from typing import Annotated

from pydantic import ConfigDict, Discriminator, Tag
from setta.types.generated.go_shared_types import (
    BaseDependencyValueUnion,
    BinaryDependencyValue,
    DependencyKeyType,
    DependencyValueType,
    FileReadDependencyValue,
    LiteralDependencyValue,
    _base_dependency_key_union_discriminator,
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
BaseDependencyKeyUnionWithDiscriminator = Annotated[
    Annotated[SectionDependencyKey, Tag(DependencyKeyType.Section.value)]
    | Annotated[
        SectionParamDependencyKey,
        Tag(DependencyKeyType.SectionParam.value),
    ],
    Discriminator(_base_dependency_key_union_discriminator),
]

__all__ = [
    "BaseDependencyKeyUnion",
    "BaseDependencyKeyUnionWithDiscriminator",
    "BaseDependencyValueUnion",
    "BinaryDependencyValue",
    "DependencyKeyType",
    "DependencyValueType",
    "FileReadDependencyValue",
    "LiteralDependencyValue",
    "SectionDependencyKey",
    "SectionParamDependencyKey",
    "create_dep_key",
]
