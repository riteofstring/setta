import dataclasses
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
from fastapi import WebSocket
from pydantic import AnyUrl, BaseModel
from pydantic_core import PydanticUndefined

from .utils import format_generated_code


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
    exclusions = set(["CoreSchema", "Sequence"])

    def is_type_alias(name, obj):
        if inspect.isclass(obj) or inspect.ismodule(obj):
            return False

        if name in exclusions:
            return False

        return hasattr(obj, "__origin__") or hasattr(obj, "__args__")

    return [
        (name, obj)
        for name, obj in inspect.getmembers(module)
        if is_type_alias(name, obj)
    ]


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


# Add this function after get_all_pydantic_models
def get_all_dataclasses(module):
    return inspect.getmembers(
        module,
        lambda obj: inspect.isclass(obj) and dataclasses.is_dataclass(obj),
    )


def create_ts_type_line(name):
    return f"export type {name} = z.infer<typeof {name}Schema>;\n\n"


def create_creation_fn_line(name):
    return f"""export function create{name[0].upper() + name[1:]}(options: Partial<{name}> = {{}}): {name} {{
    return {name}Schema.parse(options);
}}

"""


def generate_dependencies_zod(type_definitions: dict, processed_types: set):
    """Generate TypeScript for any discovered dependencies."""
    dependency_ts = ""
    for dep_name, (dep_type, dep_obj) in list(type_definitions.items()):
        if dep_name not in processed_types:
            if dep_type == "enum":
                dependency_ts += enum_to_zod(dep_obj, processed_types)
            elif dep_type == "pydantic":
                dependency_ts += pydantic_model_to_zod(
                    dep_obj, type_definitions, processed_types
                )
            elif dep_type == "dataclass":
                dependency_ts += dataclass_to_zod(
                    dep_obj, type_definitions, processed_types
                )
    return dependency_ts


def alias_to_zod(name: str, alias_type, type_definitions: dict, processed_types: set):
    if name in processed_types:
        return ""

    processed_types.add(name)

    zod_schema = python_type_to_zod(alias_type, type_definitions, processed_types)

    dependency_zod = generate_dependencies_zod(type_definitions, processed_types)

    return (
        dependency_zod
        + f"export const {name}Schema = {zod_schema}\n\n"
        + create_ts_type_line(name)
    )


def enum_to_zod(enum_class, processed_types: set):
    name = enum_class.__name__
    if name in processed_types:
        return ""

    processed_types.add(name)
    values = [f'"{member.value}"' for member in enum_class]
    values_str = ", ".join(values)
    return (
        f"export const {name}Schema = z.enum([{values_str}]);\n\n"
        + create_ts_type_line(name)
    )


def python_type_to_zod(python_type, type_definitions: dict, processed_types: set):
    """Convert Python type to Zod schema string."""

    # Handle None type
    if python_type is type(None):
        return "z.null()"

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
            return python_type_to_zod(args[0], type_definitions, processed_types)
        return "z.any()"

    # Handle Literal types
    if origin is Literal:
        args = get_args(python_type)
        # Convert each literal value to zod syntax
        # Multiple literals - use union
        literals = []
        for arg in args:
            if isinstance(arg, str):
                literals.append(f'"{arg}"')
            elif isinstance(arg, bool):
                literals.append(f"{str(arg).lower()}")
            else:
                literals.append(f"{arg}")
        if len(literals) == 1:
            return f"z.literal({literals[0]})"
        return f"z.literal([{', '.join(literals)}])"

    # Handle Optional/Union types
    if origin in (Union, types.UnionType):
        args = get_args(python_type)
        # Check if it's Optional (Union with None)
        schemas = [
            python_type_to_zod(t, type_definitions, processed_types) for t in args
        ]
        return f"z.union([{', '.join(schemas)}])"

    # Handle list/List types
    if origin in (list, List, ABCSequence):
        args = get_args(python_type)
        if args:
            element_schema = python_type_to_zod(
                args[0], type_definitions, processed_types
            )
            return f"z.array({element_schema})"
        return "z.array(z.any())"

    # Handle dict/Dict types
    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            key_schema = python_type_to_zod(args[0], type_definitions, processed_types)
            key_schema = key_schema.replace("z.null(),", "").replace(", z.null()", "")
            value_schema = python_type_to_zod(
                args[1], type_definitions, processed_types
            )
            return f"z.record({key_schema}, {value_schema})"
        return "z.record(z.string(), z.any())"

    # Handle set/Set types
    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            element_schema = python_type_to_zod(
                args[0], type_definitions, processed_types
            )
            return f"z.set({element_schema})"
        return "z.set(z.any())"

    # Handle tuple/Tuple types
    if origin in (tuple, Tuple):
        args = get_args(python_type)
        if args:
            schemas = [
                python_type_to_zod(t, type_definitions, processed_types) for t in args
            ]
            return f"z.tuple([{', '.join(schemas)}])"
        return "z.tuple()"

    # Check if it's an enum
    if inspect.isclass(python_type) and issubclass(python_type, enum.Enum):
        enum_name = python_type.__name__
        if enum_name not in processed_types:
            type_definitions[enum_name] = ("enum", python_type)
        return f"{enum_name}Schema"

    # Check if it's a Pydantic model
    if inspect.isclass(python_type) and issubclass(python_type, BaseModel):
        model_name = python_type.__name__
        if model_name not in processed_types:
            type_definitions[model_name] = ("pydantic", python_type)
        return f"{model_name}Schema"

    if dataclasses.is_dataclass(python_type):
        dc_name = python_type.__name__
        if dc_name not in processed_types:
            type_definitions[dc_name] = ("dataclass", python_type)
        return f"{dc_name}Schema"

    # Basic type mappings
    type_map = {
        str: "z.string()",
        int: "z.int()",
        float: "z.number()",
        bool: "z.boolean()",
        bytes: "z.string()",
        datetime: "z.iso.datetime()",
        object: "z.any()",
        Any: "z.any()",
        Path: "z.string()",
        AnyUrl: "z.url()",
        WebSocket: "WebSocket",
    }

    if python_type in type_map:
        return type_map[python_type]

    # Try to get the name for other types
    if hasattr(python_type, "__name__"):
        # Default to using the Python type name
        return f"{python_type.__name__}Schema"
    # Fallback
    return "z.any()"


def pydantic_model_to_zod(
    model: type[BaseModel], type_definitions: dict, processed_types: set
):
    name = model.__name__

    if name in processed_types:
        return ""

    processed_types.add(name)

    # Build the object schema
    fields = []
    for field_name, field_info in model.model_fields.items():
        field_type = field_info.annotation
        zod_schema = python_type_to_zod(field_type, type_definitions, processed_types)

        # Handle default values
        if field_info.default is not PydanticUndefined:
            default_value = field_info.default
            if isinstance(default_value, str):
                zod_schema = f'{zod_schema}.default("{default_value}")'
            elif isinstance(default_value, bool):
                zod_schema = f"{zod_schema}.default({str(default_value).lower()})"
            elif isinstance(default_value, (int, float)):
                zod_schema = f"{zod_schema}.default({default_value})"
            elif default_value is None:
                zod_schema = f"{zod_schema}.default(null)"
        elif field_info.default_factory is not None:
            if isinstance(field_info.default_factory, type(BaseModel)):
                zod_schema = (
                    f"{zod_schema}.default(create{field_info.default_factory.__name__})"
                )
            elif field_info.default_factory is dict:
                zod_schema = f"{zod_schema}.default({{}})"
            elif field_info.default_factory is list:
                zod_schema = f"{zod_schema}.default([])"
            else:
                zod_schema = (
                    f"{zod_schema}.default({field_info.default_factory.__name__})"
                )

        fields.append(f"  {field_name}: {zod_schema}")

    fields_str = ",\n".join(fields)

    dependency_zod = generate_dependencies_zod(type_definitions, processed_types)

    # Generate schema and inferred type
    return (
        dependency_zod
        + f"""export const {name}Schema = z.object({{
{fields_str}
}});\n\n"""
        + create_ts_type_line(name)
        + create_creation_fn_line(name)
    )


# Add this function after pydantic_model_to_zod
def dataclass_to_zod(model: type, type_definitions: dict, processed_types: set):
    name = model.__name__

    if name in processed_types:
        return ""

    processed_types.add(name)

    # Build the object schema
    fields_list = []
    for field in dataclasses.fields(model):
        field_name = field.name
        field_type = field.type
        zod_schema = python_type_to_zod(field_type, type_definitions, processed_types)

        # Handle default values
        if field.default is not dataclasses.MISSING:
            default_value = field.default
            if isinstance(default_value, str):
                zod_schema = f'{zod_schema}.default("{default_value}")'
            elif isinstance(default_value, bool):
                zod_schema = f"{zod_schema}.default({str(default_value).lower()})"
            elif isinstance(default_value, (int, float)):
                zod_schema = f"{zod_schema}.default({default_value})"
            elif default_value is None:
                zod_schema = f"{zod_schema}.default(null)"
        elif field.default_factory is not dataclasses.MISSING:
            default_factory = field.default_factory
            if dataclasses.is_dataclass(default_factory):
                zod_schema = f"{zod_schema}.default(create{default_factory.__name__})"
            elif default_factory is dict:
                zod_schema = f"{zod_schema}.default({{}})"
            elif default_factory is list:
                zod_schema = f"{zod_schema}.default([])"
            else:
                raise ValueError("this else case is not yet supported")

        fields_list.append(f"  {field_name}: {zod_schema}")

    fields_str = ",\n".join(fields_list)

    dependency_zod = generate_dependencies_zod(type_definitions, processed_types)

    # Generate schema and inferred type
    return (
        dependency_zod
        + f"""export const {name}Schema = z.object({{
{fields_str}
}});\n\n"""
        + create_ts_type_line(name)
        + create_creation_fn_line(name)
    )


def main(output_file):
    all_aliases = {}
    all_enums = {}
    all_pydantic_models = {}
    all_dataclasses = {}
    modules = get_modules_from_package(setta.types)
    for module in modules:
        aliases = get_all_type_aliases(module)
        all_aliases.update({k: v for k, v in aliases})
        enums = get_all_enums(module)
        all_enums.update({k: v for k, v in enums})
        pydantic_models = get_all_pydantic_models(module)
        all_pydantic_models.update({k: v for k, v in pydantic_models})
        dataclasses_list = get_all_dataclasses(module)
        all_dataclasses.update({k: v for k, v in dataclasses_list})

    ts_code = """import { z } from 'zod/v4';
import { createNewId as create_new_id, createRandomName as generate_memorable_string } from "utils/idNameCreation";
import { getNowTimestamp as get_now_timestamp } from "utils/timestamps";
import _ from "lodash"
import { BASE_UI_TYPES } from "utils/baseUITypes"

function ui_types_default_factory(){
    return _.cloneDeep(BASE_UI_TYPES)
}


export const IDSchema = z.string();
export type ID = z.infer<typeof IDSchema>;

"""
    processed_types = set()
    type_definitions = {}

    for x_name, x in all_aliases.items():
        ts_code += alias_to_zod(x_name, x, type_definitions, processed_types)

    for x in all_enums.values():
        ts_code += enum_to_zod(x, processed_types)

    for x in all_pydantic_models.values():
        ts_code += pydantic_model_to_zod(x, type_definitions, processed_types)

    for x in all_dataclasses.values():
        ts_code += dataclass_to_zod(x, type_definitions, processed_types)

    with open(output_file, "w") as f:
        f.write(ts_code)

    format_generated_code(output_file)


if __name__ == "__main__":
    main(Path("src/utils/generatedTypes.ts"))
