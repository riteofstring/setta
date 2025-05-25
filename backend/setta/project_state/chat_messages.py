from typing import Literal

from pydantic import BaseModel


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: list


class Chat(BaseModel):
    id: str
    name: str
    lastUpdated: str = ""
    messages: list[ChatMessage]
