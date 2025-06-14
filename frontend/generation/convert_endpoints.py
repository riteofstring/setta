import inspect
from typing import get_type_hints

from fastapi import BackgroundTasks
from fastapi.routing import APIRoute
from setta.server import app
from setta.types.routes import Route
from setta.utils.utils import get_absolute_path

from .utils import format_generated_code


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


def create_args(inputs, generate_types_alias):
    args = []
    type_map = {
        str: "string",
        int: "number",
        bool: "boolean",
    }
    for name, type in inputs.items():
        type_annotation = type_map.get(type)
        if not type_annotation:
            type_annotation = f"{generate_types_alias}.{type.__name__}"
        args.append(f"{name}:{type_annotation}")
    return ", ".join(args)


def create_ts_fn_def(endpoint_path, method, fn_name, args):
    endpoint_path_without_prefix = endpoint_path.replace(Route.PREFIX.value, "")
    method_fn = {"POST": "post", "GET": "get"}[method]

    return f"""
export async function {fn_name}({args}){{
    return await {method_fn}("{endpoint_path_without_prefix}", {{}})
}}

"""


def create_imports(generate_types_alias):
    return f"""
import * as {generate_types_alias} from "./generatedTypes"
import {{ get, post }} from "./endpointUtils"

"""


def main(output_path):
    specs = get_path_input_output_types()
    generate_types_alias = "gt"
    ts_code = create_imports(generate_types_alias)
    for endpoint_fn_name, s in specs.items():
        args = create_args(s["inputs"], generate_types_alias)
        ts_code += create_ts_fn_def(s["path"], s["method"], endpoint_fn_name, args)

    with open(output_path, "w") as f:
        f.write(ts_code)

    format_generated_code(output_path)


if __name__ == "__main__":
    main(get_absolute_path(__file__, "../src/utils/generatedEndpoints.ts"))
