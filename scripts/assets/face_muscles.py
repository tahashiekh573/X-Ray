"""Schematic facial-muscle sheets.

BodyParts3D contains no muscles of facial expression or mastication, so this module generates a
clearly-labelled *schematic* muscle layer instead of shipping fake "anatomical" meshes:

* Sheets for frontalis, orbicularis oculi/oris, zygomaticus major, buccinator and masseter are
  cut from a subdivided copy of MediaPipe's canonical face mesh (Apache-2.0) and pushed beneath
  the skin by typical soft-tissue depths.
* The temporalis sheet is cut from the lateral surface of the BodyParts3D cranium.

All coordinates are in the MediaPipe canonical-face frame (cm; +x subject-left, +y up, +z
anterior). Each mesh carries per-vertex colours used by the runtime shader:
R = jaw-follow weight (0 static .. 1 moves with mandible), G = fibre coordinate (0..1),
B = edge taper (0 thin edge .. 1 full thickness).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import trimesh
from mesh_utils import Mesh, normalize

FloatArray = np.ndarray


@dataclass
class MuscleSheet:
    id: str
    side: str  # left | right | midline
    mesh: Mesh
    colors: np.ndarray  # (N, 4) uint8
    anchor: FloatArray


@dataclass
class FaceRefs:
    eye_r: FloatArray
    eye_l: FloatArray
    eye_half_width: float
    mouth: FloatArray
    mouth_half_width: float
    mouth_corner_r: FloatArray
    mouth_corner_l: FloatArray
    brow_y: float


def face_refs(v: FloatArray) -> FaceRefs:
    eye_r = (v[33] + v[133]) / 2
    eye_l = (v[362] + v[263]) / 2
    mouth = (v[61] + v[291] + v[13] + v[14]) / 4
    brow_y = float(np.mean(v[[70, 63, 105, 66, 107, 300, 293, 334, 296, 336], 1]))
    return FaceRefs(
        eye_r=eye_r,
        eye_l=eye_l,
        eye_half_width=float(np.linalg.norm(v[33] - v[133]) / 2),
        mouth=mouth,
        mouth_half_width=float(np.linalg.norm(v[61] - v[291]) / 2),
        mouth_corner_r=v[61].copy(),
        mouth_corner_l=v[291].copy(),
        brow_y=brow_y,
    )


def _smoothstep(e0: float, e1: float, x: FloatArray) -> FloatArray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    out: FloatArray = t * t * (3 - 2 * t)
    return out


def _select(
    verts: FloatArray, faces: np.ndarray, mask: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Faces whose three vertices are all selected; returns (vertex ids, local faces)."""
    keep = mask[faces].all(axis=1)
    sel_faces = faces[keep]
    if len(sel_faces) == 0:
        raise ValueError("Muscle region selected no faces")
    vids, inverse = np.unique(sel_faces.ravel(), return_inverse=True)
    return vids, inverse.reshape(-1, 3)


def _largest_component(faces: np.ndarray) -> np.ndarray:
    comps = trimesh.graph.connected_components(trimesh.graph.face_adjacency(faces), min_len=1)
    if len(comps) <= 1:
        return faces
    largest = max(comps, key=len)
    return faces[np.sort(largest)]


def _edge_taper(n_verts: int, faces: np.ndarray, ramp: float = 3.0) -> FloatArray:
    """0 at the sheet boundary rising to 1 after ``ramp`` edge hops (organic thin edges)."""
    edges = np.sort(np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = np.unique(uniq[counts == 1].ravel())
    adj: list[list[int]] = [[] for _ in range(n_verts)]
    for a, b in uniq:
        adj[a].append(b)
        adj[b].append(a)
    dist = np.full(n_verts, np.inf)
    frontier = list(boundary)
    dist[boundary] = 0
    while frontier:
        nxt: list[int] = []
        for a in frontier:
            for b in adj[a]:
                if dist[b] == np.inf:
                    dist[b] = dist[a] + 1
                    nxt.append(b)
        frontier = nxt
    dist[dist == np.inf] = ramp
    out: FloatArray = np.clip(dist / ramp, 0.0, 1.0)
    return out


def _extrude(
    surface: FloatArray,
    normals: FloatArray,
    faces: np.ndarray,
    offset_outer: FloatArray,
    offset_inner: FloatArray,
) -> tuple[Mesh, np.ndarray]:
    """Turn an open surface patch into a closed shell. Returns mesh and per-vertex source ids."""
    n = len(surface)
    outer = surface + normals * offset_outer[:, None]
    inner = surface + normals * offset_inner[:, None]
    edges = np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    key = np.sort(edges, axis=1)
    _, idx, counts = np.unique(key, axis=0, return_index=True, return_counts=True)
    boundary = edges[idx[counts == 1]]
    walls = np.vstack(
        [
            np.c_[boundary[:, 1], boundary[:, 0], boundary[:, 0] + n],
            np.c_[boundary[:, 1], boundary[:, 0] + n, boundary[:, 1] + n],
        ]
    )
    all_faces = np.vstack([faces, faces[:, ::-1] + n, walls])
    src = np.r_[np.arange(n), np.arange(n)]
    return Mesh(np.vstack([outer, inner]), all_faces), src


def _colors(jaw: FloatArray, fibre: FloatArray, taper: FloatArray) -> np.ndarray:
    span = float(fibre.max() - fibre.min()) or 1.0
    g = (fibre - fibre.min()) / span
    rgba = np.c_[np.clip(jaw, 0, 1), np.clip(g, 0, 1), np.clip(taper, 0, 1), np.ones_like(jaw)]
    out: np.ndarray = np.round(rgba * 255).astype(np.uint8)
    return out


def _skin_sheet(
    sid: str,
    side: str,
    verts: FloatArray,
    normals: FloatArray,
    faces: np.ndarray,
    region: np.ndarray,
    depth: float,
    thickness: float,
    fibre_fn: Callable[[FloatArray], FloatArray],
    jaw_fn: Callable[[FloatArray], FloatArray],
) -> MuscleSheet:
    vids, local = _select(verts, faces, region)
    local = _largest_component(local)
    used, remap = np.unique(local.ravel(), return_inverse=True)
    vids, local = vids[used], remap.reshape(-1, 3)
    surf, nrm = verts[vids], normals[vids]
    taper = _edge_taper(len(surf), local)
    half = thickness * (0.25 + 0.75 * taper) / 2
    mesh, src = _extrude(surf, nrm, local, -(depth - half), -(depth + half))
    colors = _colors(jaw_fn(surf)[src], fibre_fn(surf)[src], taper[src])
    anchor = surf[np.argmax(taper + 1e-3 * surf[:, 2])]  # most "interior" point of the sheet
    return MuscleSheet(sid, side, mesh, colors, anchor)


def build_face_muscles(face: Mesh, cranium: Mesh) -> list[MuscleSheet]:
    """Generate schematic muscles. ``face`` is the canonical face mesh, ``cranium`` the fitted
    BodyParts3D cranium (both in canonical-face coordinates)."""
    refs = face_refs(face.vertices)
    fine_v, fine_f = trimesh.remesh.subdivide_loop(face.vertices, face.faces, iterations=2)
    tm = trimesh.Trimesh(fine_v, fine_f, process=False)
    verts, faces = np.asarray(tm.vertices), np.asarray(tm.faces)
    normals = np.asarray(tm.vertex_normals)
    x, y = verts[:, 0], verts[:, 1]
    zero = lambda p: np.zeros(len(p))  # noqa: E731
    sheets: list[MuscleSheet] = []

    for side, sgn, eye, corner in (
        ("right", -1.0, refs.eye_r, refs.mouth_corner_r),
        ("left", 1.0, refs.eye_l, refs.mouth_corner_l),
    ):
        # Frontalis: vertical fibres over the forehead, split at the midline.
        region = (y > refs.brow_y + 0.45) & (sgn * x > 0.35) & (sgn * x < 5.4)
        sheets.append(
            _skin_sheet(
                "frontalis", side, verts, normals, faces, region, 0.16, 0.22,
                fibre_fn=lambda p: p[:, 0], jaw_fn=zero,
            )
        )

        # Orbicularis oculi: elliptical ring around the palpebral fissure.
        a = refs.eye_half_width * 1.05
        rho = np.sqrt(((x - eye[0]) / a) ** 2 + ((y - eye[1] + 0.1) / (a * 0.78)) ** 2)
        region = (rho > 0.98) & (rho < 2.05) & (verts[:, 2] > eye[2] - 2.2)
        sheets.append(
            _skin_sheet(
                "orbicularis_oculi", side, verts, normals, faces, region, 0.28, 0.24,
                fibre_fn=lambda p, e=eye, a=a: np.sqrt(
                    ((p[:, 0] - e[0]) / a) ** 2 + ((p[:, 1] - e[1]) / (a * 0.78)) ** 2
                ),
                jaw_fn=zero,
            )
        )

        # Zygomaticus major: band from the zygomatic bone to the modiolus.
        origin = np.array([eye[0] + sgn * 2.35, eye[1] - 2.25, 0.0])
        insertion = np.array([corner[0] + sgn * 0.35, corner[1] + 0.05, 0.0])
        seg = insertion[:2] - origin[:2]
        seg_len = float(np.linalg.norm(seg))
        t = ((verts[:, :2] - origin[:2]) @ seg) / seg_len**2
        closest = origin[:2] + np.clip(t, 0, 1)[:, None] * seg
        dist = np.linalg.norm(verts[:, :2] - closest, axis=1)
        width = 0.42 + 0.12 * (1 - np.clip(t, 0, 1))
        region = (dist < width) & (t > -0.04) & (t < 1.02) & (verts[:, 2] > 0.5)
        perp = np.array([-seg[1], seg[0]]) / seg_len
        sheets.append(
            _skin_sheet(
                "zygomaticus_major", side, verts, normals, faces, region, 0.75, 0.32,
                fibre_fn=lambda p, o=origin, q=perp: (p[:, :2] - o[:2]) @ q,
                jaw_fn=lambda p, o=origin, s=seg, L=seg_len: 0.35 * np.clip(
                    ((p[:, :2] - o[:2]) @ s) / L**2, 0, 1
                ),
            )
        )

        # Buccinator: deep horizontal sheet in the cheek lateral to the mouth corner.
        lat = sgn * (x - corner[0])
        region = (lat > 0.45) & (lat < 3.3) & (y > refs.mouth[1] - 1.25) & (
            y < refs.mouth[1] + 1.05
        )
        sheets.append(
            _skin_sheet(
                "buccinator", side, verts, normals, faces, region, 1.45, 0.3,
                fibre_fn=lambda p: p[:, 1],
                jaw_fn=lambda p, m=refs.mouth[1]: 0.55 * _smoothstep(m + 0.4, m - 1.1, p[:, 1]),
            )
        )

        # Masseter: thick quadrilateral sheet over the mandibular ramus.
        region = (sgn * x > 4.55) & (y < refs.eye_r[1] - 2.55) & (y > refs.mouth[1] - 3.1) & (
            verts[:, 2] < 1.6
        ) & (verts[:, 2] > -1.9)
        sheets.append(
            _skin_sheet(
                "masseter", side, verts, normals, faces, region, 1.05, 0.75,
                fibre_fn=lambda p: p[:, 2] + 0.35 * p[:, 1],
                jaw_fn=lambda p, top=refs.eye_r[1] - 2.55, bot=refs.mouth[1] - 3.1: _smoothstep(
                    top - 0.4, bot + 0.6, p[:, 1]
                ),
            )
        )

    # Orbicularis oris: ring around the lips; the lower half follows the mandible.
    a = refs.mouth_half_width * 1.02
    m = refs.mouth
    rho = np.sqrt(((x - m[0]) / a) ** 2 + ((y - m[1]) / (a * 0.62)) ** 2)
    region = (rho < 1.42) & (verts[:, 2] > 3.0)
    sheets.append(
        _skin_sheet(
            "orbicularis_oris", "midline", verts, normals, faces, region, 0.45, 0.4,
            fibre_fn=lambda p: np.sqrt(
                ((p[:, 0] - m[0]) / a) ** 2 + ((p[:, 1] - m[1]) / (a * 0.62)) ** 2
            ),
            jaw_fn=lambda p: _smoothstep(m[1] + 0.05, m[1] - 0.45, p[:, 1]),
        )
    )

    sheets.extend(_temporalis(cranium, refs))
    return sheets


def _temporalis(cranium: Mesh, refs: FaceRefs) -> list[MuscleSheet]:
    tm = trimesh.Trimesh(cranium.vertices, cranium.faces, process=True)
    verts, faces = np.asarray(tm.vertices), np.asarray(tm.faces)
    normals = np.asarray(tm.vertex_normals)
    out: list[MuscleSheet] = []
    y_arch = float(refs.eye_r[1] - 1.35)
    z_eye = float((refs.eye_r[2] + refs.eye_l[2]) / 2)
    for side, sgn in (("right", -1.0), ("left", 1.0)):
        lateral = sgn * normals[:, 0] > 0.42
        zc, yc = z_eye - 4.9, y_arch + 2.9
        ell = ((verts[:, 2] - zc) / 4.7) ** 2 + ((verts[:, 1] - yc) / 3.9) ** 2
        region = lateral & (sgn * verts[:, 0] > 3.0) & (verts[:, 1] > y_arch) & (ell < 1.0)
        vids, local = _select(verts, faces, region)
        local = _largest_component(local)
        used, remap = np.unique(local.ravel(), return_inverse=True)
        vids, local = vids[used], remap.reshape(-1, 3)
        surf, nrm = verts[vids], normals[vids]
        taper = _edge_taper(len(surf), local, ramp=4.0)
        thick = 0.55 * (0.25 + 0.75 * taper) * (1.0 + 0.6 * _smoothstep(yc + 2, y_arch, surf[:, 1]))
        mesh, src = _extrude(surf, nrm, local, 0.06 + thick, np.full(len(surf), 0.06))
        apex = np.array([z_eye - 3.0, y_arch - 1.6])
        fan = np.arctan2(surf[:, 1] - apex[1], surf[:, 2] - apex[0])
        jaw = 0.6 * _smoothstep(y_arch + 1.4, y_arch, surf[:, 1])
        colors = _colors(jaw[src], fan[src], taper[src])
        anchor = surf[np.argmax(taper - 0.05 * np.abs(surf[:, 1] - yc))]
        out.append(MuscleSheet("temporalis", side, mesh, colors, anchor))
    return out


def lateral_dir(side: str) -> FloatArray:
    return normalize(np.array([1.0 if side == "left" else -1.0, 0.0, 0.0]))
