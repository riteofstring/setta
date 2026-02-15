import dataclasses
import inspect
import re
import types
from collections.abc import Sequence as ABCSequence
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
    get_type_hints,
    is_typeddict,
)

from fastapi import BackgroundTasks, Request, Response, UploadFile
from fastapi.params import Depends as DependsParam
from fastapi.routing import APIRoute
from pydantic import BaseModel
from setta.server import app
from setta.server_state import SettaFastAPIState
from setta.types.routes import Route
from setta.utils.utils import get_absolute_path

from .utils import format_generated_code

basic_type_map = {
    str: "string",
    int: "number",
    float: "number",
    bool: "boolean",
    Any: "any",
}

GENERATED_TYPE_ALIAS = "gt"


def get_path_input_output_types():
    output = {}

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        # deal with multiple methods some other time!
        assert len(route.methods) == 1

        route_info = {
            "method": list(route.methods)[0],
            "inputs": {},
            "output": None,
            "path": route.path,
        }

        # Get function signature and type hints
        sig = inspect.signature(route.endpoint)
        type_hints = get_type_hints(route.endpoint, include_extras=True)

        # Extract input parameters (excluding Depends)
        for param_name, param in sig.parameters.items():
            # Skip if it's a Depends parameter
            if (
                type(param.default).__name__ == "Depends"
                or param.annotation is BackgroundTasks
            ):
                continue

            # Get the raw type hint for this parameter
            param_type = type_hints.get(param_name, param.annotation)
            if _is_depends_annotation(param_type) or param_type is BackgroundTasks:
                continue
            if param_type is inspect.Parameter.empty:
                param_type = type(None)

            route_info["inputs"][param_name] = param_type

        # Extract output type (return type)
        return_type = type_hints.get("return", sig.return_annotation)
        if return_type is inspect.Parameter.empty:
            return_type = type(None)

        route_info["output"] = return_type

        output[route.endpoint.__name__] = route_info

    return output


def _is_depends_annotation(param_type) -> bool:
    if get_origin(param_type) is Annotated:
        args = get_args(param_type)
        for meta in args[1:]:
            if isinstance(meta, DependsParam):
                return True
    return False


def create_args(inputs):
    args = []
    args_with_annotations = []

    for name, type in inputs.items():
        if type in (SettaFastAPIState, Request, Response):
            continue
        type_annotation = python_type_to_ts(type, {}, set(), use_input_types=True)
        args.append(name)
        args_with_annotations.append(f"{name}:{type_annotation}")
    return args, args_with_annotations


def is_zod_schema_type(python_type) -> bool:
    if not inspect.isclass(python_type):
        return False
    if issubclass(python_type, BaseModel):
        return True
    if dataclasses.is_dataclass(python_type):
        return True
    return is_typeddict(python_type)


def python_type_to_ts(
    python_type,
    type_definitions: dict,
    processed_types: set,
    use_input_types: bool = False,
):
    # Handle None type
    if python_type is type(None):
        return "null"

    if python_type is UploadFile:
        return "FormData"

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
            return python_type_to_ts(
                args[0],
                type_definitions,
                processed_types,
                use_input_types=use_input_types,
            )
        return "any"

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
        return " | ".join(literals)

    # Handle Optional/Union types
    if origin in (Union, types.UnionType):
        args = get_args(python_type)
        # Check if it's Optional (Union with None)
        ts_types = [
            python_type_to_ts(
                t, type_definitions, processed_types, use_input_types=use_input_types
            )
            for t in args
        ]
        return " | ".join(ts_types)

    # Handle list/List types
    if origin in (list, List, ABCSequence):
        args = get_args(python_type)
        if args:
            element_ts_type = python_type_to_ts(
                args[0],
                type_definitions,
                processed_types,
                use_input_types=use_input_types,
            )
            return f"Array<{element_ts_type}>"
        return "Array<any>"

    # Handle dict/Dict types
    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            key_ts_type = python_type_to_ts(
                args[0],
                type_definitions,
                processed_types,
                use_input_types=use_input_types,
            )
            key_ts_type = key_ts_type.replace("null,", "").replace(", null", "")
            value_ts_type = python_type_to_ts(
                args[1],
                type_definitions,
                processed_types,
                use_input_types=use_input_types,
            )
            return f"Record<{key_ts_type}, {value_ts_type}>"
        return "Record<string, any>"

    # Handle set/Set types
    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            element_ts_type = python_type_to_ts(
                args[0],
                type_definitions,
                processed_types,
                use_input_types=use_input_types,
            )
            return f"Set<{element_ts_type}>"
        return "Set<any>"

    # Handle tuple/Tuple types
    if origin in (tuple, Tuple):
        args = get_args(python_type)
        ts_types = [
            python_type_to_ts(
                t, type_definitions, processed_types, use_input_types=use_input_types
            )
            for t in args
        ]
        return f"[{', '.join(ts_types)}]"

    if python_type in basic_type_map:
        return basic_type_map[python_type]

    if hasattr(python_type, "__name__"):
        type_name = python_type.__name__
        if use_input_types and is_zod_schema_type(python_type):
            return f"{GENERATED_TYPE_ALIAS}.{type_name}Input"
        return f"{GENERATED_TYPE_ALIAS}.{type_name}"
    return "any"


def create_ts_fn_def(
    endpoint_path, method, fn_name, args, args_with_annotations, output_annotation
):
    endpoint_path_without_prefix = endpoint_path
    if endpoint_path_without_prefix.startswith(Route.PREFIX.value):
        endpoint_path_without_prefix = endpoint_path_without_prefix[
            len(Route.PREFIX.value) :
        ]
    if fn_name == "route_binary_download":
        return f"""
export async function {fn_name}(contentId: string): Promise<ResponseDataAndStatus<Uint8Array>> {{
    return await getBinary("{endpoint_path_without_prefix}", {{ contentId }})
}}
"""
    definition = f"\nexport async function {fn_name}({', '.join(args_with_annotations)}): Promise<ResponseDataAndStatus<{output_annotation}>>"
    if fn_name == "route_binary_upload":
        return f"""
export async function {fn_name}(form: FormData): Promise<ResponseDataAndStatus<{output_annotation}>> {{
    return await post("{endpoint_path_without_prefix}", form)
}}
"""
    if method == "POST":
        path_param_names = re.findall(r"{(.*?)}", endpoint_path_without_prefix)
        path_params = [arg for arg in args if arg in path_param_names]
        body_args = [arg for arg in args if arg not in path_param_names]
        if not body_args:
            body = "null"
        elif len(body_args) == 1:
            body = body_args[0]
        else:
            body = f"{{ {','.join(body_args)} }}"
        address_params = f"{{ {','.join(path_params)} }}" if path_params else ""
        if address_params:
            definition += f"""{{
            return await post("{endpoint_path_without_prefix}", {body}, {address_params})
        }}
    """
        else:
            definition += f"""{{
            return await post("{endpoint_path_without_prefix}", {body})
        }}
    """
    elif method == "GET":
        args = f"{{ {','.join(args)} }}" if len(args) > 0 else ""
        definition += f"""{{
            return await get("{endpoint_path_without_prefix}", {args})
        }}
    """
    else:
        raise ValueError
    return definition


def create_imports():
    return f"""
import * as {GENERATED_TYPE_ALIAS} from "./generatedTypes"
import {{ get, getBinary, post, ResponseDataAndStatus }} from "./endpointUtils"

"""


def main(output_path):
    specs = get_path_input_output_types()
    ts_code = create_imports()
    for endpoint_fn_name, s in specs.items():
        output_annotation = python_type_to_ts(s["output"], {}, set())
        args, args_with_annotations = create_args(s["inputs"])
        ts_code += create_ts_fn_def(
            s["path"],
            s["method"],
            endpoint_fn_name,
            args,
            args_with_annotations,
            output_annotation,
        )

    with open(output_path, "w") as f:
        f.write(ts_code)

    format_generated_code(output_path)


if __name__ == "__main__":
    main(get_absolute_path(__file__, "../src/utils/generatedEndpoints.ts"))
