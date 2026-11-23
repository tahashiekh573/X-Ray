"""Minimal access logging: method, path (without query string), status and duration.

Request and response bodies are never logged.
"""

from __future__ import annotations

import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import get_logger

logger = get_logger("app.access")


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        status = 500

        async def capture(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, capture)
        finally:
            if str(scope.get("path", "")).startswith("/api"):
                logger.info(
                    "%s %s -> %d (%.1f ms)",
                    scope.get("method", "?"),
                    scope.get("path", "?"),
                    status,
                    (time.perf_counter() - start) * 1000,
                )
