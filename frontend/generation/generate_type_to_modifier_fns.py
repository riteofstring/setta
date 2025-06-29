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
    """Generate type to modifier conversion functions."""

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
    imports += """from setta.types.generated.impl_modifier_unions import (
    BaseSectionImplModifierUnion,
    BaseCodeObjImplModifierUnion,
)
"""

    # Generate section type to modifier overloads
    section_overloads = "\n# Overloads for section type to modifier conversion"

    for type_value, impl_name in zip(section_type_values, section_impl_names):
        modifier_name = impl_name + "Modifier"
        section_overloads += f"""
@overload
def create_modifier_for_section_type(type_: Literal[SectionType.{type_value}]) -> {modifier_name}: ..."""

    # General section overload
    section_overloads += """
@overload
def create_modifier_for_section_type(type_: SectionType) -> BaseSectionImplModifierUnion: ...
"""

    # Generate section type to modifier function
    section_function = """

def create_modifier_for_section_type(type_: SectionType) -> BaseSectionImplModifierUnion:
    \"\"\"Create a SectionImplModifier for the given SectionType.\"\"\"
"""

    # Generate section cases
    first = True
    for type_value, impl_name in zip(section_type_values, section_impl_names):
        modifier_name = impl_name + "Modifier"
        if first:
            section_function += f"""    if type_ == SectionType.{type_value}:
        return {modifier_name}(type=type_)"""
            first = False
        else:
            section_function += f"""
    elif type_ == SectionType.{type_value}:
        return {modifier_name}(type=type_)"""

    # Error case
    section_function += """
    else:
        raise ValueError(f"Unknown section type: {type_}")"""

    # Generate code obj type to modifier overloads
    code_obj_overloads = "\n\n\n# Overloads for code obj type to modifier conversion"

    for type_value, impl_name in zip(code_obj_type_values, code_obj_impl_names):
        modifier_name = impl_name + "Modifier"
        code_obj_overloads += f"""
@overload
def create_modifier_for_code_obj_type(type_: Literal[CodeObjType.{type_value}]) -> {modifier_name}: ..."""

    # General code obj overload
    code_obj_overloads += """
@overload
def create_modifier_for_code_obj_type(type_: CodeObjType) -> BaseCodeObjImplModifierUnion: ...
"""

    # Generate code obj type to modifier function
    code_obj_function = """

def create_modifier_for_code_obj_type(type_: CodeObjType) -> BaseCodeObjImplModifierUnion:
    \"\"\"Create a CodeObjImplModifier for the given CodeObjType.\"\"\"
"""

    # Generate code obj cases
    first = True
    for type_value, impl_name in zip(code_obj_type_values, code_obj_impl_names):
        modifier_name = impl_name + "Modifier"
        if first:
            code_obj_function += f"""    if type_ == CodeObjType.{type_value}:
        return {modifier_name}(type=type_)"""
            first = False
        else:
            code_obj_function += f"""
    elif type_ == CodeObjType.{type_value}:
        return {modifier_name}(type=type_)"""

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

    output_file = output_folder / "type_to_modifier.py"
    with open(output_file, "w") as f:
        f.write(generated_code)

    print(f"Generated type to modifier conversion functions written to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
