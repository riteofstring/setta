# Test helper copy of the former generated implementation builders.

from typing import Any

from setta.types.code_obj_impls import (
    ButtonParamCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeObjType,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DateParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    DropzoneParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    RotaryParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextAreaParamCodeObjImpl,
    TextParamCodeObjImpl,
    TimeParamCodeObjImpl,
)
# Import implementation classes
from setta.types.section_impls import (
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    ChatSectionImpl,
    CodeSectionImpl,
    DictSectionImpl,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
    GenPythonMetadataSectionImpl,
    GlobalVariablesSectionImpl,
    GroupSectionImpl,
    IFrameSectionImpl,
    ImageSectionImpl,
    ListRootSectionImpl,
    MetaControlSectionImpl,
    PluginSectionImpl,
    PromptSectionImpl,
    SectionType,
    SocialSectionImpl,
    SpreadsheetSectionImpl,
    StateMachineEndSectionImpl,
    StateMachineGateSectionImpl,
    StateMachineStartSectionImpl,
    TaskBoardSectionImpl,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)

SectionImplOverrides = dict[str, object]


def create_section_impl(
    type: SectionType, defaults: Any, overrides: SectionImplOverrides | None = None
):
    match type:
        case SectionType.Callable:
            if overrides is None:
                overrides = {}
            return CallableSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Dict:
            if overrides is None:
                overrides = {}
            return DictSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.ListRoot:
            if overrides is None:
                overrides = {}
            return ListRootSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Group:
            if overrides is None:
                overrides = {}
            return GroupSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.StateMachineStart:
            if overrides is None:
                overrides = {}
            return StateMachineStartSectionImpl(
                **{**defaults.model_dump(), **overrides}
            )

        case SectionType.StateMachineGate:
            if overrides is None:
                overrides = {}
            return StateMachineGateSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.StateMachineEnd:
            if overrides is None:
                overrides = {}
            return StateMachineEndSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Image:
            if overrides is None:
                overrides = {}
            return ImageSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Chart:
            if overrides is None:
                overrides = {}
            return ChartSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Draw:
            if overrides is None:
                overrides = {}
            return DrawSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.TextBlock:
            if overrides is None:
                overrides = {}
            return TextBlockSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Prompt:
            if overrides is None:
                overrides = {}
            return PromptSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.MetaControl:
            if overrides is None:
                overrides = {}
            return MetaControlSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Social:
            if overrides is None:
                overrides = {}
            return SocialSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.GlobalVariables:
            if overrides is None:
                overrides = {}
            return GlobalVariablesSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Code:
            if overrides is None:
                overrides = {}
            return CodeSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.GenPythonCode:
            if overrides is None:
                overrides = {}
            return GenPythonCodeSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.GenPythonMetadata:
            if overrides is None:
                overrides = {}
            return GenPythonMetadataSectionImpl(
                **{**defaults.model_dump(), **overrides}
            )

        case SectionType.Terminal:
            if overrides is None:
                overrides = {}
            return TerminalSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.IFrame:
            if overrides is None:
                overrides = {}
            return IFrameSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Chat:
            if overrides is None:
                overrides = {}
            return ChatSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Browser:
            if overrides is None:
                overrides = {}
            return BrowserSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Plugin:
            if overrides is None:
                overrides = {}
            return PluginSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.TaskBoard:
            if overrides is None:
                overrides = {}
            return TaskBoardSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Spreadsheet:
            if overrides is None:
                overrides = {}
            return SpreadsheetSectionImpl(**{**defaults.model_dump(), **overrides})


def create_code_obj_impl(type: CodeObjType, defaults: Any, overrides: Any = None):
    match type:
        case CodeObjType.CodeCallable:
            if overrides is None:
                overrides = {}
            return CodeCallableCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.CodeParam:
            if overrides is None:
                overrides = {}
            return CodeParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.TextParam:
            if overrides is None:
                overrides = {}
            return TextParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.DateParam:
            if overrides is None:
                overrides = {}
            return DateParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.TimeParam:
            if overrides is None:
                overrides = {}
            return TimeParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.ButtonParam:
            if overrides is None:
                overrides = {}
            return ButtonParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.SliderParam:
            if overrides is None:
                overrides = {}
            return SliderParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.RotaryParam:
            if overrides is None:
                overrides = {}
            return RotaryParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.SwitchParam:
            if overrides is None:
                overrides = {}
            return SwitchParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.ColorPickerParam:
            if overrides is None:
                overrides = {}
            return ColorPickerParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.DropdownParam:
            if overrides is None:
                overrides = {}
            return DropdownParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.PasswordParam:
            if overrides is None:
                overrides = {}
            return PasswordParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.TextAreaParam:
            if overrides is None:
                overrides = {}
            return TextAreaParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.DropzoneParam:
            if overrides is None:
                overrides = {}
            return DropzoneParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.NestedParam:
            if overrides is None:
                overrides = {}
            return NestedParamCodeObjImpl(**{**defaults.model_dump(), **overrides})
