import copy
from enum import StrEnum
from typing import Any, Literal, Union

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
from setta.utils.generate_memorable_string import generate_memorable_string

Size = StrEnum("Size", ["auto"])

CodeLanguage = StrEnum("CodeLanguage", ["python", "bash"])

ConfigLanguage = StrEnum("ConfigLanguage", ["python", "json"])

ParameterPassingStyle = StrEnum(
    "ParameterPassingStyle",
    ["DEFAULT", "ARGS", "KWARGS", "POSITIONAL_ONLY", "KEYWORD_ONLY"],
)

CodeInfoType = StrEnum("CodeInfoType", ["parameter", "callable", "collection"])

ViewingEditingMode = StrEnum("ViewingEditingMode", ["DEV", "USER", "USER_EDIT"])


class Viewport(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0
    zoom: float = 1


class SectionSize(BaseModel, extra="forbid"):
    width: Union[float, Literal[Size.auto]] = Size.auto
    height: Union[float, Literal[Size.auto]] = Size.auto


class Visibility(BaseModel, extra="forbid"):
    DEV: bool = True
    USER: bool = True


class DrawAreaCanvasSettings(BaseModel, extra="forbid"):
    activeLayerId: str | None = None
    color: str = "#ff0000"
    brushSize: int = 16
    brushShape: str = "butt"
    eraserBrushSize: int = 16
    drawThrottleDelay: int = 0
    canvasTransferQueueLength: int = 50
    mode: str = "draw"


class ChartSettings(BaseModel, extra="forbid"):
    type: str = "line"
    xAxisColumn: str = ""
    secondYAxisColumns: list[str] = Field(default_factory=list)
    xAxisLog: bool = False
    y1AxisLog: bool = False
    y2AxisLog: bool = False


class Section(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    size: SectionSize = Field(default_factory=SectionSize)
    parentId: str | None = None
    variantId: str = Field(default_factory=create_new_id)
    uiTypeId: str = Field(default=BASE_UI_TYPE_IDS[UITypeName.SECTION])
    uiTypeColId: str | None = None
    social: str = ""
    artifactGroupIds: list[str] = Field(default_factory=list)
    defaultVariantId: str | None = None
    variantIds: list[str] = Field(default_factory=list)
    nonPresetUITypeIds: list[str] = Field(default_factory=list)
    codeLanguage: CodeLanguage = CodeLanguage.python
    isEntryCodeBlock: bool = False
    isFrozen: bool = False
    isHorizontalOrientation: bool = False
    hideParams: bool = False
    hideSearch: bool = False
    hideUnpinnedParams: bool = False
    hideColumn: bool = False
    displayMode: str = "GUI"
    visibility: Visibility = Field(default_factory=Visibility)
    pinnedAreaHeight: Union[float, Literal[Size.auto]] = Size.auto
    isMinimized: bool = False
    canvasSettings: DrawAreaCanvasSettings = Field(
        default_factory=DrawAreaCanvasSettings
    )
    chartSettings: ChartSettings = Field(default_factory=ChartSettings)
    isTemporary: bool = False
    renderMarkdown: bool = False
    positionAndSizeLocked: bool = False
    selectedVariantIds: dict[str, Any] = Field(default_factory=dict)
    paramFilter: str = ""
    isInOtherProjectConfigs: bool = False
    aspectRatio: bool = False
    aspectRatioExtraHeight: int = 0
    aspectRatioExtraWidth: int = 0
    columnWidth: float | None = None
    renderedValue: Any = None
    headingAsSectionName: bool = False

    @model_validator(mode="after")
    def set_default_variant_id(self):
        if not self.defaultVariantId:
            self.defaultVariantId = self.variantId
        return self


class EVEntry(BaseModel, extra="forbid"):
    value: str = ""


class SectionVariant(BaseModel, extra="forbid"):
    name: str = Field(default_factory=generate_memorable_string)
    values: dict[str, EVEntry] = Field(default_factory=dict)
    children: list[str] = Field(default_factory=list)
    selectedItem: str | None = None
    code: str = ""
    codeInfoColId: str | None = None
    description: str = ""
    isFrozen: bool = False
    configLanguage: ConfigLanguage = ConfigLanguage.python
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


class CodeInfo(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    editable: bool = False
    rcType: CodeInfoType = CodeInfoType.parameter
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


def ui_types_default_factory():
    return copy.deepcopy(BASE_UI_TYPES)


class ProjectState(BaseModel, extra="forbid"):
    projectConfigs: dict[str, ProjectConfig] = Field(default_factory=dict)
    sections: dict[str, Section] = Field(default_factory=dict)
    variants: dict[str, SectionVariant] = Field(default_factory=dict)
    codeInfo: dict[str, CodeInfo] = Field(default_factory=dict)
    codeInfoCols: dict[str, CodeInfoCol] = Field(default_factory=dict)
    uiTypes: dict[str, UIType] = Field(default_factory=ui_types_default_factory)
    uiTypeCols: dict[str, dict[str, UITypeColEntry]] = Field(default_factory=dict)
    defaultProjectConfigId: str | None = None

    @model_validator(mode="after")
    def set_default_project_id(self):
        if self.projectConfigs:
            # If projects exist, use first key when defaultProjectConfigId is None
            if self.defaultProjectConfigId is None:
                self.defaultProjectConfigId = next(iter(self.projectConfigs))
        else:
            # If projects is empty, defaultProjectConfigId should be None
            self.defaultProjectConfigId = None
        return self

    @model_validator(mode="after")
    def ensure_base_ui_types(self):
        self.uiTypes.update(BASE_UI_TYPES)
        return self

    @model_validator(mode="after")
    def ensure_variants_exist(self):
        for section in self.sections.values():
            if section.variantId not in self.variants:
                self.variants[section.variantId] = SectionVariant()
        return self


class ProjectSaveState(BaseModel, extra="forbid"):
    projectConfigId: str
    projectState: ProjectState


class ProjectLoadState(BaseModel, extra="forbid"):
    projectConfigId: str
    projectState: ProjectState


class ProjectUpdateState(BaseModel, extra="forbid"):
    projectConfigId: str
    projectState: ProjectState
    requestRenameRefactor: bool = False
