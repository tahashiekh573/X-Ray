from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core.dependencies import AnatomyServiceDep
from app.schemas.anatomy import CategoryList, Structure, StructureList
from app.schemas.errors import ErrorResponse

router = APIRouter(prefix="/anatomy", tags=["anatomy"])


@router.get("/structures", response_model=StructureList)
async def list_structures(
    service: AnatomyServiceDep,
    category: Annotated[str | None, Query(pattern=r"^[a-z_]+$", max_length=32)] = None,
) -> StructureList:
    return await service.list_structures(category)


@router.get(
    "/structures/{structure_id}",
    response_model=Structure,
    responses={404: {"model": ErrorResponse}},
)
async def get_structure(
    service: AnatomyServiceDep,
    structure_id: Annotated[str, Path(pattern=r"^[a-z0-9_]+$", max_length=64)],
) -> Structure:
    return await service.get_structure(structure_id)


@router.get("/categories", response_model=CategoryList)
async def list_categories(service: AnatomyServiceDep) -> CategoryList:
    return await service.list_categories()
