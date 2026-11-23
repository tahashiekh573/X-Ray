"""The backend must never accept camera frames, landmarks or other media."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FAKE_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


@pytest.mark.parametrize(
    "content_type",
    ["image/jpeg", "image/png", "video/webm", "application/octet-stream", "audio/wav"],
)
def test_media_uploads_are_rejected(client: TestClient, content_type: str) -> None:
    res = client.post(
        "/api/v1/anatomy/structures", content=FAKE_JPEG, headers={"content-type": content_type}
    )
    assert res.status_code == 415
    assert res.json()["error"]["code"] == "media_not_accepted"


def test_multipart_frame_upload_is_rejected(client: TestClient) -> None:
    res = client.post("/api/v1/health", files={"frame": ("frame.jpg", FAKE_JPEG, "image/jpeg")})
    assert res.status_code == 415


def test_oversized_json_body_is_rejected(client: TestClient) -> None:
    landmarks = "[" + ",".join(["[0.5,0.5,0.0]"] * 478) + "]"  # a full face-landmark payload
    res = client.post(
        "/api/v1/health", content=landmarks, headers={"content-type": "application/json"}
    )
    assert res.status_code == 413


def test_streamed_oversized_body_is_rejected(client: TestClient) -> None:
    def chunks():  # no Content-Length header -> chunked transfer
        for _ in range(8):
            yield b"x" * 512

    res = client.post("/api/v1/health", content=chunks(), headers={"content-type": "text/plain"})
    assert res.status_code == 411
    assert res.json()["error"]["code"] == "length_required"


def test_no_route_accepts_writes(client: TestClient) -> None:
    app = create_app()
    for route in app.routes:
        methods = getattr(route, "methods", None) or set()
        path = getattr(route, "path", "")
        if path.startswith("/api/v1"):
            assert methods <= {"GET", "HEAD"}, f"{path} accepts {methods}"


def test_small_get_requests_pass(client: TestClient) -> None:
    assert client.get("/api/v1/health").status_code == 200
