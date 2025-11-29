from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from setta.database.utils import create_new_id
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class ChatMetadata(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)

    @field_validator("lastUpdated", mode="before")
    @classmethod
    def parse_last_updated(cls, v):
        if isinstance(v, str):
            return parse_timestamp_str(v)
        return v


class Chat(ChatMetadata):
    messages: list[BaseChatMessageUnion]
    selectedLLM: str = Field(default="")

    @field_validator("selectedLLM", mode="before")
    @classmethod
    def ensure_string(cls, value: str | None) -> str:
        if value is None:
            return ""
        return value
