from pathlib import Path

import setta.types.code_obj_impls
import setta.types.generated.cores
import setta.types.generated.layerings
import setta.types.generated.modifiers
import setta.types.section_impls
from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import get_impl_classes, get_name_without_impl, python_type_to_str


def create_modifier(impl_class: type[BaseModel], base_classes):
    name = impl_class.__name__
    attributes = []
    for field_name, field_info in impl_class.model_fields.items():
        # Skip if field is in exclusions for base class
        if impl_class in base_classes and field_name in ["id", "name", "isPreset"]:
            continue

        # For non-base classes, skip if field is defined in ANY parent class (except type)
        if impl_class not in base_classes and field_name != "type":
            field_in_parent = False
            for parent in impl_class.__bases__:
                if (
                    hasattr(parent, "model_fields")
                    and field_name in parent.model_fields
                ):
                    field_in_parent = True
                    break
            if field_in_parent:
                continue

        annotation = python_type_to_str(field_info.annotation)
        if field_name != "type":
            annotation = f"NotRequired[{annotation}]"
        attributes.append(f"{field_name}: {annotation}")

    attributes = "\n\t".join(attributes)
    attributes = f"\t{attributes}"

    if impl_class in base_classes:
        parent_class = "TypedDict"
    else:
        # Handle multiple inheritance
        parent_classes = []
        for parent in impl_class.__bases__:
            if hasattr(parent, "model_fields"):  # Only include Pydantic model parents
                parent_classes.append(
                    f"{get_name_without_impl(parent.__name__)}Modifier"
                )
        parent_class = ", ".join(parent_classes)

    name = get_name_without_impl(name)
    code = f"""
class {name}Modifier({parent_class}):
{attributes}
"""
    return code


def generate_modifiers(output_file, classes):
    code = """
from typing import TypedDict, Literal, Any, NotRequired, overload
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
    for c in classes:
        code += create_modifier(
            c,
            [
                setta.types.section_impls.BaseSectionImpl,
                setta.types.code_obj_impls.BaseCodeObjImpl,
            ],
        )

    cases = {}
    for c in classes:
        if c.model_fields["type"].default is PydanticUndefined:
            continue
        modifier_name = f"{get_name_without_impl(c.__name__)}Modifier"
        type_attribute = python_type_to_str(c.model_fields["type"].annotation)
        default_val = c.model_fields["type"].default
        cases[f"{default_val.__class__.__name__}.{default_val.value}"] = modifier_name
        code += f"""
@overload
def create_modifier(type_: {type_attribute}) -> {modifier_name}:
    ...
"""

    cases_str = []
    for type_name, modifier_name in cases.items():
        curr_case = f"""
        case {type_name}:
            return {modifier_name}(type=type_)
        """
        cases_str.append(curr_case)

    code += f"""
def create_modifier(type_: SectionType | CodeObjType):
    match type_:
{"\n".join(cases_str)}
"""
    code = ruff_format(code)
    output_file.write_text(code)


if __name__ == "__main__":
    classes = get_impl_classes()
    generate_modifiers(
        get_absolute_path(
            __file__, Path("../../backend/setta/types/generated") / "modifiers.py"
        ),
        classes,
    )
