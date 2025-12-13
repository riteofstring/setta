from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from setta.database.utils import create_new_id
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class ChatMetadata(BaseModel):
    id: ID = Field(default_factory=create_new_id)
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)
    llmConfig: LLMConfig
    projectConfigId: ID

    @field_validator("lastUpdated", mode="before")
    @classmethod
    def parse_last_updated(cls, v):
        if isinstance(v, str):
            return parse_timestamp_str(v)
        return v


class Chat(ChatMetadata):
    messages: list[BaseChatMessageUnion]


APIKeys = dict[str, str]
