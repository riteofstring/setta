from pydantic import BaseModel, Field

from setta.types.chat import APIKeys


class ManagedAPIKeysSnapshot(BaseModel):
    apiKeys: APIKeys = Field(default_factory=dict)
    revision: int = Field(ge=0)
    corrupt: bool = False
    errorCode: str | None = None
    message: str | None = None
