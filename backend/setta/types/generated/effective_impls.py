# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import overload, Any, TypeVar, Callable, Any
from pydantic import BaseModel

from setta.types.core import Core, Layering
from setta.types.section_impls import (
    CallableSectionImpl, DictSectionImpl, ListRootSectionImpl, DictRootSectionImpl, GroupSectionImpl, ImageSectionImpl, ChartSectionImpl, DrawSectionImpl, TextBlockSectionImpl, SocialSectionImpl, GlobalVariablesSectionImpl, CodeSectionImpl, GenPythonCodeSectionImpl, TerminalSectionImpl, IFrameSectionImpl, ChatSectionImpl, BrowserSectionImpl
)
from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl, CodeParamCodeObjImpl, TextParamCodeObjImpl, SliderParamCodeObjImpl, SwitchParamCodeObjImpl, ColorPickerParamCodeObjImpl, DropdownParamCodeObjImpl, PasswordParamCodeObjImpl, NestedParamCodeObjImpl
)
from setta.types.generated.unions import (
    BaseCanvasSectionImplUnion, BaseCodeSectionImplUnion, BaseDictSectionImplUnion, BaseParentCodeObjImplUnion, BaseArtifactSectionImplUnion, BaseParentSectionImplUnion, BaseSectionWithParamsImplUnion, BaseChildlessCodeObjImplUnion, BaseParamCodeObjImplUnion, BaseCodeObjImplUnion, BaseSectionImplUnion
)
from setta.types.generated.impl_args_as_typed_dicts import (
    CallableSectionImplArgs, CallableSectionImplArgsWithCallable, DictSectionImplArgs, DictSectionImplArgsWithCallable, ListRootSectionImplArgs, ListRootSectionImplArgsWithCallable, DictRootSectionImplArgs, DictRootSectionImplArgsWithCallable, GroupSectionImplArgs, GroupSectionImplArgsWithCallable, ImageSectionImplArgs, ImageSectionImplArgsWithCallable, ChartSectionImplArgs, ChartSectionImplArgsWithCallable, DrawSectionImplArgs, DrawSectionImplArgsWithCallable, TextBlockSectionImplArgs, TextBlockSectionImplArgsWithCallable, SocialSectionImplArgs, SocialSectionImplArgsWithCallable, GlobalVariablesSectionImplArgs, GlobalVariablesSectionImplArgsWithCallable, CodeSectionImplArgs, CodeSectionImplArgsWithCallable, GenPythonCodeSectionImplArgs, GenPythonCodeSectionImplArgsWithCallable, TerminalSectionImplArgs, TerminalSectionImplArgsWithCallable, IFrameSectionImplArgs, IFrameSectionImplArgsWithCallable, ChatSectionImplArgs, ChatSectionImplArgsWithCallable, BrowserSectionImplArgs, BrowserSectionImplArgsWithCallable, CodeCallableCodeObjImplArgs, CodeCallableCodeObjImplArgsWithCallable, CodeParamCodeObjImplArgs, CodeParamCodeObjImplArgsWithCallable, TextParamCodeObjImplArgs, TextParamCodeObjImplArgsWithCallable, SliderParamCodeObjImplArgs, SliderParamCodeObjImplArgsWithCallable, SwitchParamCodeObjImplArgs, SwitchParamCodeObjImplArgsWithCallable, ColorPickerParamCodeObjImplArgs, ColorPickerParamCodeObjImplArgsWithCallable, DropdownParamCodeObjImplArgs, DropdownParamCodeObjImplArgsWithCallable, PasswordParamCodeObjImplArgs, PasswordParamCodeObjImplArgsWithCallable, NestedParamCodeObjImplArgs, NestedParamCodeObjImplArgsWithCallable, BaseCanvasSectionImplArgs, BaseCanvasSectionImplArgsWithCallable, BaseCodeSectionImplArgs, BaseCodeSectionImplArgsWithCallable, BaseDictSectionImplArgs, BaseDictSectionImplArgsWithCallable, BaseParentCodeObjImplArgs, BaseParentCodeObjImplArgsWithCallable, BaseArtifactSectionImplArgs, BaseArtifactSectionImplArgsWithCallable, BaseParentSectionImplArgs, BaseParentSectionImplArgsWithCallable, BaseSectionWithParamsImplArgs, BaseSectionWithParamsImplArgsWithCallable, BaseChildlessCodeObjImplArgs, BaseChildlessCodeObjImplArgsWithCallable, BaseParamCodeObjImplArgs, BaseParamCodeObjImplArgsWithCallable, BaseCodeObjImplArgs, BaseCodeObjImplArgsWithCallable, BaseSectionImplArgs, BaseSectionImplArgsWithCallable
)


T = TypeVar("T", bound=BaseModel)


def get_effective_impl(
    impl: T,
    core: Core,
    layering: Layering,
) -> T:
    return impl.model_copy(
        update={**core.sharedModifier, **layering.modifier}, deep=True
    )


@overload
def set_effective_impl_value(
    impl: CallableSectionImpl,
    core: Core,
    layering: Layering,
    args: CallableSectionImplArgsWithCallable
) -> CallableSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictSectionImpl,
    core: Core,
    layering: Layering,
    args: DictSectionImplArgsWithCallable
) -> DictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ListRootSectionImpl,
    core: Core,
    layering: Layering,
    args: ListRootSectionImplArgsWithCallable
) -> ListRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictRootSectionImpl,
    core: Core,
    layering: Layering,
    args: DictRootSectionImplArgsWithCallable
) -> DictRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GroupSectionImpl,
    core: Core,
    layering: Layering,
    args: GroupSectionImplArgsWithCallable
) -> GroupSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ImageSectionImpl,
    core: Core,
    layering: Layering,
    args: ImageSectionImplArgsWithCallable
) -> ImageSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChartSectionImpl,
    core: Core,
    layering: Layering,
    args: ChartSectionImplArgsWithCallable
) -> ChartSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DrawSectionImpl,
    core: Core,
    layering: Layering,
    args: DrawSectionImplArgsWithCallable
) -> DrawSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TextBlockSectionImpl,
    core: Core,
    layering: Layering,
    args: TextBlockSectionImplArgsWithCallable
) -> TextBlockSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: SocialSectionImpl,
    core: Core,
    layering: Layering,
    args: SocialSectionImplArgsWithCallable
) -> SocialSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GlobalVariablesSectionImpl,
    core: Core,
    layering: Layering,
    args: GlobalVariablesSectionImplArgsWithCallable
) -> GlobalVariablesSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeSectionImpl,
    core: Core,
    layering: Layering,
    args: CodeSectionImplArgsWithCallable
) -> CodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GenPythonCodeSectionImpl,
    core: Core,
    layering: Layering,
    args: GenPythonCodeSectionImplArgsWithCallable
) -> GenPythonCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TerminalSectionImpl,
    core: Core,
    layering: Layering,
    args: TerminalSectionImplArgsWithCallable
) -> TerminalSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: IFrameSectionImpl,
    core: Core,
    layering: Layering,
    args: IFrameSectionImplArgsWithCallable
) -> IFrameSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChatSectionImpl,
    core: Core,
    layering: Layering,
    args: ChatSectionImplArgsWithCallable
) -> ChatSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BrowserSectionImpl,
    core: Core,
    layering: Layering,
    args: BrowserSectionImplArgsWithCallable
) -> BrowserSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeCallableCodeObjImpl,
    core: Core,
    layering: Layering,
    args: CodeCallableCodeObjImplArgsWithCallable
) -> CodeCallableCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: CodeParamCodeObjImplArgsWithCallable
) -> CodeParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: TextParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: TextParamCodeObjImplArgsWithCallable
) -> TextParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SliderParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: SliderParamCodeObjImplArgsWithCallable
) -> SliderParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SwitchParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: SwitchParamCodeObjImplArgsWithCallable
) -> SwitchParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: ColorPickerParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: ColorPickerParamCodeObjImplArgsWithCallable
) -> ColorPickerParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: DropdownParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: DropdownParamCodeObjImplArgsWithCallable
) -> DropdownParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: PasswordParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: PasswordParamCodeObjImplArgsWithCallable
) -> PasswordParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: NestedParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: NestedParamCodeObjImplArgsWithCallable
) -> NestedParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCanvasSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseCanvasSectionImplArgsWithCallable
) -> BaseCanvasSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseCodeSectionImplArgsWithCallable
) -> BaseCodeSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseDictSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseDictSectionImplArgsWithCallable
) -> BaseDictSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: BaseParentCodeObjImplArgsWithCallable
) -> BaseParentCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseArtifactSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseArtifactSectionImplArgsWithCallable
) -> BaseArtifactSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseParentSectionImplArgsWithCallable
) -> BaseParentSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionWithParamsImplUnion,
    core: Core,
    layering: Layering,
    args: BaseSectionWithParamsImplArgsWithCallable
) -> BaseSectionWithParamsImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseChildlessCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: BaseChildlessCodeObjImplArgsWithCallable
) -> BaseChildlessCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParamCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: BaseParamCodeObjImplArgsWithCallable
) -> BaseParamCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: BaseCodeObjImplArgsWithCallable
) -> BaseCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseSectionImplArgsWithCallable
) -> BaseSectionImplUnion: ...
def set_effective_impl_value(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: Core,
    layering: Layering,
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
            current = layering.modifier.get(k)
            layering.modifier[k] = v(current) if callable(v) else v
        else:
            current = core.sharedModifier.get(k)
            core.sharedModifier[k] = v(current) if callable(v) else v
    return get_effective_impl(impl, core, layering)
