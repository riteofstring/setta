from typing import Literal, overload

from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
from setta.types.generated.code_obj_cores import (
    CodeCallableCodeObjCore,
    CodeParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    NestedParamCodeObjCore,
    PasswordParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    TextParamCodeObjCore,
)
from setta.types.generated.section_core_unions import BaseSectionCoreUnion
from setta.types.generated.section_cores import (
    BrowserSectionCore,
    CallableSectionCore,
    ChartSectionCore,
    ChatSectionCore,
    CodeSectionCore,
    DictRootSectionCore,
    DictSectionCore,
    DrawSectionCore,
    GenPythonCodeSectionCore,
    GlobalVariablesSectionCore,
    GroupSectionCore,
    IFrameSectionCore,
    ImageSectionCore,
    ListRootSectionCore,
    SocialSectionCore,
    TerminalSectionCore,
    TextBlockSectionCore,
)
from setta.types.section_impls import SectionType


# Overloads for section type to core conversion
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Callable], **kwargs
) -> CallableSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Dict], **kwargs
) -> DictSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.ListRoot], **kwargs
) -> ListRootSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.DictRoot], **kwargs
) -> DictRootSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Group], **kwargs
) -> GroupSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Image], **kwargs
) -> ImageSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Chart], **kwargs
) -> ChartSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Draw], **kwargs
) -> DrawSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.TextBlock], **kwargs
) -> TextBlockSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Social], **kwargs
) -> SocialSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.GlobalVariables], **kwargs
) -> GlobalVariablesSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Code], **kwargs
) -> CodeSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.GenPythonCode], **kwargs
) -> GenPythonCodeSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Terminal], **kwargs
) -> TerminalSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.IFrame], **kwargs
) -> IFrameSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Chat], **kwargs
) -> ChatSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Browser], **kwargs
) -> BrowserSectionCore: ...
@overload
def create_core_for_section_type(
    type_: SectionType, **kwargs
) -> BaseSectionCoreUnion: ...


def create_core_for_section_type(type_: SectionType, **kwargs) -> BaseSectionCoreUnion:
    """Create a SectionCore for the given SectionType.

    Args:
        type_: The SectionType enum value
        **kwargs: Additional arguments to pass to the core constructor
            (e.g., id, name, sharedModifier, unsharedKeys)

    Returns:
        A new SectionCore instance of the appropriate type
    """
    if type_ == SectionType.Callable:
        return CallableSectionCore(**kwargs)
    elif type_ == SectionType.Dict:
        return DictSectionCore(**kwargs)
    elif type_ == SectionType.ListRoot:
        return ListRootSectionCore(**kwargs)
    elif type_ == SectionType.DictRoot:
        return DictRootSectionCore(**kwargs)
    elif type_ == SectionType.Group:
        return GroupSectionCore(**kwargs)
    elif type_ == SectionType.Image:
        return ImageSectionCore(**kwargs)
    elif type_ == SectionType.Chart:
        return ChartSectionCore(**kwargs)
    elif type_ == SectionType.Draw:
        return DrawSectionCore(**kwargs)
    elif type_ == SectionType.TextBlock:
        return TextBlockSectionCore(**kwargs)
    elif type_ == SectionType.Social:
        return SocialSectionCore(**kwargs)
    elif type_ == SectionType.GlobalVariables:
        return GlobalVariablesSectionCore(**kwargs)
    elif type_ == SectionType.Code:
        return CodeSectionCore(**kwargs)
    elif type_ == SectionType.GenPythonCode:
        return GenPythonCodeSectionCore(**kwargs)
    elif type_ == SectionType.Terminal:
        return TerminalSectionCore(**kwargs)
    elif type_ == SectionType.IFrame:
        return IFrameSectionCore(**kwargs)
    elif type_ == SectionType.Chat:
        return ChatSectionCore(**kwargs)
    elif type_ == SectionType.Browser:
        return BrowserSectionCore(**kwargs)
    else:
        raise ValueError(f"Unknown section type: {type_}")


# Overloads for code obj type to core conversion
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.CodeCallable], **kwargs
) -> CodeCallableCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.CodeParam], **kwargs
) -> CodeParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.TextParam], **kwargs
) -> TextParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.SliderParam], **kwargs
) -> SliderParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.SwitchParam], **kwargs
) -> SwitchParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.ColorPickerParam], **kwargs
) -> ColorPickerParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.DropdownParam], **kwargs
) -> DropdownParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.PasswordParam], **kwargs
) -> PasswordParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.NestedParam], **kwargs
) -> NestedParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: CodeObjType, **kwargs
) -> BaseCodeObjCoreUnion: ...


def create_core_for_code_obj_type(type_: CodeObjType, **kwargs) -> BaseCodeObjCoreUnion:
    """Create a CodeObjCore for the given CodeObjType.

    Args:
        type_: The CodeObjType enum value
        **kwargs: Additional arguments to pass to the core constructor
            (e.g., id, name, sharedModifier, unsharedKeys)

    Returns:
        A new CodeObjCore instance of the appropriate type
    """
    if type_ == CodeObjType.CodeCallable:
        return CodeCallableCodeObjCore(**kwargs)
    elif type_ == CodeObjType.CodeParam:
        return CodeParamCodeObjCore(**kwargs)
    elif type_ == CodeObjType.TextParam:
        return TextParamCodeObjCore(**kwargs)
    elif type_ == CodeObjType.SliderParam:
        return SliderParamCodeObjCore(**kwargs)
    elif type_ == CodeObjType.SwitchParam:
        return SwitchParamCodeObjCore(**kwargs)
    elif type_ == CodeObjType.ColorPickerParam:
        return ColorPickerParamCodeObjCore(**kwargs)
    elif type_ == CodeObjType.DropdownParam:
        return DropdownParamCodeObjCore(**kwargs)
    elif type_ == CodeObjType.PasswordParam:
        return PasswordParamCodeObjCore(**kwargs)
    elif type_ == CodeObjType.NestedParam:
        return NestedParamCodeObjCore(**kwargs)
    else:
        raise ValueError(f"Unknown code obj type: {type_}")
