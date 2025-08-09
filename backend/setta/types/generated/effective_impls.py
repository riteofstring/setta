# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Callable, TypeVar, overload

from pydantic import BaseModel

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
from setta.types.core import Core, Variant
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseArtifactSectionImplArgsWithCallable,
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
    CallableSectionImplArgsWithCallable,
    ChartSectionImplArgsWithCallable,
    ChatSectionImplArgsWithCallable,
    CodeCallableCodeObjImplArgsWithCallable,
    CodeParamCodeObjImplArgsWithCallable,
    CodeSectionImplArgsWithCallable,
    ColorPickerParamCodeObjImplArgsWithCallable,
    DictRootSectionImplArgsWithCallable,
    DictSectionImplArgsWithCallable,
    DrawSectionImplArgsWithCallable,
    DropdownParamCodeObjImplArgsWithCallable,
    GenPythonCodeSectionImplArgsWithCallable,
    GlobalVariablesSectionImplArgsWithCallable,
    GroupSectionImplArgsWithCallable,
    IFrameSectionImplArgsWithCallable,
    ImageSectionImplArgsWithCallable,
    ListRootSectionImplArgsWithCallable,
    NestedParamCodeObjImplArgsWithCallable,
    PasswordParamCodeObjImplArgsWithCallable,
    SliderParamCodeObjImplArgsWithCallable,
    SocialSectionImplArgsWithCallable,
    SwitchParamCodeObjImplArgsWithCallable,
    TerminalSectionImplArgsWithCallable,
    TextBlockSectionImplArgsWithCallable,
    TextParamCodeObjImplArgsWithCallable,
)
from setta.types.generated.unions import (
    BaseArtifactSectionImplUnion,
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
    impl: DictRootSectionImpl,
    core: Core,
    variant: Variant,
    args: DictRootSectionImplArgsWithCallable,
) -> DictRootSectionImpl: ...
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
    impl: SliderParamCodeObjImpl,
    core: Core,
    variant: Variant,
    args: SliderParamCodeObjImplArgsWithCallable,
) -> SliderParamCodeObjImpl: ...
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
    impl: BaseCodeSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseCodeSectionImplArgsWithCallable,
) -> BaseCodeSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseDictSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseDictSectionImplArgsWithCallable,
) -> BaseDictSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: BaseParentCodeObjImplArgsWithCallable,
) -> BaseParentCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseArtifactSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseArtifactSectionImplArgsWithCallable,
) -> BaseArtifactSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseParentSectionImplArgsWithCallable,
) -> BaseParentSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionWithParamsImplUnion,
    core: Core,
    variant: Variant,
    args: BaseSectionWithParamsImplArgsWithCallable,
) -> BaseSectionWithParamsImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseChildlessCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: BaseChildlessCodeObjImplArgsWithCallable,
) -> BaseChildlessCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParamCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: BaseParamCodeObjImplArgsWithCallable,
) -> BaseParamCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: BaseCodeObjImplArgsWithCallable,
) -> BaseCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionImplUnion,
    core: Core,
    variant: Variant,
    args: BaseSectionImplArgsWithCallable,
) -> BaseSectionImplUnion: ...
def set_effective_impl_value(
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
    for k, v in args.items():
        if not impl.isPreset:
            current = getattr(impl, k, None)
            setattr(impl, k, v(current) if callable(v) else v)
        elif k in core.unsharedKeys:
            current = variant.modifier.get(k)
            variant.modifier[k] = v(current) if callable(v) else v
        else:
            current = core.sharedModifier.get(k)
            core.sharedModifier[k] = v(current) if callable(v) else v
    return get_effective_impl(impl, core, variant)
