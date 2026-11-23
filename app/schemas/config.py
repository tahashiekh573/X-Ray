from __future__ import annotations

from pydantic import BaseModel


class PrivacyPolicy(BaseModel):
    camera_processing: str
    uploads: str
    analytics: str
    storage: str


class ClientConfig(BaseModel):
    """Non-sensitive runtime configuration for the web client."""

    app_name: str
    version: str
    environment: str
    default_performance_mode: str
    content_endpoint: str
    privacy: PrivacyPolicy
