from pydantic import BaseModel, Field
from setta.types.chat_messages import BaseChatMessageUnion
from setta.types.id import ID


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
