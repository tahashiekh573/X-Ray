from __future__ import annotations

from app.core.errors import AppError, NotFoundError
from app.repositories.content_repository import ContentRepository
from app.schemas.anatomy import CategoryList, Structure, StructureList


class AnatomyService:
    def __init__(self, repository: ContentRepository) -> None:
        self._repository = repository

    async def list_structures(self, category: str | None = None) -> StructureList:
        content = await self._repository.load()
        items = [s for s in content.structures if category is None or s.category == category]
        return StructureList(disclaimer=content.disclaimer, count=len(items), structures=items)

    async def get_structure(self, structure_id: str) -> Structure:
        content = await self._repository.load()
        for structure in content.structures:
            if structure.id == structure_id:
                return structure
        raise NotFoundError(f"Unknown anatomical structure: {structure_id}")

    async def list_categories(self) -> CategoryList:
        content = await self._repository.load()
        return CategoryList(categories=content.categories)

    async def is_available(self) -> bool:
        try:
            await self._repository.load()
        except AppError:
            return False
        return True
