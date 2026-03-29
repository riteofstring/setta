from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

from setta.types.id import ID


class DependencyKeyType(str, Enum):
    Section = "Section"
    SectionParam = "SectionParam"


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
