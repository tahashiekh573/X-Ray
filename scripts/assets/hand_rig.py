"""Build a landmark-drivable right-hand skeleton from BodyParts3D bones.

Each long bone is re-expressed in a *native frame*: origin at its proximal articular end, +Y
along the bone towards its distal end, and +Z towards the dorsum (back of the hand; for the thumb
the nail side). The runtime maps each bone onto the segment between two MediaPipe hand
landmarks and propagates the flexion axis (+X) down each finger, so finger bending is
reproduced. Carpals are expressed in the *palm frame* (origin at the wrist point, +Y towards the
third metacarpal head, +Z dorsal) and move rigidly with the palm.

All units are centimetres. The left hand is rendered by mirroring the right-hand skeleton.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from mesh_utils import Mesh, normalize, orthonormal_basis, principal_axis

FloatArray = np.ndarray

CARPALS = ("scaphoid", "lunate", "triquetral", "pisiform", "trapezium", "trapezoid", "capitate",
           "hamate")

# bone -> (proximal landmark, distal landmark); -1 = palm-frame base point from the model.
LANDMARK_SEGMENTS: dict[str, tuple[int, int]] = {
    "metacarpal_1": (1, 2),
    "proximal_phalanx_1": (2, 3),
    "distal_phalanx_1": (3, 4),
    "metacarpal_2": (-1, 5),
    "proximal_phalanx_2": (5, 6),
    "middle_phalanx_2": (6, 7),
    "distal_phalanx_2": (7, 8),
    "metacarpal_3": (-1, 9),
    "proximal_phalanx_3": (9, 10),
    "middle_phalanx_3": (10, 11),
    "distal_phalanx_3": (11, 12),
    "metacarpal_4": (-1, 13),
    "proximal_phalanx_4": (13, 14),
    "middle_phalanx_4": (14, 15),
    "distal_phalanx_4": (15, 16),
    "metacarpal_5": (-1, 17),
    "proximal_phalanx_5": (17, 18),
    "middle_phalanx_5": (18, 19),
    "distal_phalanx_5": (19, 20),
}

PARENT: dict[str, str | None] = {
    "metacarpal_1": None,
    "proximal_phalanx_1": "metacarpal_1",
    "distal_phalanx_1": "proximal_phalanx_1",
}
for _d in (2, 3, 4, 5):
    PARENT[f"metacarpal_{_d}"] = None
    PARENT[f"proximal_phalanx_{_d}"] = f"metacarpal_{_d}"
    PARENT[f"middle_phalanx_{_d}"] = f"proximal_phalanx_{_d}"
    PARENT[f"distal_phalanx_{_d}"] = f"middle_phalanx_{_d}"


@dataclass
class RiggedBone:
    name: str
    mesh: Mesh  # vertices in the bone's native frame
    length: float
    landmarks: tuple[int, int]
    parent: str | None
    rest_x_palm: FloatArray  # native +X axis expressed in the palm frame (rest pose)
    base_palm: FloatArray  # proximal end in palm-frame coordinates


@dataclass
class HandRig:
    carpals: Mesh  # palm-frame coordinates
    bones: list[RiggedBone] = field(default_factory=list)
    wrist_to_mcp3: float = 0.0
    palm_width: float = 0.0  # index MCP to little MCP


def _cap_centroid(points: FloatArray, axis: FloatArray, end: str, frac: float = 0.05) -> FloatArray:
    proj = points @ axis
    lo, hi = proj.min(), proj.max()
    if end == "min":
        sel = points[proj <= lo + frac * (hi - lo)]
    else:
        sel = points[proj >= hi - frac * (hi - lo)]
    out: FloatArray = sel.mean(axis=0)
    return out


def build_hand_rig(bones: dict[str, Mesh], lateral: FloatArray) -> HandRig:
    """``bones`` are right-hand meshes in the head frame (cm). ``lateral`` points away from the
    body midline on the right side (used as the thumb-nail reference)."""
    proximal_row = np.vstack([bones[n].vertices for n in ("scaphoid", "lunate", "triquetral")])
    wrist = proximal_row.mean(axis=0)
    carpal_centroid = np.vstack([bones[n].vertices for n in CARPALS]).mean(axis=0)

    ends: dict[str, tuple[FloatArray, FloatArray]] = {}
    for name in LANDMARK_SEGMENTS:
        pts = bones[name].vertices
        axis = principal_axis(pts)
        a = _cap_centroid(pts, axis, "min")
        b = _cap_centroid(pts, axis, "max")
        if np.linalg.norm(a - carpal_centroid) > np.linalg.norm(b - carpal_centroid):
            a, b = b, a
        ends[name] = (a, b)

    mcp = {d: ends[f"metacarpal_{d}"][1] for d in (2, 3, 4, 5)}
    y_palm = normalize(mcp[3] - wrist)
    z_palm = normalize(np.cross(mcp[2] - wrist, mcp[5] - wrist))
    palm_basis = orthonormal_basis(y_palm, z_palm)  # columns X, Y, Z
    z_palm = palm_basis[:, 2]

    def to_palm(p: FloatArray) -> FloatArray:
        out: FloatArray = palm_basis.T @ (p - wrist)
        return out

    carpal_mesh_parts = [bones[n] for n in CARPALS]
    cv = np.vstack([m.vertices for m in carpal_mesh_parts])
    cf = []
    off = 0
    for m in carpal_mesh_parts:
        cf.append(m.faces + off)
        off += len(m.vertices)
    carpals = Mesh((cv - wrist) @ palm_basis, np.vstack(cf))

    rig = HandRig(
        carpals=carpals,
        wrist_to_mcp3=float(np.linalg.norm(mcp[3] - wrist)),
        palm_width=float(np.linalg.norm(mcp[2] - mcp[5])),
    )
    for name, lms in LANDMARK_SEGMENTS.items():
        a, b = ends[name]
        z_hint = lateral if name.endswith("_1") else z_palm
        basis = orthonormal_basis(b - a, z_hint)
        local = (bones[name].vertices - a) @ basis
        rig.bones.append(
            RiggedBone(
                name=name,
                mesh=Mesh(local, bones[name].faces.copy()),
                length=float(np.linalg.norm(b - a)),
                landmarks=lms,
                parent=PARENT[name],
                rest_x_palm=palm_basis.T @ basis[:, 0],
                base_palm=to_palm(a),
            )
        )
    return rig
