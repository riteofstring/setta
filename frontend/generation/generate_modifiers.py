from pathlib import Path

import setta.types.code_obj_impls
import setta.types.section_impls
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    BaseClassInfoForGeneration,
    ImplClassInfoForGeneration,
    get_impl_classes,
    python_type_to_str,
)


def create_model_args_as_typed_dict(
    class_info: BaseClassInfoForGeneration,
    base_classes,
    typed_dict_name,
    typed_dict_parent_names,
    exclusions: list[str] | None = None,
    required_args: list[str] | None = None,
    include_callable_with_type=False,
):
    if exclusions is None:
        exclusions = []
    if required_args is None:
        required_args = []
    attributes = []
    for field_name, field_info in class_info.class_obj.model_fields.items():
        # Skip if field is in exclusions for base class
        if class_info.class_obj in base_classes and field_name in exclusions:
            continue

        # For non-base classes, skip if field is defined in ANY parent class (except type)
        if class_info.class_obj not in base_classes and field_name != "type":
            field_in_parent = False
            for parent in class_info.parents:
                if (
                    hasattr(parent, "model_fields")
                    and field_name in parent.model_fields
                ):
                    field_in_parent = True
                    break
            if field_in_parent:
                continue

        annotation = python_type_to_str(field_info.annotation)
        if include_callable_with_type:
            annotation += f" | Callable[[{annotation}], {annotation}]"
        if field_name not in required_args:
            annotation = f"NotRequired[{annotation}]"
        attributes.append(f"{field_name}: {annotation}")

    attributes = "\n\t".join(attributes)
    attributes = f"\t{attributes}"

    if class_info.class_obj in base_classes:
        parent_class = "TypedDict"
    else:
        parent_class = ", ".join(typed_dict_parent_names)

    code = f"""
class {typed_dict_name}({parent_class}):
{attributes}
"""
    return code


def get_imports_str():
    return """
from typing import TypedDict, Literal, Any, NotRequired, overload, Callable
from setta.types.section_impls import (
    ChartSettings,
    DrawAreaCanvasSettings,
    SectionSize,
    Visibility,
    CodeLanguage,
    ConfigLanguage,
    TextBlockDisplayMode,
    TextBlockFormat,
    SectionType,
    SectionSizeMode
)
from setta.types.code_obj_impls import (
    ParameterPassingStyle,
    ParamNameType,
    ColorPickerChoice,
    CodeObjType
)

"""


def generate_impl_args_as_typed_dicts(
    output_file, classes: dict[str, ImplClassInfoForGeneration]
):
    code = get_imports_str()
    for c in classes.values():
        code += create_model_args_as_typed_dict(
            c,
            [
                setta.types.section_impls.BaseSectionImpl,
                setta.types.code_obj_impls.BaseCodeObjImpl,
            ],
            c.args_name,
            c.parent_args_class_names,
        )

        code += create_model_args_as_typed_dict(
            c,
            [
                setta.types.section_impls.BaseSectionImpl,
                setta.types.code_obj_impls.BaseCodeObjImpl,
            ],
            c.args_with_callable_name,
            c.parent_args_with_callable_class_names,
            include_callable_with_type=True,
        )

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    generate_impl_args_as_typed_dicts(
        get_absolute_path(
            __file__,
            Path("../../backend/setta/types/generated") / "impl_args_as_typed_dicts.py",
        ),
        get_impl_classes(),
    )
