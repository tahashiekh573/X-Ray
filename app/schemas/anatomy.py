from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Category(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    description: str


class Structure(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str = Field(pattern=r"^[a-z0-9_]+$")
    name: str
    category: str
    description: str
    function: str
    related: list[str] = Field(default_factory=list)


class AnatomyContent(BaseModel):
    """Shape of ``data/anatomy_content.json``."""

    version: int
    disclaimer: str
    categories: list[Category]
    structures: list[Structure]


class StructureList(BaseModel):
    disclaimer: str
    count: int
    structures: list[Structure]


class CategoryList(BaseModel):
    categories: list[Category]
