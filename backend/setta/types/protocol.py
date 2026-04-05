from typing import Annotated, Any

from pydantic import ConfigDict, Discriminator, Tag
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


class SectionParamDependencyKey(GoSectionParamDependencyKey):
    model_config = ConfigDict(extra="forbid", frozen=True)


def create_dep_key(sectionId: ID, codeObjId: ID | None = None):
    if codeObjId is None:
        return SectionDependencyKey(
            type=DependencyKeyType.Section,
            sectionId=sectionId,
        )
    return SectionParamDependencyKey(
        type=DependencyKeyType.SectionParam,
        sectionId=sectionId,
        codeObjId=codeObjId,
    )


BaseDependencyKeyUnion = SectionDependencyKey | SectionParamDependencyKey


def _dependency_key_type(value: Any) -> str | None:
    raw_type = (
        value.get("type") if isinstance(value, dict) else getattr(value, "type", None)
    )
    if isinstance(raw_type, DependencyKeyType):
        return raw_type.value
    if isinstance(raw_type, str):
        return raw_type
    return None


BaseDependencyKeyUnionWithDiscriminator = Annotated[
    Annotated[SectionDependencyKey, Tag(DependencyKeyType.Section.value)]
    | Annotated[
        SectionParamDependencyKey,
        Tag(DependencyKeyType.SectionParam.value),
    ],
    Discriminator(_dependency_key_type),
]


def _dependency_value_type(value: Any) -> str | None:
    raw_type = (
        value.get("type") if isinstance(value, dict) else getattr(value, "type", None)
    )
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
