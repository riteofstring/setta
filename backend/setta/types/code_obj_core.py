from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string


class CodeObjCore(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
