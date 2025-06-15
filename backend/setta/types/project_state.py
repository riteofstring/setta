import copy

from pydantic import (
    BaseModel,
    Field,
    model_serializer,
    model_validator,
)

from setta.database.utils import create_new_id
from setta.types.base_ui_types import (
    BASE_UI_TYPE_IDS,
    BASE_UI_TYPES,
    UIType,
    UITypeName,
)
from setta.types.section_configs import BaseSectionConfig
from setta.types.sections import BaseSectionCore, BaseSectionImpl
from setta.types.utils import AsIsStrEnum
from setta.utils.generate_memorable_string import generate_memorable_string

ParameterPassingStyle = AsIsStrEnum(
    "ParameterPassingStyle",
    ["DEFAULT", "ARGS", "KWARGS", "POSITIONAL_ONLY", "KEYWORD_ONLY"],
)

CodeInfoType = AsIsStrEnum("CodeInfoType", ["PARAMETER", "CALLABLE", "COLLECTION"])

ViewingEditingMode = AsIsStrEnum("ViewingEditingMode", ["DEV", "USER", "USER_EDIT"])


class Position(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0


class Viewport(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0
    zoom: float = 1


class EVEntry(BaseModel, extra="forbid"):
    value: str = ""


class CodeInfo(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    editable: bool = False
    rcType: CodeInfoType = CodeInfoType.PARAMETER
    defaultVal: str = ""
    description: str = ""
    passingStyle: ParameterPassingStyle = ParameterPassingStyle.DEFAULT
    isPinned: bool = False
    isFrozen: bool = False
    isSelected: bool = False
    ignoreTypeErrors: bool = False


class CodeInfoCol(BaseModel, extra="forbid"):
    children: dict[str | None, list[str]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def convert_null_key(self):
        if "null" in self.children:
            c = self.children.pop("null")
            self.children[None] = c
        else:
            self.children[None] = []
        return self

    @model_serializer
    def convert_none_key(self):
        new_dict = {}
        for key, value in self.children.items():
            if key is None:
                new_dict["null"] = value
            else:
                new_dict[key] = value
        return {"children": new_dict}


class UITypeColEntry(BaseModel, extra="forbid"):
    uiTypeId: str = BASE_UI_TYPE_IDS[UITypeName.TEXT]
    nonPresetUITypeIds: list[str] = Field(default_factory=list)


class ProjectConfigChild(BaseModel, extra="forbid"):
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
    children: dict[str, ProjectConfigChild] = Field(default_factory=dict)
    viewingEditingMode: ViewingEditingMode = ViewingEditingMode.DEV
    genCodePrefix: str = ""
    genCodeSuffix: str = ""
    entryCodeBlockId: str | None = None
    sectionImplMap: dict[str, str] = Field(default_factory=dict)


def ui_types_default_factory():
    return copy.deepcopy(BASE_UI_TYPES)


class ProjectStateCore(BaseModel, extra="forbid"):
    sections: dict[str, BaseSectionCore] = Field(default_factory=dict)
    sectionImpls: dict[str, BaseSectionImpl] = Field(default_factory=dict)
    codeInfo: dict[str, CodeInfo] = Field(default_factory=dict)
    codeInfoCols: dict[str, CodeInfoCol] = Field(default_factory=dict)
    uiTypes: dict[str, UIType] = Field(default_factory=ui_types_default_factory)
    uiTypeCols: dict[str, dict[str, UITypeColEntry]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validator_ensure_base_ui_types(self):
        self.uiTypes.update(BASE_UI_TYPES)
        return self


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
