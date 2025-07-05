
from typing import Literal, Union

from pydantic import BaseModel, Field

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

    isFrozen: bool = False
    visibility: Visibility = Field(default_factory = Visibility)
    size: SectionSize = Field(default_factory = SectionSize)
    aspectRatio: bool | float = False
    isMinimized: bool = False
    positionAndSizeLocked: bool = False
class UserDefaultBaseSectionWithParamsImpl(UserDefaultBaseSectionImpl):

    hideUnpinnedParams: bool = False
    paramFilter: str = ""
    columnWidth: float | None = None
    configLanguage: ConfigLanguage = ConfigLanguage.python
    pinnedAreaHeight: float | Literal[SectionSizeMode.auto] = SectionSizeMode.auto
class UserDefaultBaseArtifactSectionImpl(UserDefaultBaseSectionImpl):

    pass

class UserDefaultBaseCanvasSectionImpl(UserDefaultBaseSectionImpl):

    pass

class UserDefaultBaseCodeSectionImpl(UserDefaultBaseSectionImpl):

    code: str = ""
class UserDefaultBaseParentSectionImpl(UserDefaultBaseSectionImpl):

    pass

class UserDefaultBaseDictSectionImpl(UserDefaultBaseSectionWithParamsImpl):

    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory = list[Any])
class UserDefaultCallableSectionImpl(UserDefaultBaseSectionWithParamsImpl):

    hideParams: bool = False
class UserDefaultDictSectionImpl(UserDefaultBaseDictSectionImpl):

    pass

class UserDefaultListRootSectionImpl(UserDefaultBaseParentSectionImpl):

    pass

class UserDefaultDictRootSectionImpl(UserDefaultBaseParentSectionImpl):

    pass

class UserDefaultGroupSectionImpl(UserDefaultBaseParentSectionImpl):

    isHorizontalOrientation: bool = False
class UserDefaultImageSectionImpl(UserDefaultBaseArtifactSectionImpl):

    pass

class UserDefaultChartSectionImpl(UserDefaultBaseArtifactSectionImpl, UserDefaultBaseCanvasSectionImpl):

    size: SectionSize = Field(default_factory = lambda: SectionSize(width=400, height=400))
    chartSettings: ChartSettings = Field(default_factory = ChartSettings)
class UserDefaultDrawSectionImpl(UserDefaultBaseArtifactSectionImpl, UserDefaultBaseCanvasSectionImpl):

    canvasSettings: DrawAreaCanvasSettings = Field(default_factory = DrawAreaCanvasSettings)
class UserDefaultTextBlockSectionImpl(UserDefaultBaseSectionImpl):

    format: TextBlockFormat = TextBlockFormat.Plaintext
    headingAsSectionName: bool = False
    displayMode: TextBlockDisplayMode = TextBlockDisplayMode.render
    text: str = ""
class UserDefaultSocialSectionImpl(UserDefaultBaseSectionImpl):

    social: str = ""
class UserDefaultGlobalVariablesSectionImpl(UserDefaultBaseDictSectionImpl):

    pass

class UserDefaultCodeSectionImpl(UserDefaultBaseCodeSectionImpl):

    size: SectionSize = Field(default_factory = lambda: SectionSize(width=500)))
    codeLanguage: CodeLanguage = CodeLanguage.python
class UserDefaultGenPythonCodeSectionImpl(UserDefaultBaseCodeSectionImpl):

    pass

class UserDefaultTerminalSectionImpl(UserDefaultBaseSectionImpl):

    size: SectionSize = Field(default_factory = lambda: SectionSize(width=700, height=300))
class UserDefaultIFrameSectionImpl(UserDefaultBaseSectionImpl):

    pass

class UserDefaultChatSectionImpl(UserDefaultBaseSectionImpl):

    size: SectionSize = Field(default_factory = lambda: SectionSize(width=405, height=405))
class UserDefaultBrowserSectionImpl(UserDefaultBaseSectionImpl):

    hideColumn: bool = False
class UserDefaultBaseCodeObjImpl(BaseModel):

    pass

class UserDefaultBaseParamCodeObjImpl(UserDefaultBaseCodeObjImpl):

    coreNameType: ParamNameType = ParamNameType.TEXT
    coreNameEditable: bool = False
class UserDefaultBaseChildlessCodeObjImpl(UserDefaultBaseParamCodeObjImpl):

    defaultVal: str = ""
    value: str = ""
class UserDefaultBaseParentCodeObjImpl(UserDefaultBaseCodeObjImpl):

    pass

class UserDefaultCodeCallableCodeObjImpl(UserDefaultBaseParentCodeObjImpl):

    pass

class UserDefaultCodeParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):

    pass

class UserDefaultTextParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):

    pass

class UserDefaultSliderParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):

    min: int = 0
    max: int = 100
    step: int = 1
class UserDefaultSwitchParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):

    pass

class UserDefaultColorPickerParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):

    choices: list[ColorPickerChoice] = Field(default_factory = list[Any])
class UserDefaultDropdownParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):

    choices: list[str] = Field(default_factory = list[Any])
class UserDefaultPasswordParamCodeObjImpl(UserDefaultBaseChildlessCodeObjImpl):

    pass

class UserDefaultNestedParamCodeObjImpl(UserDefaultBaseParamCodeObjImpl, UserDefaultBaseParentCodeObjImpl):

    pass
