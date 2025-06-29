from typing import Union, overload

from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.generated.code_obj_type_unions import (
    BaseCodeObjImplUnion,
)
from setta.types.generated.impl_modifier_unions import (
    AllImplModifierUnion,
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
from setta.types.generated.section_type_unions import (
    BaseSectionImplUnion,
)
from setta.types.section_impls import (
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    ChatSectionImpl,
    CodeSectionImpl,
    DictRootSectionImpl,
    DictSectionImpl,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
    GlobalVariablesSectionImpl,
    GroupSectionImpl,
    IFrameSectionImpl,
    ImageSectionImpl,
    ListRootSectionImpl,
    SocialSectionImpl,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)

# Overloads for specific type inference


@overload
def create_modifier_for_impl(
    impl: CallableSectionImpl,
) -> CallableSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: DictSectionImpl) -> DictSectionImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: ListRootSectionImpl,
) -> ListRootSectionImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: DictRootSectionImpl,
) -> DictRootSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: GroupSectionImpl) -> GroupSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: ImageSectionImpl) -> ImageSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: ChartSectionImpl) -> ChartSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: DrawSectionImpl) -> DrawSectionImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: TextBlockSectionImpl,
) -> TextBlockSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: SocialSectionImpl) -> SocialSectionImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: GlobalVariablesSectionImpl,
) -> GlobalVariablesSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: CodeSectionImpl) -> CodeSectionImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: GenPythonCodeSectionImpl,
) -> GenPythonCodeSectionImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: TerminalSectionImpl,
) -> TerminalSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: IFrameSectionImpl) -> IFrameSectionImplModifier: ...


@overload
def create_modifier_for_impl(impl: ChatSectionImpl) -> ChatSectionImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: BrowserSectionImpl,
) -> BrowserSectionImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: CodeCallableCodeObjImpl,
) -> CodeCallableCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: CodeParamCodeObjImpl,
) -> CodeParamCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: TextParamCodeObjImpl,
) -> TextParamCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: SliderParamCodeObjImpl,
) -> SliderParamCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: SwitchParamCodeObjImpl,
) -> SwitchParamCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: ColorPickerParamCodeObjImpl,
) -> ColorPickerParamCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: DropdownParamCodeObjImpl,
) -> DropdownParamCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: PasswordParamCodeObjImpl,
) -> PasswordParamCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: NestedParamCodeObjImpl,
) -> NestedParamCodeObjImplModifier: ...


@overload
def create_modifier_for_impl(
    impl: Union[BaseSectionImplUnion, BaseCodeObjImplUnion],
) -> AllImplModifierUnion: ...


def create_modifier_for_impl(
    impl: Union[BaseSectionImplUnion, BaseCodeObjImplUnion],
) -> AllImplModifierUnion:
    """Convert an Impl instance to its corresponding ImplModifier."""
    if isinstance(impl, CallableSectionImpl):
        return CallableSectionImplModifier(type=impl.type)
    elif isinstance(impl, DictSectionImpl):
        return DictSectionImplModifier(type=impl.type)
    elif isinstance(impl, ListRootSectionImpl):
        return ListRootSectionImplModifier(type=impl.type)
    elif isinstance(impl, DictRootSectionImpl):
        return DictRootSectionImplModifier(type=impl.type)
    elif isinstance(impl, GroupSectionImpl):
        return GroupSectionImplModifier(type=impl.type)
    elif isinstance(impl, ImageSectionImpl):
        return ImageSectionImplModifier(type=impl.type)
    elif isinstance(impl, ChartSectionImpl):
        return ChartSectionImplModifier(type=impl.type)
    elif isinstance(impl, DrawSectionImpl):
        return DrawSectionImplModifier(type=impl.type)
    elif isinstance(impl, TextBlockSectionImpl):
        return TextBlockSectionImplModifier(type=impl.type)
    elif isinstance(impl, SocialSectionImpl):
        return SocialSectionImplModifier(type=impl.type)
    elif isinstance(impl, GlobalVariablesSectionImpl):
        return GlobalVariablesSectionImplModifier(type=impl.type)
    elif isinstance(impl, CodeSectionImpl):
        return CodeSectionImplModifier(type=impl.type)
    elif isinstance(impl, GenPythonCodeSectionImpl):
        return GenPythonCodeSectionImplModifier(type=impl.type)
    elif isinstance(impl, TerminalSectionImpl):
        return TerminalSectionImplModifier(type=impl.type)
    elif isinstance(impl, IFrameSectionImpl):
        return IFrameSectionImplModifier(type=impl.type)
    elif isinstance(impl, ChatSectionImpl):
        return ChatSectionImplModifier(type=impl.type)
    elif isinstance(impl, BrowserSectionImpl):
        return BrowserSectionImplModifier(type=impl.type)
    elif isinstance(impl, CodeCallableCodeObjImpl):
        return CodeCallableCodeObjImplModifier(type=impl.type)
    elif isinstance(impl, CodeParamCodeObjImpl):
        return CodeParamCodeObjImplModifier(type=impl.type)
    elif isinstance(impl, TextParamCodeObjImpl):
        return TextParamCodeObjImplModifier(type=impl.type)
    elif isinstance(impl, SliderParamCodeObjImpl):
        return SliderParamCodeObjImplModifier(type=impl.type)
    elif isinstance(impl, SwitchParamCodeObjImpl):
        return SwitchParamCodeObjImplModifier(type=impl.type)
    elif isinstance(impl, ColorPickerParamCodeObjImpl):
        return ColorPickerParamCodeObjImplModifier(type=impl.type)
    elif isinstance(impl, DropdownParamCodeObjImpl):
        return DropdownParamCodeObjImplModifier(type=impl.type)
    elif isinstance(impl, PasswordParamCodeObjImpl):
        return PasswordParamCodeObjImplModifier(type=impl.type)
    elif isinstance(impl, NestedParamCodeObjImpl):
        return NestedParamCodeObjImplModifier(type=impl.type)
    else:
        raise ValueError(f"Unknown impl type: {type(impl).__name__}")
