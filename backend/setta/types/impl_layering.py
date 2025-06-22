from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.code_obj_impl_modifiers import CodeObjImplModifier
from setta.types.section_impl_modifiers import SectionImplModifier
from setta.utils.generate_memorable_string import generate_memorable_string


class ImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    modifier: CodeObjImplModifier | SectionImplModifier
