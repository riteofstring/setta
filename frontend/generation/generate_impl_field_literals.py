from pathlib import Path

from pydantic import BaseModel
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_backend_union_types import find_sub_classes

EXCLUSIONS = set(["id", "name", "type", "isPreset"])


def get_all_field_names(impl_class: type[BaseModel]) -> set[str]:
    """Get all field names for a class, including inherited fields."""
    field_names = set()

    # Get fields from the class and all its parent classes
    for cls in impl_class.__mro__:
        if issubclass(cls, BaseModel) and cls is not BaseModel:
            field_names.update(cls.model_fields.keys())

    return field_names


def generate_field_literal_type(impl_class_name: str, field_names: set[str]) -> str:
    """Generate a Literal type alias for impl fields."""
    # Sort field names for consistent output
    sorted_fields = sorted(field_names)

    # Create the Literal values, excluding the standard exclusions
    literal_values = ", ".join(
        f'"{field}"' for field in sorted_fields if field not in EXCLUSIONS
    )

    # Generate the type alias name and definition
    type_alias_name = f"{impl_class_name}Fields"
    return f"{type_alias_name} = Literal[{literal_values}]"


def generate_impl_field_literals() -> str:
    """Generate Literal type aliases for all impl classes."""
    import setta.types.code_obj_impls
    import setta.types.section_impls

    # Get all section impl classes (including base classes)
    section_base_classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        True,  # Base classes
        False,
    )
    section_concrete_classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        False,  # Concrete classes
        False,
    )
    section_classes = (
        [setta.types.section_impls.BaseSectionImpl]
        + section_base_classes
        + section_concrete_classes
    )

    # Get all code obj impl classes (including base classes)
    code_obj_base_classes = find_sub_classes(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        True,  # Base classes
        False,
    )
    code_obj_concrete_classes = find_sub_classes(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        False,  # Concrete classes
        False,
    )
    code_obj_classes = (
        [setta.types.code_obj_impls.BaseCodeObjImpl]
        + code_obj_base_classes
        + code_obj_concrete_classes
    )

    # Generate header
    header = """# Auto-generated Literal type aliases for impl fields - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal


# Section implementation field literals
"""

    # Generate section field literals
    section_literals = []
    for cls in section_classes:
        field_names = get_all_field_names(cls)
        literal_def = generate_field_literal_type(cls.__name__, field_names)
        section_literals.append(literal_def)

    # Generate code obj field literals
    code_obj_literals_header = "\n\n# Code object implementation field literals\n"
    code_obj_literals = []
    for cls in code_obj_classes:
        field_names = get_all_field_names(cls)
        literal_def = generate_field_literal_type(cls.__name__, field_names)
        code_obj_literals.append(literal_def)

    # Combine all parts
    section_literals_str = "\n".join(section_literals)
    code_obj_literals_str = "\n".join(code_obj_literals)

    return (
        header + section_literals_str + code_obj_literals_header + code_obj_literals_str
    )


def main(output_folder: Path):
    """Generate impl field literal types."""
    # Generate the code
    code = generate_impl_field_literals()

    # Format with ruff
    formatted = ruff_format(code)

    # Write output
    output_file = output_folder / "impl_field_literals.py"
    output_file.write_text(formatted)
    print(f"Generated impl field literal types in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
