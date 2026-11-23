"""Full-body skeleton rig driven by MediaPipe Pose (33 landmarks).

* The torso (rib cage, sternum, spine, clavicles, scapulae, pelvis) is rigid and expressed in a
  *torso frame*: origin at the hip-joint midpoint, +Y towards the shoulder midpoint, +X towards
  the subject's left shoulder, +Z anterior. At runtime it is fitted to the tracked shoulders and
  hips (anisotropic: shoulder width and torso length).
* Limb segments (humerus, forearm, femur, leg, foot; both sides) are expressed in native frames:
  origin at the proximal joint, +Y towards the distal joint. Each stores its rest roll (+X/+Z)
  relative to its parent segment (or the torso), so elbow/knee/ankle bending is reproduced.

Units: centimetres, BodyParts3D anatomical position.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from mesh_utils import Mesh, orthonormal_basis, principal_axis

FloatArray = np.ndarray

# MediaPipe Pose landmark ids (subject's left/right).
POSE = {
    "left_shoulder": 11, "right_shoulder": 12, "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16, "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26, "left_ankle": 27, "right_ankle": 28,
    "left_heel": 29, "right_heel": 30, "left_foot_index": 31, "right_foot_index": 32,
}


def segment_table(side: str) -> list[tuple[str, str, str, str | None]]:
    """(segment, proximal landmark, distal landmark, parent segment)."""
    return [
        (f"humerus__{side}", f"{side}_shoulder", f"{side}_elbow", None),
        (f"forearm__{side}", f"{side}_elbow", f"{side}_wrist", f"humerus__{side}"),
        (f"femur__{side}", f"{side}_hip", f"{side}_knee", None),
        (f"leg__{side}", f"{side}_knee", f"{side}_ankle", f"femur__{side}"),
        (f"foot__{side}", f"{side}_ankle", f"{side}_foot_index", f"leg__{side}"),
    ]


@dataclass
class RiggedSegment:
    name: str
    mesh: Mesh
    length: float
    landmarks: tuple[int, int]
    parent: str | None
    rest_x: FloatArray  # native +X in the parent's native frame (or torso frame for roots)
    rest_z: FloatArray


@dataclass
class BodyRig:
    torso: dict[str, Mesh]  # torso-frame meshes
    segments: list[RiggedSegment] = field(default_factory=list)
    shoulder_width: float = 0.0
    torso_length: float = 0.0


def _ends(points: FloatArray, frac: float = 0.04) -> tuple[FloatArray, FloatArray]:
    """Cap centroids at both ends along the principal axis, ordered (superior, inferior)."""
    axis = principal_axis(points)
    proj = points @ axis
    lo, hi = proj.min(), proj.max()
    a = points[proj <= lo + frac * (hi - lo)].mean(axis=0)
    b = points[proj >= hi - frac * (hi - lo)].mean(axis=0)
    return (a, b) if a[1] >= b[1] else (b, a)


def build_body_rig(torso_parts: dict[str, Mesh], limbs: dict[str, Mesh]) -> BodyRig:
    """All inputs in the head frame (cm; +x subject-left, +y superior, +z anterior)."""
    joints: dict[str, FloatArray] = {}
    for side in ("left", "right"):
        sh, el = _ends(limbs[f"humerus__{side}"].vertices)
        _, wr = _ends(limbs[f"forearm__{side}"].vertices)
        hp, kn = _ends(limbs[f"femur__{side}"].vertices)
        _, an = _ends(limbs[f"leg__{side}"].vertices)
        foot = limbs[f"foot__{side}"].vertices
        toe = foot[np.argmax(foot[:, 2])]
        joints |= {f"{side}_shoulder": sh, f"{side}_elbow": el, f"{side}_wrist": wr,
                   f"{side}_hip": hp, f"{side}_knee": kn, f"{side}_ankle": an,
                   f"{side}_foot_index": toe}

    sh_mid = (joints["left_shoulder"] + joints["right_shoulder"]) / 2
    hip_mid = (joints["left_hip"] + joints["right_hip"]) / 2
    y_axis = sh_mid - hip_mid
    x_hint = joints["left_shoulder"] - joints["right_shoulder"]
    torso_basis = orthonormal_basis(y_axis, np.cross(x_hint, y_axis))
    print(f"  body: torso X={np.round(torso_basis[:, 0], 2)} (expect +x)")

    rig = BodyRig(
        torso={k: Mesh((m.vertices - hip_mid) @ torso_basis, m.faces.copy())
               for k, m in torso_parts.items()},
        shoulder_width=float(np.linalg.norm(x_hint)),
        torso_length=float(np.linalg.norm(y_axis)),
    )

    bases: dict[str, FloatArray] = {}
    for side in ("left", "right"):
        for name, prox, dist, parent in segment_table(side):
            p, d = joints[prox], joints[dist]
            z_hint = np.array([0.0, 1.0, 0.0]) if name.startswith("foot") else np.array([0, 0, 1.0])
            basis = orthonormal_basis(d - p, z_hint)
            bases[name] = basis
            ref = bases[parent] if parent else torso_basis
            rig.segments.append(
                RiggedSegment(
                    name=name,
                    mesh=Mesh((limbs[name].vertices - p) @ basis, limbs[name].faces.copy()),
                    length=float(np.linalg.norm(d - p)),
                    landmarks=(POSE[prox], POSE[dist]),
                    parent=parent,
                    rest_x=ref.T @ basis[:, 0],
                    rest_z=ref.T @ basis[:, 2],
                )
            )
    return rig
