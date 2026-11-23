"""Domain errors translated to HTTP responses by exception handlers in ``main.py``."""

from __future__ import annotations


class AppError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ContentUnavailableError(AppError):
    status_code = 503
    code = "content_unavailable"
