"""Contract for future agents: typed Pydantic input and output, async execution."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Generic, TypeVar

from pydantic import BaseModel

InputT = TypeVar("InputT", bound=BaseModel)
OutputT = TypeVar("OutputT", bound=BaseModel)


class BaseAgent(ABC, Generic[InputT, OutputT]):
    name: str = "base"

    @abstractmethod
    async def run(self, payload: InputT) -> OutputT:
        """Execute the agent. Implementations must never receive camera or biometric data."""
