from typing import Literal

from pydantic import BaseModel, Field

from setta.types.chat_messages import ChatFileAttachment, ChatRole
from setta.types.id import ID


class ChatSendEvent(BaseModel):
    action: Literal["send"] = "send"
    sectionId: ID
    messageId: str
    text: str
    attachments: list[ChatFileAttachment] = Field(default_factory=list)
    role: ChatRole
    timestampMs: int
    managed: bool


class ChatStopEvent(BaseModel):
    action: Literal["stop"] = "stop"
    sectionId: ID
    timestampMs: int
    managed: bool


ChatActionEvent = ChatSendEvent | ChatStopEvent
