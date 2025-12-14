from dataclasses import dataclass

from pydantic import BaseModel


class SettaGenCodeDiagnostic(BaseModel):
    sectionId: str
    paramInfoId: str | None
    message: str


class SettaProjectConfigDiagnostics(BaseModel):
    projectConfigId: str
    diagnostics: list[SettaGenCodeDiagnostic]
    isGenCode: bool


@dataclass
class SettaLSPPosition:
    start: int
    end: int
