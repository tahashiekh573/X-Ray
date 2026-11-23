from __future__ import annotations

from app import __version__
from app.core.config import Settings
from app.schemas.config import ClientConfig, PrivacyPolicy


class ConfigService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def client_config(self) -> ClientConfig:
        return ClientConfig(
            app_name=self._settings.app_name,
            version=__version__,
            environment=self._settings.environment,
            default_performance_mode="balanced",
            content_endpoint="/api/v1/anatomy/structures",
            privacy=PrivacyPolicy(
                camera_processing="on-device (browser); frames never leave the device",
                uploads="none; the API rejects media and oversized request bodies",
                analytics="none",
                storage="optional calibration and preferences in browser localStorage only",
            ),
        )
