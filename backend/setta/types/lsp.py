from dataclasses import dataclass

from pydantic import BaseModel

from setta.types.id import ID


class SettaGenCodeDiagnostic(BaseModel):
    sectionId: ID
    paramInfoId: ID | None
    message: str


class SettaProjectConfigDiagnostics(BaseModel):
    projectConfigId: ID
    diagnostics: list[SettaGenCodeDiagnostic]
    isGenCode: bool


@dataclass
class SettaLSPPosition:
    start: int
    end: int
