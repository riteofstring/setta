from pathlib import Path
from typing import get_args

from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
from setta.types.generated.section_type_unions import BaseSectionImplUnion
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_cores import (
    EXCLUSIONS,
    get_all_field_names,
)


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


def generate_overload_params(
    type_value: str,
    impl_class,
    is_section: bool,
) -> str:
    """Generate parameter list for a specific overload."""

    # Get all field names for the impl class
    field_names = get_all_field_names(impl_class)

    # Sort field names for consistent output
    sorted_fields = sorted(field_names)

    # Create the Literal type string for unsharedKeys
    literal_values = ", ".join(
        f'"{field}"' for field in sorted_fields if field not in EXCLUSIONS
    )

    modifier_type = f"{impl_class.__name__}Modifier"
    enum_type = "SectionType" if is_section else "CodeObjType"

    params = f"""
    type_: Literal[{enum_type}.{type_value}],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: {modifier_type} | None = None,
    unsharedKeys: set[Literal[{literal_values}]] | None = None"""

    return params


def generate_conversion_functions():
    """Generate type to core conversion functions."""

    # Extract types from unions
    section_impl_types = get_union_members(BaseSectionImplUnion)
    code_obj_impl_types = get_union_members(BaseCodeObjImplUnion)

    section_impl_names = [get_type_name(t) for t in section_impl_types]
    code_obj_impl_names = [get_type_name(t) for t in code_obj_impl_types]

    # Extract type values
    section_type_values = [extract_type_value(name) for name in section_impl_names]
    code_obj_type_values = [extract_type_value(name) for name in code_obj_impl_names]

    # Generate imports using triple quotes
    imports = """from typing import Union, overload, Literal, Any

from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType

"""

    # Core imports - section cores
    section_core_imports = []
    for impl_name in section_impl_names:
        type_value = extract_type_value(impl_name)
        core_name = type_value + "SectionCore"
        section_core_imports.append(f"    {core_name},")
    section_core_imports_str = "\n".join(section_core_imports)

    imports += f"""from setta.types.generated.section_cores import (
{section_core_imports_str}
)

"""

    # Core imports - code obj cores
    code_obj_core_imports = []
    for impl_name in code_obj_impl_names:
        type_value = extract_type_value(impl_name)
        core_name = type_value + "CodeObjCore"
        code_obj_core_imports.append(f"    {core_name},")
    code_obj_core_imports_str = "\n".join(code_obj_core_imports)

    imports += f"""from setta.types.generated.code_obj_cores import (
{code_obj_core_imports_str}
)

"""

    # Modifier imports
    modifier_imports = []
    for impl_name in section_impl_names:
        modifier_name = impl_name + "Modifier"
        modifier_imports.append(f"    {modifier_name},")
    for impl_name in code_obj_impl_names:
        modifier_name = impl_name + "Modifier"
        modifier_imports.append(f"    {modifier_name},")
    modifier_imports_str = "\n".join(modifier_imports)

    imports += f"""from setta.types.generated.impl_modifiers import (
{modifier_imports_str}
)

"""

    # Union imports
    imports += """from setta.types.generated.section_core_unions import BaseSectionCoreUnion
from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
"""

    # Import the impl classes for introspection
    import setta.types.code_obj_impls
    import setta.types.section_impls

    # Generate section type to core overloads
    section_overloads = "\n# Overloads for section type to core conversion"

    for type_value, impl_name in zip(section_type_values, section_impl_names):
        core_name = type_value + "SectionCore"
        # Get the impl class
        impl_class = getattr(setta.types.section_impls, impl_name)

        params = generate_overload_params(type_value, impl_class, True)
        section_overloads += f"""
@overload
def create_core_for_section_type({params}
) -> {core_name}: ..."""

    # General section overload - using the same signature as implementation
    section_overloads += """
@overload
def create_core_for_section_type(
    type_: SectionType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None
) -> BaseSectionCoreUnion: ...
"""

    # Generate section type to core function
    section_function = """

def create_core_for_section_type(
    type_: SectionType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None
) -> BaseSectionCoreUnion:
    \"\"\"Create a SectionCore for the given SectionType.
    
    Args:
        type_: The SectionType enum value
        id: Optional custom ID for the core
        name: Optional custom name for the core
        implLayerings: Optional implementation layering IDs
        defaultImplLayering: Optional default layering ID
        sharedModifier: Optional modifier (must match the type)
        unsharedKeys: Optional set of keys to exclude from sharing
    
    The overloaded signatures above provide full type checking for each specific
    SectionType with properly typed parameters.
    \"\"\"
    # Build kwargs dict with only non-None values
    core_kwargs = {}
    
    if id is not None:
        core_kwargs['id'] = id
    if name is not None:
        core_kwargs['name'] = name
    if implLayerings is not None:
        core_kwargs['implLayerings'] = implLayerings
    if defaultImplLayering is not None:
        core_kwargs['defaultImplLayering'] = defaultImplLayering
    if sharedModifier is not None:
        core_kwargs['sharedModifier'] = sharedModifier
    if unsharedKeys is not None:
        core_kwargs['unsharedKeys'] = unsharedKeys
"""

    # Generate section cases
    first = True
    for type_value in section_type_values:
        core_name = type_value + "SectionCore"
        if first:
            section_function += f"""
    if type_ == SectionType.{type_value}:
        return {core_name}(**core_kwargs)"""
            first = False
        else:
            section_function += f"""
    elif type_ == SectionType.{type_value}:
        return {core_name}(**core_kwargs)"""

    # Error case
    section_function += """
    else:
        raise ValueError(f"Unknown section type: {type_}")"""

    # Generate code obj type to core overloads
    code_obj_overloads = "\n\n\n# Overloads for code obj type to core conversion"

    for type_value, impl_name in zip(code_obj_type_values, code_obj_impl_names):
        core_name = type_value + "CodeObjCore"
        # Get the impl class
        impl_class = getattr(setta.types.code_obj_impls, impl_name)

        params = generate_overload_params(type_value, impl_class, False)
        code_obj_overloads += f"""
@overload
def create_core_for_code_obj_type({params}
) -> {core_name}: ..."""

    # General code obj overload
    code_obj_overloads += """
@overload
def create_core_for_code_obj_type(
    type_: CodeObjType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None
) -> BaseCodeObjCoreUnion: ...
"""

    # Generate code obj type to core function
    code_obj_function = """

def create_core_for_code_obj_type(
    type_: CodeObjType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None
) -> BaseCodeObjCoreUnion:
    \"\"\"Create a CodeObjCore for the given CodeObjType.
    
    Args:
        type_: The CodeObjType enum value
        id: Optional custom ID for the core
        name: Optional custom name for the core
        implLayerings: Optional implementation layering IDs
        defaultImplLayering: Optional default layering ID
        sharedModifier: Optional modifier (must match the type)
        unsharedKeys: Optional set of keys to exclude from sharing
    
    The overloaded signatures above provide full type checking for each specific
    CodeObjType with properly typed parameters.
    \"\"\"
    # Build kwargs dict with only non-None values
    core_kwargs = {}
    
    if id is not None:
        core_kwargs['id'] = id
    if name is not None:
        core_kwargs['name'] = name
    if implLayerings is not None:
        core_kwargs['implLayerings'] = implLayerings
    if defaultImplLayering is not None:
        core_kwargs['defaultImplLayering'] = defaultImplLayering
    if sharedModifier is not None:
        core_kwargs['sharedModifier'] = sharedModifier
    if unsharedKeys is not None:
        core_kwargs['unsharedKeys'] = unsharedKeys
"""

    # Generate code obj cases
    first = True
    for type_value in code_obj_type_values:
        core_name = type_value + "CodeObjCore"
        if first:
            code_obj_function += f"""
    if type_ == CodeObjType.{type_value}:
        return {core_name}(**core_kwargs)"""
            first = False
        else:
            code_obj_function += f"""
    elif type_ == CodeObjType.{type_value}:
        return {core_name}(**core_kwargs)"""

    # Error case
    code_obj_function += """
    else:
        raise ValueError(f"Unknown code obj type: {type_}")"""

    # Combine all parts
    return (
        imports
        + section_overloads
        + section_function
        + code_obj_overloads
        + code_obj_function
    )


def main(output_folder):
    generated_code = generate_conversion_functions()

    # Format with ruff
    formatted = ruff_format(generated_code)

    output_file = output_folder / "type_to_core.py"
    with open(output_file, "w") as f:
        f.write(formatted)

    print(f"Generated type to core conversion functions written to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
