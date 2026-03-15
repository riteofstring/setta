from pydantic import BaseModel, Field
from setta.types.generated.impl_field_literals import AllImplFields
from setta.types.generated.shared_modifier import SharedModifier
from setta.types.id import ID, create_new_id
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
            "edgeInputParams",
            "edgeOutputPorts",
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
