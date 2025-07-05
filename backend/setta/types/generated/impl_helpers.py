# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, TypeVar, overload

from setta.types.generated.code_obj_core_unions import (
    BaseCodeObjCoreUnion,
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
from setta.types.generated.impl_field_literals import (
    BrowserSectionImplFields,
    CallableSectionImplFields,
    ChartSectionImplFields,
    ChatSectionImplFields,
    CodeCallableCodeObjImplFields,
    CodeParamCodeObjImplFields,
    CodeSectionImplFields,
    ColorPickerParamCodeObjImplFields,
    DictRootSectionImplFields,
    DictSectionImplFields,
    DrawSectionImplFields,
    DropdownParamCodeObjImplFields,
    GenPythonCodeSectionImplFields,
    GlobalVariablesSectionImplFields,
    GroupSectionImplFields,
    IFrameSectionImplFields,
    ImageSectionImplFields,
    ListRootSectionImplFields,
    NestedParamCodeObjImplFields,
    PasswordParamCodeObjImplFields,
    SliderParamCodeObjImplFields,
    SocialSectionImplFields,
    SwitchParamCodeObjImplFields,
    TerminalSectionImplFields,
    TextBlockSectionImplFields,
    TextParamCodeObjImplFields,
)
from setta.types.generated.impl_modifier_unions import (
    AllImplModifierUnion,
    BaseCodeObjImplModifierUnion,
    BaseSectionImplModifierUnion,
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
from setta.types.generated.section_core_unions import (
    BaseSectionCoreUnion,
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

TImpl = TypeVar("TImpl", bound=BaseCodeObjImplUnion | BaseSectionImplUnion)


def apply_modifier(
    impl: TImpl, shared_modifier: AllImplModifierUnion, modifier: AllImplModifierUnion
) -> TImpl:
    return impl.model_copy(update={**shared_modifier, **modifier}, deep=True)


# ============== get_effective_impl overloads ==============


@overload
def get_effective_impl(
    impl: CallableSectionImpl,
    core: CallableSectionCore,
    modifier: CallableSectionImplModifier,
) -> CallableSectionImpl: ...
@overload
def get_effective_impl(
    impl: DictSectionImpl,
    core: DictSectionCore,
    modifier: DictSectionImplModifier,
) -> DictSectionImpl: ...
@overload
def get_effective_impl(
    impl: ListRootSectionImpl,
    core: ListRootSectionCore,
    modifier: ListRootSectionImplModifier,
) -> ListRootSectionImpl: ...
@overload
def get_effective_impl(
    impl: DictRootSectionImpl,
    core: DictRootSectionCore,
    modifier: DictRootSectionImplModifier,
) -> DictRootSectionImpl: ...
@overload
def get_effective_impl(
    impl: GroupSectionImpl,
    core: GroupSectionCore,
    modifier: GroupSectionImplModifier,
) -> GroupSectionImpl: ...
@overload
def get_effective_impl(
    impl: ImageSectionImpl,
    core: ImageSectionCore,
    modifier: ImageSectionImplModifier,
) -> ImageSectionImpl: ...
@overload
def get_effective_impl(
    impl: ChartSectionImpl,
    core: ChartSectionCore,
    modifier: ChartSectionImplModifier,
) -> ChartSectionImpl: ...
@overload
def get_effective_impl(
    impl: DrawSectionImpl,
    core: DrawSectionCore,
    modifier: DrawSectionImplModifier,
) -> DrawSectionImpl: ...
@overload
def get_effective_impl(
    impl: TextBlockSectionImpl,
    core: TextBlockSectionCore,
    modifier: TextBlockSectionImplModifier,
) -> TextBlockSectionImpl: ...
@overload
def get_effective_impl(
    impl: SocialSectionImpl,
    core: SocialSectionCore,
    modifier: SocialSectionImplModifier,
) -> SocialSectionImpl: ...
@overload
def get_effective_impl(
    impl: GlobalVariablesSectionImpl,
    core: GlobalVariablesSectionCore,
    modifier: GlobalVariablesSectionImplModifier,
) -> GlobalVariablesSectionImpl: ...
@overload
def get_effective_impl(
    impl: CodeSectionImpl,
    core: CodeSectionCore,
    modifier: CodeSectionImplModifier,
) -> CodeSectionImpl: ...
@overload
def get_effective_impl(
    impl: GenPythonCodeSectionImpl,
    core: GenPythonCodeSectionCore,
    modifier: GenPythonCodeSectionImplModifier,
) -> GenPythonCodeSectionImpl: ...
@overload
def get_effective_impl(
    impl: TerminalSectionImpl,
    core: TerminalSectionCore,
    modifier: TerminalSectionImplModifier,
) -> TerminalSectionImpl: ...
@overload
def get_effective_impl(
    impl: IFrameSectionImpl,
    core: IFrameSectionCore,
    modifier: IFrameSectionImplModifier,
) -> IFrameSectionImpl: ...
@overload
def get_effective_impl(
    impl: ChatSectionImpl,
    core: ChatSectionCore,
    modifier: ChatSectionImplModifier,
) -> ChatSectionImpl: ...
@overload
def get_effective_impl(
    impl: BrowserSectionImpl,
    core: BrowserSectionCore,
    modifier: BrowserSectionImplModifier,
) -> BrowserSectionImpl: ...
@overload
def get_effective_impl(
    impl: CodeCallableCodeObjImpl,
    core: CodeCallableCodeObjCore,
    modifier: CodeCallableCodeObjImplModifier,
) -> CodeCallableCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: CodeParamCodeObjImpl,
    core: CodeParamCodeObjCore,
    modifier: CodeParamCodeObjImplModifier,
) -> CodeParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: TextParamCodeObjImpl,
    core: TextParamCodeObjCore,
    modifier: TextParamCodeObjImplModifier,
) -> TextParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: SliderParamCodeObjImpl,
    core: SliderParamCodeObjCore,
    modifier: SliderParamCodeObjImplModifier,
) -> SliderParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: SwitchParamCodeObjImpl,
    core: SwitchParamCodeObjCore,
    modifier: SwitchParamCodeObjImplModifier,
) -> SwitchParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: ColorPickerParamCodeObjImpl,
    core: ColorPickerParamCodeObjCore,
    modifier: ColorPickerParamCodeObjImplModifier,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: DropdownParamCodeObjImpl,
    core: DropdownParamCodeObjCore,
    modifier: DropdownParamCodeObjImplModifier,
) -> DropdownParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: PasswordParamCodeObjImpl,
    core: PasswordParamCodeObjCore,
    modifier: PasswordParamCodeObjImplModifier,
) -> PasswordParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: NestedParamCodeObjImpl,
    core: NestedParamCodeObjCore,
    modifier: NestedParamCodeObjImplModifier,
) -> NestedParamCodeObjImpl: ...


# Base overloads for union types
@overload
def get_effective_impl(
    impl: BaseSectionImplUnion,
    core: BaseSectionCoreUnion,
    modifier: BaseSectionImplModifierUnion,
) -> BaseSectionImplUnion: ...


@overload
def get_effective_impl(
    impl: BaseCodeObjImplUnion,
    core: BaseCodeObjCoreUnion,
    modifier: BaseCodeObjImplModifierUnion,
) -> BaseCodeObjImplUnion: ...


def get_effective_impl(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    modifier: AllImplModifierUnion,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    """Get the effective implementation by applying modifiers.

    The overloaded signatures above provide type-safe usage for each specific
    impl/core/modifier combination.
    """
    return apply_modifier(impl, core.sharedModifier, modifier)


# ============== set_effective_impl_value overloads ==============


@overload
def set_effective_impl_value(
    impl: CallableSectionImpl,
    core: CallableSectionCore,
    modifier: CallableSectionImplModifier,
    key: CallableSectionImplFields,
    value: Any,
) -> CallableSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictSectionImpl,
    core: DictSectionCore,
    modifier: DictSectionImplModifier,
    key: DictSectionImplFields,
    value: Any,
) -> DictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ListRootSectionImpl,
    core: ListRootSectionCore,
    modifier: ListRootSectionImplModifier,
    key: ListRootSectionImplFields,
    value: Any,
) -> ListRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictRootSectionImpl,
    core: DictRootSectionCore,
    modifier: DictRootSectionImplModifier,
    key: DictRootSectionImplFields,
    value: Any,
) -> DictRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GroupSectionImpl,
    core: GroupSectionCore,
    modifier: GroupSectionImplModifier,
    key: GroupSectionImplFields,
    value: Any,
) -> GroupSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ImageSectionImpl,
    core: ImageSectionCore,
    modifier: ImageSectionImplModifier,
    key: ImageSectionImplFields,
    value: Any,
) -> ImageSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChartSectionImpl,
    core: ChartSectionCore,
    modifier: ChartSectionImplModifier,
    key: ChartSectionImplFields,
    value: Any,
) -> ChartSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DrawSectionImpl,
    core: DrawSectionCore,
    modifier: DrawSectionImplModifier,
    key: DrawSectionImplFields,
    value: Any,
) -> DrawSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TextBlockSectionImpl,
    core: TextBlockSectionCore,
    modifier: TextBlockSectionImplModifier,
    key: TextBlockSectionImplFields,
    value: Any,
) -> TextBlockSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: SocialSectionImpl,
    core: SocialSectionCore,
    modifier: SocialSectionImplModifier,
    key: SocialSectionImplFields,
    value: Any,
) -> SocialSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GlobalVariablesSectionImpl,
    core: GlobalVariablesSectionCore,
    modifier: GlobalVariablesSectionImplModifier,
    key: GlobalVariablesSectionImplFields,
    value: Any,
) -> GlobalVariablesSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeSectionImpl,
    core: CodeSectionCore,
    modifier: CodeSectionImplModifier,
    key: CodeSectionImplFields,
    value: Any,
) -> CodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GenPythonCodeSectionImpl,
    core: GenPythonCodeSectionCore,
    modifier: GenPythonCodeSectionImplModifier,
    key: GenPythonCodeSectionImplFields,
    value: Any,
) -> GenPythonCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TerminalSectionImpl,
    core: TerminalSectionCore,
    modifier: TerminalSectionImplModifier,
    key: TerminalSectionImplFields,
    value: Any,
) -> TerminalSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: IFrameSectionImpl,
    core: IFrameSectionCore,
    modifier: IFrameSectionImplModifier,
    key: IFrameSectionImplFields,
    value: Any,
) -> IFrameSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChatSectionImpl,
    core: ChatSectionCore,
    modifier: ChatSectionImplModifier,
    key: ChatSectionImplFields,
    value: Any,
) -> ChatSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BrowserSectionImpl,
    core: BrowserSectionCore,
    modifier: BrowserSectionImplModifier,
    key: BrowserSectionImplFields,
    value: Any,
) -> BrowserSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeCallableCodeObjImpl,
    core: CodeCallableCodeObjCore,
    modifier: CodeCallableCodeObjImplModifier,
    key: CodeCallableCodeObjImplFields,
    value: Any,
) -> CodeCallableCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeParamCodeObjImpl,
    core: CodeParamCodeObjCore,
    modifier: CodeParamCodeObjImplModifier,
    key: CodeParamCodeObjImplFields,
    value: Any,
) -> CodeParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: TextParamCodeObjImpl,
    core: TextParamCodeObjCore,
    modifier: TextParamCodeObjImplModifier,
    key: TextParamCodeObjImplFields,
    value: Any,
) -> TextParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SliderParamCodeObjImpl,
    core: SliderParamCodeObjCore,
    modifier: SliderParamCodeObjImplModifier,
    key: SliderParamCodeObjImplFields,
    value: Any,
) -> SliderParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SwitchParamCodeObjImpl,
    core: SwitchParamCodeObjCore,
    modifier: SwitchParamCodeObjImplModifier,
    key: SwitchParamCodeObjImplFields,
    value: Any,
) -> SwitchParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: ColorPickerParamCodeObjImpl,
    core: ColorPickerParamCodeObjCore,
    modifier: ColorPickerParamCodeObjImplModifier,
    key: ColorPickerParamCodeObjImplFields,
    value: Any,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: DropdownParamCodeObjImpl,
    core: DropdownParamCodeObjCore,
    modifier: DropdownParamCodeObjImplModifier,
    key: DropdownParamCodeObjImplFields,
    value: Any,
) -> DropdownParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: PasswordParamCodeObjImpl,
    core: PasswordParamCodeObjCore,
    modifier: PasswordParamCodeObjImplModifier,
    key: PasswordParamCodeObjImplFields,
    value: Any,
) -> PasswordParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: NestedParamCodeObjImpl,
    core: NestedParamCodeObjCore,
    modifier: NestedParamCodeObjImplModifier,
    key: NestedParamCodeObjImplFields,
    value: Any,
) -> NestedParamCodeObjImpl: ...


# Base overloads for union types
@overload
def set_effective_impl_value(
    impl: BaseSectionImplUnion,
    core: BaseSectionCoreUnion,
    modifier: BaseSectionImplModifierUnion,
    key: str,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl: BaseCodeObjImplUnion,
    core: BaseCodeObjCoreUnion,
    modifier: BaseCodeObjImplModifierUnion,
    key: str,
    value: Any,
) -> BaseCodeObjImplUnion: ...


def set_effective_impl_value(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    modifier: AllImplModifierUnion,
    key: str,
    value: Any,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    """Set a value in the effective implementation.

    The value is set in the appropriate location based on:
    - If impl is not a preset: directly on the impl
    - If key is in unsharedKeys: in the modifier
    - Otherwise: in the core's sharedModifier

    The overloaded signatures above provide type-safe field names for each
    specific impl type.
    """
    if not impl.isPreset:
        setattr(impl, key, value)
    elif key in core.unsharedKeys:
        modifier[key] = value
    else:
        core.sharedModifier[key] = value
    return get_effective_impl(impl, core, modifier)
