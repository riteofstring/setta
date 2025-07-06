from pathlib import Path

from pydantic import BaseModel
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import ImplClassInfoForGeneration, get_impl_classes


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
        f'"{field}"'
        for field in sorted_fields
        if field not in ["id", "name", "type", "isPreset"]
    )

    # Generate the type alias name and definition
    type_alias_name = f"{impl_class_name}Fields"
    return f"{type_alias_name} = Literal[{literal_values}]"


def generate_impl_field_literals(
    output_file, classes: dict[str, ImplClassInfoForGeneration]
):
    # Generate header
    header = """# Auto-generated Literal type aliases for impl fields - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal
"""

    literals = []
    for cls_name, cls_info in classes.items():
        field_names = get_all_field_names(cls_info.class_obj)
        literal_def = generate_field_literal_type(cls_name, field_names)
        literals.append(literal_def)
    literals = "\n".join(literals)

    code = header + literals
    code = ruff_format(code)
    output_file.write_text(code)


if __name__ == "__main__":
    classes = get_impl_classes()
    generate_impl_field_literals(
        get_absolute_path(
            __file__,
            Path("../../backend/setta/types/generated") / "impl_field_literals.py",
        ),
        classes,
    )
