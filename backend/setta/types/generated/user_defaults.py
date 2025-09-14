# Auto-generated UserDefault classes - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal, Union

from pydantic import BaseModel, Field

# Code object type imports
from setta.types.code_obj_impls import (
    ColorPickerChoice,
    ParamNameType,
)

# Section type imports
from setta.types.section_impls import (
    BrowserAreaViewMode,
    CodeLanguage,
    ConfigLanguage,
    DrawAreaBrushShape,
    DrawAreaLayerItem,
    DrawAreaMode,
    SectionSize,
    SectionSizeMode,
    SectionWithParamsDisplayMode,
    TextBlockDisplayMode,
    TextBlockFormat,
    Visibility,
)


class UserDefaultBaseSectionImpl(BaseModel, extra="forbid"):
    isFrozen: bool = False
    visibility: Visibility = Field(default_factory=Visibility)
    size: SectionSize = Field(default_factory=SectionSize)
    aspectRatio: bool | float = False
    isMinimized: bool = False
    positionAndSizeLocked: bool = False


class UserDefaultBaseSectionWithParamsImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    hideUnpinnedParams: bool = False
    paramFilter: str = ""
    columnWidth: float | None = None
    configLanguage: ConfigLanguage = ConfigLanguage.python
    pinnedAreaHeight: Union[float, Literal[SectionSizeMode.auto]] = SectionSizeMode.auto
    displayMode: SectionWithParamsDisplayMode = SectionWithParamsDisplayMode.Gui


class UserDefaultBaseCanvasSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    pass


class UserDefaultBaseCodeSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    code: str = ""
    size: SectionSize = Field(default_factory=lambda: SectionSize(width=500))


class UserDefaultBaseParentSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    pass


class UserDefaultBaseDictSectionImpl(
    UserDefaultBaseSectionWithParamsImpl, extra="forbid"
):
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)


class UserDefaultCallableSectionImpl(
    UserDefaultBaseSectionWithParamsImpl, extra="forbid"
):
    hideParams: bool = False


class UserDefaultDictSectionImpl(UserDefaultBaseDictSectionImpl, extra="forbid"):
    pass


class UserDefaultListRootSectionImpl(UserDefaultBaseParentSectionImpl, extra="forbid"):
    pass


class UserDefaultDictRootSectionImpl(UserDefaultBaseParentSectionImpl, extra="forbid"):
    pass


class UserDefaultGroupSectionImpl(UserDefaultBaseParentSectionImpl, extra="forbid"):
    isHorizontalOrientation: bool = False


class UserDefaultImageSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    imagePath: str = ""


class UserDefaultChartSectionImpl(UserDefaultBaseCanvasSectionImpl, extra="forbid"):
    dataPath: str = ""
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=400, height=400)
    )


class UserDefaultDrawSectionImpl(UserDefaultBaseCanvasSectionImpl, extra="forbid"):
    layers: list[list[DrawAreaLayerItem]] = Field(default_factory=list)
    activeLayerIdx: int = 0
    color: str = "#ff0000"
    brushSize: int = 16
    brushShape: DrawAreaBrushShape = DrawAreaBrushShape.butt
    eraserBrushSize: int = 16
    drawThrottleDelay: int = 0
    canvasTransferQueueLength: int = 50
    canvasMode: DrawAreaMode = DrawAreaMode.draw


class UserDefaultTextBlockSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    format: TextBlockFormat = TextBlockFormat.Plaintext
    headingAsSectionName: bool = False
    displayMode: TextBlockDisplayMode = TextBlockDisplayMode.Render
    text: str = ""


class UserDefaultSocialSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    url: str = ""


class UserDefaultGlobalVariablesSectionImpl(
    UserDefaultBaseDictSectionImpl, extra="forbid"
):
    pass


class UserDefaultCodeSectionImpl(UserDefaultBaseCodeSectionImpl, extra="forbid"):
    codeLanguage: CodeLanguage = CodeLanguage.python


class UserDefaultGenPythonCodeSectionImpl(
    UserDefaultBaseCodeSectionImpl, extra="forbid"
):
    pass


class UserDefaultTerminalSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=700, height=300)
    )


class UserDefaultIFrameSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    pass


class UserDefaultChatSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=405, height=405)
    )


class UserDefaultBrowserSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    folder: str = ""
    hideColumn: bool = False
    viewMode: BrowserAreaViewMode = BrowserAreaViewMode.list


class UserDefaultBaseCodeObjImpl(BaseModel, extra="forbid"):
    pass


class UserDefaultBaseParamCodeObjImpl(UserDefaultBaseCodeObjImpl, extra="forbid"):
    coreNameType: ParamNameType = ParamNameType.TEXT
    coreNameEditable: bool = False


class UserDefaultBaseChildlessCodeObjImpl(
    UserDefaultBaseParamCodeObjImpl, extra="forbid"
):
    defaultVal: str = ""
    value: str = ""


class UserDefaultBaseParentCodeObjImpl(UserDefaultBaseCodeObjImpl, extra="forbid"):
    pass


class UserDefaultCodeCallableCodeObjImpl(
    UserDefaultBaseParentCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultCodeParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultTextParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultSliderParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    min: int = 0
    max: int = 100
    step: int = 1
    value: str = "0"


class UserDefaultSwitchParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    value: str = "false"


class UserDefaultColorPickerParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    choices: list[ColorPickerChoice] = Field(default_factory=list)
    value: str = "#ff0000"


class UserDefaultDropdownParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    choices: list[str] = Field(default_factory=list)


class UserDefaultPasswordParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultNestedParamCodeObjImpl(
    UserDefaultBaseParamCodeObjImpl, UserDefaultBaseParentCodeObjImpl, extra="forbid"
):
    pass
