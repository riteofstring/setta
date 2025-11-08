from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class DependencyKeyType(str, Enum):
    Section = "Section"
    SectionParam = "SectionParam"


@dataclass(frozen=True, slots=True)
class DependencyKey:
    type: DependencyKeyType  # stays as a field on the instance


@dataclass(frozen=True, slots=True)
class SectionDependencyKey(DependencyKey):
    sectionId: str
    type: Literal[DependencyKeyType.Section] = field(
        default=DependencyKeyType.Section, init=False
    )


@dataclass(frozen=True, slots=True)
class SectionParamDependencyKey(DependencyKey):
    sectionId: str
    codeObjId: str
    type: Literal[DependencyKeyType.SectionParam] = field(
        default=DependencyKeyType.SectionParam, init=False
    )


def create_dep_key(sectionId: str, codeObjId: str | None = None):
    if codeObjId is None:
        return SectionDependencyKey(sectionId=sectionId)
    return SectionParamDependencyKey(sectionId=sectionId, codeObjId=codeObjId)
