from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.generated.impl_field_literals import AllImplFields
from setta.types.section_impls import BaseSectionImpl, SectionType
from setta.utils.generate_memorable_string import generate_memorable_string


class Core(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    variants: list[str] = Field(default_factory=list)
    defaultVariant: str | None = None
    sharedModifier: dict = Field(default_factory=dict)
    unsharedKeys: list[AllImplFields] = Field(
        default_factory=lambda: [
            "callable",
            "codeObjVariantMap",
            "topLevelParamIds",
            "value",
        ]
    )


class Variant(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    nonPresetImpls: list[str]
    modifier: dict = Field(default_factory=dict)


def compute_initial_default_variant(variant: Variant):
    return {"variants": [variant.id], "defaultVariant": variant.id}


def compute_initial_nonPresetImpls(impl: BaseCodeObjImpl | BaseSectionImpl):
    return [] if impl.isPreset else [impl.id]


def get_default_section_core_name(implType: SectionType):
    match implType:
        case SectionType.GlobalVariables:
            return "Global Variables"
        case SectionType.GenPythonCode:
            return "Generated Python Code"
    return generate_memorable_string()
