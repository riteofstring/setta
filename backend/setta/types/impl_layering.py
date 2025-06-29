from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.generated.impl_modifier_unions import (
    BaseCodeObjImplModifierUnionWithDiscriminator,
    BaseSectionImplModifierUnionWithDiscriminator,
)
from setta.utils.generate_memorable_string import generate_memorable_string


class SectionImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    modifier: BaseSectionImplModifierUnionWithDiscriminator


class CodeObjImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    modifier: BaseCodeObjImplModifierUnionWithDiscriminator
