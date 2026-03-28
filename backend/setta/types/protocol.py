from typing import Annotated, Literal

from pydantic import ConfigDict, Field
from setta.types.generated.go_shared_types import (
    BinaryContentRef,
    DependencyKeyType,
    DependencyValueType,
)
from setta.types.generated.go_shared_types import (
    BinaryDependencyValue as GoBinaryDependencyValue,
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


class LiteralDependencyValue(GoLiteralDependencyValue):
    type: Literal[DependencyValueType.Literal] = DependencyValueType.Literal
    payload: str


class FileReadDependencyValue(GoFileReadDependencyValue):
    type: Literal[DependencyValueType.FileRead] = DependencyValueType.FileRead
    payload: str


class BinaryDependencyValue(GoBinaryDependencyValue):
    type: Literal[DependencyValueType.Binary] = DependencyValueType.Binary
    payload: BinaryContentRef


BaseDependencyValueUnion = (
    LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue
)

BaseDependencyValueUnionWithDiscriminator = Annotated[
    BaseDependencyValueUnion, Field(discriminator="type")
]
