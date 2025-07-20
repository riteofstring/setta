# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import TypeVar, overload

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
from setta.types.core import Core, Layering
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseArtifactSectionImplArgs,
    BaseCanvasSectionImplArgs,
    BaseChildlessCodeObjImplArgs,
    BaseCodeObjImplArgs,
    BaseCodeSectionImplArgs,
    BaseDictSectionImplArgs,
    BaseParamCodeObjImplArgs,
    BaseParentCodeObjImplArgs,
    BaseParentSectionImplArgs,
    BaseSectionImplArgs,
    BaseSectionWithParamsImplArgs,
    BrowserSectionImplArgs,
    CallableSectionImplArgs,
    ChartSectionImplArgs,
    ChatSectionImplArgs,
    CodeCallableCodeObjImplArgs,
    CodeParamCodeObjImplArgs,
    CodeSectionImplArgs,
    ColorPickerParamCodeObjImplArgs,
    DictRootSectionImplArgs,
    DictSectionImplArgs,
    DrawSectionImplArgs,
    DropdownParamCodeObjImplArgs,
    GenPythonCodeSectionImplArgs,
    GlobalVariablesSectionImplArgs,
    GroupSectionImplArgs,
    IFrameSectionImplArgs,
    ImageSectionImplArgs,
    ListRootSectionImplArgs,
    NestedParamCodeObjImplArgs,
    PasswordParamCodeObjImplArgs,
    SliderParamCodeObjImplArgs,
    SocialSectionImplArgs,
    SwitchParamCodeObjImplArgs,
    TerminalSectionImplArgs,
    TextBlockSectionImplArgs,
    TextParamCodeObjImplArgs,
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
    args: CallableSectionImplArgs,
) -> CallableSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictSectionImpl, core: Core, layering: Layering, args: DictSectionImplArgs
) -> DictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ListRootSectionImpl,
    core: Core,
    layering: Layering,
    args: ListRootSectionImplArgs,
) -> ListRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictRootSectionImpl,
    core: Core,
    layering: Layering,
    args: DictRootSectionImplArgs,
) -> DictRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GroupSectionImpl, core: Core, layering: Layering, args: GroupSectionImplArgs
) -> GroupSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ImageSectionImpl, core: Core, layering: Layering, args: ImageSectionImplArgs
) -> ImageSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChartSectionImpl, core: Core, layering: Layering, args: ChartSectionImplArgs
) -> ChartSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DrawSectionImpl, core: Core, layering: Layering, args: DrawSectionImplArgs
) -> DrawSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TextBlockSectionImpl,
    core: Core,
    layering: Layering,
    args: TextBlockSectionImplArgs,
) -> TextBlockSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: SocialSectionImpl, core: Core, layering: Layering, args: SocialSectionImplArgs
) -> SocialSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GlobalVariablesSectionImpl,
    core: Core,
    layering: Layering,
    args: GlobalVariablesSectionImplArgs,
) -> GlobalVariablesSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeSectionImpl, core: Core, layering: Layering, args: CodeSectionImplArgs
) -> CodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GenPythonCodeSectionImpl,
    core: Core,
    layering: Layering,
    args: GenPythonCodeSectionImplArgs,
) -> GenPythonCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TerminalSectionImpl,
    core: Core,
    layering: Layering,
    args: TerminalSectionImplArgs,
) -> TerminalSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: IFrameSectionImpl, core: Core, layering: Layering, args: IFrameSectionImplArgs
) -> IFrameSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChatSectionImpl, core: Core, layering: Layering, args: ChatSectionImplArgs
) -> ChatSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BrowserSectionImpl,
    core: Core,
    layering: Layering,
    args: BrowserSectionImplArgs,
) -> BrowserSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeCallableCodeObjImpl,
    core: Core,
    layering: Layering,
    args: CodeCallableCodeObjImplArgs,
) -> CodeCallableCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: CodeParamCodeObjImplArgs,
) -> CodeParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: TextParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: TextParamCodeObjImplArgs,
) -> TextParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SliderParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: SliderParamCodeObjImplArgs,
) -> SliderParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SwitchParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: SwitchParamCodeObjImplArgs,
) -> SwitchParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: ColorPickerParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: ColorPickerParamCodeObjImplArgs,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: DropdownParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: DropdownParamCodeObjImplArgs,
) -> DropdownParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: PasswordParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: PasswordParamCodeObjImplArgs,
) -> PasswordParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: NestedParamCodeObjImpl,
    core: Core,
    layering: Layering,
    args: NestedParamCodeObjImplArgs,
) -> NestedParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCanvasSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseCanvasSectionImplArgs,
) -> BaseCanvasSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseCodeSectionImplArgs,
) -> BaseCodeSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseDictSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseDictSectionImplArgs,
) -> BaseDictSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: BaseParentCodeObjImplArgs,
) -> BaseParentCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseArtifactSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseArtifactSectionImplArgs,
) -> BaseArtifactSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseParentSectionImplArgs,
) -> BaseParentSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionWithParamsImplUnion,
    core: Core,
    layering: Layering,
    args: BaseSectionWithParamsImplArgs,
) -> BaseSectionWithParamsImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseChildlessCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: BaseChildlessCodeObjImplArgs,
) -> BaseChildlessCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParamCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: BaseParamCodeObjImplArgs,
) -> BaseParamCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: BaseCodeObjImplArgs,
) -> BaseCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionImplUnion,
    core: Core,
    layering: Layering,
    args: BaseSectionImplArgs,
) -> BaseSectionImplUnion: ...
def set_effective_impl_value(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: Core,
    layering: Layering,
    args: dict,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    """Set a value in the effective implementation.

    The value is set in the appropriate location based on:
    - If impl is not a preset: directly on the impl
    - If key is in unsharedKeys: in the modifier
    - Otherwise: in the core's sharedModifier

    The overloaded signatures above provide type-safe field names for each
    specific impl type.
    """
    for k, v in args.items():
        if not impl.isPreset:
            setattr(impl, k, v)
        elif k in core.unsharedKeys:
            layering.modifier[k] = v
        else:
            core.sharedModifier[k] = v
    return get_effective_impl(impl, core, layering)
