from typing import Literal

from pydantic import BaseModel

# Code object type imports
from setta.types.code_obj_impls import (
    ColorPickerChoice,
    ParamNameType,
)

# Section type imports
from setta.types.section_impls import (
    ChartSettings,
    CodeLanguage,
    ConfigLanguage,
    DrawAreaCanvasSettings,
    SectionSize,
    SectionSizeMode,
    TextBlockDisplayMode,
    TextBlockFormat,
    Visibility,
)


class UserDefaultBaseSectionImpl(BaseModel):
    isFrozen: bool

    visibility: Visibility

    size: SectionSize

    aspectRatio: bool | float

    isMinimized: bool

    positionAndSizeLocked: bool


class UserDefaultBaseSectionWithParamsImpl(UserDefaultBaseSectionImpl):
    hideUnpinnedParams: bool

    paramFilter: str

    columnWidth: float | None

    configLanguage: ConfigLanguage

    pinnedAreaHeight: float | Literal[SectionSizeMode.auto]


class UserDefaultBaseArtifactSectionImpl(UserDefaultBaseSectionImpl):
    pass


class UserDefaultBaseCanvasSectionImpl(UserDefaultBaseSectionImpl):
    pass


class UserDefaultBaseCodeSectionImpl(UserDefaultBaseSectionImpl):
    code: str


class UserDefaultBaseParentSectionImpl(UserDefaultBaseSectionImpl):
    pass


class UserDefaultBaseDictSectionImpl(UserDefaultBaseSectionWithParamsImpl):
    isJsonSource: bool

    jsonSourceKeys: list[str]


class UserDefaultCallableSectionImpl(UserDefaultBaseSectionWithParamsImpl):
    hideParams: bool


class UserDefaultDictSectionImpl(UserDefaultBaseDictSectionImpl):
    pass


class UserDefaultListRootSectionImpl(UserDefaultBaseParentSectionImpl):
    pass


class UserDefaultDictRootSectionImpl(UserDefaultBaseParentSectionImpl):
    pass


class UserDefaultGroupSectionImpl(UserDefaultBaseParentSectionImpl):
    isHorizontalOrientation: bool


class UserDefaultImageSectionImpl(UserDefaultBaseArtifactSectionImpl):
    pass


class UserDefaultChartSectionImpl(
    UserDefaultBaseArtifactSectionImpl, UserDefaultBaseCanvasSectionImpl
):
    chartSettings: ChartSettings


class UserDefaultDrawSectionImpl(
    UserDefaultBaseArtifactSectionImpl, UserDefaultBaseCanvasSectionImpl
):
    canvasSettings: DrawAreaCanvasSettings


class UserDefaultTextBlockSectionImpl(UserDefaultBaseSectionImpl):
    format: TextBlockFormat

    headingAsSectionName: bool

    displayMode: TextBlockDisplayMode

    text: str


class UserDefaultSocialSectionImpl(UserDefaultBaseSectionImpl):
    social: str


class UserDefaultGlobalVariablesSectionImpl(UserDefaultBaseDictSectionImpl):
    pass


class UserDefaultCodeSectionImpl(UserDefaultBaseCodeSectionImpl):
    codeLanguage: CodeLanguage


class UserDefaultGenPythonCodeSectionImpl(UserDefaultBaseCodeSectionImpl):
    pass


class UserDefaultTerminalSectionImpl(UserDefaultBaseSectionImpl):
    pass


class UserDefaultIFrameSectionImpl(UserDefaultBaseSectionImpl):
    pass


class UserDefaultChatSectionImpl(UserDefaultBaseSectionImpl):
    pass


class UserDefaultBrowserSectionImpl(UserDefaultBaseSectionImpl):
    hideColumn: bool


class UserDefaultBaseCodeObjImpl(BaseModel):
    pass


class UserDefaultBaseParamCodeObjImpl(UserDefaultBaseCodeObjImpl):
    coreNameType: ParamNameType

    coreNameEditable: bool


class UserDefaultBaseChildlessCodeObjImpl(UserDefaultBaseParamCodeObjImpl):
    defaultVal: str

    value: str


class UserDefaultBaseParentCodeObjImpl(UserDefaultBaseCodeObjImpl):
    pass


class UserDefaultCodeCallableCodeObjImpl(UserDefaultBaseParentCodeObjImpl):
    pass


class UserDefaultCodeParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):
    pass


class UserDefaultTextParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):
    pass


class UserDefaultSliderParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):
    min: int

    max: int

    step: int


class UserDefaultSwitchParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):
    pass


class UserDefaultColorPickerParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):
    choices: list[ColorPickerChoice]


class UserDefaultDropdownParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):
    choices: list[str]


class UserDefaultPasswordParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):
    pass


class UserDefaultNestedParamCodeObjImpl(
    UserDefaultBaseParamCodeObjImpl, UserDefaultBaseParentCodeObjImpl
):
    pass
