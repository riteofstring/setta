from typing import Annotated

from pydantic import ConfigDict, Field
from setta.types.generated.go_shared_types import (
    BaseDependencyValueUnion,
    BinaryDependencyValue,
    DependencyKeyType,
    DependencyValueType,
    FileReadDependencyValue,
    LiteralDependencyValue,
)
from setta.types.generated.go_shared_types import (
    SectionDependencyKey as GoSectionDependencyKey,
)
from setta.types.generated.go_shared_types import (
    SectionParamDependencyKey as GoSectionParamDependencyKey,
)
from setta.types.id import ID


# Keep the public SDK models frozen/strict at the Python boundary while the
# field shape and discriminator semantics remain generated from Go.
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
    SectionDependencyKey | SectionParamDependencyKey,
    Field(discriminator="type"),
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
