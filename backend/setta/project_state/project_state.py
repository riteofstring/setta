from enum import StrEnum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, model_serializer, model_validator

from setta.database.utils import create_new_id
from setta.project_state.base_ui_types import BASE_UI_TYPES, UIType
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


class Viewport(BaseModel):
    x: float = 0
    y: float = 0
    zoom: float = 1


class SectionSize(BaseModel):
    width: Union[float, Literal[Size.AUTO]] = Size.AUTO
    height: Union[float, Literal[Size.AUTO]] = Size.AUTO


class Visibility(BaseModel):
    DEV: bool = True
    USER: bool = True


class CanvasSettings(BaseModel):
    activeLayerId: Optional[str] = None
    color: str = "#ff0000"
    brushSize: int = 16
    brushShape: str = "butt"
    eraserBrushSize: int = 16
    drawThrottleDelay: int = 0
    canvasTransferQueueLength: int = 50
    mode: str = "draw"


class ChartSettings(BaseModel):
    type: str = "line"
    xAxisColumn: str = ""
    secondYAxisColumns: List[str] = Field(default_factory=list)
    xAxisLog: bool = False
    y1AxisLog: bool = False
    y2AxisLog: bool = False


class Section(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    size: SectionSize = Field(default_factory=lambda: SectionSize())
    parentId: Optional[str] = None
    variantId: Optional[str] = None
    uiTypeId: str = Field(default="0191cde4-3d98-4ba0-972a-fead19b8ac73")
    uiTypeColId: Optional[str] = None
    social: str = ""
    artifactGroupIds: List[str] = Field(default_factory=list)
    defaultVariantId: Optional[str] = None
    variantIds: List[str] = Field(default_factory=list)
    paramSweepSectionId: Optional[str] = None
    nonPresetUITypeIds: List[str] = Field(default_factory=list)
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
    selectedVariantIds: Dict[str, Any] = Field(default_factory=dict)
    paramFilter: str = ""
    isInOtherProjectConfigs: bool = False
    aspectRatio: bool = False
    aspectRatioExtraHeight: int = 0
    aspectRatioExtraWidth: int = 0
    columnWidth: Optional[float] = None
    renderedValue: Optional[Any] = None
    headingAsSectionName: bool = False


class EVEntry(BaseModel):
    value: str = ""


class SectionVariant(BaseModel):
    name: str = Field(default_factory=generate_memorable_string)
    values: Dict[str, EVEntry] = Field(default_factory=dict)
    children: List[str] = Field(default_factory=list)
    selectedItem: Optional[str] = None
    code: str = ""
    codeInfoColId: Optional[str] = None
    description: str = ""
    isFrozen: bool = False
    sweep: List[Any] = Field(default_factory=list)
    runGroup: Dict[str, Any] = Field(default_factory=dict)
    configLanguage: ConfigLanguage = ConfigLanguage.PYTHON
    isJsonSource: bool = False
    jsonSourceKeys: List[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


class CodeInfo(BaseModel):
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


class CodeInfoCol(BaseModel):
    children: Dict[Optional[str], List[str]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def convert_null_key(self):
        c = self.children.pop("null", [])
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


class UITypeColEntry(BaseModel):
    uiTypeId: str = "3fdaeb6a-e989-4888-b844-17a76f0b0192"
    nonPresetUITypeIds: List[str] = Field(default_factory=list)


class Artifact(BaseModel):
    name: str
    path: str
    value: Optional[str] = None
    type: str


class ProjectConfigChild(BaseModel):
    x: float
    y: float
    zIndex: int
    w: float
    h: float


class ProjectConfig(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Optional[Viewport] = Field(default_factory=Viewport)
    children: Dict[str, ProjectConfigChild] = Field(default_factory=dict)
    viewingEditingMode: ViewingEditingMode = ViewingEditingMode.DEV
    genCodePrefix: str = ""
    genCodeSuffix: str = ""


class ProjectState(BaseModel):
    projectConfigs: Dict[str, ProjectConfig] = Field(default_factory=dict)
    sections: Dict[str, Section] = Field(default_factory=dict)
    variants: Dict[str, SectionVariant] = Field(default_factory=dict)
    codeInfo: Dict[str, CodeInfo] = Field(default_factory=dict)
    codeInfoCols: Dict[str, CodeInfoCol] = Field(default_factory=dict)
    uiTypes: Dict[str, UIType] = Field(default_factory=dict)
    uiTypeCols: Dict[str, Dict[str, UITypeColEntry]] = Field(default_factory=dict)
    defaultProjectConfigId: Optional[str] = None

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

    def get_section_type(self, id: str):
        ui_type_id = self.sections[id].uiTypeId
        ui_type = self.uiTypes[ui_type_id]
        return ui_type.type

    def get_selected_section_variant(self, section_id: str):
        variantId = self.sections[section_id].variantId
        if variantId:
            return self.variants[variantId]
        return None

    def get_selected_item(self, id: str):
        variant = self.get_selected_section_variant(id)
        if variant:
            selected_item = variant.selectedItem
            if selected_item:
                return self.codeInfo[selected_item]
        return None

    def get_section_children(self, id: str) -> list[str]:
        variant = self.get_selected_section_variant(id)
        if variant:
            return variant.children
        return []

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
        if variant:
            codeInfoColId = variant.codeInfoColId
            if not codeInfoColId:
                codeInfoCol = CodeInfoCol()
            else:
                codeInfoCol = self.codeInfoCols[codeInfoColId]
            return codeInfoCol.children
        return CodeInfoCol().children

    def get_param_ui_type(self, section_id: str, id: str):
        ui_type_col_id = self.sections[section_id].uiTypeColId
        ui_type_col = self.uiTypeCols[ui_type_col_id] if ui_type_col_id else {}
        ui_type_col_entry = ui_type_col.get(id, UITypeColEntry())
        ui_type_id = ui_type_col_entry.uiTypeId
        ui_type = self.uiTypes[ui_type_id]
        return ui_type.type


class ProjectLoadState(BaseModel):
    projectConfigId: str
    projectState: ProjectState


class ProjectUpdateState(BaseModel):
    projectConfigId: str
    projectState: ProjectState
    requestRenameRefactor: bool = False
