"""Application settings loaded from environment variables (prefix ``XRAY_``) and ``.env``."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="XRAY_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "X-Ray Mirror Pro"
    environment: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    # Comma-separated in the environment, e.g. XRAY_CORS_ORIGINS=https://a.example,https://b.example
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )
    content_path: Path = PROJECT_ROOT / "data" / "anatomy_content.json"
    serve_frontend: bool = True
    frontend_dist: Path = PROJECT_ROOT / "web" / "dist"
    # Privacy guard: API requests carry no media, so bodies are tiny. Anything bigger is refused.
    max_request_bytes: int = Field(default=16 * 1024, ge=0)
    enable_hsts: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip().startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
