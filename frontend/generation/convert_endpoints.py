import inspect
from typing import get_type_hints

from fastapi.routing import APIRoute
from setta.server import app


def is_depends_param(param):
    """Check if a parameter uses Depends"""
    if param.default is param.empty:
        return False

    # Check if it's a Depends instance
    return type(param.default).__name__ == "Depends"


output = {}

for route in app.routes:
    if not isinstance(route, APIRoute):
        continue

    route_info = {"methods": list(route.methods), "inputs": {}, "output": None}

    # Get function signature and type hints
    sig = inspect.signature(route.endpoint)
    type_hints = get_type_hints(route.endpoint)

    # Extract input parameters (excluding Depends)
    for param_name, param in sig.parameters.items():
        # Skip if it's a Depends parameter
        if is_depends_param(param):
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

    output[route.path] = route_info

for o in output.values():
    print(o["methods"])
