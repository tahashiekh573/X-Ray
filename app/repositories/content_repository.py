"""File-backed repository for curated educational anatomy content."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Protocol

from pydantic import ValidationError

from app.core.errors import ContentUnavailableError
from app.core.logging import get_logger
from app.schemas.anatomy import AnatomyContent

logger = get_logger(__name__)


class ContentRepository(Protocol):
    async def load(self) -> AnatomyContent: ...


class JsonContentRepository:
    """Reads ``anatomy_content.json`` off the event loop and caches it until the file changes."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._cache: AnatomyContent | None = None
        self._mtime: float | None = None
        self._lock = asyncio.Lock()

    async def load(self) -> AnatomyContent:
        async with self._lock:
            try:
                mtime = await asyncio.to_thread(lambda: self._path.stat().st_mtime)
            except OSError as exc:
                raise ContentUnavailableError("Anatomy content file is missing") from exc
            if self._cache is None or mtime != self._mtime:
                self._cache = await asyncio.to_thread(self._read)
                self._mtime = mtime
                logger.info("Loaded %d anatomy structures", len(self._cache.structures))
            return self._cache

    def _read(self) -> AnatomyContent:
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            return AnatomyContent.model_validate(raw)
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            raise ContentUnavailableError("Anatomy content file is invalid") from exc
