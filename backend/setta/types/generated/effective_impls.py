# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import overload, Any, TypeVar

from setta.types.section_impls import (
    BaseSectionImpl, BaseSectionWithParamsImpl, BaseArtifactSectionImpl, BaseCanvasSectionImpl, BaseCodeSectionImpl, BaseParentSectionImpl, BaseDictSectionImpl, CallableSectionImpl, DictSectionImpl, ListRootSectionImpl, DictRootSectionImpl, GroupSectionImpl, ImageSectionImpl, ChartSectionImpl, DrawSectionImpl, TextBlockSectionImpl, SocialSectionImpl, GlobalVariablesSectionImpl, CodeSectionImpl, GenPythonCodeSectionImpl, TerminalSectionImpl, IFrameSectionImpl, ChatSectionImpl, BrowserSectionImpl
)
from setta.types.code_obj_impls import (
    BaseCodeObjImpl, BaseParamCodeObjImpl, BaseChildlessCodeObjImpl, BaseParentCodeObjImpl, CodeCallableCodeObjImpl, CodeParamCodeObjImpl, TextParamCodeObjImpl, SliderParamCodeObjImpl, SwitchParamCodeObjImpl, ColorPickerParamCodeObjImpl, DropdownParamCodeObjImpl, PasswordParamCodeObjImpl, NestedParamCodeObjImpl
)
from setta.types.generated.cores import (
    BaseSectionCore, BaseSectionWithParamsCore, BaseArtifactSectionCore, BaseCanvasSectionCore, BaseCodeSectionCore, BaseParentSectionCore, BaseDictSectionCore, CallableSectionCore, DictSectionCore, ListRootSectionCore, DictRootSectionCore, GroupSectionCore, ImageSectionCore, ChartSectionCore, DrawSectionCore, TextBlockSectionCore, SocialSectionCore, GlobalVariablesSectionCore, CodeSectionCore, GenPythonCodeSectionCore, TerminalSectionCore, IFrameSectionCore, ChatSectionCore, BrowserSectionCore, BaseCodeObjCore, BaseParamCodeObjCore, BaseChildlessCodeObjCore, BaseParentCodeObjCore, CodeCallableCodeObjCore, CodeParamCodeObjCore, TextParamCodeObjCore, SliderParamCodeObjCore, SwitchParamCodeObjCore, ColorPickerParamCodeObjCore, DropdownParamCodeObjCore, PasswordParamCodeObjCore, NestedParamCodeObjCore
)
from setta.types.generated.layerings import (
    BaseSectionLayering, BaseSectionWithParamsLayering, BaseArtifactSectionLayering, BaseCanvasSectionLayering, BaseCodeSectionLayering, BaseParentSectionLayering, BaseDictSectionLayering, CallableSectionLayering, DictSectionLayering, ListRootSectionLayering, DictRootSectionLayering, GroupSectionLayering, ImageSectionLayering, ChartSectionLayering, DrawSectionLayering, TextBlockSectionLayering, SocialSectionLayering, GlobalVariablesSectionLayering, CodeSectionLayering, GenPythonCodeSectionLayering, TerminalSectionLayering, IFrameSectionLayering, ChatSectionLayering, BrowserSectionLayering, BaseCodeObjLayering, BaseParamCodeObjLayering, BaseChildlessCodeObjLayering, BaseParentCodeObjLayering, CodeCallableCodeObjLayering, CodeParamCodeObjLayering, TextParamCodeObjLayering, SliderParamCodeObjLayering, SwitchParamCodeObjLayering, ColorPickerParamCodeObjLayering, DropdownParamCodeObjLayering, PasswordParamCodeObjLayering, NestedParamCodeObjLayering
)

TImpl = TypeVar("TImpl", bound=BaseCodeObjImplUnion | BaseSectionImplUnion)


def apply_modifier(
    impl: TImpl, core: BaseSectionCore | BaseCodeObjCore, layering: BaseSectionLayering | BaseCodeObjLayering
) -> TImpl:
    return impl.model_copy(update={**core.shared_modifier, **layering.modifier}, deep=True)

@overload
def get_effective_impl(
    impl: NestedParamCodeObjImpl,
    core: NestedParamCodeObjCore,
    layering: NestedParamCodeObjLayering,
) -> NestedParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: PasswordParamCodeObjImpl,
    core: PasswordParamCodeObjCore,
    layering: PasswordParamCodeObjLayering,
) -> PasswordParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: DropdownParamCodeObjImpl,
    core: DropdownParamCodeObjCore,
    layering: DropdownParamCodeObjLayering,
) -> DropdownParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: ColorPickerParamCodeObjImpl,
    core: ColorPickerParamCodeObjCore,
    layering: ColorPickerParamCodeObjLayering,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: SwitchParamCodeObjImpl,
    core: SwitchParamCodeObjCore,
    layering: SwitchParamCodeObjLayering,
) -> SwitchParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: SliderParamCodeObjImpl,
    core: SliderParamCodeObjCore,
    layering: SliderParamCodeObjLayering,
) -> SliderParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: TextParamCodeObjImpl,
    core: TextParamCodeObjCore,
    layering: TextParamCodeObjLayering,
) -> TextParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: CodeParamCodeObjImpl,
    core: CodeParamCodeObjCore,
    layering: CodeParamCodeObjLayering,
) -> CodeParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: CodeCallableCodeObjImpl,
    core: CodeCallableCodeObjCore,
    layering: CodeCallableCodeObjLayering,
) -> CodeCallableCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: BaseParentCodeObjImpl,
    core: BaseParentCodeObjCore,
    layering: BaseParentCodeObjLayering,
) -> BaseParentCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: BaseChildlessCodeObjImpl,
    core: BaseChildlessCodeObjCore,
    layering: BaseChildlessCodeObjLayering,
) -> BaseChildlessCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: BaseParamCodeObjImpl,
    core: BaseParamCodeObjCore,
    layering: BaseParamCodeObjLayering,
) -> BaseParamCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: BaseCodeObjImpl,
    core: BaseCodeObjCore,
    layering: BaseCodeObjLayering,
) -> BaseCodeObjImpl: ...
@overload
def get_effective_impl(
    impl: BrowserSectionImpl,
    core: BrowserSectionCore,
    layering: BrowserSectionLayering,
) -> BrowserSectionImpl: ...
@overload
def get_effective_impl(
    impl: ChatSectionImpl,
    core: ChatSectionCore,
    layering: ChatSectionLayering,
) -> ChatSectionImpl: ...
@overload
def get_effective_impl(
    impl: IFrameSectionImpl,
    core: IFrameSectionCore,
    layering: IFrameSectionLayering,
) -> IFrameSectionImpl: ...
@overload
def get_effective_impl(
    impl: TerminalSectionImpl,
    core: TerminalSectionCore,
    layering: TerminalSectionLayering,
) -> TerminalSectionImpl: ...
@overload
def get_effective_impl(
    impl: GenPythonCodeSectionImpl,
    core: GenPythonCodeSectionCore,
    layering: GenPythonCodeSectionLayering,
) -> GenPythonCodeSectionImpl: ...
@overload
def get_effective_impl(
    impl: CodeSectionImpl,
    core: CodeSectionCore,
    layering: CodeSectionLayering,
) -> CodeSectionImpl: ...
@overload
def get_effective_impl(
    impl: GlobalVariablesSectionImpl,
    core: GlobalVariablesSectionCore,
    layering: GlobalVariablesSectionLayering,
) -> GlobalVariablesSectionImpl: ...
@overload
def get_effective_impl(
    impl: SocialSectionImpl,
    core: SocialSectionCore,
    layering: SocialSectionLayering,
) -> SocialSectionImpl: ...
@overload
def get_effective_impl(
    impl: TextBlockSectionImpl,
    core: TextBlockSectionCore,
    layering: TextBlockSectionLayering,
) -> TextBlockSectionImpl: ...
@overload
def get_effective_impl(
    impl: DrawSectionImpl,
    core: DrawSectionCore,
    layering: DrawSectionLayering,
) -> DrawSectionImpl: ...
@overload
def get_effective_impl(
    impl: ChartSectionImpl,
    core: ChartSectionCore,
    layering: ChartSectionLayering,
) -> ChartSectionImpl: ...
@overload
def get_effective_impl(
    impl: ImageSectionImpl,
    core: ImageSectionCore,
    layering: ImageSectionLayering,
) -> ImageSectionImpl: ...
@overload
def get_effective_impl(
    impl: GroupSectionImpl,
    core: GroupSectionCore,
    layering: GroupSectionLayering,
) -> GroupSectionImpl: ...
@overload
def get_effective_impl(
    impl: DictRootSectionImpl,
    core: DictRootSectionCore,
    layering: DictRootSectionLayering,
) -> DictRootSectionImpl: ...
@overload
def get_effective_impl(
    impl: ListRootSectionImpl,
    core: ListRootSectionCore,
    layering: ListRootSectionLayering,
) -> ListRootSectionImpl: ...
@overload
def get_effective_impl(
    impl: DictSectionImpl,
    core: DictSectionCore,
    layering: DictSectionLayering,
) -> DictSectionImpl: ...
@overload
def get_effective_impl(
    impl: CallableSectionImpl,
    core: CallableSectionCore,
    layering: CallableSectionLayering,
) -> CallableSectionImpl: ...
@overload
def get_effective_impl(
    impl: BaseDictSectionImpl,
    core: BaseDictSectionCore,
    layering: BaseDictSectionLayering,
) -> BaseDictSectionImpl: ...
@overload
def get_effective_impl(
    impl: BaseParentSectionImpl,
    core: BaseParentSectionCore,
    layering: BaseParentSectionLayering,
) -> BaseParentSectionImpl: ...
@overload
def get_effective_impl(
    impl: BaseCodeSectionImpl,
    core: BaseCodeSectionCore,
    layering: BaseCodeSectionLayering,
) -> BaseCodeSectionImpl: ...
@overload
def get_effective_impl(
    impl: BaseCanvasSectionImpl,
    core: BaseCanvasSectionCore,
    layering: BaseCanvasSectionLayering,
) -> BaseCanvasSectionImpl: ...
@overload
def get_effective_impl(
    impl: BaseArtifactSectionImpl,
    core: BaseArtifactSectionCore,
    layering: BaseArtifactSectionLayering,
) -> BaseArtifactSectionImpl: ...
@overload
def get_effective_impl(
    impl: BaseSectionWithParamsImpl,
    core: BaseSectionWithParamsCore,
    layering: BaseSectionWithParamsLayering,
) -> BaseSectionWithParamsImpl: ...
@overload
def get_effective_impl(
    impl: BaseSectionImpl,
    core: BaseSectionCore,
    layering: BaseSectionLayering,
) -> BaseSectionImpl: ...
def get_effective_impl(
    impl: BaseSectionImpl | BaseCodeObjImpl,
    core: BaseSectionCore | BaseCodeObjCore,
    layering: BaseSectionLayering | BaseCodeObjLayering,
) -> BaseSectionImpl | BaseCodeObjImpl,
    return apply_modifier(impl, core, layering)

@overload
def set_effective_impl_value(
    impl: NestedParamCodeObjImpl,
    core: NestedParamCodeObjCore,
    layering: NestedParamCodeObjLayering,
    key: NestedParamCodeObjImplFields,
    value: Any,
) -> NestedParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: PasswordParamCodeObjImpl,
    core: PasswordParamCodeObjCore,
    layering: PasswordParamCodeObjLayering,
    key: PasswordParamCodeObjImplFields,
    value: Any,
) -> PasswordParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: DropdownParamCodeObjImpl,
    core: DropdownParamCodeObjCore,
    layering: DropdownParamCodeObjLayering,
    key: DropdownParamCodeObjImplFields,
    value: Any,
) -> DropdownParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: ColorPickerParamCodeObjImpl,
    core: ColorPickerParamCodeObjCore,
    layering: ColorPickerParamCodeObjLayering,
    key: ColorPickerParamCodeObjImplFields,
    value: Any,
) -> ColorPickerParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SwitchParamCodeObjImpl,
    core: SwitchParamCodeObjCore,
    layering: SwitchParamCodeObjLayering,
    key: SwitchParamCodeObjImplFields,
    value: Any,
) -> SwitchParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: SliderParamCodeObjImpl,
    core: SliderParamCodeObjCore,
    layering: SliderParamCodeObjLayering,
    key: SliderParamCodeObjImplFields,
    value: Any,
) -> SliderParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: TextParamCodeObjImpl,
    core: TextParamCodeObjCore,
    layering: TextParamCodeObjLayering,
    key: TextParamCodeObjImplFields,
    value: Any,
) -> TextParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeParamCodeObjImpl,
    core: CodeParamCodeObjCore,
    layering: CodeParamCodeObjLayering,
    key: CodeParamCodeObjImplFields,
    value: Any,
) -> CodeParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeCallableCodeObjImpl,
    core: CodeCallableCodeObjCore,
    layering: CodeCallableCodeObjLayering,
    key: CodeCallableCodeObjImplFields,
    value: Any,
) -> CodeCallableCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseParentCodeObjImpl,
    core: BaseParentCodeObjCore,
    layering: BaseParentCodeObjLayering,
    key: BaseParentCodeObjImplFields,
    value: Any,
) -> BaseParentCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseChildlessCodeObjImpl,
    core: BaseChildlessCodeObjCore,
    layering: BaseChildlessCodeObjLayering,
    key: BaseChildlessCodeObjImplFields,
    value: Any,
) -> BaseChildlessCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseParamCodeObjImpl,
    core: BaseParamCodeObjCore,
    layering: BaseParamCodeObjLayering,
    key: BaseParamCodeObjImplFields,
    value: Any,
) -> BaseParamCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeObjImpl,
    core: BaseCodeObjCore,
    layering: BaseCodeObjLayering,
    key: BaseCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImpl: ...
@overload
def set_effective_impl_value(
    impl: BrowserSectionImpl,
    core: BrowserSectionCore,
    layering: BrowserSectionLayering,
    key: BrowserSectionImplFields,
    value: Any,
) -> BrowserSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChatSectionImpl,
    core: ChatSectionCore,
    layering: ChatSectionLayering,
    key: ChatSectionImplFields,
    value: Any,
) -> ChatSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: IFrameSectionImpl,
    core: IFrameSectionCore,
    layering: IFrameSectionLayering,
    key: IFrameSectionImplFields,
    value: Any,
) -> IFrameSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TerminalSectionImpl,
    core: TerminalSectionCore,
    layering: TerminalSectionLayering,
    key: TerminalSectionImplFields,
    value: Any,
) -> TerminalSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GenPythonCodeSectionImpl,
    core: GenPythonCodeSectionCore,
    layering: GenPythonCodeSectionLayering,
    key: GenPythonCodeSectionImplFields,
    value: Any,
) -> GenPythonCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CodeSectionImpl,
    core: CodeSectionCore,
    layering: CodeSectionLayering,
    key: CodeSectionImplFields,
    value: Any,
) -> CodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GlobalVariablesSectionImpl,
    core: GlobalVariablesSectionCore,
    layering: GlobalVariablesSectionLayering,
    key: GlobalVariablesSectionImplFields,
    value: Any,
) -> GlobalVariablesSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: SocialSectionImpl,
    core: SocialSectionCore,
    layering: SocialSectionLayering,
    key: SocialSectionImplFields,
    value: Any,
) -> SocialSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: TextBlockSectionImpl,
    core: TextBlockSectionCore,
    layering: TextBlockSectionLayering,
    key: TextBlockSectionImplFields,
    value: Any,
) -> TextBlockSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DrawSectionImpl,
    core: DrawSectionCore,
    layering: DrawSectionLayering,
    key: DrawSectionImplFields,
    value: Any,
) -> DrawSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ChartSectionImpl,
    core: ChartSectionCore,
    layering: ChartSectionLayering,
    key: ChartSectionImplFields,
    value: Any,
) -> ChartSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ImageSectionImpl,
    core: ImageSectionCore,
    layering: ImageSectionLayering,
    key: ImageSectionImplFields,
    value: Any,
) -> ImageSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: GroupSectionImpl,
    core: GroupSectionCore,
    layering: GroupSectionLayering,
    key: GroupSectionImplFields,
    value: Any,
) -> GroupSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictRootSectionImpl,
    core: DictRootSectionCore,
    layering: DictRootSectionLayering,
    key: DictRootSectionImplFields,
    value: Any,
) -> DictRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: ListRootSectionImpl,
    core: ListRootSectionCore,
    layering: ListRootSectionLayering,
    key: ListRootSectionImplFields,
    value: Any,
) -> ListRootSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: DictSectionImpl,
    core: DictSectionCore,
    layering: DictSectionLayering,
    key: DictSectionImplFields,
    value: Any,
) -> DictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: CallableSectionImpl,
    core: CallableSectionCore,
    layering: CallableSectionLayering,
    key: CallableSectionImplFields,
    value: Any,
) -> CallableSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseDictSectionImpl,
    core: BaseDictSectionCore,
    layering: BaseDictSectionLayering,
    key: BaseDictSectionImplFields,
    value: Any,
) -> BaseDictSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseParentSectionImpl,
    core: BaseParentSectionCore,
    layering: BaseParentSectionLayering,
    key: BaseParentSectionImplFields,
    value: Any,
) -> BaseParentSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCodeSectionImpl,
    core: BaseCodeSectionCore,
    layering: BaseCodeSectionLayering,
    key: BaseCodeSectionImplFields,
    value: Any,
) -> BaseCodeSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseCanvasSectionImpl,
    core: BaseCanvasSectionCore,
    layering: BaseCanvasSectionLayering,
    key: BaseCanvasSectionImplFields,
    value: Any,
) -> BaseCanvasSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseArtifactSectionImpl,
    core: BaseArtifactSectionCore,
    layering: BaseArtifactSectionLayering,
    key: BaseArtifactSectionImplFields,
    value: Any,
) -> BaseArtifactSectionImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionWithParamsImpl,
    core: BaseSectionWithParamsCore,
    layering: BaseSectionWithParamsLayering,
    key: BaseSectionWithParamsImplFields,
    value: Any,
) -> BaseSectionWithParamsImpl: ...
@overload
def set_effective_impl_value(
    impl: BaseSectionImpl,
    core: BaseSectionCore,
    layering: BaseSectionLayering,
    key: BaseSectionImplFields,
    value: Any,
) -> BaseSectionImpl: ...

def set_effective_impl_value(
    impl: BaseSectionImpl | BaseCodeObjImpl,
    core: BaseSectionCore | BaseCodeObjCore,
    layering: BaseSectionLayering | BaseCodeObjLayering,
    key: str,
    value: Any,
) -> BaseSectionImpl | BaseCodeObjImpl,
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
