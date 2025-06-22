import types
from collections.abc import Sequence as ABCSequence
from enum import Enum
from pathlib import Path
from typing import (
    Annotated,
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

exclusions = ["id", "name", "type"]


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

    # if issubclass(python_type, Enum):
    #     print(python_type)

    return python_type.__name__


def create_typed_dict(impl_class: type[BaseModel]):
    name = impl_class.__name__
    attributes = []
    for field_name, field_info in impl_class.model_fields.items():
        if field_name in exclusions:
            continue
        attributes.append(f"{field_name}: {python_type_to_str(field_info.annotation)}")
    attributes = "\n\t".join(attributes)
    attributes = f"\t{attributes}"
    code = f"""
class {name}Modifier(TypedDict, total=False):
{attributes}
"""
    return code


def section_impl_modifiers(output_file):
    import setta.types.sections

    sub_classes = find_sub_classes(
        setta.types.sections, setta.types.sections.BaseSectionImpl, "type", False
    )

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

class SectionImplModifier(TypedDict, total=False):
    pass
"""
    for c in sub_classes:
        code += create_typed_dict(c)

    code = ruff_format(code)
    with open(output_file, "w") as f:
        f.write(code)

    print(f"wrote to {output_file}")


def code_obj_impl_modifiers(output_file):
    import setta.types.code_objs

    sub_classes = find_sub_classes(
        setta.types.code_objs, setta.types.code_objs.BaseCodeObjImpl, "type", False
    )

    code = """
from typing import TypedDict, Literal, Any
from setta.types.code_objs import (
    ParameterPassingStyle,
    ParamNameType
)

class CodeObjImplModifier(TypedDict, total=False):
    pass
"""
    for c in sub_classes:
        code += create_typed_dict(c)

    code = ruff_format(code)
    with open(output_file, "w") as f:
        f.write(code)

    print(f"wrote to {output_file}")


def main(output_folder):
    section_impl_modifiers(output_folder / "section_impl_modifiers.py")
    code_obj_impl_modifiers(output_folder / "code_obj_impl_modifiers.py")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types")))
