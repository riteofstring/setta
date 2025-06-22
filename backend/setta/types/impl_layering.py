from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.generated_code_obj_impl_modifier_unions import (
    BaseCodeObjImplModifierUnion,
)
from setta.types.generated_section_impl_modifier_unions import (
    BaseSectionImplModifierUnion,
)
from setta.utils.generate_memorable_string import generate_memorable_string


class ImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    modifier: BaseSectionImplModifierUnion | BaseCodeObjImplModifierUnion
