from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_defaults_are_safe() -> None:
    s = Settings(_env_file=None)  # type: ignore[call-arg]
    assert s.environment == "development"
    assert s.max_request_bytes <= 64 * 1024
    assert s.content_path.name == "anatomy_content.json"


def test_environment_variables_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("XRAY_ENVIRONMENT", "production")
    monkeypatch.setenv("XRAY_PORT", "9001")
    monkeypatch.setenv("XRAY_CORS_ORIGINS", "https://a.example, https://b.example")
    s = Settings(_env_file=None)  # type: ignore[call-arg]
    assert s.environment == "production"
    assert s.port == 9001
    assert s.cors_origins == ["https://a.example", "https://b.example"]


def test_env_file_is_read(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("XRAY_LOG_LEVEL=DEBUG\nXRAY_MAX_REQUEST_BYTES=2048\n", encoding="utf-8")
    s = Settings(_env_file=env)  # type: ignore[call-arg]
    assert s.log_level == "DEBUG"
    assert s.max_request_bytes == 2048


def test_invalid_values_are_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("XRAY_PORT", "70000")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # type: ignore[call-arg]
