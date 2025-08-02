from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.generated.impl_field_literals import AllImplFields
from setta.utils.generate_memorable_string import generate_memorable_string


class Core(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    sharedModifier: dict = Field(default_factory=dict)
    unsharedKeys: list[AllImplFields] = Field(
        default_factory=lambda: [
            "callable",
            "codeObjImplLayeringMap",
            "topLevelParamIds",
            "value",
        ]
    )


class Layering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    nonPresetImpls: list[str]
    modifier: dict = Field(default_factory=dict)
