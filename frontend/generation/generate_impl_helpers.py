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


def generate_get_effective_impl_overload(
    impl_name: str, core_name: str, modifier_name: str
) -> str:
    """Generate a single get_effective_impl overload."""
    return f"""
@overload
def get_effective_impl(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
) -> {impl_name}: ..."""


def generate_set_effective_impl_value_overload(
    impl_name: str, core_name: str, modifier_name: str, field_literal_name: str
) -> str:
    """Generate a single set_effective_impl_value overload."""
    return f"""
@overload
def set_effective_impl_value(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
    key: {field_literal_name},
    value: Any,
) -> {impl_name}: ..."""


def generate_effective_impl_overloads():
    """Generate overloaded effective impl functions."""

    # Extract types from unions
    section_impl_types = get_union_members(BaseSectionImplUnion)
    code_obj_impl_types = get_union_members(BaseCodeObjImplUnion)

    section_impl_names = [get_type_name(t) for t in section_impl_types]
    code_obj_impl_names = [get_type_name(t) for t in code_obj_impl_types]

    # Extract type values
    section_type_values = [extract_type_value(name) for name in section_impl_names]
    code_obj_type_values = [extract_type_value(name) for name in code_obj_impl_names]

    # Build import lists
    section_impl_imports = "\n".join(f"    {name}," for name in section_impl_names)
    code_obj_impl_imports = "\n".join(f"    {name}," for name in code_obj_impl_names)

    section_core_imports = "\n".join(
        f"    {type_value}SectionCore," for type_value in section_type_values
    )
    code_obj_core_imports = "\n".join(
        f"    {type_value}CodeObjCore," for type_value in code_obj_type_values
    )

    modifier_imports = "\n".join(
        f"    {name}Modifier," for name in section_impl_names + code_obj_impl_names
    )

    field_literal_imports = "\n".join(
        f"    {name}Fields," for name in section_impl_names + code_obj_impl_names
    )

    # Generate imports using triple quotes
    imports = f"""# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import overload, Any, TypeVar

from setta.types.generated.section_type_unions import (
    BaseSectionImplUnion,
{section_impl_imports}
)

from setta.types.generated.code_obj_type_unions import (
    BaseCodeObjImplUnion,
{code_obj_impl_imports}
)

from setta.types.generated.section_core_unions import (
    BaseSectionCoreUnion,
{section_core_imports}
)

from setta.types.generated.code_obj_core_unions import (
    BaseCodeObjCoreUnion,
{code_obj_core_imports}
)

from setta.types.generated.impl_modifier_unions import (
    AllImplModifierUnion,
    BaseSectionImplModifierUnion,
    BaseCodeObjImplModifierUnion,
{modifier_imports}
)

from setta.types.generated.impl_field_literals import (
{field_literal_imports}
)
"""

    # TypeVar definition
    type_var_def = """
TImpl = TypeVar("TImpl", bound=BaseCodeObjImplUnion | BaseSectionImplUnion)


def apply_modifier(
    impl: TImpl, shared_modifier: AllImplModifierUnion, modifier: AllImplModifierUnion
) -> TImpl:
    return impl.model_copy(update={**shared_modifier, **modifier}, deep=True)
"""

    # Generate get_effective_impl overloads
    get_overloads_header = (
        "\n\n# ============== get_effective_impl overloads ==============\n"
    )

    # Generate specific overloads
    get_overloads_list = []

    # Specific section overloads
    for impl_name, type_value in zip(section_impl_names, section_type_values):
        core_name = f"{type_value}SectionCore"
        modifier_name = f"{impl_name}Modifier"
        get_overloads_list.append(
            generate_get_effective_impl_overload(impl_name, core_name, modifier_name)
        )

    # Specific code obj overloads
    for impl_name, type_value in zip(code_obj_impl_names, code_obj_type_values):
        core_name = f"{type_value}CodeObjCore"
        modifier_name = f"{impl_name}Modifier"
        get_overloads_list.append(
            generate_get_effective_impl_overload(impl_name, core_name, modifier_name)
        )

    get_overloads_specific = "".join(get_overloads_list)

    # Base overloads (for union types)
    get_overloads_base = """

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
"""

    # get_effective_impl implementation
    get_impl = """

def get_effective_impl(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    modifier: AllImplModifierUnion,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    \"\"\"Get the effective implementation by applying modifiers.
    
    The overloaded signatures above provide type-safe usage for each specific
    impl/core/modifier combination.
    \"\"\"
    return apply_modifier(impl, core.sharedModifier, modifier)
"""

    # Generate set_effective_impl_value overloads
    set_overloads_header = (
        "\n\n# ============== set_effective_impl_value overloads ==============\n"
    )

    # Generate specific overloads
    set_overloads_list = []

    # Specific section overloads
    for impl_name, type_value in zip(section_impl_names, section_type_values):
        core_name = f"{type_value}SectionCore"
        modifier_name = f"{impl_name}Modifier"
        field_literal_name = f"{impl_name}Fields"
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(
                impl_name, core_name, modifier_name, field_literal_name
            )
        )

    # Specific code obj overloads
    for impl_name, type_value in zip(code_obj_impl_names, code_obj_type_values):
        core_name = f"{type_value}CodeObjCore"
        modifier_name = f"{impl_name}Modifier"
        field_literal_name = f"{impl_name}Fields"
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(
                impl_name, core_name, modifier_name, field_literal_name
            )
        )

    set_overloads_specific = "".join(set_overloads_list)

    # Base overloads (for union types)
    set_overloads_base = """

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
"""

    # set_effective_impl_value implementation
    set_impl = """

def set_effective_impl_value(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    modifier: AllImplModifierUnion,
    key: str,
    value: Any,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    \"\"\"Set a value in the effective implementation.
    
    The value is set in the appropriate location based on:
    - If impl is not a preset: directly on the impl
    - If key is in unsharedKeys: in the modifier
    - Otherwise: in the core's sharedModifier
    
    The overloaded signatures above provide type-safe field names for each
    specific impl type.
    \"\"\"
    if not impl.isPreset:
        setattr(impl, key, value)
    elif key in core.unsharedKeys:
        modifier[key] = value
    else:
        core.sharedModifier[key] = value
    return get_effective_impl(impl, core, modifier)
"""

    # Combine all parts
    return (
        imports
        + type_var_def
        + get_overloads_header
        + get_overloads_specific
        + get_overloads_base
        + get_impl
        + set_overloads_header
        + set_overloads_specific
        + set_overloads_base
        + set_impl
    )


def main(output_folder: Path):
    """Generate effective impl overloads."""
    # Generate the code
    code = generate_effective_impl_overloads()

    # Format with ruff
    formatted = ruff_format(code)

    # Write output
    output_file = output_folder / "impl_helpers.py"
    output_file.write_text(formatted)
    print(f"Generated effective impl overloads in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
