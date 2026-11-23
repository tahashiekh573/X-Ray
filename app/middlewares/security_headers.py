"""Security headers suitable for a camera-using single-page app.

* Camera access is limited to this origin via Permissions-Policy; microphone/geolocation are off.
* The CSP allows only same-origin scripts plus ``'wasm-unsafe-eval'`` (needed to compile the
  self-hosted MediaPipe WebAssembly). ``connect-src 'self'`` means the page cannot send data to
  any third-party host, which enforces the "no uploads" privacy rule in the browser too.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "worker-src 'self' blob:",
        "connect-src 'self' blob: data:",
        "img-src 'self' data: blob:",
        "media-src 'self' blob: mediastream:",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)

BASE_HEADERS: list[tuple[bytes, bytes]] = [
    (b"content-security-policy", CSP.encode()),
    (b"permissions-policy", b"camera=(self), microphone=(), geolocation=(), payment=(), usb=()"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"cross-origin-opener-policy", b"same-origin"),
]


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, enable_hsts: bool = False) -> None:
        self.app = app
        self.headers = list(BASE_HEADERS)
        if enable_hsts:
            self.headers.append((b"strict-transport-security", b"max-age=31536000"))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message.get("headers", [])}
                extra = [(k, v) for k, v in self.headers if k not in existing]
                message["headers"] = [*message.get("headers", []), *extra]
            await send(message)

        await self.app(scope, receive, send_with_headers)
