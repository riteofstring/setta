import enum
import importlib
import inspect
import pkgutil
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple, Union, get_args, get_origin

import setta.types
from pydantic import BaseModel


def get_modules_from_package(package):
    modules = []
    package_name = package.__name__

    for _, modname, ispkg in pkgutil.iter_modules(package.__path__, package_name + "."):
        if not ispkg:
            try:
                module = importlib.import_module(modname)
                modules.append(module)
            except ImportError as e:
                print(f"Could not import {modname}: {e}")

    return modules


def get_all_enums(module):
    return [
        x[1]
        for x in inspect.getmembers(
            module,
            lambda obj: inspect.isclass(obj)
            and issubclass(obj, enum.Enum)
            and obj is not enum.Enum
            and obj is not enum.StrEnum,
        )
    ]


def get_all_pydantic_models(module):
    return [
        x[1]
        for x in inspect.getmembers(
            module,
            lambda obj: inspect.isclass(obj)
            and issubclass(obj, BaseModel)
            and obj is not BaseModel,
        )
    ]


def enum_to_ts(enum_class):
    enum_name = enum_class.__name__
    members = [f'  {member.name} = "{member.value}"' for member in enum_class]
    members_str = ",\n".join(members)
    return f"enum {enum_name} {{\n{members_str}\n}}\n\n"


def python_type_to_ts(python_type):
    """Convert Python type to TypeScript type string."""
    # Handle None type
    if python_type is type(None):
        return "null"

    # Get the origin for generic types
    origin = get_origin(python_type)

    # Handle Optional/Union types
    if origin is Union:
        args = get_args(python_type)
        # Check if it's Optional (Union with None)
        if type(None) in args:
            # Filter out None and convert the remaining type
            non_none_types = [arg for arg in args if arg is not type(None)]
            if len(non_none_types) == 1:
                return f"{python_type_to_ts(non_none_types[0])} | null"
            else:
                # Multiple non-None types
                ts_types = [python_type_to_ts(t) for t in non_none_types]
                return f"({' | '.join(ts_types)}) | null"
        else:
            # Regular Union without None
            ts_types = [python_type_to_ts(t) for t in args]
            return f"({' | '.join(ts_types)})"

    # Handle list/List types
    if origin in (list, List):
        args = get_args(python_type)
        if args:
            return f"{python_type_to_ts(args[0])}[]"
        return "any[]"

    # Handle dict/Dict types
    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            key_type = python_type_to_ts(args[0])
            value_type = python_type_to_ts(args[1])
            return f"Record<{key_type}, {value_type}>"
        return "Record<string, any>"

    # Handle set/Set types
    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            return f"{python_type_to_ts(args[0])}[]"
        return "any[]"

    # Handle tuple/Tuple types
    if origin in (tuple, Tuple):
        args = get_args(python_type)
        if args:
            ts_types = [python_type_to_ts(t) for t in args]
            return f"[{', '.join(ts_types)}]"
        return "[]"

    # Check if it's an enum
    if inspect.isclass(python_type) and issubclass(python_type, enum.Enum):
        return python_type.__name__

    # Check if it's a Pydantic model
    if inspect.isclass(python_type) and issubclass(python_type, BaseModel):
        return python_type.__name__

    # Basic type mappings
    type_map = {
        str: "string",
        int: "number",
        float: "number",
        bool: "boolean",
        bytes: "string",  # or could use Uint8Array
        type(None): "null",
        object: "any",
        Any: "any",
    }

    # Direct type mapping
    if python_type in type_map:
        return type_map[python_type]

    # Try to get the name for other types
    if hasattr(python_type, "__name__"):
        # Default to using the Python type name
        return python_type.__name__

    # Fallback
    return "any"


def pydantic_model_to_ts(model):
    """Convert a Pydantic model to TypeScript type definition."""
    name = model.__name__

    # Get model fields
    fields = []
    for field_name, field_info in model.model_fields.items():
        # Get the field type
        field_type = field_info.annotation

        # Convert to TypeScript type
        ts_type = python_type_to_ts(field_type)

        # Check if field is required
        is_required = field_info.is_required()

        # Format field with optional marker if not required
        if is_required:
            fields.append(f"  {field_name}: {ts_type}")
        else:
            fields.append(f"  {field_name}?: {ts_type}")

    # Join fields with semicolons
    members_str = ";\n".join(fields)
    if members_str:
        members_str += ";"

    return f"type {name} = {{\n{members_str}\n}}\n\n"


def main(output_file):
    all_enums = set()
    all_pydantic_models = set()
    modules = get_modules_from_package(setta.types)
    for module in modules:
        enums = get_all_enums(module)
        all_enums.update(enums)
        pydantic_models = get_all_pydantic_models(module)
        all_pydantic_models.update(pydantic_models)

    ts_code = ""
    for e in all_enums:
        ts_code += enum_to_ts(e)

    for p in all_pydantic_models:
        ts_code += pydantic_model_to_ts(p)

    with open(output_file, "w") as f:
        f.write(ts_code)


if __name__ == "__main__":
    main(Path("../src/utils/generated_schemas_2.ts"))
