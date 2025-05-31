import enum
import importlib
import inspect
import pkgutil
import types
from collections.abc import Sequence as ABCSequence
from datetime import datetime
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


def get_all_type_aliases(module):
    return inspect.getmembers(module, lambda obj: isinstance(obj, types.GenericAlias))


def get_all_enums(module):
    return inspect.getmembers(
        module,
        lambda obj: inspect.isclass(obj)
        and issubclass(obj, enum.Enum)
        and obj is not enum.Enum
        and obj is not enum.StrEnum,
    )


def get_all_pydantic_models(module):
    return inspect.getmembers(
        module,
        lambda obj: inspect.isclass(obj)
        and issubclass(obj, BaseModel)
        and obj is not BaseModel,
    )


def generate_dependencies_ts(type_definitions: dict, processed_types: set):
    """Generate TypeScript for any discovered dependencies."""
    dependency_ts = ""
    for dep_name, (dep_type, dep_obj) in list(type_definitions.items()):
        if dep_name not in processed_types:
            if dep_type == "enum":
                dependency_ts += enum_to_ts(dep_obj, processed_types)
            elif dep_type == "pydantic":
                dependency_ts += pydantic_model_to_ts(
                    dep_obj, type_definitions, processed_types
                )
    return dependency_ts


def alias_to_ts(name, alias_type, type_definitions: dict, processed_types: set):
    """Convert a type alias to TypeScript type definition."""
    if name in processed_types:
        return ""

    processed_types.add(name)
    ts_type = python_type_to_ts(alias_type, type_definitions, processed_types)

    # Generate any dependencies first
    dependency_ts = generate_dependencies_ts(type_definitions, processed_types)

    return dependency_ts + f"type {name} = {ts_type};\n\n"


def enum_to_ts(enum_class, processed_types: set):
    enum_name = enum_class.__name__
    if enum_name in processed_types:
        return ""

    processed_types.add(enum_name)
    members = [f'  {member.name} = "{member.value}"' for member in enum_class]
    members_str = ",\n".join(members)
    return f"enum {enum_name} {{\n{members_str}\n}}\n\n"


def python_type_to_ts(python_type, type_definitions: dict, processed_types: set):
    """Convert Python type to TypeScript type string.

    Args:
        python_type: The Python type to convert
        type_definitions: Dict to accumulate type definitions that need to be generated
        processed_types: Set of already processed type names to avoid duplicates
    """
    # Handle None type
    if python_type is type(None):
        return "null"

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
            return python_type_to_ts(args[0], type_definitions, processed_types)
        return "any"

    # Handle Literal types
    if origin is Literal:
        args = get_args(python_type)
        # Convert each literal value to TypeScript syntax
        ts_literals = []
        for arg in args:
            if isinstance(arg, str):
                ts_literals.append(f'"{arg}"')
            elif isinstance(arg, (int, float)):
                ts_literals.append(str(arg))
            elif isinstance(arg, bool):
                ts_literals.append(str(arg).lower())
            else:
                ts_literals.append(f'"{arg}"')  # fallback to string representation
        return " | ".join(ts_literals)

    # Handle Optional/Union types
    if origin is Union:
        args = get_args(python_type)
        # Check if it's Optional (Union with None)
        if type(None) in args:
            # Filter out None and convert the remaining type
            non_none_types = [arg for arg in args if arg is not type(None)]
            if len(non_none_types) == 1:
                return f"{python_type_to_ts(non_none_types[0], type_definitions, processed_types)} | null"
            else:
                # Multiple non-None types
                ts_types = [
                    python_type_to_ts(t, type_definitions, processed_types)
                    for t in non_none_types
                ]
                return f"({' | '.join(ts_types)}) | null"
        else:
            # Regular Union without None
            ts_types = [
                python_type_to_ts(t, type_definitions, processed_types) for t in args
            ]
            return f"({' | '.join(ts_types)})"

    # Handle list/List/Sequence types
    if origin in (list, List, ABCSequence):
        args = get_args(python_type)
        if args:
            return f"{python_type_to_ts(args[0], type_definitions, processed_types)}[]"
        return "any[]"

    # Handle dict/Dict types
    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            key_type = python_type_to_ts(args[0], type_definitions, processed_types)
            value_type = python_type_to_ts(args[1], type_definitions, processed_types)
            return f"Record<{key_type}, {value_type}>"
        return "Record<string, any>"

    # Handle set/Set types
    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            return f"{python_type_to_ts(args[0], type_definitions, processed_types)}[]"
        return "any[]"

    # Handle tuple/Tuple types
    if origin in (tuple, Tuple):
        args = get_args(python_type)
        if args:
            ts_types = [
                python_type_to_ts(t, type_definitions, processed_types) for t in args
            ]
            return f"[{', '.join(ts_types)}]"
        return "[]"

    # Check if it's an enum
    if inspect.isclass(python_type) and issubclass(python_type, enum.Enum):
        enum_name = python_type.__name__
        # If not yet processed, add to definitions
        if enum_name not in processed_types:
            type_definitions[enum_name] = ("enum", python_type)
        return enum_name

    # Check if it's a Pydantic model
    if inspect.isclass(python_type) and issubclass(python_type, BaseModel):
        model_name = python_type.__name__
        # If not yet processed, add to definitions
        if model_name not in processed_types:
            type_definitions[model_name] = ("pydantic", python_type)
        return model_name

    # Basic type mappings
    type_map = {
        str: "string",
        int: "number",
        float: "number",
        bool: "boolean",
        bytes: "string",  # or could use Uint8Array
        type(None): "null",
        datetime: "string",
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


def pydantic_model_to_ts(model, type_definitions: dict, processed_types: set):
    """Convert a Pydantic model to TypeScript type definition.

    Args:
        model: The Pydantic model to convert
        type_definitions: Dict to accumulate type definitions that need to be generated
        processed_types: Set of already processed type names to avoid duplicates
    """
    name = model.__name__

    # Check if already processed
    if name in processed_types:
        return ""

    # Mark as being processed (to handle circular references)
    processed_types.add(name)

    # Get model fields
    fields = []
    for field_name, field_info in model.model_fields.items():
        field_type = field_info.annotation
        ts_type = python_type_to_ts(field_type, type_definitions, processed_types)
        is_required = field_info.is_required()
        if is_required:
            fields.append(f"  {field_name}: {ts_type}")
        else:
            fields.append(f"  {field_name}?: {ts_type}")

    # Join fields with semicolons
    members_str = ";\n".join(fields)
    if members_str:
        members_str += ";"

    # Generate TypeScript for any dependencies that were discovered
    dependency_ts = generate_dependencies_ts(type_definitions, processed_types)

    return dependency_ts + f"type {name} = {{\n{members_str}\n}}\n\n"


def main(output_file):
    all_aliases = {}
    all_enums = {}
    all_pydantic_models = {}
    modules = get_modules_from_package(setta.types)
    for module in modules:
        aliases = get_all_type_aliases(module)
        all_aliases.update({k: v for k, v in aliases})
        enums = get_all_enums(module)
        all_enums.update({k: v for k, v in enums})
        pydantic_models = get_all_pydantic_models(module)
        all_pydantic_models.update({k: v for k, v in pydantic_models})

    ts_code = ""
    processed_types = set()
    type_definitions = {}

    for x_name, x in all_aliases.items():
        ts_code += alias_to_ts(x_name, x, type_definitions, processed_types)

    for x in all_enums.values():
        ts_code += enum_to_ts(x, processed_types)

    for x in all_pydantic_models.values():
        ts_code += pydantic_model_to_ts(x, type_definitions, processed_types)

    with open(output_file, "w") as f:
        f.write(ts_code)


if __name__ == "__main__":
    main(Path("../src/utils/generatedTypes.ts"))
