from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.config import PROJECT_ROOT
from app.core.errors import ContentUnavailableError, NotFoundError
from app.repositories.content_repository import JsonContentRepository
from app.services.anatomy_service import AnatomyService

CONTENT = PROJECT_ROOT / "data" / "anatomy_content.json"


@pytest.fixture
def service() -> AnatomyService:
    return AnatomyService(JsonContentRepository(CONTENT))


async def test_lists_all_structures(service: AnatomyService) -> None:
    result = await service.list_structures()
    assert result.count == len(result.structures) > 30
    assert "not medical imaging" in result.disclaimer


async def test_filters_by_category(service: AnatomyService) -> None:
    result = await service.list_structures("brain")
    assert result.count >= 4
    assert {s.category for s in result.structures} == {"brain"}


async def test_get_mandible(service: AnatomyService) -> None:
    mandible = await service.get_structure("mandible")
    assert mandible.name == "Mandible"
    assert "lower jaw" in mandible.description.lower()


async def test_unknown_structure_raises(service: AnatomyService) -> None:
    with pytest.raises(NotFoundError):
        await service.get_structure("flux_capacitor")


async def test_missing_file_reports_unavailable(tmp_path: Path) -> None:
    svc = AnatomyService(JsonContentRepository(tmp_path / "missing.json"))
    with pytest.raises(ContentUnavailableError):
        await svc.list_structures()
    assert await svc.is_available() is False


async def test_invalid_file_reports_unavailable(tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"version": 1}), encoding="utf-8")
    with pytest.raises(ContentUnavailableError):
        await AnatomyService(JsonContentRepository(bad)).list_structures()


async def test_reloads_when_file_changes(tmp_path: Path) -> None:
    path = tmp_path / "content.json"
    data = json.loads(CONTENT.read_text(encoding="utf-8"))
    path.write_text(json.dumps(data), encoding="utf-8")
    repo = JsonContentRepository(path)
    first = await repo.load()
    data["structures"] = data["structures"][:3]
    path.write_text(json.dumps(data), encoding="utf-8")
    import os

    os.utime(path, (first_mtime := path.stat().st_mtime + 5, first_mtime))
    second = await repo.load()
    assert len(second.structures) == 3 != len(first.structures)
