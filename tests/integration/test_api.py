from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["content_available"] is True


def test_config_is_non_sensitive(client: TestClient) -> None:
    body = client.get("/api/v1/config").json()
    assert body["default_performance_mode"] == "balanced"
    assert "on-device" in body["privacy"]["camera_processing"]
    serialized = str(body).lower()
    for forbidden in ("key", "secret", "token", "password"):
        assert forbidden not in serialized


def test_list_and_filter_structures(client: TestClient) -> None:
    all_items = client.get("/api/v1/anatomy/structures").json()
    assert all_items["count"] > 30
    skull = client.get("/api/v1/anatomy/structures", params={"category": "skull"}).json()
    assert skull["count"] > 0
    assert all(s["category"] == "skull" for s in skull["structures"])


def test_get_structure_and_404(client: TestClient) -> None:
    assert client.get("/api/v1/anatomy/structures/mandible").json()["category"] == "skull"
    missing = client.get("/api/v1/anatomy/structures/unknown_bone")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"


def test_invalid_path_parameter_is_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/anatomy/structures/DROP TABLE").status_code == 422


def test_categories(client: TestClient) -> None:
    ids = {c["id"] for c in client.get("/api/v1/anatomy/categories").json()["categories"]}
    assert {"skull", "brain", "eyes", "muscles", "hands"} <= ids


def test_security_headers(client: TestClient) -> None:
    res = client.get("/api/v1/health")
    assert "camera=(self)" in res.headers["permissions-policy"]
    assert "microphone=()" in res.headers["permissions-policy"]
    csp = res.headers["content-security-policy"]
    assert "connect-src 'self'" in csp
    assert "'wasm-unsafe-eval'" in csp
    assert res.headers["x-content-type-options"] == "nosniff"


def test_only_get_is_allowed_cross_origin(client: TestClient) -> None:
    res = client.options(
        "/api/v1/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert "POST" not in res.headers.get("access-control-allow-methods", "")
