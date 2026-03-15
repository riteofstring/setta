from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from setta.types.id import ID, create_new_id


class PromptFormat(str, Enum):
    Jinja = "Jinja"


class PromptTemplate(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str
    description: str = ""
    template: str
    format: PromptFormat = PromptFormat.Jinja
    inputSchema: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
