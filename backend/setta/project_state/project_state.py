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
from setta.project_state.base_ui_types import (
    BASE_UI_TYPE_IDS,
    BASE_UI_TYPES,
    UIType,
    UITypeName,
)
from setta.utils.generate_memorable_string import generate_memorable_string


class Size(StrEnum):
    AUTO = "auto"


class CodeLanguage(StrEnum):
    PYTHON = "python"
    BASH = "bash"


class ConfigLanguage(StrEnum):
    PYTHON = "python"
    JSON = "json"


class ParameterPassingStyle(StrEnum):
    DEFAULT = "DEFAULT"
    ARGS = "ARGS"
    KWARGS = "KWARGS"
    POSITIONAL_ONLY = "POSITIONAL_ONLY"
    KEYWORD_ONLY = "KEYWORD_ONLY"


class CodeInfoType(StrEnum):
    PARAMETER = "parameter"
    CALLABLE = "callable"
    COLLECTION = "collection"


class ViewingEditingMode(StrEnum):
    DEV = "DEV"
    USER = "USER"
    USER_EDIT = "USER_EDIT"


class Viewport(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0
    zoom: float = 1


class SectionSize(BaseModel, extra="forbid"):
    width: Union[float, Literal[Size.AUTO]] = Size.AUTO
    height: Union[float, Literal[Size.AUTO]] = Size.AUTO


class Visibility(BaseModel, extra="forbid"):
    DEV: bool = True
    USER: bool = True


class CanvasSettings(BaseModel, extra="forbid"):
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
    paramSweepSectionId: str | None = None
    nonPresetUITypeIds: list[str] = Field(default_factory=list)
    codeLanguage: CodeLanguage = CodeLanguage.PYTHON
    isEntryCodeBlock: bool = False
    isFrozen: bool = False
    isHorizontalOrientation: bool = False
    hideParams: bool = False
    hideSearch: bool = False
    hideUnpinnedParams: bool = False
    hideColumn: bool = False
    displayMode: str = "GUI"
    visibility: Visibility = Field(default_factory=Visibility)
    pinnedAreaHeight: Union[float, Literal[Size.AUTO]] = Size.AUTO
    isMinimized: bool = False
    canvasSettings: CanvasSettings = Field(default_factory=CanvasSettings)
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
    sweep: list[Any] = Field(default_factory=list)
    runGroup: dict[str, Any] = Field(default_factory=dict)
    configLanguage: ConfigLanguage = ConfigLanguage.PYTHON
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


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
        return self

    @model_serializer
    def convert_none_key(self):
        new_dict = {}
        for key, value in self.children.items():
            if key == None:
                new_dict["null"] = value
            else:
                new_dict[key] = value
        return {"children": new_dict}


class UITypeColEntry(BaseModel, extra="forbid"):
    uiTypeId: str = BASE_UI_TYPE_IDS[UITypeName.TEXT]
    nonPresetUITypeIds: list[str] = Field(default_factory=list)


class Artifact(BaseModel, extra="forbid"):
    name: str
    path: str
    value: str | None = None
    type: str


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


class ProjectState(BaseModel, extra="forbid"):
    projectConfigs: dict[str, ProjectConfig] = Field(default_factory=dict)
    sections: dict[str, Section] = Field(default_factory=dict)
    variants: dict[str, SectionVariant] = Field(default_factory=dict)
    codeInfo: dict[str, CodeInfo] = Field(default_factory=dict)
    codeInfoCols: dict[str, CodeInfoCol] = Field(default_factory=dict)
    uiTypes: dict[str, UIType] = Field(
        default_factory=lambda: copy.deepcopy(BASE_UI_TYPES)
    )
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

    def get_section_type(self, id: str):
        ui_type_id = self.sections[id].uiTypeId
        ui_type = self.uiTypes[ui_type_id]
        return ui_type.type

    def get_selected_section_variant(self, section_id: str):
        variantId = self.sections[section_id].variantId
        return self.variants[variantId]

    def get_selected_item(self, id: str):
        variant = self.get_selected_section_variant(id)
        selected_item = variant.selectedItem
        if selected_item:
            return self.codeInfo[selected_item]

    def get_section_children(self, id: str) -> list[str]:
        variant = self.get_selected_section_variant(id)
        return variant.children

    def get_top_level_param_ids(self, id: str) -> list[str]:
        selected_item = self.get_selected_item(id)
        if selected_item:
            section_code_info_children = self.get_section_code_info_children(id)
            children = section_code_info_children.get(selected_item.id, [])
            return [
                c for c in children if self.codeInfo[c].rcType == CodeInfoType.PARAMETER
            ]
        return []

    def get_section_code_info_children(self, section_id: str):
        variant = self.get_selected_section_variant(section_id)
        codeInfoColId = variant.codeInfoColId
        if not codeInfoColId:
            codeInfoCol = CodeInfoCol()
        else:
            codeInfoCol = self.codeInfoCols[codeInfoColId]
        return codeInfoCol.children

    def get_param_ui_type(self, section_id: str, id: str):
        ui_type_col_id = self.sections[section_id].uiTypeColId
        ui_type_col = self.uiTypeCols[ui_type_col_id] if ui_type_col_id else {}
        ui_type_col_entry = ui_type_col.get(id, UITypeColEntry())
        ui_type_id = ui_type_col_entry.uiTypeId
        ui_type = self.uiTypes[ui_type_id]
        return ui_type.type


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
