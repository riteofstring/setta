from pathlib import Path

import setta.types.code_obj_impls
import setta.types.generated.cores
import setta.types.generated.layerings
import setta.types.generated.modifiers
import setta.types.section_impls
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    ImplClassInfoForGeneration,
    get_creation_fns,
    get_impl_classes,
    python_type_to_str,
)


def create_modifier(class_info: ImplClassInfoForGeneration, base_classes):
    attributes = []
    for field_name, field_info in class_info.class_obj.model_fields.items():
        # Skip if field is in exclusions for base class
        if class_info.class_obj in base_classes and field_name in [
            "id",
            "name",
            "isPreset",
        ]:
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
        if field_name != "type":
            annotation = f"NotRequired[{annotation}]"
        attributes.append(f"{field_name}: {annotation}")

    attributes = "\n\t".join(attributes)
    attributes = f"\t{attributes}"

    if class_info.class_obj in base_classes:
        parent_class = "TypedDict"
    else:
        parent_class = ", ".join(class_info.parent_modifier_class_names)

    code = f"""
class {class_info.modifier_name}({parent_class}):
{attributes}
"""
    return code


def generate_modifiers(output_file, classes: dict[str, ImplClassInfoForGeneration]):
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
    for c in classes.values():
        code += create_modifier(
            c,
            [
                setta.types.section_impls.BaseSectionImpl,
                setta.types.code_obj_impls.BaseCodeObjImpl,
            ],
        )

    code += get_creation_fns(classes, "modifier")
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
