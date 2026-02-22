import dataclasses
import enum
import importlib
import inspect
import pkgutil
import types
from collections.abc import Callable as ABCCallable
from collections.abc import Sequence as ABCSequence
from datetime import datetime
from pathlib import Path
from typing import (
    Annotated,
    Any,
    Callable,
    Dict,
    List,
    Literal,
    NotRequired,
    Set,
    Tuple,
    TypeVar,
    Union,
    get_args,
    get_origin,
    is_typeddict,
)

import setta.routers
import setta.types
import setta.types.code_obj_impls
import setta.types.section_impls
import setta.types.websocket
from fastapi import WebSocket
from pydantic import AnyUrl, BaseModel
from pydantic.fields import FieldInfo
from pydantic_core import PydanticUndefined
from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.section_impls import BaseSectionImpl
from setta.utils.utils import get_absolute_path

from .utils import format_generated_code, get_impl_classes

TYPE_ALIAS_EXCLUSIONS = [
    "CoreSchema",
    "Sequence",
    "Callable",
    "AsyncGenerator",
    "AppStateFromRequest",
    "AppStateFromWebsocket",
    "ReadyAppStateFromRequest",
    "ReadyAppStateFromWebsocket",
    "RuntimeContextFromRequest",
    "RuntimeContextFromWebsocket",
    "Type",
]

DATACLASS_EXCLUSIONS = ["SerializeAsAny"]
DEFAULT_FACTORY_PASSTHROUGH = {
    "create_new_id",
    "generate_memorable_string",
    "create_artifact_id",
    "create_json_artifact_id",
    "create_csv_artifact_id",
    "create_png_artifact_id",
    "create_file_artifact_id",
    "get_now_timestamp",
}


def is_not_tagged_for_skipping(cls):
    try:
        source = inspect.getsource(cls)
        return all(
            "# setta-convert-pydantic-to-js: skip" not in s for s in source.split("\n")
        )
    except:
        return True


def get_modules_from_package(package):
    modules = []
    package_name = package.__name__

    for _, modname, ispkg in pkgutil.iter_modules(package.__path__, package_name + "."):
        try:
            if ispkg:
                # Import the sub-package
                subpackage = importlib.import_module(modname)
                # Recursively get modules from the sub-package
                modules.extend(get_modules_from_package(subpackage))
            else:
                # Import the module
                module = importlib.import_module(modname)
                modules.append(module)
        except ImportError as e:
            print(f"Could not import {modname}: {e}")

    return modules


def get_all_sets(module):
    return [
        (name, obj)
        for name, obj in inspect.getmembers(module)
        if isinstance(obj, (set, frozenset))
        and not inspect.isclass(obj)
        and not name.startswith("_")
        and is_not_tagged_for_skipping(obj)
    ]


def get_all_type_aliases(module):
    def is_type_alias(name, obj):
        if inspect.isclass(obj) or inspect.ismodule(obj):
            return False

        if name in TYPE_ALIAS_EXCLUSIONS:
            return False

        return hasattr(obj, "__origin__") or hasattr(obj, "__args__")

    return [
        (name, obj)
        for name, obj in inspect.getmembers(module)
        if is_type_alias(name, obj) and is_not_tagged_for_skipping(obj)
    ]


def get_all_enums(module):
    return inspect.getmembers(
        module,
        lambda obj: inspect.isclass(obj)
        and issubclass(obj, enum.Enum)
        and obj is not enum.Enum
        and is_not_tagged_for_skipping(obj),
    )


def get_all_typeddicts(module):
    return inspect.getmembers(
        module, lambda obj: is_typeddict(obj) and is_not_tagged_for_skipping(obj)
    )


def get_all_pydantic_models(module):
    return inspect.getmembers(
        module,
        lambda obj: inspect.isclass(obj)
        and issubclass(obj, BaseModel)
        and obj is not BaseModel
        and is_not_tagged_for_skipping(obj),
    )


# Add this function after get_all_pydantic_models
def get_all_dataclasses(module):
    return inspect.getmembers(
        module,
        lambda obj: inspect.isclass(obj)
        and dataclasses.is_dataclass(obj)
        and obj.__name__ not in DATACLASS_EXCLUSIONS
        and is_not_tagged_for_skipping(obj),
    )


def create_ts_type_line(name):
    return f"export type {name} = z.infer<typeof {name}Schema>;\n\n"


def create_ts_input_type_line(name):
    return f"export type {name}Input = z.input<typeof {name}Schema>;\n\n"


def create_creation_fn_line(name, is_impl_class=False):
    if is_impl_class:
        # For impl classes, take user defaults as first parameter
        user_default_name = f"UserDefault{name}"
        return f"""export function create{name}(defaults: {user_default_name}, overrides: Partial<{name}> = {{}}): {name} {{
    return {name}Schema.parse({{...defaults, ...overrides}});
}}

"""
    else:
        # Original implementation for other types
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
                dependency_ts += enum_to_ts(dep_obj, processed_types)
            elif dep_type == "pydantic":
                dependency_ts += pydantic_model_to_zod(dep_obj, processed_types)
            elif dep_type == "dataclass":
                dependency_ts += dataclass_to_zod(dep_obj, processed_types)
            elif dep_type == "typeddict":
                dependency_ts += typeddict_to_zod(dep_obj, processed_types)
    return dependency_ts


def _set_sort_key(value):
    if isinstance(value, enum.Enum):
        return str(value.value)
    return str(value)


def _set_elem_to_ts_literal(value):
    if isinstance(value, enum.Enum):
        value = value.value
    if isinstance(value, str):
        return f'"{value}"'
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        return str(value)
    if value is None:
        return "null"
    return f'"{str(value)}"'


def set_to_ts(name: str, set_obj: set | frozenset, processed_types: set):
    if name in processed_types:
        return ""

    processed_types.add(name)

    # Convert set elements to TypeScript array literals
    elements = [
        _set_elem_to_ts_literal(elem) for elem in sorted(set_obj, key=_set_sort_key)
    ]

    elements_str = ", ".join(elements)
    return f"export const {name} = new Set([{elements_str}]);\n\n"


def alias_to_zod(name: str, alias_type, processed_types: set):
    # Have to catch a case where Callable is an alias for some reason
    if name in processed_types:
        return ""

    processed_types.add(name)

    zod_schema, type_definitions = python_type_to_zod(alias_type, processed_types)

    dependency_zod = generate_dependencies_zod(type_definitions, processed_types)

    code = (
        dependency_zod
        + f"export const {name}Schema = {zod_schema}\n\n"
        + create_ts_type_line(name)
        + create_ts_input_type_line(name)
    )

    if zod_schema.startswith("z.discriminatedUnion"):
        code += create_creation_fn_line(name)
    return code


# just to regular ts enum, not zod enum
def enum_to_ts(enum_class, processed_types: set):
    name = enum_class.__name__
    if name in processed_types:
        return ""

    processed_types.add(name)
    values = [f'"{member.name}":"{member.value}"' for member in enum_class]
    values_str = ", ".join(values)
    return f"""
export const {name}Enum = {{{values_str}}} as const;

export type {name} = ObjectValues<typeof {name}Enum>

"""


def python_type_to_zod(python_type, processed_types: set) -> tuple[str, dict]:
    """Convert Python type to Zod schema string."""

    type_definitions = {}

    if isinstance(python_type, TypeVar):
        return "z.any()", type_definitions

    # Handle None type
    if python_type is type(None):
        return "z.null()", type_definitions

    # Get the origin for generic types
    origin = get_origin(python_type)

    # Handle built-in types that aren't from typing module
    if origin is None:
        # Check if the type itself is a built-in collection type
        if python_type in (list, dict, set, tuple):
            origin = python_type

    if origin is NotRequired:
        args = get_args(python_type)
        return python_type_to_zod(args[0], processed_types)

    # Handle Annotated types - extract the actual type (first arg)
    if origin is Annotated:
        args = get_args(python_type)
        if args:
            actual_type, annotation = args
            ts, dependent_type_defs = python_type_to_zod(actual_type, processed_types)
            type_definitions.update(dependent_type_defs)
            if (
                get_origin(actual_type) in (Union, types.UnionType)
                and type(annotation) is FieldInfo
                and annotation.discriminator
            ):
                ts = ts.replace("z.union(", "").replace(")", "")
                return (
                    f'z.discriminatedUnion("{annotation.discriminator}", {ts})',
                    type_definitions,
                )
            return ts, type_definitions
        return "z.any()", type_definitions

    # Handle Literal types
    if origin is Literal:
        args = get_args(python_type)
        # Convert each literal value to zod syntax
        # Multiple literals - use union
        literals = []
        for arg in args:
            if isinstance(arg, enum.Enum):
                literals.append(f'"{arg.value}"')
            elif isinstance(arg, str):
                literals.append(f'"{arg}"')
            elif isinstance(arg, bool):
                literals.append(f"{str(arg).lower()}")
            else:
                literals.append(f"{arg}")
        if len(literals) == 1:
            return f"z.literal({literals[0]})", type_definitions
        return f"z.literal([{', '.join(literals)}])", type_definitions

    # Handle Union types
    if origin in (Union, types.UnionType):
        args = get_args(python_type)
        schemas = []
        for t in args:
            ts, dependent_type_defs = python_type_to_zod(t, processed_types)
            type_definitions.update(dependent_type_defs)
            schemas.append(ts)
        return f"z.union([{', '.join(schemas)}])", type_definitions

    # Handle list/List types
    if origin in (list, List, ABCSequence):
        args = get_args(python_type)
        if args:
            element_schema, dependent_type_defs = python_type_to_zod(
                args[0], processed_types
            )
            type_definitions.update(dependent_type_defs)
            return f"z.array({element_schema})", type_definitions
        return "z.array(z.any())", type_definitions

    # Handle dict/Dict types
    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            key_schema, dependent_type_defs = python_type_to_zod(
                args[0], processed_types
            )
            type_definitions.update(dependent_type_defs)
            key_schema = key_schema.replace("z.null(),", "").replace(", z.null()", "")
            value_schema, dependent_type_defs = python_type_to_zod(
                args[1], processed_types
            )
            type_definitions.update(dependent_type_defs)
            return f"z.record({key_schema}, {value_schema})", type_definitions
        return "z.record(z.string(), z.any())", type_definitions

    # Handle set/Set types
    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            element_schema, dependent_type_defs = python_type_to_zod(
                args[0], processed_types
            )
            type_definitions.update(dependent_type_defs)
            return f"z.set({element_schema})", type_definitions
        return "z.set(z.any())", type_definitions

    # Handle tuple/Tuple types
    if origin in (tuple, Tuple):
        args = get_args(python_type)
        if args:
            schemas = []
            hasEllipsis = False
            for t in args:
                if t is Ellipsis:
                    hasEllipsis = True
                else:
                    ts, dependent_type_defs = python_type_to_zod(t, processed_types)
                    schemas.append(ts)
                    type_definitions.update(dependent_type_defs)
            if len(set(schemas)) == 1 and hasEllipsis:
                return f"z.array({schemas[0]})", type_definitions
            return f"z.tuple([{', '.join(schemas)}])", type_definitions
        return "z.tuple()", type_definitions

    # Check if it's an enum
    if inspect.isclass(python_type) and issubclass(python_type, enum.Enum):
        enum_name = python_type.__name__
        if enum_name not in processed_types:
            type_definitions[enum_name] = ("enum", python_type)
        return f"z.enum({enum_name}Enum)", type_definitions

    # Check if it's a Pydantic model
    if inspect.isclass(python_type) and issubclass(python_type, BaseModel):
        model_name = python_type.__name__
        if model_name not in processed_types:
            type_definitions[model_name] = ("pydantic", python_type)
        return f"{model_name}Schema", type_definitions

    if dataclasses.is_dataclass(python_type):
        dc_name = python_type.__name__
        if dc_name not in processed_types:
            type_definitions[dc_name] = ("dataclass", python_type)
        return f"{dc_name}Schema", type_definitions

    if is_typeddict(python_type):
        td_name = python_type.__name__
        if td_name not in processed_types:
            type_definitions[td_name] = ("typeddict", python_type)
        return f"{td_name}Schema", type_definitions

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
        Callable: "z.any()",  # zod 4 doesn't support z.function()
        ABCCallable: "z.any()",  # zod 4 doesn't support z.function(),
    }

    if python_type in type_map:
        return type_map[python_type], type_definitions
    if origin in type_map:
        return type_map[origin], type_definitions

    # Try to get the name for other types
    if hasattr(python_type, "__name__"):
        # Default to using the Python type name
        return f"{python_type.__name__}Schema", type_definitions
    # Fallback
    return "z.any()", type_definitions


def typeddict_to_zod(typed_dict: type, processed_types: set):
    name = typed_dict.__name__

    if name in processed_types:
        return ""

    type_definitions = {}
    processed_types.add(name)

    # Get annotations
    annotations = typed_dict.__annotations__

    # Get optional keys
    optional_keys = getattr(typed_dict, "__optional_keys__", set())

    # If neither __required_keys__ nor __optional_keys__ exist, check __total__
    if not hasattr(typed_dict, "__required_keys__") and not hasattr(
        typed_dict, "__optional_keys__"
    ):
        # If __total__ is False, all keys are optional
        if hasattr(typed_dict, "__total__") and not typed_dict.__total__:
            optional_keys = set(annotations.keys())

    # Build the object schema
    fields_list = []
    for field_name, field_type in annotations.items():
        zod_schema, dependent_type_defs = python_type_to_zod(
            field_type, processed_types
        )
        type_definitions.update(dependent_type_defs)

        # Make field optional if it's in optional_keys
        if field_name in optional_keys:
            zod_schema = f"{zod_schema}.optional()"

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
        + create_ts_input_type_line(name)
        + create_creation_fn_line(name)
    )


def python_value_to_ts(value):
    """Convert a Python value to its TypeScript literal representation."""
    if isinstance(value, enum.Enum):
        return f"{value.__class__.__name__}Enum.{value.name}"
    elif isinstance(value, str):
        return f'"{value}" as const'
    elif isinstance(value, bool):
        return str(value).lower()
    elif isinstance(value, (int, float)):
        return str(value)
    elif value is None:
        return "null"
    elif isinstance(value, dict):
        items = []
        for key, entry in value.items():
            if isinstance(key, enum.Enum):
                key = key.value
            items.append(f'"{key}": {python_value_to_ts(entry)}')
        return f"{{{', '.join(items)}}}"
    elif isinstance(value, (list, tuple)):
        items = [python_value_to_ts(item) for item in value]
        return f"[{', '.join(items)}]"
    elif isinstance(value, (set, frozenset)):
        items = [python_value_to_ts(item) for item in value]
        return f"new Set([{', '.join(items)}] as const)"
    elif isinstance(value, BaseModel):
        # For Pydantic models, use their creation function
        model_name = value.__class__.__name__
        model_data = value.model_dump(exclude_defaults=True)
        if model_data:
            params = python_value_to_ts(model_data)
            return f"create{model_name}({params})"
        else:
            return f"create{model_name}()"
    else:
        return str(value)


def pydantic_model_to_zod(model: type[BaseModel], processed_types: set):
    name = model.__name__

    if name in processed_types:
        return ""

    type_definitions = {}
    processed_types.add(name)

    # Build the object schema
    fields = []
    for field_name, field_info in model.model_fields.items():
        field_type = field_info.annotation
        zod_schema, dependent_type_defs = python_type_to_zod(
            field_type, processed_types
        )
        type_definitions.update(dependent_type_defs)

        # Handle default values
        if field_info.default is not PydanticUndefined:
            default_value_ts = python_value_to_ts(field_info.default)
            zod_schema = f"{zod_schema}.default({default_value_ts})"
        elif field_info.default_factory is not None:
            # Handle special cases for default factories
            if isinstance(field_info.default_factory, type(BaseModel)) or is_typeddict(
                field_info.default_factory
            ):
                zod_schema = (
                    f"{zod_schema}.default(create{field_info.default_factory.__name__})"
                )
            elif field_info.default_factory is dict:
                zod_schema = f"{zod_schema}.default({{}})"
            elif field_info.default_factory is list:
                zod_schema = f"{zod_schema}.default([])"
            elif field_info.default_factory is set:
                zod_schema = f"{zod_schema}.default(new Set())"
            elif (
                hasattr(field_info.default_factory, "__name__")
                and field_info.default_factory.__name__ == "<lambda>"
            ):
                # Handle lambda functions by trying to execute them
                try:
                    result = field_info.default_factory()  # type:ignore
                    ts_value = python_value_to_ts(result)
                    zod_schema = f"{zod_schema}.default(() => ({ts_value}))"
                except Exception:
                    # If we can't execute the lambda, generate a generic function
                    zod_schema = f"{zod_schema}.default(() => ({{}}))"
            else:
                factory_name = getattr(field_info.default_factory, "__name__", None)
                if factory_name in DEFAULT_FACTORY_PASSTHROUGH:
                    zod_schema = f"{zod_schema}.default({factory_name})"
                else:
                    result = field_info.default_factory()
                    ts_value = python_value_to_ts(result)
                    zod_schema = f"{zod_schema}.default(() => ({ts_value}))"

        fields.append(f"  {field_name}: {zod_schema}")

    fields_str = ",\n".join(fields)

    dependency_zod = generate_dependencies_zod(type_definitions, processed_types)

    is_impl_class = (
        issubclass(model, BaseSectionImpl) or issubclass(model, BaseCodeObjImpl)
    ) and not name.startswith("Base")

    # Generate schema and inferred type
    return (
        dependency_zod
        + f"""export const {name}Schema = z.object({{
{fields_str}
}});\n\n"""
        + create_ts_type_line(name)
        + create_ts_input_type_line(name)
        + create_creation_fn_line(name, is_impl_class)
    )


# Add this function after pydantic_model_to_zod
def dataclass_to_zod(model: type, processed_types: set):
    name = model.__name__

    if name in processed_types:
        return ""

    type_definitions = {}
    processed_types.add(name)

    # Build the object schema
    fields_list = []
    for field in dataclasses.fields(model):
        field_name = field.name
        field_type = field.type
        zod_schema, dependent_type_defs = python_type_to_zod(
            field_type, processed_types
        )
        type_definitions.update(dependent_type_defs)

        # Handle default values
        if field.default is not dataclasses.MISSING:
            default_value = field.default
            if isinstance(default_value, enum.Enum):
                enum_class_name = default_value.__class__.__name__
                enum_member_name = default_value.name
                zod_schema = (
                    f"{zod_schema}.default({enum_class_name}Enum.{enum_member_name})"
                )
            elif isinstance(default_value, str):
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
            elif default_factory is set:
                zod_schema = f"{zod_schema}.default(new Set())"
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
        + create_ts_input_type_line(name)
        + create_creation_fn_line(name)
    )


def create_type_predicate_fns_from_sets(all_sets):
    code = ""
    for x_name in all_sets.keys():
        type_name = x_name.removesuffix("TypeSet")
        discriminator = "type"
        actual_type = getattr(setta.types.section_impls, type_name, None)
        if not actual_type:
            actual_type = getattr(setta.types.code_obj_impls, type_name, None)
        if not actual_type:
            actual_type = getattr(setta.types.websocket, type_name, None)
        if not actual_type:
            continue
        if issubclass(actual_type, BaseSectionImpl):
            input_type = "BaseSectionImplUnion"
        elif issubclass(actual_type, BaseCodeObjImpl):
            input_type = "BaseCodeObjImplUnion"
        else:
            continue

        code += f"""
export function is{type_name}(x: {input_type}): x is {type_name}Union{{
    return {x_name}.has(x.{discriminator})
}}

"""
    return code


def create_impl_core_variant_bundled_types():
    classes = get_impl_classes()
    code = ""
    for c in classes.values():
        code += f"""
    {c.base_name}: {{
        impl: {c.original_name};
        args: ImplArgsBundleWithUpdaters<{c.args_name}, {c.original_name}>;
    }}
"""

    code = f"""
type ImplArgsBundleWithUpdaters<T, T2> = {{
  [K in keyof T]?: T[K] | (K extends keyof T2 ? (prev: T2[K]) => T2[K] : never);
}};

    export type ImplArgsBundleMap = {{
        {code}
    }}
"""
    return code


def main(output_file):
    all_sets = {}
    all_aliases = {}
    all_enums = {}
    all_typeddicts = {}
    all_pydantic_models = {}
    all_dataclasses = {}
    modules = get_modules_from_package(setta.types)
    modules += get_modules_from_package(setta.routers)
    for module in modules:
        sets = get_all_sets(module)
        all_sets.update({k: v for k, v in sets})
        enums = get_all_enums(module)
        all_enums.update({k: v for k, v in enums})
        aliases = get_all_type_aliases(module)
        all_aliases.update({k: v for k, v in aliases})
        typeddicts = get_all_typeddicts(module)
        all_typeddicts.update({k: v for k, v in typeddicts})
        pydantic_models = get_all_pydantic_models(module)
        all_pydantic_models.update({k: v for k, v in pydantic_models})
        dataclasses_list = get_all_dataclasses(module)
        all_dataclasses.update({k: v for k, v in dataclasses_list})

    ts_code = """import { z } from 'zod';
import { createNewId as create_new_id, createRandomName as generate_memorable_string, createArtifactId as create_artifact_id, createJsonArtifactId as create_json_artifact_id, createCsvArtifactId as create_csv_artifact_id, createPngArtifactId as create_png_artifact_id, createFileArtifactId as create_file_artifact_id } from "utils/idNameCreation";
import { getNowTimestamp as get_now_timestamp } from "utils/timestamps";
import _ from "lodash"

export const IDSchema = z.string();
export type ID = z.infer<typeof IDSchema>;

export type ObjectValues<T> = T[keyof T]
"""
    processed_types = set()

    for x_name, x in all_sets.items():
        ts_code += set_to_ts(x_name, x, processed_types)

    for x in all_enums.values():
        ts_code += enum_to_ts(x, processed_types)

    for x_name, x in all_aliases.items():
        ts_code += alias_to_zod(x_name, x, processed_types)

    for x in all_typeddicts.values():
        ts_code += typeddict_to_zod(x, processed_types)

    for x in all_pydantic_models.values():
        ts_code += pydantic_model_to_zod(x, processed_types)

    for x in all_dataclasses.values():
        ts_code += dataclass_to_zod(x, processed_types)

    ts_code += create_type_predicate_fns_from_sets(all_sets)
    ts_code += create_impl_core_variant_bundled_types()

    with open(output_file, "w") as f:
        f.write(ts_code)

    format_generated_code(output_file)


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../src/utils/generatedTypes.ts")))
