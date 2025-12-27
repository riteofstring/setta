from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.generated.impl_field_literals import AllImplFields
from setta.types.generated.shared_modifier import SharedModifier
from setta.types.id import ID
from setta.types.section_impls import BaseSectionImpl, SectionType
from setta.utils.generate_memorable_string import generate_memorable_string


class Core(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    displayName: str = ""
    variants: list[ID] = Field(default_factory=list)
    defaultVariant: ID | None = None
    sharedModifier: SharedModifier = Field(default_factory=SharedModifier)
    unsharedKeys: list[AllImplFields] = Field(
        default_factory=lambda: [
            "callable",
            "codeObjVariantMap",
            "topLevelParamId",
            "value",
            "layers",
        ]
    )


class Variant(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: ID
    nonPresetImpls: list[ID]
    modifier: SharedModifier = Field(default_factory=SharedModifier)
    isFrozen: bool = False


def compute_initial_nonPresetImpls(impl: BaseCodeObjImpl | BaseSectionImpl):
    return [] if impl.isPreset else [impl.id]


def get_default_section_core_name(implType: SectionType):
    match implType:
        case SectionType.GlobalVariables:
            return "Global Variables"
        case SectionType.GenPythonCode:
            return "Generated Python Code"
    return generate_memorable_string()
