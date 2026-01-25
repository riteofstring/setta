from pydantic import BaseModel, Field

from setta.types.id import ID


class SettaProjectNameValidationErrors(BaseModel):
    projectConfigId: ID
    sectionErrors: dict[ID, list[str]] = Field(default_factory=dict)
    paramErrors: dict[ID, list[str]] = Field(default_factory=dict)
