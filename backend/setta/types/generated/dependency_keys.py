from typing import Annotated

from pydantic import Field
from setta.types.dependency_key import SectionDependencyKey, SectionParamDependencyKey

BaseDependencyKeyUnion = SectionDependencyKey | SectionParamDependencyKey

BaseDependencyKeyUnionWithDiscriminator = Annotated[
    BaseDependencyKeyUnion, Field(discriminator="type")
]
