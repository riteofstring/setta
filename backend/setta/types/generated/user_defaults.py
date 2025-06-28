# Auto-generated UserDefault classes - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Literal, Union

from pydantic import BaseModel, Field

# Code object type imports
from setta.types.code_objs import (
    ColorPickerChoice,
    ParameterPassingStyle,
    ParamNameType,
)

# Section type imports
from setta.types.sections import (
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

# ============== Section UserDefault Classes ==============


class UserDefaultBaseSectionImpl(BaseModel, extra="forbid"):
    """User-configurable defaults for BaseSectionImpl"""

    parentId: str | None = None
    isFrozen: bool = False
    visibility: Visibility = Field(default_factory=Visibility)
    isInOtherProjectConfigs: bool = False
    size: SectionSize = Field(default_factory=SectionSize)
    aspectRatio: bool = False
    aspectRatioExtraHeight: int = 0
    aspectRatioExtraWidth: int = 0
    isMinimized: bool = False
    positionAndSizeLocked: bool = False
    isPreset: bool = False


class UserDefaultBaseSectionWithParamsImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for BaseSectionWithParamsImpl"""

    codeObjImplLayeringMap: dict[str, str] = Field(default_factory=dict)
    hideUnpinnedParams: bool = False
    paramFilter: str = ""
    columnWidth: float | None = None
    configLanguage: ConfigLanguage = ConfigLanguage.python
    pinnedParams: list[str] = Field(default_factory=list)
    pinnedAreaHeight: Union[float, Literal[SectionSizeMode.auto]] = SectionSizeMode.auto
    selectedParams: list[str] = Field(default_factory=list)
    ignoreTypeErrors: dict[str, bool] = Field(default_factory=dict)


class UserDefaultBaseArtifactSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for BaseArtifactSectionImpl"""

    artifactGroupIds: list[str] = Field(default_factory=list)


class UserDefaultBaseCanvasSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for BaseCanvasSectionImpl"""

    renderedValue: Any = None


class UserDefaultBaseCodeSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for BaseCodeSectionImpl"""

    code: str = ""


class UserDefaultBaseParentSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for BaseParentSectionImpl"""

    children: list[str] = Field(default_factory=list)


class UserDefaultBaseDictSectionImpl(
    UserDefaultBaseSectionWithParamsImpl, extra="forbid"
):
    """User-configurable defaults for BaseDictSectionImpl"""

    topLevelParamIds: list[str] = Field(default_factory=list)
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


class UserDefaultCallableSectionImpl(
    UserDefaultBaseSectionWithParamsImpl, extra="forbid"
):
    """User-configurable defaults for CallableSectionImpl"""

    callable: str | None = None
    hideParams: bool = False


class UserDefaultDictSectionImpl(UserDefaultBaseDictSectionImpl, extra="forbid"):
    """User-configurable defaults for DictSectionImpl"""

    pass


class UserDefaultListRootSectionImpl(UserDefaultBaseParentSectionImpl, extra="forbid"):
    """User-configurable defaults for ListRootSectionImpl"""

    pass


class UserDefaultDictRootSectionImpl(UserDefaultBaseParentSectionImpl, extra="forbid"):
    """User-configurable defaults for DictRootSectionImpl"""

    pass


class UserDefaultGroupSectionImpl(UserDefaultBaseParentSectionImpl, extra="forbid"):
    """User-configurable defaults for GroupSectionImpl"""

    isHorizontalOrientation: bool = False


class UserDefaultImageSectionImpl(UserDefaultBaseArtifactSectionImpl, extra="forbid"):
    """User-configurable defaults for ImageSectionImpl"""

    pass


class UserDefaultChartSectionImpl(UserDefaultBaseArtifactSectionImpl, extra="forbid"):
    """User-configurable defaults for ChartSectionImpl"""

    chartSettings: ChartSettings = Field(default_factory=ChartSettings)
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=400, height=400)
    )


class UserDefaultDrawSectionImpl(UserDefaultBaseArtifactSectionImpl, extra="forbid"):
    """User-configurable defaults for DrawSectionImpl"""

    canvasSettings: DrawAreaCanvasSettings = Field(
        default_factory=DrawAreaCanvasSettings
    )


class UserDefaultTextBlockSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for TextBlockSectionImpl"""

    format: TextBlockFormat = TextBlockFormat.Plaintext
    headingAsSectionName: bool = False
    displayMode: TextBlockDisplayMode = TextBlockDisplayMode.render
    text: str = ""


class UserDefaultSocialSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for SocialSectionImpl"""

    social: str = ""


class UserDefaultGlobalVariablesSectionImpl(
    UserDefaultBaseDictSectionImpl, extra="forbid"
):
    """User-configurable defaults for GlobalVariablesSectionImpl"""

    name: str = "Global Variables"


class UserDefaultCodeSectionImpl(UserDefaultBaseCodeSectionImpl, extra="forbid"):
    """User-configurable defaults for CodeSectionImpl"""

    codeLanguage: CodeLanguage = CodeLanguage.python
    size: SectionSize = Field(default_factory=lambda: SectionSize(width=500))


class UserDefaultGenPythonCodeSectionImpl(
    UserDefaultBaseCodeSectionImpl, extra="forbid"
):
    """User-configurable defaults for GenPythonCodeSectionImpl"""

    name: str = "Generated Python Code"


class UserDefaultTerminalSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for TerminalSectionImpl"""

    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=700, height=300)
    )


class UserDefaultIFrameSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for IFrameSectionImpl"""

    pass


class UserDefaultChatSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for ChatSectionImpl"""

    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=405, height=405)
    )


class UserDefaultBrowserSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    """User-configurable defaults for BrowserSectionImpl"""

    hideColumn: bool = False


# ============== Code Object UserDefault Classes ==============


class UserDefaultBaseCodeObjImpl(BaseModel, extra="forbid"):
    """User-configurable defaults for BaseCodeObjImpl"""

    description: str = ""
    isPreset: bool = False


class UserDefaultBaseParamCodeObjImpl(UserDefaultBaseCodeObjImpl, extra="forbid"):
    """User-configurable defaults for BaseParamCodeObjImpl"""

    coreNameType: ParamNameType = ParamNameType.TEXT
    coreNameEditable: bool = False
    passingStyle: ParameterPassingStyle = ParameterPassingStyle.DEFAULT


class UserDefaultBaseChildlessCodeObjImpl(
    UserDefaultBaseParamCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for BaseChildlessCodeObjImpl"""

    defaultVal: str = ""
    value: str = ""


class UserDefaultBaseParentCodeObjImpl(UserDefaultBaseCodeObjImpl, extra="forbid"):
    """User-configurable defaults for BaseParentCodeObjImpl"""

    children: list[str] = Field(default_factory=list)


class UserDefaultCodeCallableCodeObjImpl(
    UserDefaultBaseParentCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for CodeCallableCodeObjImpl"""

    pass


class UserDefaultCodeParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for CodeParamCodeObjImpl"""

    pass


class UserDefaultTextParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for TextParamCodeObjImpl"""

    pass


class UserDefaultSliderParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for SliderParamCodeObjImpl"""

    min: int = 0
    max: int = 100
    step: int = 1


class UserDefaultSwitchParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for SwitchParamCodeObjImpl"""

    pass


class UserDefaultColorPickerParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for ColorPickerParamCodeObjImpl"""

    choices: list[ColorPickerChoice] = Field(default_factory=list)


class UserDefaultDropdownParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for DropdownParamCodeObjImpl"""

    choices: list[str] = Field(default_factory=list)


class UserDefaultPasswordParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for PasswordParamCodeObjImpl"""

    pass


class UserDefaultNestedParamCodeObjImpl(
    UserDefaultBaseParamCodeObjImpl, extra="forbid"
):
    """User-configurable defaults for NestedParamCodeObjImpl"""

    pass
