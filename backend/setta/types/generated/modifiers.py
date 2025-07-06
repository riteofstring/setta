from typing import Any, Literal, NotRequired, TypedDict, overload

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


class BaseSectionModifier(TypedDict):
    type: Any
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


class BaseSectionWithParamsModifier(BaseSectionModifier):
    type: Any
    codeObjImplLayeringMap: NotRequired[dict[str, str]]
    hideUnpinnedParams: NotRequired[bool]
    paramFilter: NotRequired[str]
    columnWidth: NotRequired[float | None]
    configLanguage: NotRequired[ConfigLanguage]
    pinnedParams: NotRequired[list[str]]
    pinnedAreaHeight: NotRequired[float | Literal[SectionSizeMode.auto]]
    selectedParams: NotRequired[list[str]]
    ignoreTypeErrors: NotRequired[dict[str, bool]]


class BaseArtifactSectionModifier(BaseSectionModifier):
    type: Any
    artifactGroupIds: NotRequired[list[str]]


class BaseCanvasSectionModifier(BaseSectionModifier):
    type: Any
    renderedValue: NotRequired[Any]


class BaseCodeSectionModifier(BaseSectionModifier):
    type: Any
    code: NotRequired[str]


class BaseParentSectionModifier(BaseSectionModifier):
    type: Any
    children: NotRequired[list[str]]


class BaseDictSectionModifier(BaseSectionWithParamsModifier):
    type: Any
    topLevelParamIds: NotRequired[list[str]]
    isJsonSource: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]


class CallableSectionModifier(BaseSectionWithParamsModifier):
    type: Literal[SectionType.Callable]
    callable: NotRequired[str | None]
    hideParams: NotRequired[bool]


class DictSectionModifier(BaseDictSectionModifier):
    type: Literal[SectionType.Dict]


class ListRootSectionModifier(BaseParentSectionModifier):
    type: Literal[SectionType.ListRoot]


class DictRootSectionModifier(BaseParentSectionModifier):
    type: Literal[SectionType.DictRoot]


class GroupSectionModifier(BaseParentSectionModifier):
    type: Literal[SectionType.Group]
    isHorizontalOrientation: NotRequired[bool]


class ImageSectionModifier(BaseArtifactSectionModifier):
    type: Literal[SectionType.Image]


class ChartSectionModifier(BaseArtifactSectionModifier, BaseCanvasSectionModifier):
    type: Literal[SectionType.Chart]
    chartSettings: NotRequired[ChartSettings]


class DrawSectionModifier(BaseArtifactSectionModifier, BaseCanvasSectionModifier):
    type: Literal[SectionType.Draw]
    canvasSettings: NotRequired[DrawAreaCanvasSettings]


class TextBlockSectionModifier(BaseSectionModifier):
    type: Literal[SectionType.TextBlock]
    format: NotRequired[TextBlockFormat]
    headingAsSectionName: NotRequired[bool]
    displayMode: NotRequired[TextBlockDisplayMode]
    text: NotRequired[str]


class SocialSectionModifier(BaseSectionModifier):
    type: Literal[SectionType.Social]
    social: NotRequired[str]


class GlobalVariablesSectionModifier(BaseDictSectionModifier):
    type: Literal[SectionType.GlobalVariables]


class CodeSectionModifier(BaseCodeSectionModifier):
    type: Literal[SectionType.Code]
    codeLanguage: NotRequired[CodeLanguage]


class GenPythonCodeSectionModifier(BaseCodeSectionModifier):
    type: Literal[SectionType.GenPythonCode]


class TerminalSectionModifier(BaseSectionModifier):
    type: Literal[SectionType.Terminal]


class IFrameSectionModifier(BaseSectionModifier):
    type: Literal[SectionType.IFrame]


class ChatSectionModifier(BaseSectionModifier):
    type: Literal[SectionType.Chat]


class BrowserSectionModifier(BaseSectionModifier):
    type: Literal[SectionType.Browser]
    hideColumn: NotRequired[bool]


class BaseCodeObjModifier(TypedDict):
    type: Any
    description: NotRequired[str]


class BaseParamCodeObjModifier(BaseCodeObjModifier):
    type: Any
    coreNameType: NotRequired[ParamNameType]
    coreNameEditable: NotRequired[bool]
    passingStyle: NotRequired[ParameterPassingStyle]


class BaseChildlessCodeObjModifier(BaseParamCodeObjModifier):
    type: Any
    defaultVal: NotRequired[str]
    value: NotRequired[str]


class BaseParentCodeObjModifier(BaseCodeObjModifier):
    type: Any
    children: NotRequired[list[str]]


class CodeCallableCodeObjModifier(BaseParentCodeObjModifier):
    type: Literal[CodeObjType.CodeCallable]


class CodeParamCodeObjModifier(BaseChildlessCodeObjModifier):
    type: Literal[CodeObjType.CodeParam]


class TextParamCodeObjModifier(BaseChildlessCodeObjModifier):
    type: Literal[CodeObjType.TextParam]


class SliderParamCodeObjModifier(BaseChildlessCodeObjModifier):
    type: Literal[CodeObjType.SliderParam]
    min: NotRequired[int]
    max: NotRequired[int]
    step: NotRequired[int]


class SwitchParamCodeObjModifier(BaseChildlessCodeObjModifier):
    type: Literal[CodeObjType.SwitchParam]


class ColorPickerParamCodeObjModifier(BaseChildlessCodeObjModifier):
    type: Literal[CodeObjType.ColorPickerParam]
    choices: NotRequired[list[ColorPickerChoice]]


class DropdownParamCodeObjModifier(BaseChildlessCodeObjModifier):
    type: Literal[CodeObjType.DropdownParam]
    choices: NotRequired[list[str]]


class PasswordParamCodeObjModifier(BaseChildlessCodeObjModifier):
    type: Literal[CodeObjType.PasswordParam]


class NestedParamCodeObjModifier(BaseParamCodeObjModifier, BaseParentCodeObjModifier):
    type: Literal[CodeObjType.NestedParam]


@overload
def create_section_modifier(
    type: Literal[SectionType.Callable],
) -> CallableSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Dict],
) -> DictSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.ListRoot],
) -> ListRootSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.DictRoot],
) -> DictRootSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Group],
) -> GroupSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Image],
) -> ImageSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Chart],
) -> ChartSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Draw],
) -> DrawSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.TextBlock],
) -> TextBlockSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Social],
) -> SocialSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.GlobalVariables],
) -> GlobalVariablesSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Code],
) -> CodeSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.GenPythonCode],
) -> GenPythonCodeSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Terminal],
) -> TerminalSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.IFrame],
) -> IFrameSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Chat],
) -> ChatSectionModifier: ...


@overload
def create_section_modifier(
    type: Literal[SectionType.Browser],
) -> BrowserSectionModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.CodeCallable],
) -> CodeCallableCodeObjModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.CodeParam],
) -> CodeParamCodeObjModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.TextParam],
) -> TextParamCodeObjModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.SliderParam],
) -> SliderParamCodeObjModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.SwitchParam],
) -> SwitchParamCodeObjModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.ColorPickerParam],
) -> ColorPickerParamCodeObjModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.DropdownParam],
) -> DropdownParamCodeObjModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.PasswordParam],
) -> PasswordParamCodeObjModifier: ...


@overload
def create_code_obj_modifier(
    type: Literal[CodeObjType.NestedParam],
) -> NestedParamCodeObjModifier: ...


def create_section_modifier(
    type: SectionType,
):
    match type:
        case SectionType.Callable:
            return CallableSectionModifier(
                type=type,
            )

        case SectionType.Dict:
            return DictSectionModifier(
                type=type,
            )

        case SectionType.ListRoot:
            return ListRootSectionModifier(
                type=type,
            )

        case SectionType.DictRoot:
            return DictRootSectionModifier(
                type=type,
            )

        case SectionType.Group:
            return GroupSectionModifier(
                type=type,
            )

        case SectionType.Image:
            return ImageSectionModifier(
                type=type,
            )

        case SectionType.Chart:
            return ChartSectionModifier(
                type=type,
            )

        case SectionType.Draw:
            return DrawSectionModifier(
                type=type,
            )

        case SectionType.TextBlock:
            return TextBlockSectionModifier(
                type=type,
            )

        case SectionType.Social:
            return SocialSectionModifier(
                type=type,
            )

        case SectionType.GlobalVariables:
            return GlobalVariablesSectionModifier(
                type=type,
            )

        case SectionType.Code:
            return CodeSectionModifier(
                type=type,
            )

        case SectionType.GenPythonCode:
            return GenPythonCodeSectionModifier(
                type=type,
            )

        case SectionType.Terminal:
            return TerminalSectionModifier(
                type=type,
            )

        case SectionType.IFrame:
            return IFrameSectionModifier(
                type=type,
            )

        case SectionType.Chat:
            return ChatSectionModifier(
                type=type,
            )

        case SectionType.Browser:
            return BrowserSectionModifier(
                type=type,
            )


def create_code_obj_modifier(
    type: CodeObjType,
):
    match type:
        case CodeObjType.CodeCallable:
            return CodeCallableCodeObjModifier(
                type=type,
            )

        case CodeObjType.CodeParam:
            return CodeParamCodeObjModifier(
                type=type,
            )

        case CodeObjType.TextParam:
            return TextParamCodeObjModifier(
                type=type,
            )

        case CodeObjType.SliderParam:
            return SliderParamCodeObjModifier(
                type=type,
            )

        case CodeObjType.SwitchParam:
            return SwitchParamCodeObjModifier(
                type=type,
            )

        case CodeObjType.ColorPickerParam:
            return ColorPickerParamCodeObjModifier(
                type=type,
            )

        case CodeObjType.DropdownParam:
            return DropdownParamCodeObjModifier(
                type=type,
            )

        case CodeObjType.PasswordParam:
            return PasswordParamCodeObjModifier(
                type=type,
            )

        case CodeObjType.NestedParam:
            return NestedParamCodeObjModifier(
                type=type,
            )
