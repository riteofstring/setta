from typing import Annotated, Any, Literal

from pydantic import ConfigDict, Discriminator, Field, Tag
from setta.types.generated.go_shared_types import (
    BinaryDependencyValue as GoBinaryDependencyValue,
)
from setta.types.generated.go_shared_types import (
    DependencyKeyType,
    DependencyValueType,
)
from setta.types.generated.go_shared_types import (
    FileReadDependencyValue as GoFileReadDependencyValue,
)
from setta.types.generated.go_shared_types import (
    LiteralDependencyValue as GoLiteralDependencyValue,
)
from setta.types.generated.go_shared_types import (
    SectionDependencyKey as GoSectionDependencyKey,
)
from setta.types.generated.go_shared_types import (
    SectionParamDependencyKey as GoSectionParamDependencyKey,
)
from setta.types.id import ID


class SectionDependencyKey(GoSectionDependencyKey):
    model_config = ConfigDict(extra="forbid", frozen=True)

    sectionId: ID
    type: Literal[DependencyKeyType.Section] = DependencyKeyType.Section


class SectionParamDependencyKey(GoSectionParamDependencyKey):
    model_config = ConfigDict(extra="forbid", frozen=True)

    sectionId: ID
    codeObjId: ID
    type: Literal[DependencyKeyType.SectionParam] = DependencyKeyType.SectionParam


def create_dep_key(sectionId: ID, codeObjId: ID | None = None):
    if codeObjId is None:
        return SectionDependencyKey(sectionId=sectionId)
    return SectionParamDependencyKey(sectionId=sectionId, codeObjId=codeObjId)


BaseDependencyKeyUnion = SectionDependencyKey | SectionParamDependencyKey

BaseDependencyKeyUnionWithDiscriminator = Annotated[
    BaseDependencyKeyUnion, Field(discriminator="type")
]


def _dependency_value_type(value: Any) -> str | None:
    raw_type = value.get("type") if isinstance(value, dict) else getattr(value, "type", None)
    if isinstance(raw_type, DependencyValueType):
        return raw_type.value
    if isinstance(raw_type, str):
        return raw_type
    return None


BaseDependencyValueUnion = Annotated[
    Annotated[GoLiteralDependencyValue, Tag(DependencyValueType.Literal.value)]
    | Annotated[GoFileReadDependencyValue, Tag(DependencyValueType.FileRead.value)]
    | Annotated[GoBinaryDependencyValue, Tag(DependencyValueType.Binary.value)],
    Discriminator(_dependency_value_type),
]

BaseDependencyValueUnionWithDiscriminator = BaseDependencyValueUnion
