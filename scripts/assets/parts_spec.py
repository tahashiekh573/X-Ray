"""Declarative mapping from app structure ids to BodyParts3D (FMA) concepts.

Every structure id here must also exist in ``data/anatomy_content.json`` (educational text).
Concepts may be given as FMA ids ("FMA52748") or as exact English names from the parts lists,
or as a regular expression prefixed with ``re:`` that is matched against names.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PartSpec:
    id: str
    asset: str  # skull | brain | eyes | muscles | hand
    concepts: tuple[str, ...]
    group: str = "static"  # static | jaw | eye_left | eye_right
    target_tris: int = 6000
    label: bool = True


SKULL: tuple[PartSpec, ...] = (
    PartSpec("frontal_bone", "skull", ("FMA52734",), target_tris=5000),
    PartSpec("parietal_bone", "skull", ("FMA52788", "FMA52789"), target_tris=5000),
    PartSpec("occipital_bone", "skull", ("FMA52735",), target_tris=4000),
    PartSpec("temporal_bone", "skull", ("FMA52738", "FMA52739"), target_tris=5000),
    PartSpec("sphenoid_bone", "skull", ("FMA52736",), target_tris=3500),
    PartSpec("ethmoid_bone", "skull", ("FMA52740",), target_tris=1500, label=False),
    PartSpec("zygomatic_bone", "skull", ("FMA52892", "FMA52893"), target_tris=4000),
    PartSpec("maxilla", "skull", ("FMA53649", "FMA53650"), target_tris=4500),
    PartSpec("nasal_bone", "skull", ("FMA53647", "FMA53648"), target_tris=1200),
    PartSpec("lacrimal_bone", "skull", ("FMA53645", "FMA53646"), target_tris=800, label=False),
    PartSpec("palatine_bone", "skull", ("FMA53655", "FMA53656"), target_tris=1500, label=False),
    PartSpec("vomer", "skull", ("FMA9710",), target_tris=800, label=False),
    PartSpec(
        "inferior_nasal_concha", "skull", ("FMA54737", "FMA54738"), target_tris=1200, label=False
    ),
    PartSpec(
        "upper_teeth",
        "skull",
        (r"re:^(right|left) upper .*secondary .*tooth$",),
        target_tris=3000,
    ),
    PartSpec("mandible", "skull", ("FMA52748",), group="jaw", target_tris=6000),
    PartSpec(
        "lower_teeth",
        "skull",
        (r"re:^(right|left) lower .*secondary .*tooth$",),
        group="jaw",
        target_tris=3000,
    ),
)

BRAIN: tuple[PartSpec, ...] = (
    PartSpec("left_cerebral_hemisphere", "brain", ("FMA242182",), target_tris=13000),
    PartSpec("right_cerebral_hemisphere", "brain", ("FMA242180",), target_tris=13000),
    PartSpec("cerebellum", "brain", ("FMA67944",), target_tris=6000),
    PartSpec("brainstem", "brain", ("FMA79876",), target_tris=5000),
    PartSpec("ventricular_system", "brain", ("FMA242787",), target_tris=4000),
)

EYES: tuple[PartSpec, ...] = (
    PartSpec("eyeball", "eyes", ("FMA58271",), group="eye_right", target_tris=1500),
    PartSpec("eyeball", "eyes", ("FMA58272",), group="eye_left", target_tris=1500),
    PartSpec("cornea", "eyes", ("FMA58239",), group="eye_right", target_tris=500, label=False),
    PartSpec("cornea", "eyes", ("FMA58240",), group="eye_left", target_tris=500, label=False),
    PartSpec("iris", "eyes", ("FMA58236",), group="eye_right", target_tris=500, label=False),
    PartSpec("iris", "eyes", ("FMA58237",), group="eye_left", target_tris=500, label=False),
    PartSpec("lens", "eyes", ("FMA58242",), group="eye_right", target_tris=400, label=False),
    PartSpec("lens", "eyes", ("FMA58243",), group="eye_left", target_tris=400, label=False),
    PartSpec("optic_nerve", "eyes", ("right optic nerve", "left optic nerve"), target_tris=1200),
    PartSpec(
        "extraocular_muscles",
        "eyes",
        (
            r"re:^(right|left) (superior|inferior|medial|lateral) rectus$",
            r"re:^(right|left) (superior|inferior) oblique$",
            r"re:^(right|left) levator palpebrae superioris$",
        ),
        target_tris=6000,
    ),
)

# BodyParts3D contains no muscles of facial expression or mastication; the facial muscle layer is
# generated as a clearly-labelled schematic (see build_face_muscles.py). Only the tongue muscles
# below are real BodyParts3D meshes.
MUSCLES: tuple[PartSpec, ...] = (
    PartSpec(
        "tongue_muscles",
        "muscles",
        (r"re:^(right|left) (genioglossus|hyoglossus)$",),
        group="jaw",
        target_tris=4000,
    ),
)

RIGHT_HAND_BONES: dict[str, str] = {
    "scaphoid": "FMA24435",
    "lunate": "FMA24437",
    "triquetral": "FMA24439",
    "pisiform": "FMA24441",
    "trapezium": "FMA24443",
    "trapezoid": "FMA23725",
    "capitate": "FMA24446",
    "hamate": "FMA24448",
    "metacarpal_1": "FMA24464",
    "metacarpal_2": "FMA24466",
    "metacarpal_3": "FMA24468",
    "metacarpal_4": "FMA24470",
    "metacarpal_5": "FMA24472",
    "proximal_phalanx_1": "FMA24450",
    "proximal_phalanx_2": "FMA24451",
    "proximal_phalanx_3": "FMA24452",
    "proximal_phalanx_4": "FMA24453",
    "proximal_phalanx_5": "FMA24454",
    "middle_phalanx_2": "FMA24455",
    "middle_phalanx_3": "FMA24456",
    "middle_phalanx_4": "FMA24457",
    "middle_phalanx_5": "FMA24458",
    "distal_phalanx_1": "FMA24459",
    "distal_phalanx_2": "FMA24460",
    "distal_phalanx_3": "FMA24461",
    "distal_phalanx_4": "FMA24462",
    "distal_phalanx_5": "FMA24463",
}

HEAD_PARTS: tuple[PartSpec, ...] = SKULL + BRAIN + EYES + MUSCLES

# Full-body skeleton driven by MediaPipe Pose. "torso" parts move rigidly with the shoulders and
# hips; limb segments are rigged between two pose landmarks (see body_rig.py).
TORSO_PARTS: dict[str, tuple[str, ...]] = {
    "rib_cage": (r"re:^(right|left) \w+ rib$", r"re:^(right|left) \w+ costal cartilage$"),
    "sternum": ("FMA7485",),
    "vertebral_column": (
        "atlas",
        "axis",
        r"re:^\w+ (cervical|thoracic|lumbar) vertebra$",
        "FMA16202",  # sacrum
    ),
    "clavicle": ("FMA13322", "FMA13323"),
    "scapula": ("FMA13395", "FMA13396"),
    "pelvis": ("FMA16586", "FMA16587"),
}

FOOT = (
    r"re:^{s} (talus|calcaneus|cuboid bone)$",
    r"re:^navicular bone of {s} foot$",
    r"re:^{s} (medial|intermediate|lateral) cuneiform bone$",
    r"re:^{s} \w+ metatarsal bone$",
    r"re:^(proximal|middle|distal) phalanx of {s} \w+ toe$",
)

LIMB_PARTS: dict[str, tuple[str, ...]] = {}
for _side in ("right", "left"):
    LIMB_PARTS[f"humerus__{_side}"] = (f"{_side} humerus",)
    LIMB_PARTS[f"forearm__{_side}"] = (f"{_side} radius", f"{_side} ulna")
    LIMB_PARTS[f"femur__{_side}"] = (f"{_side} femur",)
    LIMB_PARTS[f"leg__{_side}"] = (f"{_side} tibia", f"{_side} fibula", f"{_side} patella")
    LIMB_PARTS[f"foot__{_side}"] = tuple(p.format(s=_side) for p in FOOT)


@dataclass
class Tables:
    names: dict[str, str]  # FMA id -> name
    elements: dict[str, list[str]]  # FMA id -> FJ element ids


def _read_tsv(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh, delimiter="\t"))
    return rows[1:]


def load_tables(raw_dir: Path) -> Tables:
    names: dict[str, str] = {}
    elements: dict[str, list[str]] = {}
    # PART-OF first, IS-A second: both trees share the same FJ element files.
    for tree in ("partof", "isa"):
        for row in _read_tsv(raw_dir / f"{tree}_parts_list_e.txt"):
            if len(row) >= 3:
                names.setdefault(row[0], row[2])
        for row in _read_tsv(raw_dir / f"{tree}_element_parts.txt"):
            if len(row) >= 3:
                bucket = elements.setdefault(row[0], [])
                if row[2] not in bucket:
                    bucket.append(row[2])
    return Tables(names=names, elements=elements)


def resolve_concepts(tables: Tables, concepts: tuple[str, ...]) -> list[tuple[str, str]]:
    """Return (fma_id, name) pairs for the given ids / names / regexes."""
    out: list[tuple[str, str]] = []
    for concept in concepts:
        if concept.startswith("FMA"):
            matches = [concept] if concept in tables.names else []
        elif concept.startswith("re:"):
            rx = re.compile(concept[3:])
            matches = sorted(k for k, v in tables.names.items() if rx.match(v))
        else:
            matches = [k for k, v in tables.names.items() if v == concept]
        if not matches:
            raise KeyError(f"BodyParts3D concept not found: {concept!r}")
        for fma in matches:
            if not tables.elements.get(fma):
                raise KeyError(f"Concept {fma} ({tables.names[fma]}) has no mesh elements")
            out.append((fma, tables.names[fma]))
    return out


def elements_for(tables: Tables, concepts: tuple[str, ...]) -> list[str]:
    seen: list[str] = []
    for fma, _ in resolve_concepts(tables, concepts):
        for fj in tables.elements[fma]:
            if fj not in seen:
                seen.append(fj)
    return seen


def required_elements(raw_dir: Path) -> set[str]:
    tables = load_tables(raw_dir)
    wanted: set[str] = set()
    for spec in HEAD_PARTS:
        wanted.update(elements_for(tables, spec.concepts))
    for fma in RIGHT_HAND_BONES.values():
        wanted.update(elements_for(tables, (fma,)))
    for concepts in (*TORSO_PARTS.values(), *LIMB_PARTS.values()):
        wanted.update(elements_for(tables, concepts))
    return wanted
