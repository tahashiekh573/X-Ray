"""Privacy guard: the API must never receive camera frames or other media.

All legitimate API calls are small JSON GETs. This middleware rejects, for every ``/api`` path:
  * media and binary uploads (image/*, video/*, audio/*, multipart/*, application/octet-stream)
    -> 415
  * chunked bodies of unknown length -> 411
  * request bodies larger than ``max_bytes`` (declared or counted while reading) -> 413
It is defence-in-depth: no endpoint accepts uploads in the first place.
"""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import get_logger

logger = get_logger(__name__)

BLOCKED_CONTENT_PREFIXES = ("image/", "video/", "audio/", "multipart/", "application/octet-stream")


class _BodyTooLargeError(Exception):
    pass


async def _reject(send: Send, status: int, code: str, message: str) -> None:
    body = json.dumps({"error": {"code": code, "message": message}}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class PrivacyGuardMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int, path_prefix: str = "/api") -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.path_prefix = path_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not str(scope.get("path", "")).startswith(self.path_prefix):
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        content_type = headers.get("content-type", "").lower()
        if content_type.startswith(BLOCKED_CONTENT_PREFIXES):
            logger.warning("Rejected media upload attempt to %s", scope["path"])
            await _reject(
                send,
                415,
                "media_not_accepted",
                "This API never accepts camera frames or media uploads.",
            )
            return
        declared = headers.get("content-length")
        if declared is None and "chunked" in headers.get("transfer-encoding", "").lower():
            await _reject(
                send,
                411,
                "length_required",
                "Streamed request bodies are not accepted by this API.",
            )
            return
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await _reject(send, 413, "payload_too_large", "Request body exceeds the allowed size.")
            return

        received = 0
        response_started = False

        async def guarded_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLargeError
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, guarded_receive, tracking_send)
        except _BodyTooLargeError:
            if not response_started:
                await _reject(
                    send, 413, "payload_too_large", "Request body exceeds the allowed size."
                )
