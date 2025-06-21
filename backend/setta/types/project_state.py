from enum import Enum
from typing import Any

from pydantic import (
    BaseModel,
    Field,
    SerializeAsAny,
    field_validator,
    model_validator,
)

from setta.database.utils import create_new_id
from setta.types.code_objs import BaseCodeObjImpl, CodeObjCore, CodeObjImplLayering
from setta.types.generated_code_obj_type_unions import (
    CodeObjImplTypeAdapter,
)
from setta.types.generated_section_type_unions import (
    SectionImplTypeAdapter,
)
from setta.types.sections import BaseSectionImpl, SectionCore, SectionImplLayering
from setta.utils.generate_memorable_string import generate_memorable_string


class ViewingEditingMode(Enum):
    DEV = "DEV"
    USER = "USER"
    USER_EDIT = "USER_EDIT"


class Viewport(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0
    zoom: float = 1


class TopLevelSectionLayout(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0
    zIndex: int = 0
    w: float = 1
    h: float = 1


class ProjectConfig(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Viewport | None = Field(default_factory=Viewport)
    viewingEditingMode: ViewingEditingMode = ViewingEditingMode.DEV
    genCodePrefix: str = ""
    genCodeSuffix: str = ""
    entryCodeBlockId: str | None = None
    topLevelSections: dict[str, TopLevelSectionLayout] = Field(default_factory=dict)
    sectionImplLayeringMap: dict[str, str] = Field(default_factory=dict)


class ProjectStateCore(BaseModel, extra="forbid"):
    sections: dict[str, SectionCore] = Field(default_factory=dict)
    sectionImpls: dict[str, SerializeAsAny[BaseSectionImpl]] = Field(
        default_factory=dict
    )
    sectionImplLayerings: dict[str, SectionImplLayering] = Field(default_factory=dict)
    codeObjs: dict[str, CodeObjCore] = Field(default_factory=dict)
    codeObjImpls: dict[str, SerializeAsAny[BaseCodeObjImpl]] = Field(
        default_factory=dict
    )
    codeObjImplLayerings: dict[str, CodeObjImplLayering] = Field(default_factory=dict)

    @field_validator("sectionImpls", mode="before")
    @classmethod
    def validate_section_impls(cls, v: Any):
        if not isinstance(v, dict):
            raise ValueError("sectionImpls must be a dictionary")

        validated: dict[str, BaseSectionImpl] = {}
        for key, value in v.items():
            if isinstance(value, BaseSectionImpl):
                validated[key] = value
            else:
                validated[key] = SectionImplTypeAdapter.validate_python(value)

        return validated

    @field_validator("codeObjImpls", mode="before")
    @classmethod
    def validate_code_obj_impls(cls, v: Any):
        if not isinstance(v, dict):
            raise ValueError("codeObjImpls must be a dictionary")

        validated: dict[str, BaseCodeObjImpl] = {}
        for key, value in v.items():
            if isinstance(value, BaseCodeObjImpl):
                validated[key] = value
            else:
                validated[key] = CodeObjImplTypeAdapter.validate_python(value)

        return validated


class ProjectStateBackend(ProjectStateCore, extra="forbid"):
    projectConfigs: dict[str, ProjectConfig] = Field(default_factory=dict)
    defaultProjectConfigId: str | None = None

    @model_validator(mode="after")
    def validator_ensure_default_project_id(self):
        self.ensure_default_project_id()
        return self

    def ensure_default_project_id(self):
        if self.projectConfigs:
            # If projects exist, use first key when defaultProjectConfigId is None
            if (
                self.defaultProjectConfigId is None
                or self.defaultProjectConfigId not in self.projectConfigs
            ):
                self.defaultProjectConfigId = next(iter(self.projectConfigs))
        else:
            # If projects is empty, defaultProjectConfigId should be None
            self.defaultProjectConfigId = None
        return self


class ProjectStateSingleConfig(ProjectStateCore, extra="forbid"):
    projectConfig: ProjectConfig
