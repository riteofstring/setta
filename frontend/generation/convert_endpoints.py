import inspect
from pathlib import Path
from typing import get_type_hints

from fastapi.routing import APIRoute
from setta.server import app


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
            if type(param.default).__name__ == "Depends":
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


def remove_underscores_and_capitalize(s):
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


def get_ts_fn_def(fn_name):
    return f"""
export function {fn_name}(){{

}}

"""


def main(output_path):
    specs = get_path_input_output_types()
    ts_code = ""
    for endpoint_fn_name, s in specs.items():
        fn_name = remove_underscores_and_capitalize(endpoint_fn_name)
        ts_code += get_ts_fn_def(fn_name)

    with open(output_path, "w") as f:
        f.write(ts_code)


if __name__ == "__main__":
    main(Path("./generatedEndpoints.ts"))
