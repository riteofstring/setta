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


class SettaLspDiagnosticPosition(BaseModel):
    line: int
    character: int


class SettaLspDiagnosticRange(BaseModel):
    start: SettaLspDiagnosticPosition
    end: SettaLspDiagnosticPosition


class SettaLspDiagnostic(BaseModel):
    message: str
    severity: int | None = None
    code: str | int | None = None
    source: str | None = None
    range: SettaLspDiagnosticRange
    uri: str | None = None


class SettaLspDiagnosticsPayload(BaseModel):
    projectConfigId: ID
    genCode: SettaProjectConfigDiagnostics
    codeSections: dict[ID, list[SettaLspDiagnostic]] = Field(default_factory=dict)
    unmappedGenCode: list[SettaLspDiagnostic] = Field(default_factory=list)


@dataclass
class SettaLSPPosition:
    start: int
    end: int
