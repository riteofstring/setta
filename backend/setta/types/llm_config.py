from typing import Any

from pydantic import BaseModel, ConfigDict


class LLMConfig(BaseModel):
    """Configuration for a single provider/model combination."""

    id: str
    model: str
    provider: str | None = None
    base_url: str | None = None
    api_key_env: str | None = None
    other_params: dict[str, Any] | None = None
    mcpServerIds: list[str] | None = None
    temporary: bool = False

    model_config = ConfigDict(extra="forbid")
