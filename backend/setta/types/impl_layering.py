from pydantic import BaseModel, Field, field_validator

from setta.database.utils import create_new_id
from setta.types.generated.impl_modifier_unions import (
    AllImplModifierUnion,
    AllImplModifierUnionTypeAdapter,
)
from setta.utils.generate_memorable_string import generate_memorable_string


class ImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    modifier: AllImplModifierUnion

    @field_validator("modifier", mode="before")
    @classmethod
    def validate_modifier(cls, v):
        return AllImplModifierUnionTypeAdapter.validate_python(v)
