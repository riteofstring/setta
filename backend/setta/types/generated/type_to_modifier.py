from typing import Literal, overload

from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_modifier_unions import (
    BaseCodeObjImplModifierUnion,
    BaseSectionImplModifierUnion,
)
from setta.types.generated.impl_modifiers import (
    BrowserSectionImplModifier,
    CallableSectionImplModifier,
    ChartSectionImplModifier,
    ChatSectionImplModifier,
    CodeCallableCodeObjImplModifier,
    CodeParamCodeObjImplModifier,
    CodeSectionImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DictRootSectionImplModifier,
    DictSectionImplModifier,
    DrawSectionImplModifier,
    DropdownParamCodeObjImplModifier,
    GenPythonCodeSectionImplModifier,
    GlobalVariablesSectionImplModifier,
    GroupSectionImplModifier,
    IFrameSectionImplModifier,
    ImageSectionImplModifier,
    ListRootSectionImplModifier,
    NestedParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SocialSectionImplModifier,
    SwitchParamCodeObjImplModifier,
    TerminalSectionImplModifier,
    TextBlockSectionImplModifier,
    TextParamCodeObjImplModifier,
)
from setta.types.section_impls import SectionType


# Overloads for section type to modifier conversion
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Callable],
) -> CallableSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Dict],
) -> DictSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.ListRoot],
) -> ListRootSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.DictRoot],
) -> DictRootSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Group],
) -> GroupSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Image],
) -> ImageSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Chart],
) -> ChartSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Draw],
) -> DrawSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.TextBlock],
) -> TextBlockSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Social],
) -> SocialSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.GlobalVariables],
) -> GlobalVariablesSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Code],
) -> CodeSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.GenPythonCode],
) -> GenPythonCodeSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Terminal],
) -> TerminalSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.IFrame],
) -> IFrameSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Chat],
) -> ChatSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: Literal[SectionType.Browser],
) -> BrowserSectionImplModifier: ...
@overload
def create_modifier_for_section_type(
    type_: SectionType,
) -> BaseSectionImplModifierUnion: ...


def create_modifier_for_section_type(
    type_: SectionType,
) -> BaseSectionImplModifierUnion:
    """Create a SectionImplModifier for the given SectionType."""
    if type_ == SectionType.Callable:
        return CallableSectionImplModifier(type=type_)
    elif type_ == SectionType.Dict:
        return DictSectionImplModifier(type=type_)
    elif type_ == SectionType.ListRoot:
        return ListRootSectionImplModifier(type=type_)
    elif type_ == SectionType.DictRoot:
        return DictRootSectionImplModifier(type=type_)
    elif type_ == SectionType.Group:
        return GroupSectionImplModifier(type=type_)
    elif type_ == SectionType.Image:
        return ImageSectionImplModifier(type=type_)
    elif type_ == SectionType.Chart:
        return ChartSectionImplModifier(type=type_)
    elif type_ == SectionType.Draw:
        return DrawSectionImplModifier(type=type_)
    elif type_ == SectionType.TextBlock:
        return TextBlockSectionImplModifier(type=type_)
    elif type_ == SectionType.Social:
        return SocialSectionImplModifier(type=type_)
    elif type_ == SectionType.GlobalVariables:
        return GlobalVariablesSectionImplModifier(type=type_)
    elif type_ == SectionType.Code:
        return CodeSectionImplModifier(type=type_)
    elif type_ == SectionType.GenPythonCode:
        return GenPythonCodeSectionImplModifier(type=type_)
    elif type_ == SectionType.Terminal:
        return TerminalSectionImplModifier(type=type_)
    elif type_ == SectionType.IFrame:
        return IFrameSectionImplModifier(type=type_)
    elif type_ == SectionType.Chat:
        return ChatSectionImplModifier(type=type_)
    elif type_ == SectionType.Browser:
        return BrowserSectionImplModifier(type=type_)
    else:
        raise ValueError(f"Unknown section type: {type_}")


# Overloads for code obj type to modifier conversion
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.CodeCallable],
) -> CodeCallableCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.CodeParam],
) -> CodeParamCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.TextParam],
) -> TextParamCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.SliderParam],
) -> SliderParamCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.SwitchParam],
) -> SwitchParamCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.ColorPickerParam],
) -> ColorPickerParamCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.DropdownParam],
) -> DropdownParamCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.PasswordParam],
) -> PasswordParamCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: Literal[CodeObjType.NestedParam],
) -> NestedParamCodeObjImplModifier: ...
@overload
def create_modifier_for_code_obj_type(
    type_: CodeObjType,
) -> BaseCodeObjImplModifierUnion: ...


def create_modifier_for_code_obj_type(
    type_: CodeObjType,
) -> BaseCodeObjImplModifierUnion:
    """Create a CodeObjImplModifier for the given CodeObjType."""
    if type_ == CodeObjType.CodeCallable:
        return CodeCallableCodeObjImplModifier(type=type_)
    elif type_ == CodeObjType.CodeParam:
        return CodeParamCodeObjImplModifier(type=type_)
    elif type_ == CodeObjType.TextParam:
        return TextParamCodeObjImplModifier(type=type_)
    elif type_ == CodeObjType.SliderParam:
        return SliderParamCodeObjImplModifier(type=type_)
    elif type_ == CodeObjType.SwitchParam:
        return SwitchParamCodeObjImplModifier(type=type_)
    elif type_ == CodeObjType.ColorPickerParam:
        return ColorPickerParamCodeObjImplModifier(type=type_)
    elif type_ == CodeObjType.DropdownParam:
        return DropdownParamCodeObjImplModifier(type=type_)
    elif type_ == CodeObjType.PasswordParam:
        return PasswordParamCodeObjImplModifier(type=type_)
    elif type_ == CodeObjType.NestedParam:
        return NestedParamCodeObjImplModifier(type=type_)
    else:
        raise ValueError(f"Unknown code obj type: {type_}")
