import inspect
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable, get_type_hints

from fastapi import BackgroundTasks
from fastapi.routing import APIRoute
from pydantic import BaseModel
from setta.runtime.context import RuntimeContext
from setta.server import app
from setta.server_state import SettaFastAPIState

_ALLOWED_ENDPOINT_MODULE_PREFIXES = (
    "setta.routers.project_manager",
    "setta.routers.terminals",
    "setta.routers.listener",
    "setta.routers.lsp",
)


@dataclass(frozen=True, slots=True)
class ListenerRouterEndpointSpec:
    endpoint_name: str
    endpoint: Callable[..., Any]
    request_model: type[BaseModel]
    request_param_name: str
    state_param_name: str | None
    runtime_context_param_name: str | None


def _is_allowed_module(module_name: str) -> bool:
    for prefix in _ALLOWED_ENDPOINT_MODULE_PREFIXES:
        if module_name.startswith(prefix):
            return True
    return False


def _build_spec(route: APIRoute) -> ListenerRouterEndpointSpec | None:
    endpoint = route.endpoint
    if not _is_allowed_module(endpoint.__module__):
        return None

    signature = inspect.signature(endpoint)
    type_hints = get_type_hints(endpoint)
    request_param_name: str | None = None
    request_model: type[BaseModel] | None = None
    state_param_name: str | None = None
    runtime_context_param_name: str | None = None

    for param in signature.parameters.values():
        if type(param.default).__name__ == "Depends":
            continue
        param_type = type_hints.get(param.name, param.annotation)
        if param_type is BackgroundTasks:
            continue
        if param_type is SettaFastAPIState:
            state_param_name = param.name
            continue
        if param_type is RuntimeContext:
            runtime_context_param_name = param.name
            continue
        if request_param_name is not None:
            return None
        if not inspect.isclass(param_type) or not issubclass(param_type, BaseModel):
            return None
        request_param_name = param.name
        request_model = param_type

    if request_param_name is None or request_model is None:
        return None
    if (
        "projectConfigId" not in request_model.model_fields
        and not endpoint.__module__.startswith("setta.routers.listener")
    ):
        return None

    return ListenerRouterEndpointSpec(
        endpoint_name=endpoint.__name__,
        endpoint=endpoint,
        request_model=request_model,
        request_param_name=request_param_name,
        state_param_name=state_param_name,
        runtime_context_param_name=runtime_context_param_name,
    )


@lru_cache(maxsize=1)
def get_listener_router_endpoint_specs() -> dict[str, ListenerRouterEndpointSpec]:
    specs: dict[str, ListenerRouterEndpointSpec] = {}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        spec = _build_spec(route)
        if spec is None:
            continue
        specs[spec.endpoint_name] = spec
    return specs
