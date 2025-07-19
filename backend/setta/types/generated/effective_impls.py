# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import TypeVar, overload

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
from setta.types.generated.cores import (
    BrowserSectionCore,
    CallableSectionCore,
    ChartSectionCore,
    ChatSectionCore,
    CodeCallableCodeObjCore,
    CodeParamCodeObjCore,
    CodeSectionCore,
    ColorPickerParamCodeObjCore,
    DictRootSectionCore,
    DictSectionCore,
    DrawSectionCore,
    DropdownParamCodeObjCore,
    GenPythonCodeSectionCore,
    GlobalVariablesSectionCore,
    GroupSectionCore,
    IFrameSectionCore,
    ImageSectionCore,
    ListRootSectionCore,
    NestedParamCodeObjCore,
    PasswordParamCodeObjCore,
    SliderParamCodeObjCore,
    SocialSectionCore,
    SwitchParamCodeObjCore,
    TerminalSectionCore,
    TextBlockSectionCore,
    TextParamCodeObjCore,
)
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
from setta.types.generated.layering_unions import (
    BaseArtifactSectionLayeringUnion,
    BaseCanvasSectionLayeringUnion,
    BaseChildlessCodeObjLayeringUnion,
    BaseCodeObjLayeringUnion,
    BaseCodeSectionLayeringUnion,
    BaseDictSectionLayeringUnion,
    BaseParamCodeObjLayeringUnion,
    BaseParentCodeObjLayeringUnion,
    BaseParentSectionLayeringUnion,
    BaseSectionLayeringUnion,
    BaseSectionWithParamsLayeringUnion,
)
from setta.types.generated.layerings import (
    BrowserSectionLayering,
    CallableSectionLayering,
    ChartSectionLayering,
    ChatSectionLayering,
    CodeCallableCodeObjLayering,
    CodeParamCodeObjLayering,
    CodeSectionLayering,
    ColorPickerParamCodeObjLayering,
    DictRootSectionLayering,
    DictSectionLayering,
    DrawSectionLayering,
    DropdownParamCodeObjLayering,
    GenPythonCodeSectionLayering,
    GlobalVariablesSectionLayering,
    GroupSectionLayering,
    IFrameSectionLayering,
    ImageSectionLayering,
    ListRootSectionLayering,
    NestedParamCodeObjLayering,
    PasswordParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SocialSectionLayering,
    SwitchParamCodeObjLayering,
    TerminalSectionLayering,
    TextBlockSectionLayering,
    TextParamCodeObjLayering,
)
from setta.types.generated.unions import (
    BaseArtifactSectionCoreUnion,
    BaseArtifactSectionImplUnion,
    BaseCanvasSectionCoreUnion,
    BaseCanvasSectionImplUnion,
    BaseChildlessCodeObjCoreUnion,
    BaseChildlessCodeObjImplUnion,
    BaseCodeObjCoreUnion,
    BaseCodeObjImplUnion,
    BaseCodeSectionCoreUnion,
    BaseCodeSectionImplUnion,
    BaseDictSectionCoreUnion,
    BaseDictSectionImplUnion,
    BaseParamCodeObjCoreUnion,
    BaseParamCodeObjImplUnion,
    BaseParentCodeObjCoreUnion,
    BaseParentCodeObjImplUnion,
    BaseParentSectionCoreUnion,
    BaseParentSectionImplUnion,
    BaseSectionCoreUnion,
    BaseSectionImplUnion,
    BaseSectionWithParamsCoreUnion,
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

TImpl = TypeVar("TImpl", bound=BaseCodeObjImplUnion | BaseSectionImplUnion)


def apply_modifier(
    impl: TImpl,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    layering: BaseSectionLayeringUnion | BaseCodeObjLayeringUnion,
) -> TImpl:
    return impl.model_copy(
        update={**core.sharedModifier, **layering.modifier}, deep=True
    )


@overload
def get_effective_impl(
    impl: CallableSectionImpl,
    core: CallableSectionCore,
    layering: CallableSectionLayering,
) -> CallableSectionImpl: ...
@overload
def get_effective_impl(
    impl: DictSectionImpl,
    core: DictSectionCore,
    layering: DictSectionLayering,
) -> DictSectionImpl: ...
@overload
def get_effective_impl(
    impl: ListRootSectionImpl,
    core: ListRootSectionCore,
    layering: ListRootSectionLayering,
) -> ListRootSectionImpl: ...
@overload
def get_effective_impl(
    impl: DictRootSectionImpl,
    core: DictRootSectionCore,
    layering: DictRootSectionLayering,
) -> DictRootSectionImpl: ...
@overload
def get_effective_impl(
    impl: GroupSectionImpl,
    core: GroupSectionCore,
    layering: GroupSectionLayering,
) -> GroupSectionImpl: ...
@overload
def get_effective_impl(
    impl: ImageSectionImpl,
    core: ImageSectionCore,
    layering: ImageSectionLayering,
) -> ImageSectionImpl: ...
@overload
def get_effective_impl(
    impl: ChartSectionImpl,
    core: ChartSectionCore,
    layering: ChartSectionLayering,
) -> ChartSectionImpl: ...
@overload
def get_effective_impl(
    impl: DrawSectionImpl,
    core: DrawSectionCore,
    layering: DrawSectionLayering,
) -> DrawSectionImpl: ...
@overload
def get_effective_impl(
    impl: TextBlockSectionImpl,
    core: TextBlockSectionCore,
    layering: TextBlockSectionLayering,
) -> TextBlockSectionImpl: ...
@overload
def get_effective_impl(
    impl: SocialSectionImpl,
    core: SocialSectionCore,
    layering: SocialSectionLayering,
) -> SocialSectionImpl: ...
@overload
def get_effective_impl(
    impl: GlobalVariablesSectionImpl,
    core: GlobalVariablesSectionCore,
    layering: GlobalVariablesSectionLayering,
) -> GlobalVariablesSectionImpl: ...
@overload
def get_effective_impl(
    impl: CodeSectionImpl,
    core: CodeSectionCore,
    layering: CodeSectionLayering,
) -> CodeSectionImpl: ...
@overload
def get_effective_impl(
    impl: GenPythonCodeSectionImpl,
    core: GenPythonCodeSectionCore,
    layering: GenPythonCodeSectionLayering,
) -> GenPythonCodeSectionImpl: ...
@overload
def get_effective_impl(
    impl: TerminalSectionImpl,
    core: TerminalSectionCore,
    layering: TerminalSectionLayering,
) -> TerminalSectionImpl: ...
@overload
def get_effective_impl(
    impl: IFrameSectionImpl,
    core: IFrameSectionCore,
    layering: IFrameSectionLayering,
) -> IFrameSectionImpl: ...
@overload
def get_effective_impl(
    impl: ChatSectionImpl,
    core: ChatSectionCore,
    layering: ChatSectionLayering,
) -> ChatSectionImpl: ...
@overload
def get_effective_impl(
    impl: BrowserSectionImpl,
    core: BrowserSectionCore,
    layering: BrowserSectionLayering,
) -> BrowserSectionImpl: ...
@overload
def get_effective_impl(
    impl: CodeCallableCodeObjImpl,
    core: CodeCallableCodeObjCore,
    layering: CodeCallableCodeObjLayering,
) -> CodeCallableCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: CodeParamCodeObjImpl,
    core: CodeParamCodeObjCore,
    layering: CodeParamCodeObjLayering,
) -> CodeParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: TextParamCodeObjImpl,
    core: TextParamCodeObjCore,
    layering: TextParamCodeObjLayering,
) -> TextParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: SliderParamCodeObjImpl,
    core: SliderParamCodeObjCore,
    layering: SliderParamCodeObjLayering,
) -> SliderParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: SwitchParamCodeObjImpl,
    core: SwitchParamCodeObjCore,
    layering: SwitchParamCodeObjLayering,
) -> SwitchParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: ColorPickerParamCodeObjImpl,
    core: ColorPickerParamCodeObjCore,
    layering: ColorPickerParamCodeObjLayering,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: DropdownParamCodeObjImpl,
    core: DropdownParamCodeObjCore,
    layering: DropdownParamCodeObjLayering,
) -> DropdownParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: PasswordParamCodeObjImpl,
    core: PasswordParamCodeObjCore,
    layering: PasswordParamCodeObjLayering,
) -> PasswordParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: NestedParamCodeObjImpl,
    core: NestedParamCodeObjCore,
    layering: NestedParamCodeObjLayering,
) -> NestedParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: BaseCanvasSectionImplUnion,
    core: BaseCanvasSectionCoreUnion,
    layering: BaseCanvasSectionLayeringUnion,
) -> BaseCanvasSectionImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseCodeSectionImplUnion,
    core: BaseCodeSectionCoreUnion,
    layering: BaseCodeSectionLayeringUnion,
) -> BaseCodeSectionImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseDictSectionImplUnion,
    core: BaseDictSectionCoreUnion,
    layering: BaseDictSectionLayeringUnion,
) -> BaseDictSectionImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseParentCodeObjImplUnion,
    core: BaseParentCodeObjCoreUnion,
    layering: BaseParentCodeObjLayeringUnion,
) -> BaseParentCodeObjImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseArtifactSectionImplUnion,
    core: BaseArtifactSectionCoreUnion,
    layering: BaseArtifactSectionLayeringUnion,
) -> BaseArtifactSectionImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseParentSectionImplUnion,
    core: BaseParentSectionCoreUnion,
    layering: BaseParentSectionLayeringUnion,
) -> BaseParentSectionImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseSectionWithParamsImplUnion,
    core: BaseSectionWithParamsCoreUnion,
    layering: BaseSectionWithParamsLayeringUnion,
) -> BaseSectionWithParamsImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseChildlessCodeObjImplUnion,
    core: BaseChildlessCodeObjCoreUnion,
    layering: BaseChildlessCodeObjLayeringUnion,
) -> BaseChildlessCodeObjImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseParamCodeObjImplUnion,
    core: BaseParamCodeObjCoreUnion,
    layering: BaseParamCodeObjLayeringUnion,
) -> BaseParamCodeObjImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseCodeObjImplUnion,
    core: BaseCodeObjCoreUnion,
    layering: BaseCodeObjLayeringUnion,
) -> BaseCodeObjImplUnion: ...
@overload
def get_effective_impl(
    impl: BaseSectionImplUnion,
    core: BaseSectionCoreUnion,
    layering: BaseSectionLayeringUnion,
) -> BaseSectionImplUnion: ...
def get_effective_impl(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    layering: BaseSectionLayeringUnion | BaseCodeObjLayeringUnion,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    return apply_modifier(impl, core, layering)


@overload
def set_effective_impl_value(
    impl: CallableSectionImpl,
    core: CallableSectionCore,
    layering: CallableSectionLayering,
    args: CallableSectionImplArgs,
) -> CallableSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictSectionImpl,
    core: DictSectionCore,
    layering: DictSectionLayering,
    args: DictSectionImplArgs,
) -> DictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ListRootSectionImpl,
    core: ListRootSectionCore,
    layering: ListRootSectionLayering,
    args: ListRootSectionImplArgs,
) -> ListRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictRootSectionImpl,
    core: DictRootSectionCore,
    layering: DictRootSectionLayering,
    args: DictRootSectionImplArgs,
) -> DictRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GroupSectionImpl,
    core: GroupSectionCore,
    layering: GroupSectionLayering,
    args: GroupSectionImplArgs,
) -> GroupSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ImageSectionImpl,
    core: ImageSectionCore,
    layering: ImageSectionLayering,
    args: ImageSectionImplArgs,
) -> ImageSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChartSectionImpl,
    core: ChartSectionCore,
    layering: ChartSectionLayering,
    args: ChartSectionImplArgs,
) -> ChartSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DrawSectionImpl,
    core: DrawSectionCore,
    layering: DrawSectionLayering,
    args: DrawSectionImplArgs,
) -> DrawSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TextBlockSectionImpl,
    core: TextBlockSectionCore,
    layering: TextBlockSectionLayering,
    args: TextBlockSectionImplArgs,
) -> TextBlockSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: SocialSectionImpl,
    core: SocialSectionCore,
    layering: SocialSectionLayering,
    args: SocialSectionImplArgs,
) -> SocialSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GlobalVariablesSectionImpl,
    core: GlobalVariablesSectionCore,
    layering: GlobalVariablesSectionLayering,
    args: GlobalVariablesSectionImplArgs,
) -> GlobalVariablesSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeSectionImpl,
    core: CodeSectionCore,
    layering: CodeSectionLayering,
    args: CodeSectionImplArgs,
) -> CodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GenPythonCodeSectionImpl,
    core: GenPythonCodeSectionCore,
    layering: GenPythonCodeSectionLayering,
    args: GenPythonCodeSectionImplArgs,
) -> GenPythonCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TerminalSectionImpl,
    core: TerminalSectionCore,
    layering: TerminalSectionLayering,
    args: TerminalSectionImplArgs,
) -> TerminalSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: IFrameSectionImpl,
    core: IFrameSectionCore,
    layering: IFrameSectionLayering,
    args: IFrameSectionImplArgs,
) -> IFrameSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChatSectionImpl,
    core: ChatSectionCore,
    layering: ChatSectionLayering,
    args: ChatSectionImplArgs,
) -> ChatSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BrowserSectionImpl,
    core: BrowserSectionCore,
    layering: BrowserSectionLayering,
    args: BrowserSectionImplArgs,
) -> BrowserSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeCallableCodeObjImpl,
    core: CodeCallableCodeObjCore,
    layering: CodeCallableCodeObjLayering,
    args: CodeCallableCodeObjImplArgs,
) -> CodeCallableCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeParamCodeObjImpl,
    core: CodeParamCodeObjCore,
    layering: CodeParamCodeObjLayering,
    args: CodeParamCodeObjImplArgs,
) -> CodeParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: TextParamCodeObjImpl,
    core: TextParamCodeObjCore,
    layering: TextParamCodeObjLayering,
    args: TextParamCodeObjImplArgs,
) -> TextParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SliderParamCodeObjImpl,
    core: SliderParamCodeObjCore,
    layering: SliderParamCodeObjLayering,
    args: SliderParamCodeObjImplArgs,
) -> SliderParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SwitchParamCodeObjImpl,
    core: SwitchParamCodeObjCore,
    layering: SwitchParamCodeObjLayering,
    args: SwitchParamCodeObjImplArgs,
) -> SwitchParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: ColorPickerParamCodeObjImpl,
    core: ColorPickerParamCodeObjCore,
    layering: ColorPickerParamCodeObjLayering,
    args: ColorPickerParamCodeObjImplArgs,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: DropdownParamCodeObjImpl,
    core: DropdownParamCodeObjCore,
    layering: DropdownParamCodeObjLayering,
    args: DropdownParamCodeObjImplArgs,
) -> DropdownParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: PasswordParamCodeObjImpl,
    core: PasswordParamCodeObjCore,
    layering: PasswordParamCodeObjLayering,
    args: PasswordParamCodeObjImplArgs,
) -> PasswordParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: NestedParamCodeObjImpl,
    core: NestedParamCodeObjCore,
    layering: NestedParamCodeObjLayering,
    args: NestedParamCodeObjImplArgs,
) -> NestedParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCanvasSectionImplUnion,
    core: BaseCanvasSectionCoreUnion,
    layering: BaseCanvasSectionLayeringUnion,
    args: BaseCanvasSectionImplArgs,
) -> BaseCanvasSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeSectionImplUnion,
    core: BaseCodeSectionCoreUnion,
    layering: BaseCodeSectionLayeringUnion,
    args: BaseCodeSectionImplArgs,
) -> BaseCodeSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseDictSectionImplUnion,
    core: BaseDictSectionCoreUnion,
    layering: BaseDictSectionLayeringUnion,
    args: BaseDictSectionImplArgs,
) -> BaseDictSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentCodeObjImplUnion,
    core: BaseParentCodeObjCoreUnion,
    layering: BaseParentCodeObjLayeringUnion,
    args: BaseParentCodeObjImplArgs,
) -> BaseParentCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseArtifactSectionImplUnion,
    core: BaseArtifactSectionCoreUnion,
    layering: BaseArtifactSectionLayeringUnion,
    args: BaseArtifactSectionImplArgs,
) -> BaseArtifactSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentSectionImplUnion,
    core: BaseParentSectionCoreUnion,
    layering: BaseParentSectionLayeringUnion,
    args: BaseParentSectionImplArgs,
) -> BaseParentSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionWithParamsImplUnion,
    core: BaseSectionWithParamsCoreUnion,
    layering: BaseSectionWithParamsLayeringUnion,
    args: BaseSectionWithParamsImplArgs,
) -> BaseSectionWithParamsImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseChildlessCodeObjImplUnion,
    core: BaseChildlessCodeObjCoreUnion,
    layering: BaseChildlessCodeObjLayeringUnion,
    args: BaseChildlessCodeObjImplArgs,
) -> BaseChildlessCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParamCodeObjImplUnion,
    core: BaseParamCodeObjCoreUnion,
    layering: BaseParamCodeObjLayeringUnion,
    args: BaseParamCodeObjImplArgs,
) -> BaseParamCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeObjImplUnion,
    core: BaseCodeObjCoreUnion,
    layering: BaseCodeObjLayeringUnion,
    args: BaseCodeObjImplArgs,
) -> BaseCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionImplUnion,
    core: BaseSectionCoreUnion,
    layering: BaseSectionLayeringUnion,
    args: BaseSectionImplArgs,
) -> BaseSectionImplUnion: ...
def set_effective_impl_value(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    layering: BaseSectionLayeringUnion | BaseCodeObjLayeringUnion,
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
