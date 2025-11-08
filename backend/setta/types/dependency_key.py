from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class DependencyKeyType(str, Enum):
    Section = "Section"
    SectionParam = "SectionParam"


@dataclass(frozen=True, slots=True)
class BaseDependencyKey:
    type: DependencyKeyType  # stays as a field on the instance


@dataclass(frozen=True, slots=True)
class SectionDependencyKey(BaseDependencyKey):
    sectionId: str
    type: Literal[DependencyKeyType.Section] = field(
        default=DependencyKeyType.Section, init=False
    )


@dataclass(frozen=True, slots=True)
class SectionParamDependencyKey(BaseDependencyKey):
    sectionId: str
    codeObjId: str
    type: Literal[DependencyKeyType.SectionParam] = field(
        default=DependencyKeyType.SectionParam, init=False
    )


def create_dep_key(sectionId: str, codeObjId: str | None = None):
    if codeObjId is None:
        return SectionDependencyKey(sectionId=sectionId)
    return SectionParamDependencyKey(sectionId=sectionId, codeObjId=codeObjId)
