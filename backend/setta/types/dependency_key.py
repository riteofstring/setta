from typing import Annotated, Literal

from pydantic import ConfigDict, Field
from setta.types.generated.go_shared_types import (
    DependencyKeyType,
    SectionDependencyKey as GoSectionDependencyKey,
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
