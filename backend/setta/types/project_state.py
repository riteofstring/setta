from enum import Enum

from pydantic import (
    BaseModel,
    Field,
    model_validator,
)

from setta.database.utils import create_new_id
from setta.types.core import Core, Variant
from setta.types.gen_code_specs import PythonGenCodeSpecs
from setta.types.generated.unions import (
    BaseCodeObjImplUnionWithDiscriminator,
    BaseSectionImplUnionWithDiscriminator,
)
from setta.utils.generate_memorable_string import generate_memorable_string


class ViewingEditingMode(str, Enum):
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
    w: float | None = None
    h: float | None = None


class ProjectConfig(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Viewport | None = Field(default_factory=Viewport)
    viewingEditingMode: ViewingEditingMode = ViewingEditingMode.DEV
    genCodeSpecs: PythonGenCodeSpecs | None = Field(default_factory=PythonGenCodeSpecs)
    entryCodeBlockId: str | None = None
    topLevelSections: dict[str, TopLevelSectionLayout] = Field(default_factory=dict)
    sectionVariantMap: dict[str, str] = Field(default_factory=dict)


class ProjectStateCore(BaseModel, extra="forbid"):
    sections: dict[str, Core] = Field(default_factory=dict)
    sectionImpls: dict[str, BaseSectionImplUnionWithDiscriminator] = Field(
        default_factory=dict
    )
    sectionVariants: dict[str, Variant] = Field(default_factory=dict)
    codeObjs: dict[str, Core] = Field(default_factory=dict)
    codeObjImpls: dict[str, BaseCodeObjImplUnionWithDiscriminator] = Field(
        default_factory=dict
    )
    codeObjVariants: dict[str, Variant] = Field(default_factory=dict)


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


class ProjectMetadata(BaseModel):
    defaultProjectConfigId: str | None
    projectMetadata: list[ProjectConfig]
