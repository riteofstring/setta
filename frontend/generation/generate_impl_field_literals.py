from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import ImplClassInfoForGeneration, get_impl_classes


def generate_field_literal_type(impl_class_name: str, field_names: set[str]) -> str:
    """Generate a Literal type alias for impl fields."""
    sorted_fields = sorted(field_names)
    literal_values = ", ".join(f'"{field}"' for field in sorted_fields)
    type_alias_name = f"{impl_class_name}Fields"
    return f"{type_alias_name} = Literal[{literal_values}]"


def generate_all_impl_field_literals(
    output_file, classes: dict[str, ImplClassInfoForGeneration]
):
    # Generate header
    header = """
from typing import Literal
"""

    field_names = set()
    for cls_name, cls_info in classes.items():
        for parent in cls_info.parent_classes_up_to_base_model:
            field_names.update(parent.model_fields.keys())
    literal_def = generate_field_literal_type("AllImpl", field_names)

    code = header + literal_def
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    classes = get_impl_classes()
    generate_all_impl_field_literals(
        get_absolute_path(
            __file__,
            Path("../../backend/setta/types/generated") / "impl_field_literals.py",
        ),
        classes,
    )
