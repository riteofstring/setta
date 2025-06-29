from pathlib import Path
from typing import get_args

from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
from setta.types.generated.section_type_unions import BaseSectionImplUnion
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


def get_union_members(union_type):
    """Extract member types from a Union type."""
    return get_args(union_type)


def get_type_name(type_obj):
    """Get the name of a type object."""
    return type_obj.__name__


def extract_type_value(impl_name):
    """Extract the enum value from impl class name (e.g., CallableSectionImpl -> Callable)."""
    if impl_name.endswith("SectionImpl"):
        return impl_name[:-11]  # Remove "SectionImpl"
    elif impl_name.endswith("CodeObjImpl"):
        return impl_name[:-11]  # Remove "CodeObjImpl"
    else:
        raise ValueError(f"Unexpected impl name format: {impl_name}")


def main(output_folder: Path):
    """Generate a Python file containing type-safe overloads and helpers."""

    # Extract types from unions
    section_impl_types = get_union_members(BaseSectionImplUnion)
    code_obj_impl_types = get_union_members(BaseCodeObjImplUnion)

    section_impl_names = [get_type_name(t) for t in section_impl_types]
    code_obj_impl_names = [get_type_name(t) for t in code_obj_impl_types]

    # Build the complete file content
    content = '''"""
Auto-generated helper module for type-safe impl operations.

This module provides:
1. Specific overloads for each core/impl type combination
2. Helper functions that can be imported and used
"""

from typing import overload, Any, Union, TypeVar, cast

from setta.types.impl_layering import ImplLayering
from setta.types.generated.section_type_unions import BaseSectionImplUnion
from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
from setta.types.generated.section_core_unions import BaseSectionCoreUnion
from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
from setta.types.generated.impl_modifier_unions import AllImplModifierUnion

'''

    # Add specific core imports
    content += "# Core type imports\n"
    content += "from setta.types.generated.section_cores import (\n"
    for impl_name in section_impl_names:
        type_value = extract_type_value(impl_name)
        content += f"    {type_value}SectionCore,\n"
    content += ")\n\n"

    content += "from setta.types.generated.code_obj_cores import (\n"
    for impl_name in code_obj_impl_names:
        type_value = extract_type_value(impl_name)
        content += f"    {type_value}CodeObjCore,\n"
    content += ")\n\n"

    # Add field literal imports
    content += "# Field literal imports\n"
    content += "from setta.types.generated.impl_field_literals import (\n"
    for impl_name in section_impl_names + code_obj_impl_names:
        content += f"    {impl_name}Fields,\n"
    content += ")\n\n"

    # Add TypeVar
    content += 'TImpl = TypeVar("TImpl", bound=Union[BaseCodeObjImplUnion, BaseSectionImplUnion])\n\n\n'

    # Add helper functions
    content += '''# Helper functions
def apply_modifier(
    impl: TImpl, 
    shared_modifier: AllImplModifierUnion, 
    modifier: AllImplModifierUnion
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
        impl_dict[impl_layering.impl], 
        core.sharedModifier, 
        impl_layering.modifier
    )


'''

    # Generate specific overloads for sections
    content += "# Specific overloads for type-safe field access\n"
    for impl_name in section_impl_names:
        type_value = extract_type_value(impl_name)
        content += f"""@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: {type_value}SectionCore,
    impl_dict: dict[str, BaseSectionImplUnion],
    key: {impl_name}Fields,
    value: Any,
) -> BaseSectionImplUnion: ...


"""

    # Generate specific overloads for code objs
    for impl_name in code_obj_impl_names:
        type_value = extract_type_value(impl_name)
        content += f"""@overload
def set_effective_impl_value(
    impl_layering: ImplLayering,
    core: {type_value}CodeObjCore,
    impl_dict: dict[str, BaseCodeObjImplUnion],
    key: {impl_name}Fields,
    value: Any,
) -> BaseCodeObjImplUnion: ...


"""

    # Add general overloads
    content += '''# General overloads for when specific type is not known
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
'''

    # Format and write
    formatted = ruff_format(content)
    output_file = output_folder / "impl_helpers.py"
    output_file.write_text(formatted)
    print(f"Generated impl helper module in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
