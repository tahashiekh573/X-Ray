from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.core.dependencies import AnatomyServiceDep, ConfigServiceDep
from app.schemas.config import ClientConfig
from app.schemas.health import Health

router = APIRouter(tags=["system"])


@router.get("/health", response_model=Health)
async def health(service: AnatomyServiceDep) -> Health:
    available = await service.is_available()
    return Health(
        status="ok" if available else "degraded", version=__version__, content_available=available
    )


@router.get("/config", response_model=ClientConfig)
async def client_config(service: ConfigServiceDep) -> ClientConfig:
    return service.client_config()
