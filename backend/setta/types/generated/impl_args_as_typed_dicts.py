from typing import Any, Callable, Literal, NotRequired, TypedDict

from setta.types.code_obj_impls import (
    CodeObjType,
    ColorPickerChoice,
    ParameterPassingStyle,
    ParamNameType,
)
from setta.types.section_impls import (
    ChartSettings,
    CodeLanguage,
    ConfigLanguage,
    DrawAreaCanvasSettings,
    SectionSize,
    SectionSizeMode,
    SectionType,
    TextBlockDisplayMode,
    TextBlockFormat,
    Visibility,
)


class CoreArgs(TypedDict):
    id: NotRequired[str]
    name: NotRequired[str]
    variants: NotRequired[list[str]]
    defaultVariant: NotRequired[str | None]
    sharedModifier: NotRequired[dict[str, Any]]
    unsharedKeys: NotRequired[
        list[
            Literal[
                "artifactGroupIds",
                "aspectRatio",
                "aspectRatioExtraHeight",
                "aspectRatioExtraWidth",
                "callable",
                "canvasSettings",
                "chartSettings",
                "children",
                "choices",
                "code",
                "codeLanguage",
                "codeObjVariantMap",
                "columnWidth",
                "configLanguage",
                "coreNameEditable",
                "coreNameType",
                "defaultVal",
                "description",
                "displayMode",
                "format",
                "headingAsSectionName",
                "hideColumn",
                "hideParams",
                "hideUnpinnedParams",
                "id",
                "ignoreTypeErrors",
                "isFrozen",
                "isHorizontalOrientation",
                "isInOtherProjectConfigs",
                "isJsonSource",
                "isMinimized",
                "isPreset",
                "jsonSourceKeys",
                "jsonSourceMissing",
                "max",
                "min",
                "name",
                "paramFilter",
                "parentId",
                "passingStyle",
                "pinnedAreaHeight",
                "pinnedParams",
                "positionAndSizeLocked",
                "renderedValue",
                "selectedParams",
                "size",
                "social",
                "step",
                "text",
                "topLevelParamIds",
                "type",
                "value",
                "visibility",
            ]
        ]
    ]


class BaseSectionImplArgs(TypedDict):
    type: NotRequired[Any]
    id: NotRequired[str]
    name: NotRequired[str]
    parentId: NotRequired[str | None]
    isFrozen: NotRequired[bool]
    visibility: NotRequired[Visibility]
    isInOtherProjectConfigs: NotRequired[bool]
    size: NotRequired[SectionSize]
    aspectRatio: NotRequired[bool | float]
    aspectRatioExtraHeight: NotRequired[int]
    aspectRatioExtraWidth: NotRequired[int]
    isMinimized: NotRequired[bool]
    positionAndSizeLocked: NotRequired[bool]
    isPreset: NotRequired[bool]


class BaseSectionImplArgsWithCallable(TypedDict):
    type: NotRequired[Any | Callable[[Any], Any]]
    id: NotRequired[str | Callable[[str], str]]
    name: NotRequired[str | Callable[[str], str]]
    parentId: NotRequired[str | None | Callable[[str | None], str | None]]
    isFrozen: NotRequired[bool | Callable[[bool], bool]]
    visibility: NotRequired[Visibility | Callable[[Visibility], Visibility]]
    isInOtherProjectConfigs: NotRequired[bool | Callable[[bool], bool]]
    size: NotRequired[SectionSize | Callable[[SectionSize], SectionSize]]
    aspectRatio: NotRequired[bool | float | Callable[[bool | float], bool | float]]
    aspectRatioExtraHeight: NotRequired[int | Callable[[int], int]]
    aspectRatioExtraWidth: NotRequired[int | Callable[[int], int]]
    isMinimized: NotRequired[bool | Callable[[bool], bool]]
    positionAndSizeLocked: NotRequired[bool | Callable[[bool], bool]]
    isPreset: NotRequired[bool | Callable[[bool], bool]]


class BaseSectionWithParamsImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    codeObjVariantMap: NotRequired[dict[str, str]]
    hideUnpinnedParams: NotRequired[bool]
    paramFilter: NotRequired[str]
    columnWidth: NotRequired[float | None]
    configLanguage: NotRequired[ConfigLanguage]
    pinnedParams: NotRequired[list[str]]
    pinnedAreaHeight: NotRequired[float | Literal[SectionSizeMode.auto]]
    selectedParams: NotRequired[list[str]]
    ignoreTypeErrors: NotRequired[dict[str, bool]]


class BaseSectionWithParamsImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    codeObjVariantMap: NotRequired[
        dict[str, str] | Callable[[dict[str, str]], dict[str, str]]
    ]
    hideUnpinnedParams: NotRequired[bool | Callable[[bool], bool]]
    paramFilter: NotRequired[str | Callable[[str], str]]
    columnWidth: NotRequired[float | None | Callable[[float | None], float | None]]
    configLanguage: NotRequired[
        ConfigLanguage | Callable[[ConfigLanguage], ConfigLanguage]
    ]
    pinnedParams: NotRequired[list[str] | Callable[[list[str]], list[str]]]
    pinnedAreaHeight: NotRequired[
        float
        | Literal[SectionSizeMode.auto]
        | Callable[
            [float | Literal[SectionSizeMode.auto]],
            float | Literal[SectionSizeMode.auto],
        ]
    ]
    selectedParams: NotRequired[list[str] | Callable[[list[str]], list[str]]]
    ignoreTypeErrors: NotRequired[
        dict[str, bool] | Callable[[dict[str, bool]], dict[str, bool]]
    ]


class BaseArtifactSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    artifactGroupIds: NotRequired[list[str]]


class BaseArtifactSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    artifactGroupIds: NotRequired[list[str] | Callable[[list[str]], list[str]]]


class BaseCanvasSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    renderedValue: NotRequired[Any]


class BaseCanvasSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    renderedValue: NotRequired[Any | Callable[[Any], Any]]


class BaseCodeSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    code: NotRequired[str]


class BaseCodeSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    code: NotRequired[str | Callable[[str], str]]


class BaseParentSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    children: NotRequired[list[str]]


class BaseParentSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    children: NotRequired[list[str] | Callable[[list[str]], list[str]]]


class BaseDictSectionImplArgs(BaseSectionWithParamsImplArgs):
    type: NotRequired[Any]
    topLevelParamIds: NotRequired[list[str]]
    isJsonSource: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]


class BaseDictSectionImplArgsWithCallable(BaseSectionWithParamsImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    topLevelParamIds: NotRequired[list[str] | Callable[[list[str]], list[str]]]
    isJsonSource: NotRequired[bool | Callable[[bool], bool]]
    jsonSourceKeys: NotRequired[list[str] | Callable[[list[str]], list[str]]]
    jsonSourceMissing: NotRequired[bool | Callable[[bool], bool]]


class CallableSectionImplArgs(BaseSectionWithParamsImplArgs):
    type: NotRequired[Literal[SectionType.Callable]]
    callable: NotRequired[str | None]
    hideParams: NotRequired[bool]


class CallableSectionImplArgsWithCallable(BaseSectionWithParamsImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Callable]
        | Callable[[Literal[SectionType.Callable]], Literal[SectionType.Callable]]
    ]
    callable: NotRequired[str | None | Callable[[str | None], str | None]]
    hideParams: NotRequired[bool | Callable[[bool], bool]]


class DictSectionImplArgs(BaseDictSectionImplArgs):
    type: NotRequired[Literal[SectionType.Dict]]


class DictSectionImplArgsWithCallable(BaseDictSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Dict]
        | Callable[[Literal[SectionType.Dict]], Literal[SectionType.Dict]]
    ]


class ListRootSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.ListRoot]]


class ListRootSectionImplArgsWithCallable(BaseParentSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.ListRoot]
        | Callable[[Literal[SectionType.ListRoot]], Literal[SectionType.ListRoot]]
    ]


class DictRootSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.DictRoot]]


class DictRootSectionImplArgsWithCallable(BaseParentSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.DictRoot]
        | Callable[[Literal[SectionType.DictRoot]], Literal[SectionType.DictRoot]]
    ]


class GroupSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.Group]]
    isHorizontalOrientation: NotRequired[bool]


class GroupSectionImplArgsWithCallable(BaseParentSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Group]
        | Callable[[Literal[SectionType.Group]], Literal[SectionType.Group]]
    ]
    isHorizontalOrientation: NotRequired[bool | Callable[[bool], bool]]


class ImageSectionImplArgs(BaseArtifactSectionImplArgs):
    type: NotRequired[Literal[SectionType.Image]]


class ImageSectionImplArgsWithCallable(BaseArtifactSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Image]
        | Callable[[Literal[SectionType.Image]], Literal[SectionType.Image]]
    ]


class ChartSectionImplArgs(BaseArtifactSectionImplArgs, BaseCanvasSectionImplArgs):
    type: NotRequired[Literal[SectionType.Chart]]
    chartSettings: NotRequired[ChartSettings]


class ChartSectionImplArgsWithCallable(
    BaseArtifactSectionImplArgsWithCallable, BaseCanvasSectionImplArgsWithCallable
):
    type: NotRequired[
        Literal[SectionType.Chart]
        | Callable[[Literal[SectionType.Chart]], Literal[SectionType.Chart]]
    ]
    chartSettings: NotRequired[ChartSettings | Callable[[ChartSettings], ChartSettings]]


class DrawSectionImplArgs(BaseArtifactSectionImplArgs, BaseCanvasSectionImplArgs):
    type: NotRequired[Literal[SectionType.Draw]]
    canvasSettings: NotRequired[DrawAreaCanvasSettings]


class DrawSectionImplArgsWithCallable(
    BaseArtifactSectionImplArgsWithCallable, BaseCanvasSectionImplArgsWithCallable
):
    type: NotRequired[
        Literal[SectionType.Draw]
        | Callable[[Literal[SectionType.Draw]], Literal[SectionType.Draw]]
    ]
    canvasSettings: NotRequired[
        DrawAreaCanvasSettings
        | Callable[[DrawAreaCanvasSettings], DrawAreaCanvasSettings]
    ]


class TextBlockSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.TextBlock]]
    format: NotRequired[TextBlockFormat]
    headingAsSectionName: NotRequired[bool]
    displayMode: NotRequired[TextBlockDisplayMode]
    text: NotRequired[str]


class TextBlockSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.TextBlock]
        | Callable[[Literal[SectionType.TextBlock]], Literal[SectionType.TextBlock]]
    ]
    format: NotRequired[TextBlockFormat | Callable[[TextBlockFormat], TextBlockFormat]]
    headingAsSectionName: NotRequired[bool | Callable[[bool], bool]]
    displayMode: NotRequired[
        TextBlockDisplayMode | Callable[[TextBlockDisplayMode], TextBlockDisplayMode]
    ]
    text: NotRequired[str | Callable[[str], str]]


class SocialSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Social]]
    social: NotRequired[str]


class SocialSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Social]
        | Callable[[Literal[SectionType.Social]], Literal[SectionType.Social]]
    ]
    social: NotRequired[str | Callable[[str], str]]


class GlobalVariablesSectionImplArgs(BaseDictSectionImplArgs):
    type: NotRequired[Literal[SectionType.GlobalVariables]]


class GlobalVariablesSectionImplArgsWithCallable(BaseDictSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.GlobalVariables]
        | Callable[
            [Literal[SectionType.GlobalVariables]], Literal[SectionType.GlobalVariables]
        ]
    ]


class CodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: NotRequired[Literal[SectionType.Code]]
    codeLanguage: NotRequired[CodeLanguage]


class CodeSectionImplArgsWithCallable(BaseCodeSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Code]
        | Callable[[Literal[SectionType.Code]], Literal[SectionType.Code]]
    ]
    codeLanguage: NotRequired[CodeLanguage | Callable[[CodeLanguage], CodeLanguage]]


class GenPythonCodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: NotRequired[Literal[SectionType.GenPythonCode]]


class GenPythonCodeSectionImplArgsWithCallable(BaseCodeSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.GenPythonCode]
        | Callable[
            [Literal[SectionType.GenPythonCode]], Literal[SectionType.GenPythonCode]
        ]
    ]


class TerminalSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Terminal]]


class TerminalSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Terminal]
        | Callable[[Literal[SectionType.Terminal]], Literal[SectionType.Terminal]]
    ]


class IFrameSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.IFrame]]


class IFrameSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.IFrame]
        | Callable[[Literal[SectionType.IFrame]], Literal[SectionType.IFrame]]
    ]


class ChatSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Chat]]


class ChatSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Chat]
        | Callable[[Literal[SectionType.Chat]], Literal[SectionType.Chat]]
    ]


class BrowserSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Browser]]
    hideColumn: NotRequired[bool]


class BrowserSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Browser]
        | Callable[[Literal[SectionType.Browser]], Literal[SectionType.Browser]]
    ]
    hideColumn: NotRequired[bool | Callable[[bool], bool]]


class BaseCodeObjImplArgs(TypedDict):
    type: NotRequired[Any]
    id: NotRequired[str]
    name: NotRequired[str]
    description: NotRequired[str]
    isPreset: NotRequired[bool]


class BaseCodeObjImplArgsWithCallable(TypedDict):
    type: NotRequired[Any | Callable[[Any], Any]]
    id: NotRequired[str | Callable[[str], str]]
    name: NotRequired[str | Callable[[str], str]]
    description: NotRequired[str | Callable[[str], str]]
    isPreset: NotRequired[bool | Callable[[bool], bool]]


class BaseParamCodeObjImplArgs(BaseCodeObjImplArgs):
    type: NotRequired[Any]
    coreNameType: NotRequired[ParamNameType]
    coreNameEditable: NotRequired[bool]
    passingStyle: NotRequired[ParameterPassingStyle]


class BaseParamCodeObjImplArgsWithCallable(BaseCodeObjImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    coreNameType: NotRequired[ParamNameType | Callable[[ParamNameType], ParamNameType]]
    coreNameEditable: NotRequired[bool | Callable[[bool], bool]]
    passingStyle: NotRequired[
        ParameterPassingStyle | Callable[[ParameterPassingStyle], ParameterPassingStyle]
    ]


class BaseChildlessCodeObjImplArgs(BaseParamCodeObjImplArgs):
    type: NotRequired[Any]
    defaultVal: NotRequired[str]
    value: NotRequired[str]


class BaseChildlessCodeObjImplArgsWithCallable(BaseParamCodeObjImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    defaultVal: NotRequired[str | Callable[[str], str]]
    value: NotRequired[str | Callable[[str], str]]


class BaseParentCodeObjImplArgs(BaseCodeObjImplArgs):
    type: NotRequired[Any]
    children: NotRequired[list[str]]


class BaseParentCodeObjImplArgsWithCallable(BaseCodeObjImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    children: NotRequired[list[str] | Callable[[list[str]], list[str]]]


class CodeCallableCodeObjImplArgs(BaseParentCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.CodeCallable]]


class CodeCallableCodeObjImplArgsWithCallable(BaseParentCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.CodeCallable]
        | Callable[
            [Literal[CodeObjType.CodeCallable]], Literal[CodeObjType.CodeCallable]
        ]
    ]


class CodeParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.CodeParam]]


class CodeParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.CodeParam]
        | Callable[[Literal[CodeObjType.CodeParam]], Literal[CodeObjType.CodeParam]]
    ]


class TextParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.TextParam]]


class TextParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.TextParam]
        | Callable[[Literal[CodeObjType.TextParam]], Literal[CodeObjType.TextParam]]
    ]


class SliderParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.SliderParam]]
    min: NotRequired[int]
    max: NotRequired[int]
    step: NotRequired[int]


class SliderParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.SliderParam]
        | Callable[[Literal[CodeObjType.SliderParam]], Literal[CodeObjType.SliderParam]]
    ]
    min: NotRequired[int | Callable[[int], int]]
    max: NotRequired[int | Callable[[int], int]]
    step: NotRequired[int | Callable[[int], int]]


class SwitchParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.SwitchParam]]


class SwitchParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.SwitchParam]
        | Callable[[Literal[CodeObjType.SwitchParam]], Literal[CodeObjType.SwitchParam]]
    ]


class ColorPickerParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.ColorPickerParam]]
    choices: NotRequired[list[ColorPickerChoice]]


class ColorPickerParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.ColorPickerParam]
        | Callable[
            [Literal[CodeObjType.ColorPickerParam]],
            Literal[CodeObjType.ColorPickerParam],
        ]
    ]
    choices: NotRequired[
        list[ColorPickerChoice]
        | Callable[[list[ColorPickerChoice]], list[ColorPickerChoice]]
    ]


class DropdownParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.DropdownParam]]
    choices: NotRequired[list[str]]


class DropdownParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.DropdownParam]
        | Callable[
            [Literal[CodeObjType.DropdownParam]], Literal[CodeObjType.DropdownParam]
        ]
    ]
    choices: NotRequired[list[str] | Callable[[list[str]], list[str]]]


class PasswordParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.PasswordParam]]


class PasswordParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.PasswordParam]
        | Callable[
            [Literal[CodeObjType.PasswordParam]], Literal[CodeObjType.PasswordParam]
        ]
    ]


class NestedParamCodeObjImplArgs(BaseParamCodeObjImplArgs, BaseParentCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.NestedParam]]


class NestedParamCodeObjImplArgsWithCallable(
    BaseParamCodeObjImplArgsWithCallable, BaseParentCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.NestedParam]
        | Callable[[Literal[CodeObjType.NestedParam]], Literal[CodeObjType.NestedParam]]
    ]
