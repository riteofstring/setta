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


def schema_name(name):
    return f"{name}Schema"


def create_obj_name(name):
    return f"create{name}"


def enum_to_zod(enum_class):
    """Convert Python enum to Zod enum schema."""
    enum_name = enum_class.__name__
    # Get all enum values as strings
    values = [f'"{member.value}"' for member in enum_class]
    values_str = ", ".join(values)

    # Create both the schema and the inferred type
    return (
        f"export const {schema_name(enum_name)} = z.enum([{values_str}]);\n"
        f"export type {enum_name} = z.infer<typeof {schema_name(enum_name)}>;\n\n"
    )


def python_type_to_zod(python_type, field_name=None):
    """Convert Python type to Zod schema string."""
    # Handle None type
    if python_type is type(None):
        return "z.null()"

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
                # Optional single type
                base_type = python_type_to_zod(non_none_types[0], field_name)
                return f"{base_type}.nullable()"
            else:
                # Multiple non-None types with nullable
                zod_types = [python_type_to_zod(t, field_name) for t in non_none_types]
                return f"z.union([{', '.join(zod_types)}]).nullable()"
        else:
            # Regular Union without None
            zod_types = [python_type_to_zod(t, field_name) for t in args]
            return f"z.union([{', '.join(zod_types)}])"

    # Handle list/List types
    if origin in (list, List):
        args = get_args(python_type)
        if args:
            element_type = python_type_to_zod(args[0], field_name)
            return f"z.array({element_type})"
        return "z.array(z.any())"

    # Handle dict/Dict types
    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            # Note: Zod's record only supports string keys
            value_type = python_type_to_zod(args[1], field_name)
            return f"z.record(z.string(), {value_type})"
        return "z.record(z.string(), z.any())"

    # Handle set/Set types (convert to array in Zod)
    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            element_type = python_type_to_zod(args[0], field_name)
            return f"z.array({element_type})"
        return "z.array(z.any())"

    # Handle tuple/Tuple types
    if origin in (tuple, Tuple):
        args = get_args(python_type)
        if args:
            if len(args) == 2 and args[1] is ...:
                # Variable length tuple
                element_type = python_type_to_zod(args[0], field_name)
                return f"z.array({element_type})"
            else:
                # Fixed length tuple
                zod_types = [python_type_to_zod(t, field_name) for t in args]
                return f"z.tuple([{', '.join(zod_types)}])"
        return "z.tuple([])"

    # Check if it's an enum
    if inspect.isclass(python_type) and issubclass(python_type, enum.Enum):
        return f"{schema_name(python_type.__name__)}"

    # Check if it's a Pydantic model
    if inspect.isclass(python_type) and issubclass(python_type, BaseModel):
        return f"{schema_name(python_type.__name__)}"

    # Basic type mappings
    type_map = {
        str: "z.string()",
        int: "z.number().int()",
        float: "z.number()",
        bool: "z.boolean()",
        bytes: "z.string()",  # or could use z.instanceof(Uint8Array)
        type(None): "z.null()",
        object: "z.any()",
        Any: "z.any()",
    }

    # Direct type mapping
    if python_type in type_map:
        return type_map[python_type]

    # Try to handle datetime types
    if hasattr(python_type, "__module__") and python_type.__module__ == "datetime":
        if python_type.__name__ in ["datetime", "date"]:
            return "z.string().datetime()"
        elif python_type.__name__ == "time":
            return "z.string().time()"

    # Fallback
    return "z.any()"


def pydantic_model_to_zod(model):
    """Convert a Pydantic model to Zod schema."""
    name = model.__name__

    # Get model fields
    field_definitions = []
    for field_name, field_info in model.model_fields.items():
        field_type = field_info.annotation
        zod_type = python_type_to_zod(field_type, field_name)
        is_required = field_info.is_required()
        if not is_required and ".nullable()" not in zod_type:
            zod_type = f"{zod_type}.optional()"
        field_definitions.append(f"  {field_name}: {zod_type}")

    # Join fields
    fields_str = ",\n".join(field_definitions)

    # Create schema and type
    return (
        f"export const {schema_name(name)} = z.object({{\n{fields_str}\n}});\n\n"
        f"export type {name} = z.infer<typeof {schema_name(name)}>;\n\n"
        f"export function {create_obj_name(name)}(options={{}}){{\n  return {schema_name(name)}.parse(options)\n}}\n\n"
    )


def main(output_file):
    all_enums = {}
    all_pydantic_models = {}
    modules = get_modules_from_package(setta.types)
    for module in modules:
        enums = get_all_enums(module)
        all_enums.update({k: v for k, v in enums})
        pydantic_models = get_all_pydantic_models(module)
        all_pydantic_models.update({k: v for k, v in pydantic_models})

    # Start with zod import
    zod_code = 'import { z } from "zod";\n\n'

    # Generate enum schemas first (they might be referenced by models)
    for e in all_enums.values():
        zod_code += enum_to_zod(e)

    # Generate model schemas
    for p in all_pydantic_models.values():
        zod_code += pydantic_model_to_zod(p)

    with open(output_file, "w") as f:
        f.write(zod_code)


if __name__ == "__main__":
    main(Path("../src/utils/generated_schemas_2.ts"))
