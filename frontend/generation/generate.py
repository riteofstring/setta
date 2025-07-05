import inspect
import types
from collections.abc import Sequence as ABCSequence
from enum import Enum
from pathlib import Path
from typing import (
    Annotated,
    Any,
    Dict,
    List,
    Literal,
    Set,
    Tuple,
    Type,
    Union,
    get_args,
    get_origin,
)

import setta.types.code_obj_impls
import setta.types.section_impls
from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


def find_sub_classes(
    module: Any,
    base_class: Type[BaseModel],
) -> List[Type[BaseModel]]:
    classes = []

    # Get all classes that match our criteria
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base_class):
            classes.append(obj)

    # Sort by line number where the class is defined
    def get_line_number(cls):
        try:
            return inspect.getsourcelines(cls)[1]
        except (OSError, TypeError):
            return float("inf")  # Put classes without source at the end

    classes.sort(key=get_line_number)

    return classes


def python_type_to_str(python_type):
    # Handle None type
    if python_type is type(None):
        return "None"

    # Get the origin for generic types
    origin = get_origin(python_type)

    # Handle built-in types that aren't from typing module
    if origin is None:
        # Check if the type itself is a built-in collection type
        if python_type in (list, dict, set, tuple):
            origin = python_type

    # Handle Annotated types - extract the actual type (first arg)
    if origin is Annotated:
        args = get_args(python_type)
        if args:
            # The first argument is the actual type, rest are annotations
            return f"Annotated[{python_type_to_str(args[0])}, {python_type_to_str(args[1])}]"
        return "Any"

    # Handle Literal types
    if origin is Literal:
        args = get_args(python_type)
        # Convert each literal value to zod syntax
        # Multiple literals - use union
        literals = []
        for arg in args:
            if isinstance(arg, Enum):
                literals.append(f"{arg.__class__.__name__}.{arg.name}")
            elif isinstance(arg, str):
                literals.append(f'"{arg}"')
            elif isinstance(arg, bool):
                literals.append(f"{str(arg).lower()}")
            else:
                literals.append(f"{arg}")
        literals = " | ".join(literals)
        return f"Literal[{literals}]"

    # Handle Optional/Union types
    if origin in (Union, types.UnionType):
        args = get_args(python_type)
        # Check if it's Optional (Union with None)
        ts_types = [python_type_to_str(t) for t in args]
        return " | ".join(ts_types)

    # Handle list/List types
    if origin in (list, List, ABCSequence):
        args = get_args(python_type)
        if args:
            element_ts_type = python_type_to_str(args[0])
            return f"list[{element_ts_type}]"
        return "list[Any]"

    # Handle dict/Dict types
    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            key_ts_type = python_type_to_str(args[0])
            value_ts_type = python_type_to_str(args[1])
            return f"dict[{key_ts_type}, {value_ts_type}]"
        return "dict[string, Any]"

    # Handle set/Set types
    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            element_ts_type = python_type_to_str(
                args[0],
            )
            return f"set[{element_ts_type}]"
        return "set[Any]"

    # Handle tuple/Tuple types
    if origin in (tuple, Tuple):
        args = get_args(python_type)
        ts_types = [python_type_to_str(t) for t in args]
        return f"tuple[{', '.join(ts_types)}]"

    return python_type.__name__


def get_name_without_impl(x):
    return x.rstrip("Impl")


def generate_impl_field_literals(output_file, classes):
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

    # Generate header
    header = """# Auto-generated Literal type aliases for impl fields - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal
"""

    literals = []
    for cls in classes:
        field_names = get_all_field_names(cls)
        literal_def = generate_field_literal_type(cls.__name__, field_names)
        literals.append(literal_def)
    literals = "\n".join(literals)

    code = header + literals
    code = ruff_format(code)
    output_file.write_text(code)


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
from typing import TypedDict, Literal, Any, NotRequired
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

    code = ruff_format(code)
    output_file.write_text(code)


def generate_layerings(output_file, classes):
    code = """
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string  
from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType
"""

    modifier_names = []

    for c in classes:
        modifier_name = get_name_without_impl(c.__name__) + "Modifier"
        modifier_names.append(modifier_name)
        if c.__name__ == "BaseSectionImpl":
            code += f"""
class BaseSectionLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: {modifier_name}

"""
        elif c.__name__ == "BaseCodeObjImpl":
            code += f"""
class BaseCodeObjLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: {modifier_name}

"""
        else:
            class_name = get_name_without_impl(c.__name__) + "Layering"
            parent_class_names = ", ".join(
                get_name_without_impl(b.__name__) + "Layering" for b in c.__bases__
            )
            type_attribute = python_type_to_str(c.model_fields["type"].annotation)
            if c.model_fields["type"].default != PydanticUndefined:
                default_val = c.model_fields["type"].default
                type_attribute += (
                    f" = {default_val.__class__.__name__}.{default_val.value}"
                )

            code += f"""
class {class_name}({parent_class_names}):
    type: {type_attribute}
    modifier: {modifier_name} # type: ignore

"""

    code = (
        f"""
from setta.types.generated.modifiers import {", ".join(modifier_names)}
"""
        + code
    )

    code = ruff_format(code)
    output_file.write_text(code)


def generate_cores(output_file, classes):
    code = """
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string  
from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType
"""

    modifier_names = []
    impl_fields = []

    for c in classes:
        modifier_name = get_name_without_impl(c.__name__) + "Modifier"
        modifier_names.append(modifier_name)

        impl_fields_name = c.__name__ + "Fields"
        impl_fields.append(impl_fields_name)

        if c.__name__ == "BaseSectionImpl":
            code += f"""
class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: {modifier_name}
    unsharedKeys: {impl_fields_name}

"""
        elif c.__name__ == "BaseCodeObjImpl":
            code += f"""
class BaseCodeObjCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: {modifier_name}
    unsharedKeys: {impl_fields_name}

"""
        else:
            class_name = get_name_without_impl(c.__name__) + "Core"
            parent_class_names = ", ".join(
                get_name_without_impl(b.__name__) + "Core" for b in c.__bases__
            )
            type_attribute = python_type_to_str(c.model_fields["type"].annotation)
            if c.model_fields["type"].default != PydanticUndefined:
                default_val = c.model_fields["type"].default
                type_attribute += (
                    f" = {default_val.__class__.__name__}.{default_val.value}"
                )

            code += f"""
class {class_name}({parent_class_names}):
    type: {type_attribute}
    sharedModifier: {modifier_name} # type: ignore
    unsharedKeys: {impl_fields_name} # type: ignore

"""

    code = (
        f"""
from setta.types.generated.modifiers import {", ".join(modifier_names)}
from setta.types.generated.impl_field_literals import {", ".join(impl_fields)}
"""
        + code
    )

    code = ruff_format(code)
    output_file.write_text(code)


def main(output_folder):
    classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
    )
    classes += find_sub_classes(
        setta.types.code_obj_impls, setta.types.code_obj_impls.BaseCodeObjImpl
    )

    generate_impl_field_literals(output_folder / "impl_field_literals.py", classes)
    generate_modifiers(output_folder / "modifiers.py", classes)
    generate_layerings(output_folder / "layerings.py", classes)
    generate_cores(output_folder / "cores.py", classes)


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
