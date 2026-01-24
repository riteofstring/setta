from pathlib import Path

import setta.types.code_obj_impls
import setta.types.core
import setta.types.project_config
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
    model_class,
    typed_dict_name: str,
    required_args: list[str],
    include_callable_with_type: bool,
    is_base_class: bool,
    typed_dict_parent_names: list[str] | None = None,
    condition_callback=None,
):
    attributes = []
    for field_name, field_info in model_class.model_fields.items():
        if condition_callback and condition_callback(field_name):
            continue
        annotation = python_type_to_str(field_info.annotation)
        if include_callable_with_type:
            annotation += f" | Callable[[{annotation}], {annotation}]"
        if field_name not in required_args:
            annotation = f"NotRequired[{annotation}]"
        attributes.append(f"{field_name}: {annotation}")

    attributes = "\n\t".join(attributes)
    attributes = f"\t{attributes}"

    if is_base_class:
        parent_class = "TypedDict"
    elif typed_dict_parent_names is not None:
        parent_class = ", ".join(typed_dict_parent_names)
    else:
        raise ValueError

    code = f"""
class {typed_dict_name}({parent_class}):
{attributes}
"""
    return code


def create_impl_model_args_as_typed_dict(
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

    def condition_callback(field_name):
        # Skip if field is in exclusions for base class
        if class_info.class_obj in base_classes and field_name in exclusions:
            return True

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
                return True

        return False

    return create_model_args_as_typed_dict(
        model_class=class_info.class_obj,
        typed_dict_name=typed_dict_name,
        required_args=required_args,
        include_callable_with_type=include_callable_with_type,
        is_base_class=class_info.class_obj in base_classes,
        typed_dict_parent_names=typed_dict_parent_names,
        condition_callback=condition_callback,
    )


def get_imports_str():
    return """
from typing import TypedDict, Literal, Any, NotRequired, overload, Callable
from setta.types.id import ID
from setta.types.core import Core
from setta.types.artifact import LineChartSettings, ScatterChartSettings
from setta.types.artifact import DrawAreaBrushShape, DrawAreaLayer, DrawAreaMode
from setta.types.section_impls import (
    SectionSize,
    CodeLanguage,
    ConfigLanguage,
    TextBlockDisplayMode,
    TextBlockFormat,
    PromptFormat,
    SectionType,
    SectionSizeMode,
    SectionWithParamsDisplayMode,
    BrowserAreaViewMode,
    BrowserAreaItem,
    CodeFileBinding,
    TypeErrorIgnoreState
)
from setta.types.code_obj_impls import (
    ParameterPassingStyle,
    ParamNameType,
    ColorPickerChoice,
    CodeObjType,
    ButtonActionMode,
    HttpRequestMethod,
)
from setta.types.edges import Edge, EdgePort
from setta.types.chat_messages import (
    AssistantChatMessage,
    SystemChatMessage,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout, Viewport, ViewingEditingMode, ViewModeConfig
from setta.types.generated.shared_modifier import SharedModifier

"""


def generate_impl_args_as_typed_dicts(
    output_file, classes: dict[str, ImplClassInfoForGeneration]
):
    code = get_imports_str()
    code += create_model_args_as_typed_dict(
        model_class=setta.types.core.Core,
        typed_dict_name="CoreArgs",
        required_args=[],
        include_callable_with_type=False,
        is_base_class=True,
    )
    code += create_model_args_as_typed_dict(
        model_class=setta.types.project_config.ProjectConfig,
        typed_dict_name="ProjectConfigArgs",
        required_args=[],
        include_callable_with_type=False,
        is_base_class=True,
    )
    for c in classes.values():
        code += create_impl_model_args_as_typed_dict(
            c,
            [
                setta.types.section_impls.BaseSectionImpl,
                setta.types.code_obj_impls.BaseCodeObjImpl,
            ],
            c.args_name,
            c.parent_args_class_names,
        )

        code += create_impl_model_args_as_typed_dict(
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
