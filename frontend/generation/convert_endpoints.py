import inspect
import types
from typing import Union, get_args, get_origin, get_type_hints

from fastapi import BackgroundTasks
from fastapi.routing import APIRoute
from setta.server import app
from setta.types.routes import Route
from setta.utils.utils import get_absolute_path

from .utils import format_generated_code

basic_type_map = {
    str: "string",
    int: "number",
    bool: "boolean",
    type(None): "null",
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
        type_hints = get_type_hints(route.endpoint)

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


def maybe_get_basic_type_annotation(x):
    type_annotation = basic_type_map.get(x)
    if type_annotation:
        return type_annotation
    return f"{GENERATED_TYPE_ALIAS}.{x.__name__}"


def create_args(inputs):
    args = []
    args_with_annotations = []

    for name, type in inputs.items():
        type_annotation = maybe_get_basic_type_annotation(type)
        args.append(name)
        args_with_annotations.append(f"{name}:{type_annotation}")
    return args, args_with_annotations


def create_output_annotation(output_type):
    if output_type is type(None):
        return "null"
    origin = get_origin(output_type)
    if origin in (Union, types.UnionType):
        args = get_args(output_type)
        return " | ".join(maybe_get_basic_type_annotation(x) for x in args)
    elif origin is None:
        return f"{GENERATED_TYPE_ALIAS}.{output_type.__name__}"
    else:
        # support other stuff later
        raise ValueError


def create_ts_fn_def(
    endpoint_path, method, fn_name, args, args_with_annotations, output_annotation
):
    definition = f"\nexport async function {fn_name}({', '.join(args_with_annotations)}): Promise<{output_annotation}>"
    endpoint_path_without_prefix = endpoint_path.replace(Route.PREFIX.value, "")
    if method == "POST":
        assert len(args) <= 1
        arg = args[0] if len(args) == 1 else ""
        definition += f"""{{
            return await post("{endpoint_path_without_prefix}", {arg})
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
import {{ get, post }} from "./endpointUtils"

"""


def main(output_path):
    specs = get_path_input_output_types()
    ts_code = create_imports()
    for endpoint_fn_name, s in specs.items():
        output_annotation = create_output_annotation(s["output"])
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
