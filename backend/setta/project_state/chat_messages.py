from pydantic import BaseModel


class ChatMessage(BaseModel):
    id: str
    role: str
    content: list


class Chat(BaseModel):
    id: str
    name: str
    lastUpdated: str
    messages: list[ChatMessage]
