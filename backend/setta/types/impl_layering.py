from typing import Any

from pydantic import BaseModel, Field, SerializeAsAny

from setta.database.utils import create_new_id
from setta.types.code_obj_impl_modifiers import BaseCodeObjImplModifier
from setta.types.section_impl_modifiers import BaseSectionImplModifier
from setta.utils.generate_memorable_string import generate_memorable_string


class ImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    modifier: Any


class SectionImplLayering(ImplLayering):
    modifier: SerializeAsAny[BaseSectionImplModifier] = Field(
        default_factory=BaseSectionImplModifier
    )


class CodeObjImplLayering(ImplLayering):
    modifier: SerializeAsAny[BaseCodeObjImplModifier] = Field(
        default_factory=BaseCodeObjImplModifier
    )
