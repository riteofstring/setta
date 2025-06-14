import inspect
from typing import get_type_hints

from fastapi import BackgroundTasks
from fastapi.routing import APIRoute
from setta.server import app
from setta.utils.utils import get_absolute_path

from .utils import format_generated_code


def get_path_input_output_types():
    output = {}

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        # deal with multiple methods some other time!
        assert len(route.methods) == 1

        route_info = {"method": list(route.methods)[0], "inputs": {}, "output": None}

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


def create_fn_name(s):
    if not s:
        return s

    result = []
    i = 0

    while i < len(s):
        if s[i] == "_":
            # Skip the underscore and capitalize the next character if it exists
            i += 1
            if i < len(s):
                result.append(s[i].upper())
        else:
            result.append(s[i])
        i += 1

    s = "".join(result)
    return "db" + s[0].upper() + s[1:]


def create_args(inputs, generate_types_alias):
    args = []
    for name, type in inputs.items():
        args.append(f"{name}:{generate_types_alias}.{type.__name__}")
    return ", ".join(args)


def get_ts_fn_def(fn_name, args):
    return f"""
export function {fn_name}({args}){{

}}

"""


def main(output_path):
    specs = get_path_input_output_types()
    generate_types_alias = "gt"
    ts_code = f'import * as {generate_types_alias} from "./generatedTypes"\n'
    for endpoint_fn_name, s in specs.items():
        fn_name = create_fn_name(endpoint_fn_name)
        args = create_args(s["inputs"], generate_types_alias)
        ts_code += get_ts_fn_def(fn_name, args)

    with open(output_path, "w") as f:
        f.write(ts_code)

    format_generated_code(output_path)


if __name__ == "__main__":
    main(get_absolute_path(__file__, "../src/utils/generatedEndpoints.ts"))
