# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Callable, TypeVar, overload

from pydantic import BaseModel

from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseCodeObjImpl,
    BaseParamCodeObjImpl,
    BaseParentCodeObjImpl,
    ButtonParamCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    DropzoneParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    RotaryParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextAreaParamCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.core import Core, Variant
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseCanvasSectionImplArgsWithCallable,
    BaseChildlessCodeObjImplArgsWithCallable,
    BaseCodeObjImplArgsWithCallable,
    BaseCodeSectionImplArgsWithCallable,
    BaseDictSectionImplArgsWithCallable,
    BaseParamCodeObjImplArgsWithCallable,
    BaseParentCodeObjImplArgsWithCallable,
    BaseParentSectionImplArgsWithCallable,
    BaseSectionImplArgsWithCallable,
    BaseSectionWithParamsImplArgsWithCallable,
    BrowserSectionImplArgsWithCallable,
    ButtonParamCodeObjImplArgsWithCallable,
    CallableSectionImplArgsWithCallable,
    ChartSectionImplArgsWithCallable,
    ChatSectionImplArgsWithCallable,
    CodeCallableCodeObjImplArgsWithCallable,
    CodeParamCodeObjImplArgsWithCallable,
    CodeSectionImplArgsWithCallable,
    ColorPickerParamCodeObjImplArgsWithCallable,
    DictSectionImplArgsWithCallable,
    DrawSectionImplArgsWithCallable,
    DropdownParamCodeObjImplArgsWithCallable,
    DropzoneParamCodeObjImplArgsWithCallable,
    GenPythonCodeSectionImplArgsWithCallable,
    GenPythonMetadataSectionImplArgsWithCallable,
    GlobalVariablesSectionImplArgsWithCallable,
    GroupSectionImplArgsWithCallable,
    IFrameSectionImplArgsWithCallable,
    ImageSectionImplArgsWithCallable,
    ListRootSectionImplArgsWithCallable,
    MetaControlSectionImplArgsWithCallable,
    NestedParamCodeObjImplArgsWithCallable,
    PasswordParamCodeObjImplArgsWithCallable,
    PluginSectionImplArgsWithCallable,
    PromptSectionImplArgsWithCallable,
    RotaryParamCodeObjImplArgsWithCallable,
    SliderParamCodeObjImplArgsWithCallable,
    SocialSectionImplArgsWithCallable,
    SwitchParamCodeObjImplArgsWithCallable,
    TerminalSectionImplArgsWithCallable,
    TextAreaParamCodeObjImplArgsWithCallable,
    TextBlockSectionImplArgsWithCallable,
    TextParamCodeObjImplArgsWithCallable,
)
from setta.types.generated.unions import (
    BaseCanvasSectionImplUnion,
    BaseChildlessCodeObjImplUnion,
    BaseCodeObjImplUnion,
    BaseCodeSectionImplUnion,
    BaseDictSectionImplUnion,
    BaseParamCodeObjImplUnion,
    BaseParentCodeObjImplUnion,
    BaseParentSectionImplUnion,
    BaseSectionImplUnion,
    BaseSectionWithParamsImplUnion,
)
from setta.types.section_impls import (
    BaseCanvasSectionImpl,
    BaseCodeSectionImpl,
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionImpl,
    BaseSectionWithParamsImpl,
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
    SocialSectionImpl,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)

T = TypeVar("T", bound=BaseModel)


def get_effective_impl(
    impl: T,
    core: Core,
    variant: Variant,
) -> T:
    return impl.model_copy(
        update={**core.sharedModifier, **variant.modifier}, deep=True
    )


@overload
def set_effective_impl_value(
    impl: CallableSectionImpl,
    core: Core,
    variant: Variant,
    args: CallableSectionImplArgsWithCallable,
) -> CallableSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictSectionImpl,
    core: Core,
    variant: Variant,
    args: DictSectionImplArgsWithCallable,
) -> DictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ListRootSectionImpl,
    core: Core,
    variant: Variant,
    args: ListRootSectionImplArgsWithCallable,
) -> ListRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GroupSectionImpl,
    core: Core,
    variant: Variant,
    args: GroupSectionImplArgsWithCallable,
) -> GroupSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ImageSectionImpl,
    core: Core,
    variant: Variant,
    args: ImageSectionImplArgsWithCallable,
) -> ImageSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChartSectionImpl,
    core: Core,
    variant: Variant,
    args: ChartSectionImplArgsWithCallable,
) -> ChartSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DrawSectionImpl,
    core: Core,
    variant: Variant,
    args: DrawSectionImplArgsWithCallable,
) -> DrawSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TextBlockSectionImpl,
    core: Core,
    variant: Variant,
    args: TextBlockSectionImplArgsWithCallable,
) -> TextBlockSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: PromptSectionImpl,
    core: Core,
    variant: Variant,
    args: PromptSectionImplArgsWithCallable,
) -> PromptSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: MetaControlSectionImpl,
    core: Core,
    variant: Variant,
    args: MetaControlSectionImplArgsWithCallable,
) -> MetaControlSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: SocialSectionImpl,
    core: Core,
    variant: Variant,
    args: SocialSectionImplArgsWithCallable,
) -> SocialSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GlobalVariablesSectionImpl,
    core: Core,
    variant: Variant,
    args: GlobalVariablesSectionImplArgsWithCallable,
) -> GlobalVariablesSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeSectionImpl,
    core: Core,
    variant: Variant,
    args: CodeSectionImplArgsWithCallable,
) -> CodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GenPythonCodeSectionImpl,
    core: Core,
    variant: Variant,
    args: GenPythonCodeSectionImplArgsWithCallable,
) -> GenPythonCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GenPythonMetadataSectionImpl,
    core: Core,
    variant: Variant,
    args: GenPythonMetadataSectionImplArgsWithCallable,
) -> GenPythonMetadataSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TerminalSectionImpl,
    core: Core,
    variant: Variant,
    args: TerminalSectionImplArgsWithCallable,
) -> TerminalSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: IFrameSectionImpl,
    core: Core,
    variant: Variant,
    args: IFrameSectionImplArgsWithCallable,
) -> IFrameSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChatSectionImpl,
    core: Core,
    variant: Variant,
    args: ChatSectionImplArgsWithCallable,
) -> ChatSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BrowserSectionImpl,
    core: Core,
    variant: Variant,
    args: BrowserSectionImplArgsWithCallable,
) -> BrowserSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: PluginSectionImpl,
    core: Core,
    variant: Variant,
    args: PluginSectionImplArgsWithCallable,
) -> PluginSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeCallableCodeObjImpl,
    core: Core,
    variant: Variant,
    args: CodeCallableCodeObjImplArgsWithCallable,
) -> CodeCallableCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: CodeParamCodeObjImplArgsWithCallable,
) -> CodeParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: TextParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: TextParamCodeObjImplArgsWithCallable,
) -> TextParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: ButtonParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: ButtonParamCodeObjImplArgsWithCallable,
) -> ButtonParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SliderParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: SliderParamCodeObjImplArgsWithCallable,
) -> SliderParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: RotaryParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: RotaryParamCodeObjImplArgsWithCallable,
) -> RotaryParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SwitchParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: SwitchParamCodeObjImplArgsWithCallable,
) -> SwitchParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: ColorPickerParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: ColorPickerParamCodeObjImplArgsWithCallable,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: DropdownParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: DropdownParamCodeObjImplArgsWithCallable,
) -> DropdownParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: PasswordParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: PasswordParamCodeObjImplArgsWithCallable,
) -> PasswordParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: TextAreaParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: TextAreaParamCodeObjImplArgsWithCallable,
) -> TextAreaParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: DropzoneParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: DropzoneParamCodeObjImplArgsWithCallable,
) -> DropzoneParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: NestedParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: NestedParamCodeObjImplArgsWithCallable,
) -> NestedParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCanvasSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseCanvasSectionImplArgsWithCallable,
) -> BaseCanvasSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCanvasSectionImpl,
    core: Core,
    variant: Variant,
    args: BaseCanvasSectionImplArgsWithCallable,
) -> BaseCanvasSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseDictSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseDictSectionImplArgsWithCallable,
) -> BaseDictSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseDictSectionImpl,
    core: Core,
    variant: Variant,
    args: BaseDictSectionImplArgsWithCallable,
) -> BaseDictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseParentCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: BaseParentCodeObjImplArgsWithCallable,
) -> BaseParentCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentCodeObjImpl,
    core: Core,
    variant: Variant,
    args: BaseParentCodeObjImplArgsWithCallable,
) -> BaseParentCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseCodeSectionImplArgsWithCallable,
) -> BaseCodeSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeSectionImpl,
    core: Core,
    variant: Variant,
    args: BaseCodeSectionImplArgsWithCallable,
) -> BaseCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionWithParamsImplUnion,
    core: Core,
    variant: Variant,
    args: BaseSectionWithParamsImplArgsWithCallable,
) -> BaseSectionWithParamsImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionWithParamsImpl,
    core: Core,
    variant: Variant,
    args: BaseSectionWithParamsImplArgsWithCallable,
) -> BaseSectionWithParamsImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseParentSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseParentSectionImplArgsWithCallable,
) -> BaseParentSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentSectionImpl,
    core: Core,
    variant: Variant,
    args: BaseParentSectionImplArgsWithCallable,
) -> BaseParentSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseChildlessCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: BaseChildlessCodeObjImplArgsWithCallable,
) -> BaseChildlessCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseChildlessCodeObjImpl,
    core: Core,
    variant: Variant,
    args: BaseChildlessCodeObjImplArgsWithCallable,
) -> BaseChildlessCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseParamCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: BaseParamCodeObjImplArgsWithCallable,
) -> BaseParamCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: BaseParamCodeObjImplArgsWithCallable,
) -> BaseParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: BaseCodeObjImplArgsWithCallable,
) -> BaseCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeObjImpl,
    core: Core,
    variant: Variant,
    args: BaseCodeObjImplArgsWithCallable,
) -> BaseCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseSectionImplArgsWithCallable,
) -> BaseSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionImpl,
    core: Core,
    variant: Variant,
    args: BaseSectionImplArgsWithCallable,
) -> BaseSectionImpl: ...
def set_effective_impl_value(  # type: ignore
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: dict[str, Any | Callable[[Any], Any]],
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    """Set a value in the effective implementation.

    The value is set in the appropriate location based on:
    - If impl is not a preset: directly on the impl
    - If key is in unsharedKeys: in the modifier
    - Otherwise: in the core's sharedModifier

    Args is a dict where each value can be either:
    - A direct value to set
    - A callable that takes the current value and returns a new value

    The overloaded signatures above provide type-safe field names for each
    specific impl type.
    """
    curr = get_effective_impl(impl, core, variant)
    for k, v in args.items():
        currV = getattr(curr, k, None)
        if k not in core.unsharedKeys:
            core.sharedModifier[k] = v(currV) if callable(v) else v
        elif not impl.isPreset:
            setattr(impl, k, v(currV) if callable(v) else v)
        else:
            variant.modifier[k] = v(currV) if callable(v) else v
    return get_effective_impl(impl, core, variant)
