from typing import Annotated

from pydantic import Field, TypeAdapter
from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
)

BaseDependencyKeyUnion = SectionDependencyKey | SectionParamDependencyKey

BaseDependencyKeyUnionWithDiscriminator = Annotated[
    BaseDependencyKeyUnion, Field(discriminator="type")
]

BaseDependencyKeyTypeAdapter = TypeAdapter(BaseDependencyKeyUnionWithDiscriminator)

BaseDependencyKeyTypeSet = set(["Section", "SectionParam"])
