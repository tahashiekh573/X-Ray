"""Build the runtime anatomy assets (GLB + manifest) from BodyParts3D source meshes.

Pipeline
  1. Load BodyParts3D OBJ elements (mm, BodyParts3D body frame) per structure in parts_spec.py.
  2. Detect the body axes from anatomy itself (left/right parietal, nasal vs occipital, frontal
     vs mandible) and convert to a head frame in cm (+x subject-left, +y superior, +z anterior).
  3. Fit the skull into MediaPipe's canonical-face frame with a similarity transform using four
     correspondences (eyeball centres, nasion, menton) and typical soft-tissue depths.
  4. Decimate, compute the jaw hinge, eye pivots and label anchors, generate schematic facial
     muscles, rig the right hand, and export GLBs plus ``anatomy_manifest.json``.

Usage:
    python -I scripts/assets/build_anatomy_assets.py \
        --raw-dir data/raw/bodyparts3d --mediapipe-dir data/raw/mediapipe --out web/public/models
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parent))

from face_muscles import build_face_muscles  # noqa: E402
from body_rig import build_body_rig  # noqa: E402
from hand_rig import build_hand_rig  # noqa: E402
from mesh_utils import (  # noqa: E402
    Mesh,
    decimate,
    load_obj,
    merge,
    normalize,

    translation,
    umeyama,
    vertex_normals,
)
from parts_spec import (  # noqa: E402
    BRAIN,
    EYES,
    MUSCLES,
    LIMB_PARTS,
    RIGHT_HAND_BONES,
    TORSO_PARTS,
    SKULL,
    PartSpec,
    Tables,
    elements_for,
    load_tables,
)

ATTRIBUTION = (
    "BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 "
    "International"
)
# Soft-tissue depths (cm) used to place bony landmarks beneath MediaPipe's skin landmarks.
# Typical adult values from facial soft-tissue depth literature; approximate by design.
EYE_CENTRE_BEHIND_CANTHI = 0.5
NASION_TISSUE = 0.65
MENTON_TISSUE = 0.8
MANIFEST_VERSION = 1

def load_concepts(raw: Path, tables: Tables, concepts: tuple[str, ...]) -> Mesh:
    meshes = [load_obj(raw / "obj" / f"{fj}.obj") for fj in elements_for(tables, concepts)]
    return merge(meshes)

def snap_axis(v: np.ndarray) -> np.ndarray:
    out = np.zeros(3)
    k = int(np.argmax(np.abs(v)))
    out[k] = np.sign(v[k])
    return out

def head_frame_matrix(raw: Path, tables: Tables) -> np.ndarray:
    """4x4 transform BodyParts3D(mm) -> head frame (cm), axes derived from anatomy."""
    c = {k: load_concepts(raw, tables, (k,)).centroid for k in
         ("FMA52789", "FMA52788", "FMA53647", "FMA52735", "FMA52734", "FMA52748")}
    left = snap_axis(c["FMA52789"] - c["FMA52788"])  # left - right parietal
    anterior = snap_axis(c["FMA53647"] - c["FMA52735"])  # nasal - occipital
    superior = snap_axis(c["FMA52734"] - c["FMA52748"])  # frontal - mandible
    rot = np.stack([left, superior, anterior])  # rows map bp3d -> head axes
    m = np.eye(4)
    m[:3, :3] = rot / 10.0
    print(f"  axes: left={left} superior={superior} anterior={anterior} "
          f"det={np.linalg.det(rot):+.0f}")
    return m

def canonical_targets(face: Mesh) -> dict[str, np.ndarray]:
    v, n = face.vertices, vertex_normals(face)
    eye_r = (v[33] + v[133]) / 2 - np.array([0, 0, EYE_CENTRE_BEHIND_CANTHI])
    eye_l = (v[362] + v[263]) / 2 - np.array([0, 0, EYE_CENTRE_BEHIND_CANTHI])
    return {
        "eye_r": eye_r,
        "eye_l": eye_l,
        "nasion": v[168] - n[168] * NASION_TISSUE,
        "menton": v[152] - n[152] * MENTON_TISSUE,
    }

# Approximate mean adult facial soft-tissue depths (cm) at MediaPipe landmarks, compiled from
# published craniofacial tissue-depth tables. They steer the default fit only; users calibrate.
# Right-side and midline landmarks are listed; left-side partners are found by mirroring.
TISSUE_TARGETS: dict[int, float] = {
    10: 0.45,  # upper forehead
    151: 0.45,  # metopion
    9: 0.55,  # glabella
    168: 0.65,  # nasion
    105: 0.60,  # supraorbital
    54: 0.50,  # lateral frontal
    123: 0.70,  # zygomatic
    172: 1.20,  # gonion
    136: 1.10,  # inferior ramus / mandibular border
    150: 1.00,  # lateral mental
    152: 0.80,  # menton
    0: 1.25,  # labrale superius -> upper incisors
    17: 1.30,  # labrale inferius -> lower incisors / mandible
}

def mirrored_targets(v: np.ndarray) -> dict[int, float]:
    out = dict(TISSUE_TARGETS)
    for i, depth in TISSUE_TARGETS.items():
        if abs(v[i, 0]) > 0.05:
            mirror = v[i] * np.array([-1.0, 1.0, 1.0])
            out[int(np.argmin(np.linalg.norm(v - mirror, axis=1)))] = depth
    return out

def _rx(theta: float) -> np.ndarray:
    c, s = np.cos(theta), np.sin(theta)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def signed_depths(points: np.ndarray, skull_v: np.ndarray, skull_n: np.ndarray) -> np.ndarray:
    """Signed skin-to-bone distance: + when the skin point lies outside the bone surface."""
    from scipy.spatial import cKDTree  # noqa: PLC0415

    dist, idx = cKDTree(skull_v).query(points)
    sign = np.sign(np.einsum("ij,ij->i", points - skull_v[idx], skull_n[idx]))
    out: np.ndarray = dist * np.where(sign == 0, 1.0, sign)
    return out

def refine_fit(skull: Mesh, face: Mesh, eyes: dict[str, np.ndarray],
               targets: dict[str, np.ndarray]) -> np.ndarray:
    """Optimise anisotropic scale, pitch and (y, z) translation so that skin-to-bone distances
    match typical soft-tissue depths. Returns a 4x4 applied after the landmark fit."""
    from scipy.optimize import minimize  # noqa: PLC0415

    v = face.vertices
    table = mirrored_targets(v)
    ids = np.array(list(table))
    want = np.array(list(table.values()))
    skin = v[ids]
    sk_v, sk_n = skull.vertices, vertex_normals(skull)
    centre = (eyes["eye_r"] + eyes["eye_l"]) / 2
    eye_src = np.array([eyes["eye_r"], eyes["eye_l"]])
    eye_dst = np.array([targets["eye_r"], targets["eye_l"]])

    def matrix(p: np.ndarray) -> np.ndarray:
        sx, sy, sz = np.exp(p[0]), np.exp(p[1]), np.exp(p[0])
        theta, ty, tz = p[2], p[3], p[4]
        m = np.eye(4)
        m[:3, :3] = _rx(theta) @ np.diag([sx, sy, sz])
        m[:3, 3] = centre - m[:3, :3] @ centre + np.array([0, ty, tz])
        return m

    def cost(p: np.ndarray) -> float:
        m = matrix(p)
        lin = m[:3, :3]
        normals = sk_n @ np.linalg.inv(lin)  # inverse-transpose for normals (row vectors)
        normals /= np.linalg.norm(normals, axis=1)[:, None]
        depth = signed_depths(skin, sk_v @ lin.T + m[:3, 3], normals)
        err = depth - want
        err = np.where(depth < 0.0, err * 3.0, err)  # bone through skin is much worse
        eye_now = eye_src @ lin.T + m[:3, 3]
        eye_err = np.linalg.norm(eye_now - eye_dst, axis=1)
        aniso = (p[1] - p[0]) ** 2
        # Eye sockets are the most noticeable alignment cue in a mirror overlay.
        return float((err**2).sum() + 6.0 * (eye_err**2).sum() + 8.0 * aniso)

    p0 = np.zeros(5)
    start = cost(p0)
    res = minimize(cost, p0, method="Nelder-Mead",
                   options={"xatol": 1e-4, "fatol": 1e-5, "maxiter": 2000})
    sx, sy, sz = (float(np.exp(res.x[k])) for k in (0, 1, 0))
    theta, ty, tz = float(np.degrees(res.x[2])), float(res.x[3]), float(res.x[4])
    print(f"  tissue refine: cost {start:.2f} -> {res.fun:.2f} (scale {sx:.3f}/{sy:.3f}/{sz:.3f},"
          f" pitch {theta:+.1f} deg, ty {ty:+.2f}, tz {tz:+.2f})")
    return matrix(res.x)

def tissue_depths(skull: Mesh, face: Mesh) -> dict[int, float]:
    v = face.vertices
    ids = np.array(list(TISSUE_TARGETS))
    d = signed_depths(v[ids], skull.vertices, vertex_normals(skull))
    return {int(i): round(float(x), 2) for i, x in zip(ids, d, strict=True)}

def skull_landmarks(parts: dict[str, Mesh]) -> dict[str, np.ndarray]:
    nasal = parts["nasal_bone"].vertices
    top = nasal[nasal[:, 1] >= nasal[:, 1].max() - 0.25]
    nasion = top[np.argmax(top[:, 2])].copy()
    nasion[0] = 0.0
    mand = parts["mandible"].vertices
    mid = mand[np.abs(mand[:, 0]) < 0.6]
    menton = mid[np.argmin(mid[:, 1])].copy()
    menton[0] = 0.0
    return {
        "eye_r": parts["eyeball__right"].centroid,
        "eye_l": parts["eyeball__left"].centroid,
        "nasion": nasion,
        "menton": menton,
    }

def jaw_hinge(mandible: Mesh) -> tuple[np.ndarray, np.ndarray]:
    v = mandible.vertices
    posterior = v[v[:, 2] < np.median(v[:, 2])]
    condyles = []
    for sgn in (-1, 1):
        side = posterior[sgn * posterior[:, 0] > 0]
        top = side[side[:, 1] >= np.percentile(side[:, 1], 97)]
        condyles.append(top.mean(axis=0) - np.array([0, 0.35, 0]))  # centre of condylar head
    hinge = (condyles[0] + condyles[1]) / 2
    axis = normalize(condyles[1] - condyles[0])
    return hinge, axis

def label_anchor(v: np.ndarray, centre: np.ndarray, side: int) -> np.ndarray:
    if side != 0:
        same = v[np.sign(v[:, 0]) == side]
        if len(same) > 10:
            v = same
    d = v.mean(axis=0) - centre
    if np.linalg.norm(d) < 1.0:
        d = np.array([0, 0, 1.0])
    d = normalize(d)
    out: np.ndarray = v[np.argmax((v - centre) @ d)]
    return out

def to_trimesh(mesh: Mesh, colors: np.ndarray | None = None) -> trimesh.Trimesh:
    tm = trimesh.Trimesh(mesh.vertices.astype(np.float32), mesh.faces, process=False)
    _ = tm.vertex_normals  # cache smooth normals for export
    if colors is not None:
        tm.visual = trimesh.visual.ColorVisuals(tm, vertex_colors=colors)
    return tm

def export_scene(nodes: list[dict], path: Path) -> None:
    """nodes: {name, mesh?, parent?, transform?, colors?} -> GLB with a named node hierarchy."""
    scene = trimesh.Scene()
    for node in nodes:
        parent = node.get("parent") or scene.graph.base_frame
        transform = node.get("transform", np.eye(4))
        if node.get("mesh") is None:
            scene.graph.update(frame_from=parent, frame_to=node["name"], matrix=transform)
        else:
            scene.add_geometry(
                to_trimesh(node["mesh"], node.get("colors")),
                node_name=node["name"],
                geom_name=node["name"],
                parent_node_name=parent,
                transform=transform,
            )
    scene.metadata["extras"] = {"attribution": ATTRIBUTION}
    path.write_bytes(trimesh.exchange.gltf.export_glb(scene, include_normals=True))
    print(f"  wrote {path.name}: {path.stat().st_size / 1024:.0f} KiB")

def node_name(spec: PartSpec) -> str:
    suffix = {"eye_left": "__left", "eye_right": "__right"}.get(spec.group, "")
    return spec.id + suffix

def build(raw: Path, mp_dir: Path, out: Path) -> dict:
    tables = load_tables(raw)
    to_head = head_frame_matrix(raw, tables)
    face = load_obj(mp_dir / "canonical_face_model.obj")

    head_specs = SKULL + BRAIN + EYES + MUSCLES
    parts: dict[str, Mesh] = {}
    for spec in head_specs:
        mesh = load_concepts(raw, tables, spec.concepts).transformed(to_head)
        parts[node_name(spec)] = decimate(mesh, spec.target_tris)

    src = skull_landmarks(parts)
    dst = canonical_targets(face)
    keys = ("eye_r", "eye_l", "nasion", "menton")
    fit = umeyama(np.array([src[k] for k in keys]), np.array([dst[k] for k in keys]))
    parts = {k: m.transformed(fit) for k, m in parts.items()}
    skull_ids = [node_name(s) for s in SKULL]
    refine = refine_fit(merge([parts[k] for k in skull_ids]), face, skull_landmarks(parts), dst)
    parts = {k: m.transformed(refine) for k, m in parts.items()}
    fit = refine @ fit
    scale = float(np.cbrt(np.linalg.det(fit[:3, :3])))
    depths = tissue_depths(merge([parts[k] for k in skull_ids]), face)
    print(f"  tissue depths (cm) at landmarks: {depths}")
    fitted = skull_landmarks(parts)
    residual = {k: float(np.linalg.norm(fitted[k] - dst[k])) for k in keys}
    print(f"  canonical fit: scale={scale:.3f} residual(cm)={ {k: round(v, 2) for k, v in residual.items()} }")

    hinge, hinge_axis = jaw_hinge(parts["mandible"])
    eye_pivot = {"right": parts["eyeball__right"].centroid, "left": parts["eyeball__left"].centroid}
    cranium_ids = ("frontal_bone", "parietal_bone", "temporal_bone", "sphenoid_bone",
                   "occipital_bone")
    head_centre = merge([parts[k] for k in cranium_ids]).centroid
    # Deterministic label sides so that bilateral labels spread across both sides of the face.
    side_pref = {"parietal_bone": 1, "temporal_bone": -1, "zygomatic_bone": 1, "maxilla": -1,
                 "nasal_bone": 0, "optic_nerve": 1, "extraocular_muscles": -1,
                 "tongue_muscles": 0}

    manifest: dict = {
        "version": MANIFEST_VERSION,
        "units": "cm",
        "frame": "mediapipe-canonical-face (+x subject-left, +y up, +z anterior)",
        "attribution": ATTRIBUTION,
        "fit": {"scale": scale, "residual_cm": residual, "tissue_depths_cm": depths,
                "landmarks": {k: dst[k].tolist() for k in keys}},
        "jaw": {"hinge": hinge.tolist(), "axis": hinge_axis.tolist(), "maxOpenDeg": 28.0,
                "maxProtrusion": 0.35},
        "eyes": {k: v.tolist() for k, v in eye_pivot.items()},
        "headCentre": head_centre.tolist(),
        "assets": {},
        "structures": {},
    }

    def register(sid: str, asset: str, layer: str, anchor: np.ndarray, node: str,
                 schematic: bool = False, label: bool = True) -> None:
        entry = manifest["structures"].setdefault(
            sid, {"asset": asset, "layer": layer, "nodes": [], "anchor": anchor.tolist(),
                  "schematic": schematic, "label": label})
        entry["nodes"].append(node)

    for asset, specs, layer in (("skull", SKULL, "skull"), ("brain", BRAIN, "brain"),
                                ("eyes", EYES, "eyes"), ("muscles", MUSCLES, "muscles")):
        nodes: list[dict] = [{"name": f"{asset}_root"}]
        if any(s.group == "jaw" for s in specs):
            nodes.append({"name": "jaw_pivot", "parent": f"{asset}_root",
                          "transform": translation(hinge)})
        for side in ("right", "left"):
            if any(s.group == f"eye_{side}" for s in specs):
                nodes.append({"name": f"eye_pivot_{side}", "parent": f"{asset}_root",
                              "transform": translation(eye_pivot[side])})
        for spec in specs:
            name = node_name(spec)
            mesh = parts[name]
            if spec.group == "jaw":
                parent, local = "jaw_pivot", mesh.transformed(translation(-hinge))
            elif spec.group.startswith("eye_"):
                side = spec.group.split("_")[1]
                parent, local = f"eye_pivot_{side}", mesh.transformed(translation(-eye_pivot[side]))
            else:
                parent, local = f"{asset}_root", mesh
            nodes.append({"name": name, "mesh": local, "parent": parent})
            side = side_pref.get(spec.id, 1 if spec.group != "eye_right" else -1)
            if spec.group == "eye_right":
                side = -1
            register(spec.id, asset, layer, label_anchor(mesh.vertices, head_centre, side), name,
                     label=spec.label)
        if asset == "muscles":
            cranium = merge([parts[k] for k in cranium_ids])
            for sheet in build_face_muscles(face, cranium):
                name = f"{sheet.id}__{sheet.side}"
                nodes.append({"name": name, "mesh": sheet.mesh, "parent": "muscles_root",
                              "colors": sheet.colors})
                register(sheet.id, asset, layer, sheet.anchor, name, schematic=True)
        export_scene(nodes, out / f"{asset}.glb")
        manifest["assets"][asset] = {"file": f"{asset}.glb", "triangles": int(sum(
            len(n["mesh"].faces) for n in nodes if n.get("mesh") is not None))}

    # Hand skeleton (right hand, head-frame cm; not fitted to the face).
    hand_parts = {k: decimate(load_concepts(raw, tables, (fma,)).transformed(to_head), 1400)
                  for k, fma in RIGHT_HAND_BONES.items()}
    rig = build_hand_rig(hand_parts, lateral=np.array([-1.0, 0.0, 0.0]))
    hand_nodes: list[dict] = [{"name": "hand_root"},
                              {"name": "carpals", "mesh": decimate(rig.carpals, 5000),
                               "parent": "hand_root"}]
    for bone in rig.bones:
        hand_nodes.append({"name": bone.name, "mesh": bone.mesh, "parent": "hand_root"})
    export_scene(hand_nodes, out / "hand_bones.glb")
    manifest["assets"]["hand"] = {"file": "hand_bones.glb", "triangles": int(
        sum(len(n["mesh"].faces) for n in hand_nodes if n.get("mesh") is not None))}
    manifest["hand"] = {
        "wristToMcp3": rig.wrist_to_mcp3,
        "palmWidth": rig.palm_width,
        "bones": [
            {"name": b.name, "length": b.length, "landmarks": list(b.landmarks),
             "parent": b.parent, "restXPalm": b.rest_x_palm.tolist(),
             "basePalm": b.base_palm.tolist()}
            for b in rig.bones
        ],
    }
    for name, struct in (("carpals", "carpal_bones"),):
        manifest["structures"][struct] = {"asset": "hand", "layer": "hands", "nodes": [name],
                                          "anchor": [0, 0, 0], "schematic": False, "label": True}
    for kind, struct in (("metacarpal", "metacarpal_bones"), ("phalanx", "phalanges")):
        manifest["structures"][struct] = {
            "asset": "hand", "layer": "hands", "anchor": [0, 0, 0], "schematic": False,
            "label": True, "nodes": [b.name for b in rig.bones if kind in b.name]}
    # Full-body skeleton (pose-driven; head-frame cm, not fitted to the face).
    torso_tris = {"rib_cage": 9000, "vertebral_column": 7000, "pelvis": 4000, "scapula": 2400,
                  "clavicle": 1000, "sternum": 800}
    torso_parts = {k: decimate(load_concepts(raw, tables, v).transformed(to_head), torso_tris[k])
                   for k, v in TORSO_PARTS.items()}
    limb_tris = {"humerus": 1600, "forearm": 2000, "femur": 2000, "leg": 2400, "foot": 2600}
    limbs = {k: decimate(load_concepts(raw, tables, v).transformed(to_head),
                         limb_tris[k.split("__")[0]]) for k, v in LIMB_PARTS.items()}
    body = build_body_rig(torso_parts, limbs)
    body_nodes: list[dict] = [{"name": "body_root"}]
    for name, mesh in body.torso.items():
        body_nodes.append({"name": name, "mesh": mesh, "parent": "body_root"})
        manifest["structures"][name] = {"asset": "body", "layer": "body", "nodes": [name],
                                        "anchor": mesh.centroid.tolist(), "schematic": False,
                                        "label": True, "frame": "torso"}
    for seg in body.segments:
        body_nodes.append({"name": seg.name, "mesh": seg.mesh, "parent": "body_root"})
        sid = seg.name.split("__")[0]
        entry = manifest["structures"].setdefault(sid, {
            "asset": "body", "layer": "body", "nodes": [], "schematic": False, "label": True,
            "frame": "segment", "anchor": [0.0, seg.length / 2, 0.0]})
        entry["nodes"].append(seg.name)
    export_scene(body_nodes, out / "body_skeleton.glb")
    manifest["assets"]["body"] = {"file": "body_skeleton.glb", "triangles": int(
        sum(len(n["mesh"].faces) for n in body_nodes if n.get("mesh") is not None))}
    manifest["body"] = {
        "shoulderWidth": body.shoulder_width,
        "torsoLength": body.torso_length,
        "torsoNodes": list(body.torso),
        "segments": [
            {"name": g.name, "length": g.length, "landmarks": list(g.landmarks),
             "parent": g.parent, "restX": g.rest_x.tolist(), "restZ": g.rest_z.tolist()}
            for g in body.segments
        ],
    }
    return manifest

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw/bodyparts3d"))
    parser.add_argument("--mediapipe-dir", type=Path, default=Path("data/raw/mediapipe"))
    parser.add_argument("--out", type=Path, default=Path("web/public/models"))
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    print("Building anatomy assets ...")
    manifest = build(args.raw_dir, args.mediapipe_dir, args.out)
    (args.out / "anatomy_manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"  wrote anatomy_manifest.json ({len(manifest['structures'])} structures)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
