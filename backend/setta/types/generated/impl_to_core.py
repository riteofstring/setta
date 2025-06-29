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
from setta.types.generated.code_obj_type_unions import (
    BaseCodeObjImplUnion,
)
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
from setta.types.generated.section_type_unions import (
    BaseSectionImplUnion,
)
from setta.types.section_core import BaseSectionCore
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
def create_core_for_impl(impl: CallableSectionImpl) -> CallableSectionCore: ...
@overload
def create_core_for_impl(impl: DictSectionImpl) -> DictSectionCore: ...
@overload
def create_core_for_impl(impl: ListRootSectionImpl) -> ListRootSectionCore: ...
@overload
def create_core_for_impl(impl: DictRootSectionImpl) -> DictRootSectionCore: ...
@overload
def create_core_for_impl(impl: GroupSectionImpl) -> GroupSectionCore: ...
@overload
def create_core_for_impl(impl: ImageSectionImpl) -> ImageSectionCore: ...
@overload
def create_core_for_impl(impl: ChartSectionImpl) -> ChartSectionCore: ...
@overload
def create_core_for_impl(impl: DrawSectionImpl) -> DrawSectionCore: ...
@overload
def create_core_for_impl(impl: TextBlockSectionImpl) -> TextBlockSectionCore: ...
@overload
def create_core_for_impl(impl: SocialSectionImpl) -> SocialSectionCore: ...
@overload
def create_core_for_impl(
    impl: GlobalVariablesSectionImpl,
) -> GlobalVariablesSectionCore: ...
@overload
def create_core_for_impl(impl: CodeSectionImpl) -> CodeSectionCore: ...
@overload
def create_core_for_impl(
    impl: GenPythonCodeSectionImpl,
) -> GenPythonCodeSectionCore: ...
@overload
def create_core_for_impl(impl: TerminalSectionImpl) -> TerminalSectionCore: ...
@overload
def create_core_for_impl(impl: IFrameSectionImpl) -> IFrameSectionCore: ...
@overload
def create_core_for_impl(impl: ChatSectionImpl) -> ChatSectionCore: ...
@overload
def create_core_for_impl(impl: BrowserSectionImpl) -> BrowserSectionCore: ...
@overload
def create_core_for_impl(impl: CodeCallableCodeObjImpl) -> CodeCallableCodeObjCore: ...
@overload
def create_core_for_impl(impl: CodeParamCodeObjImpl) -> CodeParamCodeObjCore: ...
@overload
def create_core_for_impl(impl: TextParamCodeObjImpl) -> TextParamCodeObjCore: ...
@overload
def create_core_for_impl(impl: SliderParamCodeObjImpl) -> SliderParamCodeObjCore: ...
@overload
def create_core_for_impl(impl: SwitchParamCodeObjImpl) -> SwitchParamCodeObjCore: ...
@overload
def create_core_for_impl(
    impl: ColorPickerParamCodeObjImpl,
) -> ColorPickerParamCodeObjCore: ...
@overload
def create_core_for_impl(
    impl: DropdownParamCodeObjImpl,
) -> DropdownParamCodeObjCore: ...
@overload
def create_core_for_impl(
    impl: PasswordParamCodeObjImpl,
) -> PasswordParamCodeObjCore: ...
@overload
def create_core_for_impl(impl: NestedParamCodeObjImpl) -> NestedParamCodeObjCore: ...
@overload
def create_core_for_impl(
    impl: Union[BaseSectionImplUnion, BaseCodeObjImplUnion],
) -> Union[BaseSectionCore, CodeObjCore]: ...


def create_core_for_impl(
    impl: Union[BaseSectionImplUnion, BaseCodeObjImplUnion],
) -> Union[BaseSectionCore, CodeObjCore]:
    """Convert an Impl instance to its corresponding Core object."""
    if isinstance(impl, CallableSectionImpl):
        return CallableSectionCore()
    elif isinstance(impl, DictSectionImpl):
        return DictSectionCore()
    elif isinstance(impl, ListRootSectionImpl):
        return ListRootSectionCore()
    elif isinstance(impl, DictRootSectionImpl):
        return DictRootSectionCore()
    elif isinstance(impl, GroupSectionImpl):
        return GroupSectionCore()
    elif isinstance(impl, ImageSectionImpl):
        return ImageSectionCore()
    elif isinstance(impl, ChartSectionImpl):
        return ChartSectionCore()
    elif isinstance(impl, DrawSectionImpl):
        return DrawSectionCore()
    elif isinstance(impl, TextBlockSectionImpl):
        return TextBlockSectionCore()
    elif isinstance(impl, SocialSectionImpl):
        return SocialSectionCore()
    elif isinstance(impl, GlobalVariablesSectionImpl):
        return GlobalVariablesSectionCore()
    elif isinstance(impl, CodeSectionImpl):
        return CodeSectionCore()
    elif isinstance(impl, GenPythonCodeSectionImpl):
        return GenPythonCodeSectionCore()
    elif isinstance(impl, TerminalSectionImpl):
        return TerminalSectionCore()
    elif isinstance(impl, IFrameSectionImpl):
        return IFrameSectionCore()
    elif isinstance(impl, ChatSectionImpl):
        return ChatSectionCore()
    elif isinstance(impl, BrowserSectionImpl):
        return BrowserSectionCore()
    elif isinstance(impl, CodeCallableCodeObjImpl):
        return CodeCallableCodeObjCore()
    elif isinstance(impl, CodeParamCodeObjImpl):
        return CodeParamCodeObjCore()
    elif isinstance(impl, TextParamCodeObjImpl):
        return TextParamCodeObjCore()
    elif isinstance(impl, SliderParamCodeObjImpl):
        return SliderParamCodeObjCore()
    elif isinstance(impl, SwitchParamCodeObjImpl):
        return SwitchParamCodeObjCore()
    elif isinstance(impl, ColorPickerParamCodeObjImpl):
        return ColorPickerParamCodeObjCore()
    elif isinstance(impl, DropdownParamCodeObjImpl):
        return DropdownParamCodeObjCore()
    elif isinstance(impl, PasswordParamCodeObjImpl):
        return PasswordParamCodeObjCore()
    elif isinstance(impl, NestedParamCodeObjImpl):
        return NestedParamCodeObjCore()
    else:
        raise ValueError(f"Unknown impl type: {type(impl).__name__}")
