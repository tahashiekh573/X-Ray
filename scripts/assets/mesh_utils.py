"""Geometry helpers for the offline anatomy asset pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh

FloatArray = np.ndarray


@dataclass
class Mesh:
    vertices: FloatArray  # (N, 3) float64
    faces: np.ndarray  # (M, 3) int64

    @property
    def centroid(self) -> FloatArray:
        return np.asarray(self.vertices.mean(axis=0))

    def transformed(self, matrix: FloatArray) -> Mesh:
        v = np.c_[self.vertices, np.ones(len(self.vertices))] @ matrix.T
        faces = self.faces if np.linalg.det(matrix[:3, :3]) > 0 else self.faces[:, ::-1]
        return Mesh(v[:, :3].copy(), faces.copy())

    def to_trimesh(self) -> trimesh.Trimesh:
        return trimesh.Trimesh(self.vertices, self.faces, process=True)


def load_obj(path: Path) -> Mesh:
    """Parse the subset of OBJ used by BodyParts3D / MediaPipe (v + triangular f)."""
    verts: list[list[float]] = []
    faces: list[list[int]] = []
    with path.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("v "):
                parts = line.split()
                verts.append([float(parts[1]), float(parts[2]), float(parts[3])])
            elif line.startswith("f "):
                idx = [int(tok.split("/")[0]) for tok in line.split()[1:]]
                for k in range(1, len(idx) - 1):  # fan-triangulate polygons
                    faces.append([idx[0] - 1, idx[k] - 1, idx[k + 1] - 1])
    return Mesh(np.asarray(verts, dtype=np.float64), np.asarray(faces, dtype=np.int64))


def merge(meshes: list[Mesh]) -> Mesh:
    verts: list[FloatArray] = []
    faces: list[np.ndarray] = []
    offset = 0
    for m in meshes:
        verts.append(m.vertices)
        faces.append(m.faces + offset)
        offset += len(m.vertices)
    return Mesh(np.vstack(verts), np.vstack(faces))


def clean(mesh: Mesh) -> Mesh:
    tm = trimesh.Trimesh(mesh.vertices, mesh.faces, process=True)
    tm.merge_vertices()
    tm.update_faces(tm.nondegenerate_faces())
    tm.update_faces(tm.unique_faces())
    tm.remove_unreferenced_vertices()
    return Mesh(np.asarray(tm.vertices), np.asarray(tm.faces))


def decimate(mesh: Mesh, target_tris: int) -> Mesh:
    mesh = clean(mesh)
    n = len(mesh.faces)
    if n <= target_tris:
        return mesh
    reduction = 1.0 - target_tris / n
    pts, tris = fast_simplification.simplify(
        mesh.vertices.astype(np.float32), mesh.faces.astype(np.int32), target_reduction=reduction
    )
    return clean(Mesh(np.asarray(pts, dtype=np.float64), np.asarray(tris, dtype=np.int64)))


def vertex_normals(mesh: Mesh) -> FloatArray:
    tm = trimesh.Trimesh(mesh.vertices, mesh.faces, process=False)
    return np.asarray(tm.vertex_normals)


def umeyama(src: FloatArray, dst: FloatArray, with_scale: bool = True) -> FloatArray:
    """Least-squares similarity transform (4x4) mapping src points onto dst points."""
    mu_s, mu_d = src.mean(axis=0), dst.mean(axis=0)
    xs, xd = src - mu_s, dst - mu_d
    cov = xd.T @ xs / len(src)
    u, d, vt = np.linalg.svd(cov)
    s_mat = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        s_mat[2, 2] = -1
    rot = u @ s_mat @ vt
    scale = (np.trace(np.diag(d) @ s_mat) / (xs**2).sum(axis=1).mean()) if with_scale else 1.0
    out = np.eye(4)
    out[:3, :3] = scale * rot
    out[:3, 3] = mu_d - scale * rot @ mu_s
    return out


def translation(t: FloatArray) -> FloatArray:
    m = np.eye(4)
    m[:3, 3] = t
    return m


def ray_distances(
    mesh: Mesh, origins: FloatArray, directions: FloatArray, max_dist: float = 1e9
) -> FloatArray:
    """Distance to the first hit of each ray (Moller-Trumbore, vectorised); nan when missed."""
    tri = mesh.vertices[mesh.faces]
    v0, e1, e2 = tri[:, 0], tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
    out = np.full(len(origins), np.nan)
    for i, (o, d) in enumerate(zip(origins, directions, strict=True)):
        p = np.cross(d, e2)
        det = np.einsum("ij,ij->i", e1, p)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
        s = o - v0
        u = np.einsum("ij,ij->i", s, p) * inv
        q = np.cross(s, e1)
        v = (q @ d) * inv
        t = np.einsum("ij,ij->i", e2, q) * inv
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-9) & (t < max_dist)
        if hit.any():
            out[i] = float(t[hit].min())
    return out


def principal_axis(points: FloatArray) -> FloatArray:
    centered = points - points.mean(axis=0)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    axis: FloatArray = vt[0] / np.linalg.norm(vt[0])
    return axis


def normalize(v: FloatArray) -> FloatArray:
    n = float(np.linalg.norm(v))
    if n < 1e-12:
        raise ValueError("Cannot normalize a zero vector")
    out: FloatArray = v / n
    return out


def orthonormal_basis(y_axis: FloatArray, z_hint: FloatArray) -> FloatArray:
    """Columns X, Y, Z with Y = y_axis and Z as close as possible to z_hint."""
    y = normalize(y_axis)
    z = normalize(z_hint - np.dot(z_hint, y) * y)
    x = np.cross(y, z)
    return np.stack([x, y, z], axis=1)
