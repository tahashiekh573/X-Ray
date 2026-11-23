"""Cross-checks between educational content and the generated 3D asset manifest."""

from __future__ import annotations

import json

import pytest

from app.core.config import PROJECT_ROOT

CONTENT = json.loads((PROJECT_ROOT / "data" / "anatomy_content.json").read_text(encoding="utf-8"))
MANIFEST_PATH = PROJECT_ROOT / "web" / "public" / "models" / "anatomy_manifest.json"


def test_structure_ids_are_unique() -> None:
    ids = [s["id"] for s in CONTENT["structures"]]
    assert len(ids) == len(set(ids))


def test_related_ids_resolve() -> None:
    ids = {s["id"] for s in CONTENT["structures"]}
    for s in CONTENT["structures"]:
        assert set(s["related"]) <= ids, s["id"]


def test_categories_resolve() -> None:
    cats = {c["id"] for c in CONTENT["categories"]}
    assert {s["category"] for s in CONTENT["structures"]} <= cats


def test_schematic_muscles_are_labelled_as_schematic() -> None:
    if not MANIFEST_PATH.exists():
        pytest.skip("assets not built")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    names = {s["id"]: s["name"] for s in CONTENT["structures"]}
    for sid, entry in manifest["structures"].items():
        if entry["schematic"]:
            assert "schematic" in names[sid].lower(), sid


def test_every_rendered_structure_has_content() -> None:
    if not MANIFEST_PATH.exists():
        pytest.skip("assets not built (run scripts/assets/build_anatomy_assets.py)")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    content_ids = {s["id"] for s in CONTENT["structures"]}
    assert set(manifest["structures"]) <= content_ids
    assert manifest["attribution"].startswith("BodyParts3D")
