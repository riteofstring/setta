from pydantic import BaseModel, Field

from setta.database.utils import create_new_id


class ImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    impl: str
    modifiers: list = Field(default_factory=list)
