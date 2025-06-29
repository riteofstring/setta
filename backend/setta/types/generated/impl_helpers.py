"""
Auto-generated helper module for type-safe impl operations.

This module provides:
1. Specific overloads for each core/impl type combination
2. Helper functions that can be imported and used
"""

from typing import Any, TypeVar, Union, overload

from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
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
from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion

# Field literal imports
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
from setta.types.generated.impl_modifier_unions import AllImplModifierUnion
from setta.types.generated.section_core_unions import BaseSectionCoreUnion

# Core type imports
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
from setta.types.generated.section_type_unions import BaseSectionImplUnion
from setta.types.impl_layering import ImplLayering

TImpl = TypeVar("TImpl", bound=Union[BaseCodeObjImplUnion, BaseSectionImplUnion])


# Helper functions
def apply_modifier(
    impl: TImpl, shared_modifier: AllImplModifierUnion, modifier: AllImplModifierUnion
) -> TImpl:
    """Apply modifiers to an impl."""
    return impl.model_copy(update={**shared_modifier, **modifier}, deep=True)


@overload
def get_effective_impl(
    impl_layering: ImplLayering,
    core: BaseSectionCoreUnion,
    impl_dict: dict[str, BaseSectionImplUnion],
) -> BaseSectionImplUnion: ...


@overload
def get_effective_impl(
    impl_layering: ImplLayering,
    core: BaseCodeObjCoreUnion,
    impl_dict: dict[str, BaseCodeObjImplUnion],
) -> BaseCodeObjImplUnion: ...


def get_effective_impl(
    impl_layering: ImplLayering,
    core: Union[BaseSectionCoreUnion, BaseCodeObjCoreUnion],
    impl_dict: dict[str, Any],
) -> Any:
    """Get the effective impl by applying modifiers."""
    return apply_modifier(
        impl_dict[impl_layering.impl], core.sharedModifier, impl_layering.modifier
    )


# Specific overloads for type-safe field access
@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: CallableSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: CallableSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: DictSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: DictSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: ListRootSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: ListRootSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: DictRootSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: DictRootSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: GroupSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: GroupSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: ImageSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: ImageSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: ChartSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: ChartSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: DrawSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: DrawSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: TextBlockSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: TextBlockSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: SocialSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: SocialSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: GlobalVariablesSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: GlobalVariablesSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: CodeSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: CodeSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: GenPythonCodeSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: GenPythonCodeSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: TerminalSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: TerminalSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: IFrameSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: IFrameSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: ChatSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: ChatSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: BrowserSectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: BrowserSectionImplFields,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: CodeCallableCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: CodeCallableCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: CodeParamCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: CodeParamCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: TextParamCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: TextParamCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: SliderParamCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: SliderParamCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: SwitchParamCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: SwitchParamCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: ColorPickerParamCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: ColorPickerParamCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: DropdownParamCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: DropdownParamCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: PasswordParamCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: PasswordParamCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: NestedParamCodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: NestedParamCodeObjImplFields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


# General overloads for when specific type is not known
@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: BaseSectionCoreUnion,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: str,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: BaseCodeObjCoreUnion,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: str,
    value: Any,
) -> BaseCodeObjImplUnion: ...


# Implementation
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: Union[BaseSectionCoreUnion, BaseCodeObjCoreUnion],
    impl_dict: dict[str, Any],
    key: str,
    value: Any,
) -> Any:
    """Set a value on the effective impl, handling preset logic.

    Args:
        impl_layering: The impl layering to use
        core: The core object (section or code obj)
        impl_dict: Dictionary of impl objects
        key: The field name to set (should be a valid field for the impl type)
        value: The value to set

    Returns:
        The updated effective impl
    """
    impl = impl_dict[impl_layering.impl]

    if not impl.isPreset:
        setattr(impl, key, value)
    elif key in core.unsharedKeys:
        impl_layering.modifier[key] = value
    else:
        core.sharedModifier[key] = value

    return get_effective_impl(impl_layering, core, impl_dict)
