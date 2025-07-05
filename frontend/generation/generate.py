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

from pydantic import BaseModel
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


def create_typed_dict(impl_class: type[BaseModel], base_class):
    name = impl_class.__name__
    attributes = []
    for field_name, field_info in impl_class.model_fields.items():
        # Skip if field is in exclusions for base class
        if impl_class is base_class and field_name in ["id", "name", "isPreset"]:
            continue

        # For non-base classes, skip if field is defined in ANY parent class (except type)
        if impl_class is not base_class and field_name != "type":
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

    if impl_class is base_class:
        parent_class = "TypedDict"
    else:
        # Handle multiple inheritance
        parent_classes = []
        for parent in impl_class.__bases__:
            if hasattr(parent, "model_fields"):  # Only include Pydantic model parents
                parent_classes.append(f"{parent.__name__}Modifier")
        parent_class = ", ".join(parent_classes)

    code = f"""
class {name}Modifier({parent_class}):
{attributes}
"""
    return code


def generate_modifiers(output_folder):
    import setta.types.section_impls

    classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
    )

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

"""
    for c in classes:
        code += create_typed_dict(c, setta.types.section_impls.BaseSectionImpl)

    print(code)

    return code


def generate_cores(output_folder):
    import setta.types.section_impls

    classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
    )

    code = """
from typing import Any

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string  
"""

    modifier_names = []

    for c in classes:
        if c.__name__ == "BaseSectionImpl":
            code += """
class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: Any
    unsharedKeys: Any

"""
        else:
            class_name = c.__name__.rstrip("Impl") + "Core"
            parent_class_names = ", ".join(
                b.__name__.rstrip("Impl") + "Core" for b in c.__bases__
            )
            modifier_name = c.__name__.rstrip("Impl") + "Modifier"
            modifier_names.append(modifier_name)

            code += f"""
class {class_name}({parent_class_names}):
    sharedModifier: {modifier_name}

"""

    code = (
        f"""
from setta.types.generated.impl_modifiers import {", ".join(modifier_names)}
"""
        + code
    )
    print(code)


def main(output_folder):
    generate_modifiers(output_folder)
    generate_cores(output_folder)


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
