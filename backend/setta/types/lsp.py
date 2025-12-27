from dataclasses import dataclass

from pydantic import BaseModel, Field

from setta.types.id import ID


class SettaSectionTypeErrors(BaseModel):
    callable: list[str] = Field(default_factory=list)
    params: dict[ID, list[str]] = Field(default_factory=dict)


class SettaProjectConfigDiagnostics(BaseModel):
    projectConfigId: ID
    errors: dict[ID, SettaSectionTypeErrors] = Field(default_factory=dict)
    isGenCode: bool


@dataclass
class SettaLSPPosition:
    start: int
    end: int
