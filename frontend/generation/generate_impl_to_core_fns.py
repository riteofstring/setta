from pathlib import Path
from typing import get_args

from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
from setta.types.generated.section_type_unions import BaseSectionImplUnion
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
    imports = """from typing import Union, overload, Literal

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

    # Union imports
    imports += """from setta.types.generated.section_core_unions import BaseSectionCoreUnion
from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
"""

    # Generate section type to core overloads
    section_overloads = "\n# Overloads for section type to core conversion"

    for type_value in section_type_values:
        core_name = type_value + "SectionCore"
        section_overloads += f"""
@overload
def create_core_for_section_type(type_: Literal[SectionType.{type_value}], **kwargs) -> {core_name}: ..."""

    # General section overload
    section_overloads += """
@overload
def create_core_for_section_type(type_: SectionType, **kwargs) -> BaseSectionCoreUnion: ...
"""

    # Generate section type to core function
    section_function = """

def create_core_for_section_type(type_: SectionType, **kwargs) -> BaseSectionCoreUnion:
    \"\"\"Create a SectionCore for the given SectionType.
    
    Args:
        type_: The SectionType enum value
        **kwargs: Additional arguments to pass to the core constructor
            (e.g., id, name, sharedModifier, unsharedKeys)
    
    Returns:
        A new SectionCore instance of the appropriate type
    \"\"\"
"""

    # Generate section cases
    first = True
    for type_value in section_type_values:
        core_name = type_value + "SectionCore"
        if first:
            section_function += f"""    if type_ == SectionType.{type_value}:
        return {core_name}(**kwargs)"""
            first = False
        else:
            section_function += f"""
    elif type_ == SectionType.{type_value}:
        return {core_name}(**kwargs)"""

    # Error case
    section_function += """
    else:
        raise ValueError(f"Unknown section type: {type_}")"""

    # Generate code obj type to core overloads
    code_obj_overloads = "\n\n\n# Overloads for code obj type to core conversion"

    for type_value in code_obj_type_values:
        core_name = type_value + "CodeObjCore"
        code_obj_overloads += f"""
@overload
def create_core_for_code_obj_type(type_: Literal[CodeObjType.{type_value}], **kwargs) -> {core_name}: ..."""

    # General code obj overload
    code_obj_overloads += """
@overload
def create_core_for_code_obj_type(type_: CodeObjType, **kwargs) -> BaseCodeObjCoreUnion: ...
"""

    # Generate code obj type to core function
    code_obj_function = """

def create_core_for_code_obj_type(type_: CodeObjType, **kwargs) -> BaseCodeObjCoreUnion:
    \"\"\"Create a CodeObjCore for the given CodeObjType.
    
    Args:
        type_: The CodeObjType enum value
        **kwargs: Additional arguments to pass to the core constructor
            (e.g., id, name, sharedModifier, unsharedKeys)
    
    Returns:
        A new CodeObjCore instance of the appropriate type
    \"\"\"
"""

    # Generate code obj cases
    first = True
    for type_value in code_obj_type_values:
        core_name = type_value + "CodeObjCore"
        if first:
            code_obj_function += f"""    if type_ == CodeObjType.{type_value}:
        return {core_name}(**kwargs)"""
            first = False
        else:
            code_obj_function += f"""
    elif type_ == CodeObjType.{type_value}:
        return {core_name}(**kwargs)"""

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

    output_file = output_folder / "type_to_core.py"
    with open(output_file, "w") as f:
        f.write(generated_code)

    print(f"Generated type to core conversion functions written to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
