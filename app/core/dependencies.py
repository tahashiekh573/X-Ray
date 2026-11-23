"""FastAPI dependency providers (composition root for repositories and services)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.repositories.content_repository import ContentRepository, JsonContentRepository
from app.services.anatomy_service import AnatomyService
from app.services.config_service import ConfigService

SettingsDep = Annotated[Settings, Depends(get_settings)]

_repositories: dict[str, JsonContentRepository] = {}


def get_content_repository(settings: SettingsDep) -> ContentRepository:
    key = str(settings.content_path)
    if key not in _repositories:
        _repositories[key] = JsonContentRepository(settings.content_path)
    return _repositories[key]


def get_anatomy_service(
    repository: Annotated[ContentRepository, Depends(get_content_repository)],
) -> AnatomyService:
    return AnatomyService(repository)


def get_config_service(settings: SettingsDep) -> ConfigService:
    return ConfigService(settings)


AnatomyServiceDep = Annotated[AnatomyService, Depends(get_anatomy_service)]
ConfigServiceDep = Annotated[ConfigService, Depends(get_config_service)]
