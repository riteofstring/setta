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
    Union,
    get_args,
    get_origin,
)

from pydantic import BaseModel
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_backend_union_types import find_sub_classes

exclusions = ["id", "name"]


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
                literals.append(f'"{arg.value}"')
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
        if (impl_class is base_class and field_name in exclusions) or (
            impl_class is not base_class
            and field_name in base_class.model_fields
            and field_name != "type"
        ):
            continue
        attributes.append(f"{field_name}: {python_type_to_str(field_info.annotation)}")
    attributes = "\n\t".join(attributes)
    attributes = f"\t{attributes}"
    if impl_class is base_class:
        parent_class = "TypedDict"
    else:
        parent_class = f"{python_type_to_str(impl_class.__base__)}Modifier"
    code = f"""
class {name}Modifier({parent_class}, total=False):
{attributes}
"""
    return code


def create_layering(impl_class, base_class):
    name = impl_class.__name__
    if impl_class is base_class:
        parent_class = "ImplLayering"
    else:
        parent_class = f"{python_type_to_str(impl_class.__base__)}Layering"

    if impl_class.model_fields["type"].annotation is Any:
        modifier = "Any"
    else:
        modifier_class = f"{name}Modifier"
        modifier = f"{modifier_class} = Field(default_factory={modifier_class})"
    return f"""
class {name}Layering({parent_class}):
    modifier: {modifier}

"""


def section_impl_modifiers(output_file):
    import setta.types.sections

    classes = find_sub_classes(
        setta.types.sections, setta.types.sections.BaseSectionImpl, "type", True, False
    )
    classes += find_sub_classes(
        setta.types.sections, setta.types.sections.BaseSectionImpl, "type", False, False
    )
    classes = [setta.types.sections.BaseSectionImpl, *classes]

    code = """
from typing import TypedDict, Literal, Any
from setta.types.sections import (
    ChartSettings,
    DrawAreaCanvasSettings,
    SectionSize,
    Visibility,
    CodeLanguage,
    ConfigLanguage,
)

"""
    for c in classes:
        code += create_typed_dict(c, setta.types.sections.BaseSectionImpl)

    code = ruff_format(code)
    with open(output_file, "w") as f:
        f.write(code)

    print(f"wrote to {output_file}")

    return classes


def section_impl_layering(output_file, impl_classes):
    modifier_class_names = [f"{c.__name__}Modifier" for c in impl_classes]
    code = f"""
from pydantic import Field
from typing import Any
from setta.types.impl_layering import ImplLayering
from setta.types.section_impl_modifiers import {",".join(modifier_class_names)}
"""
    for c in impl_classes:
        code += create_layering(c, impl_classes[0])
    code = ruff_format(code)
    with open(output_file, "w") as f:
        f.write(code)

    print(f"wrote to {output_file}")


def code_obj_impl_modifiers(output_file):
    import setta.types.code_objs

    classes = find_sub_classes(
        setta.types.code_objs,
        setta.types.code_objs.BaseCodeObjImpl,
        "type",
        True,
        False,
    )
    classes += find_sub_classes(
        setta.types.code_objs,
        setta.types.code_objs.BaseCodeObjImpl,
        "type",
        False,
        False,
    )
    classes = [setta.types.code_objs.BaseCodeObjImpl, *classes]

    code = """
from typing import TypedDict, Literal, Any
from setta.types.code_objs import (
    ParameterPassingStyle,
    ParamNameType
)

"""
    for c in classes:
        code += create_typed_dict(c, setta.types.code_objs.BaseCodeObjImpl)

    code = ruff_format(code)
    with open(output_file, "w") as f:
        f.write(code)

    print(f"wrote to {output_file}")
    return classes


def main(output_folder):
    impl_classes = section_impl_modifiers(output_folder / "section_impl_modifiers.py")
    section_impl_layering(output_folder / "section_impl_layering.py", impl_classes)
    code_obj_impl_modifiers(output_folder / "code_obj_impl_modifiers.py")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types")))
