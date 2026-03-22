from datetime import datetime

from pydantic import BaseModel, Field, field_validator
from setta.types.chat_messages import BaseChatMessageUnion
from setta.types.generated.go_shared_types import LLMConfig
from setta.types.id import ID, create_new_id
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class ChatMetadata(BaseModel):
    id: ID = Field(default_factory=create_new_id)
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)
    llmConfig: LLMConfig
    projectConfigId: ID | None = None

    @field_validator("lastUpdated", mode="before")
    @classmethod
    def parse_last_updated(cls, v):
        if isinstance(v, str):
            return parse_timestamp_str(v)
        return v


class Chat(ChatMetadata):
    messages: list[BaseChatMessageUnion]
    systemPrompt: str | None = None


class ChatSectionBranch(BaseModel, extra="forbid"):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    createdAt: int = 0
    parentBranchId: ID | None = None
    branchFromMessageId: ID | None = None


class ChatSectionState(BaseModel, extra="forbid"):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    inputText: str = ""
    waitingForResponse: bool = False
    toolCallArguments: dict[str, str] = Field(default_factory=dict)
    activeBranchId: ID | None = None
    branches: dict[ID, ChatSectionBranch] = Field(default_factory=dict)


APIKeys = dict[str, str]
