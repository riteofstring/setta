from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string


class Core(BaseModel, extras="forbid"):
    id: str = Field(default_factory=create_new_id)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    sharedModifier: dict = Field(default_factory=dict)
    unsharedKeys: list[str] = Field(default_factory=list)


class Layering(BaseModel, extras="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    nonPresetImpls: list[str]
    modifier: dict = Field(default_factory=dict)
