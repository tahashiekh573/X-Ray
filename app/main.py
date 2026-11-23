"""Application entry point.

Request flow: main.py -> middlewares -> routers -> services -> repositories.
(Orchestrators, agents and clients are part of the architectural convention but are unused: the
real-time vision/rendering pipeline lives in the browser and the backend calls no external APIs.)
"""

from __future__ import annotations

import mimetypes
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.logging import configure_logging, get_logger
from app.middlewares.privacy_guard import PrivacyGuardMiddleware
from app.middlewares.request_logging import RequestLoggingMiddleware
from app.middlewares.security_headers import SecurityHeadersMiddleware
from app.routers import anatomy, system

# Windows' registry often lacks these; correct types matter (WASM streaming compile, GLB).
for ext, mime in (
    (".wasm", "application/wasm"),
    (".glb", "model/gltf-binary"),
    (".task", "application/octet-stream"),
    (".mjs", "text/javascript"),
    (".js", "text/javascript"),
):
    mimetypes.add_type(mime, ext)

logger = get_logger(__name__)


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    if not index.is_file():
        logger.info("Frontend build not found at %s; serving API only", dist)
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
    root = dist.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        return FileResponse(index)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info("%s %s starting (%s)", settings.app_name, __version__, settings.environment)
        yield

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.dependency_overrides[get_settings] = lambda: settings

    # Middleware order: last added runs first.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET"],
        allow_headers=["Content-Type"],
    )
    app.add_middleware(PrivacyGuardMiddleware, max_bytes=settings.max_request_bytes)
    app.add_middleware(SecurityHeadersMiddleware, enable_hsts=settings.enable_hsts)
    app.add_middleware(RequestLoggingMiddleware)

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    app.include_router(system.router, prefix="/api/v1")
    app.include_router(anatomy.router, prefix="/api/v1")

    if settings.serve_frontend:
        _mount_frontend(app, settings.frontend_dist)
    return app


app = create_app()


def run() -> None:  # pragma: no cover - convenience entry point
    import uvicorn

    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)


if __name__ == "__main__":  # pragma: no cover
    run()
