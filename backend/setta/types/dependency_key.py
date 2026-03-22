from dataclasses import dataclass, field
from typing import Annotated, Literal

from pydantic import Field
from setta.types.generated.go_shared_types import DependencyKeyType
from setta.types.id import ID


@dataclass(frozen=True, slots=True)
class BaseDependencyKey:
    type: DependencyKeyType  # stays as a field on the instance


@dataclass(frozen=True, slots=True)
class SectionDependencyKey(BaseDependencyKey):
    sectionId: ID
    type: Literal[DependencyKeyType.Section] = field(
        default=DependencyKeyType.Section, init=False
    )


@dataclass(frozen=True, slots=True)
class SectionParamDependencyKey(BaseDependencyKey):
    sectionId: ID
    codeObjId: ID
    type: Literal[DependencyKeyType.SectionParam] = field(
        default=DependencyKeyType.SectionParam, init=False
    )


def create_dep_key(sectionId: ID, codeObjId: ID | None = None):
    if codeObjId is None:
        return SectionDependencyKey(sectionId=sectionId)
    return SectionParamDependencyKey(sectionId=sectionId, codeObjId=codeObjId)


BaseDependencyKeyUnion = SectionDependencyKey | SectionParamDependencyKey

BaseDependencyKeyUnionWithDiscriminator = Annotated[
    BaseDependencyKeyUnion, Field(discriminator="type")
]
