# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, TypeVar, overload

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
    BaseArtifactSectionLayeringUnion,
    BaseCanvasSectionCoreUnion,
    BaseCanvasSectionImplUnion,
    BaseCanvasSectionLayeringUnion,
    BaseChildlessCodeObjCoreUnion,
    BaseChildlessCodeObjImplUnion,
    BaseChildlessCodeObjLayeringUnion,
    BaseCodeObjCoreUnion,
    BaseCodeObjImplUnion,
    BaseCodeObjLayeringUnion,
    BaseCodeSectionCoreUnion,
    BaseCodeSectionImplUnion,
    BaseCodeSectionLayeringUnion,
    BaseDictSectionCoreUnion,
    BaseDictSectionImplUnion,
    BaseDictSectionLayeringUnion,
    BaseParamCodeObjCoreUnion,
    BaseParamCodeObjImplUnion,
    BaseParamCodeObjLayeringUnion,
    BaseParentCodeObjCoreUnion,
    BaseParentCodeObjImplUnion,
    BaseParentCodeObjLayeringUnion,
    BaseParentSectionCoreUnion,
    BaseParentSectionImplUnion,
    BaseParentSectionLayeringUnion,
    BaseSectionCoreUnion,
    BaseSectionImplUnion,
    BaseSectionLayeringUnion,
    BaseSectionWithParamsCoreUnion,
    BaseSectionWithParamsImplUnion,
    BaseSectionWithParamsLayeringUnion,
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
    key: str,
    value: Any,
) -> CallableSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictSectionImpl,
    core: DictSectionCore,
    layering: DictSectionLayering,
    key: str,
    value: Any,
) -> DictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ListRootSectionImpl,
    core: ListRootSectionCore,
    layering: ListRootSectionLayering,
    key: str,
    value: Any,
) -> ListRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictRootSectionImpl,
    core: DictRootSectionCore,
    layering: DictRootSectionLayering,
    key: str,
    value: Any,
) -> DictRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GroupSectionImpl,
    core: GroupSectionCore,
    layering: GroupSectionLayering,
    key: str,
    value: Any,
) -> GroupSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ImageSectionImpl,
    core: ImageSectionCore,
    layering: ImageSectionLayering,
    key: str,
    value: Any,
) -> ImageSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChartSectionImpl,
    core: ChartSectionCore,
    layering: ChartSectionLayering,
    key: str,
    value: Any,
) -> ChartSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DrawSectionImpl,
    core: DrawSectionCore,
    layering: DrawSectionLayering,
    key: str,
    value: Any,
) -> DrawSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TextBlockSectionImpl,
    core: TextBlockSectionCore,
    layering: TextBlockSectionLayering,
    key: str,
    value: Any,
) -> TextBlockSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: SocialSectionImpl,
    core: SocialSectionCore,
    layering: SocialSectionLayering,
    key: str,
    value: Any,
) -> SocialSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GlobalVariablesSectionImpl,
    core: GlobalVariablesSectionCore,
    layering: GlobalVariablesSectionLayering,
    key: str,
    value: Any,
) -> GlobalVariablesSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeSectionImpl,
    core: CodeSectionCore,
    layering: CodeSectionLayering,
    key: str,
    value: Any,
) -> CodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GenPythonCodeSectionImpl,
    core: GenPythonCodeSectionCore,
    layering: GenPythonCodeSectionLayering,
    key: str,
    value: Any,
) -> GenPythonCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TerminalSectionImpl,
    core: TerminalSectionCore,
    layering: TerminalSectionLayering,
    key: str,
    value: Any,
) -> TerminalSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: IFrameSectionImpl,
    core: IFrameSectionCore,
    layering: IFrameSectionLayering,
    key: str,
    value: Any,
) -> IFrameSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChatSectionImpl,
    core: ChatSectionCore,
    layering: ChatSectionLayering,
    key: str,
    value: Any,
) -> ChatSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BrowserSectionImpl,
    core: BrowserSectionCore,
    layering: BrowserSectionLayering,
    key: str,
    value: Any,
) -> BrowserSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeCallableCodeObjImpl,
    core: CodeCallableCodeObjCore,
    layering: CodeCallableCodeObjLayering,
    key: str,
    value: Any,
) -> CodeCallableCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeParamCodeObjImpl,
    core: CodeParamCodeObjCore,
    layering: CodeParamCodeObjLayering,
    key: str,
    value: Any,
) -> CodeParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: TextParamCodeObjImpl,
    core: TextParamCodeObjCore,
    layering: TextParamCodeObjLayering,
    key: str,
    value: Any,
) -> TextParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SliderParamCodeObjImpl,
    core: SliderParamCodeObjCore,
    layering: SliderParamCodeObjLayering,
    key: str,
    value: Any,
) -> SliderParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SwitchParamCodeObjImpl,
    core: SwitchParamCodeObjCore,
    layering: SwitchParamCodeObjLayering,
    key: str,
    value: Any,
) -> SwitchParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: ColorPickerParamCodeObjImpl,
    core: ColorPickerParamCodeObjCore,
    layering: ColorPickerParamCodeObjLayering,
    key: str,
    value: Any,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: DropdownParamCodeObjImpl,
    core: DropdownParamCodeObjCore,
    layering: DropdownParamCodeObjLayering,
    key: str,
    value: Any,
) -> DropdownParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: PasswordParamCodeObjImpl,
    core: PasswordParamCodeObjCore,
    layering: PasswordParamCodeObjLayering,
    key: str,
    value: Any,
) -> PasswordParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: NestedParamCodeObjImpl,
    core: NestedParamCodeObjCore,
    layering: NestedParamCodeObjLayering,
    key: str,
    value: Any,
) -> NestedParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCanvasSectionImplUnion,
    core: BaseCanvasSectionCoreUnion,
    layering: BaseCanvasSectionLayeringUnion,
    key: str,
    value: Any,
) -> BaseCanvasSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeSectionImplUnion,
    core: BaseCodeSectionCoreUnion,
    layering: BaseCodeSectionLayeringUnion,
    key: str,
    value: Any,
) -> BaseCodeSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseDictSectionImplUnion,
    core: BaseDictSectionCoreUnion,
    layering: BaseDictSectionLayeringUnion,
    key: str,
    value: Any,
) -> BaseDictSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentCodeObjImplUnion,
    core: BaseParentCodeObjCoreUnion,
    layering: BaseParentCodeObjLayeringUnion,
    key: str,
    value: Any,
) -> BaseParentCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseArtifactSectionImplUnion,
    core: BaseArtifactSectionCoreUnion,
    layering: BaseArtifactSectionLayeringUnion,
    key: str,
    value: Any,
) -> BaseArtifactSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParentSectionImplUnion,
    core: BaseParentSectionCoreUnion,
    layering: BaseParentSectionLayeringUnion,
    key: str,
    value: Any,
) -> BaseParentSectionImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionWithParamsImplUnion,
    core: BaseSectionWithParamsCoreUnion,
    layering: BaseSectionWithParamsLayeringUnion,
    key: str,
    value: Any,
) -> BaseSectionWithParamsImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseChildlessCodeObjImplUnion,
    core: BaseChildlessCodeObjCoreUnion,
    layering: BaseChildlessCodeObjLayeringUnion,
    key: str,
    value: Any,
) -> BaseChildlessCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseParamCodeObjImplUnion,
    core: BaseParamCodeObjCoreUnion,
    layering: BaseParamCodeObjLayeringUnion,
    key: str,
    value: Any,
) -> BaseParamCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeObjImplUnion,
    core: BaseCodeObjCoreUnion,
    layering: BaseCodeObjLayeringUnion,
    key: str,
    value: Any,
) -> BaseCodeObjImplUnion: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionImplUnion,
    core: BaseSectionCoreUnion,
    layering: BaseSectionLayeringUnion,
    key: str,
    value: Any,
) -> BaseSectionImplUnion: ...
def set_effective_impl_value(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    layering: BaseSectionLayeringUnion | BaseCodeObjLayeringUnion,
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
        layering.modifier[key] = value
    else:
        core.sharedModifier[key] = value
    return get_effective_impl(impl, core, layering)
