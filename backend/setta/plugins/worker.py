import argparse
import asyncio
import base64
import datetime
import importlib.util
import inspect
import json
import sys
from dataclasses import dataclass, field, is_dataclass
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Literal, Union, get_args, get_origin
from urllib.parse import urlencode
from uuid import UUID

from fastapi.params import Body as _FastAPIBody
from fastapi.params import Param as _FastAPIParam
from pydantic import BaseModel, TypeAdapter
from pydantic_core import PydanticUndefined as _PydanticUndefined

BACKEND_PLUGIN_API_VERSION = 1
SUPPORTED_RPC_METHODS: tuple[str, ...] = (
    "plugin.initialize",
    "plugin.register",
    "plugin.shutdown",
    "plugin.invoke_route",
    "plugin.invoke_mcp_tool",
    "plugin.invoke_codegen_target",
    "plugin.invoke_ui_setting_handler",
    "host.register_router",
    "host.register_listener_endpoint",
    "host.register_static_dir",
    "host.register_mcp_tool",
    "host.register_language_server",
    "host.register_external_agent_adapter",
    "host.register_codegen_target",
    "host.register_ui_setting",
    "host.read_project_state",
    "host.emit_listener_dependency_event",
)
_PROTOCOL_STDOUT = sys.stdout
_ROUTE_SCALAR_ANNOTATION_TYPES: tuple[type[Any], ...] = (
    str,
    int,
    float,
    bool,
    bytes,
    bytearray,
    Decimal,
    UUID,
    datetime.date,
    datetime.datetime,
    datetime.time,
    datetime.timedelta,
    Path,
)


class WorkerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class _HostRpcCaller:
    def __init__(self) -> None:
        self._next_request_id = 10_000

    def call(self, method: str, params: dict[str, Any]) -> Any:
        request_id = self._next_request_id
        self._next_request_id += 1
        _emit_response(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            }
        )
        raw_line = sys.stdin.readline()
        if raw_line == "":
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "Host transport closed while waiting for host RPC response.",
            )
        try:
            payload = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                f"Host returned invalid JSON-RPC response: {raw_line.strip()}",
            ) from exc
        if not isinstance(payload, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "Host returned non-object JSON-RPC response.",
            )
        response_id = payload.get("id")
        if response_id != request_id:
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    "Host JSON-RPC response id mismatch while waiting for "
                    f"{method}: expected {request_id}, received {response_id!r}."
                ),
            )
        error_payload = payload.get("error")
        if isinstance(error_payload, dict):
            raw_code = error_payload.get("code")
            raw_message = error_payload.get("message")
            code = (
                raw_code
                if isinstance(raw_code, str)
                else "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
            )
            message = (
                raw_message
                if isinstance(raw_message, str)
                else "Host returned an invalid JSON-RPC error payload."
            )
            raise WorkerError(code, message)
        if "result" not in payload:
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "Host JSON-RPC response missing result field.",
            )
        return payload["result"]


def _ensure_json_serializable(
    value: Any,
    *,
    plugin_id: str,
    label: str,
) -> Any:
    try:
        json.dumps(value)
    except TypeError as exc:
        raise WorkerError(
            "PLUGIN_BACKEND_REGISTER_FAILED",
            (
                f"Plugin {plugin_id} passed a non-JSON-serializable {label} "
                "payload in isolated worker mode."
            ),
        ) from exc
    return value


@dataclass(slots=True)
class _WorkerRouteHandler:
    path: str
    endpoint: Callable[..., Any]
    needs_raw_body: bool


@dataclass(slots=True)
class _WorkerState:
    plugin_id: str
    plugin_version: str
    plugin_root: Path
    entrypoint_path: Path
    server_mode: Literal["ide", "share", "app"] = "ide"
    requested_capabilities: list[str] = field(default_factory=list)
    effective_capabilities: list[str] = field(default_factory=list)
    module: Any | None = None
    route_handlers: dict[str, _WorkerRouteHandler] = field(default_factory=dict)
    route_ids_by_endpoint_name: dict[str, list[str]] = field(default_factory=dict)
    mcp_tools_by_name: dict[str, Callable[..., Any]] = field(default_factory=dict)
    codegen_target_generators: dict[str, Callable[..., Any]] = field(
        default_factory=dict
    )
    ui_setting_read_handlers: dict[str, Callable[..., Any]] = field(
        default_factory=dict
    )
    ui_setting_write_handlers: dict[str, Callable[..., Any]] = field(
        default_factory=dict
    )
    _next_route_counter: int = 0
    _async_loop: asyncio.AbstractEventLoop | None = field(
        init=False, repr=False, default=None
    )

    def _load_module(self) -> Any:
        if self.module is not None:
            return self.module
        module_name = f"setta_plugin_worker_{self.plugin_id.replace('-', '_')}"
        spec = importlib.util.spec_from_file_location(module_name, self.entrypoint_path)
        if spec is None or spec.loader is None:
            raise WorkerError(
                "PLUGIN_BACKEND_IMPORT_FAILED",
                f"Failed to construct import spec for plugin {self.plugin_id}.",
            )
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except Exception as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_IMPORT_FAILED",
                f"Failed to import backend plugin {self.plugin_id}: {exc}",
            ) from exc
        self.module = module
        return module

    def _build_handshake_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "pluginId": self.plugin_id,
            "pluginVersion": self.plugin_version,
            "backendPluginApiVersion": BACKEND_PLUGIN_API_VERSION,
            "supportedRpcMethods": list(SUPPORTED_RPC_METHODS),
        }
        override_path = self.plugin_root / "backend" / "handshake.override.json"
        if not override_path.exists() or not override_path.is_file():
            return payload
        try:
            override_payload = json.loads(override_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_HANDSHAKE_INVALID",
                f"Invalid handshake override JSON for {self.plugin_id}: {exc}",
            ) from exc
        if not isinstance(override_payload, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_HANDSHAKE_INVALID",
                f"Handshake override payload must be an object for {self.plugin_id}.",
            )
        payload.update(override_payload)
        return payload

    def _allocate_route_id(self) -> str:
        route_id = f"route_{self._next_route_counter}"
        self._next_route_counter += 1
        return route_id

    def _register_router(
        self,
        router: Any,
        *,
        prefix: str | None,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        from fastapi import APIRouter
        from fastapi.routing import APIRoute

        if not isinstance(router, APIRouter):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} passed an invalid router to "
                    "register_router (expected fastapi.APIRouter)."
                ),
            )
        route_descriptors: list[dict[str, Any]] = []
        for route in router.routes:
            if not isinstance(route, APIRoute):
                continue
            raw_methods = route.methods or set()
            methods = sorted(
                method for method in raw_methods if method not in {"HEAD", "OPTIONS"}
            )
            if len(methods) == 0:
                continue
            route_id = self._allocate_route_id()
            needs_raw_body = self._route_endpoint_requires_raw_body(route.endpoint)
            self.route_handlers[route_id] = _WorkerRouteHandler(
                path=route.path,
                endpoint=route.endpoint,
                needs_raw_body=needs_raw_body,
            )
            endpoint_name = route.endpoint.__name__
            if endpoint_name not in self.route_ids_by_endpoint_name:
                self.route_ids_by_endpoint_name[endpoint_name] = []
            self.route_ids_by_endpoint_name[endpoint_name].append(route_id)
            route_descriptors.append(
                {
                    "routeId": route_id,
                    "path": route.path,
                    "methods": methods,
                    "needsRawBody": needs_raw_body,
                }
            )
        host_call(
            "host.register_router",
            {
                "prefix": prefix,
                "routes": route_descriptors,
            },
        )

    def _register_static_dir(
        self,
        *,
        url_prefix: str,
        path: str | Path,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        host_call(
            "host.register_static_dir",
            {
                "urlPrefix": url_prefix,
                "path": str(path),
            },
        )

    def _register_listener_endpoint(
        self,
        *,
        endpoint_name: str,
        route_id: str | None,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        if not isinstance(endpoint_name, str) or endpoint_name.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} listener endpoint name must be "
                    "a non-empty string."
                ),
            )
        normalized_endpoint_name = endpoint_name.strip()

        resolved_route_id = route_id
        if resolved_route_id is None:
            route_ids = self.route_ids_by_endpoint_name.get(normalized_endpoint_name)
            if route_ids is None or len(route_ids) == 0:
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {self.plugin_id} listener endpoint "
                        f"{normalized_endpoint_name!r} does not match any "
                        "registered route endpoint names."
                    ),
                )
            if len(route_ids) > 1:
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {self.plugin_id} listener endpoint "
                        f"{normalized_endpoint_name!r} is ambiguous; pass route_id "
                        "explicitly."
                    ),
                )
            resolved_route_id = route_ids[0]
        if not isinstance(resolved_route_id, str) or resolved_route_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} listener endpoint route_id must be "
                    "a non-empty string when provided."
                ),
            )
        normalized_route_id = resolved_route_id.strip()
        if normalized_route_id not in self.route_handlers:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} listener endpoint references unknown "
                    f"route id: {normalized_route_id}."
                ),
            )
        host_call(
            "host.register_listener_endpoint",
            {
                "endpointName": normalized_endpoint_name,
                "routeId": normalized_route_id,
            },
        )

    def _register_mcp_tool(
        self,
        *,
        func: Any,
        name: str | None,
        annotations: dict[str, Any] | None,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        if not callable(func):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {self.plugin_id} passed a non-callable MCP tool.",
            )
        tool_name = name if isinstance(name, str) and name.strip() else func.__name__
        if not isinstance(tool_name, str) or tool_name.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {self.plugin_id} provided an invalid MCP tool name.",
            )
        self.mcp_tools_by_name[tool_name] = func
        payload: dict[str, Any] = {
            "toolName": tool_name,
        }
        if annotations is not None:
            if not isinstance(annotations, dict):
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    f"Plugin {self.plugin_id} provided invalid MCP annotations payload.",
                )
            payload["annotations"] = _ensure_json_serializable(
                annotations,
                plugin_id=self.plugin_id,
                label="MCP annotations",
            )
        host_call("host.register_mcp_tool", payload)

    def _register_external_agent_adapter(
        self,
        *,
        adapter: Any,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        host_call(
            "host.register_external_agent_adapter",
            {
                "adapter": _ensure_json_serializable(
                    adapter,
                    plugin_id=self.plugin_id,
                    label="external agent adapter",
                )
            },
        )

    def _register_language_server(
        self,
        *,
        provider: Any,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        host_call(
            "host.register_language_server",
            {
                "provider": _ensure_json_serializable(
                    provider,
                    plugin_id=self.plugin_id,
                    label="language server",
                )
            },
        )

    def _register_codegen_target(
        self,
        *,
        target: Any,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        if not isinstance(target, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} codegen target registration "
                    "must be an object."
                ),
            )
        allowed_keys = {"id", "name", "language", "defaultFileName", "generate"}
        unknown_keys = sorted(set(target.keys()) - allowed_keys)
        if len(unknown_keys) > 0:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} codegen target registration has "
                    f"unsupported keys: {', '.join(unknown_keys)}"
                ),
            )
        raw_id = target.get("id")
        if not isinstance(raw_id, str) or raw_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {self.plugin_id} codegen target id must be a string.",
            )
        local_id = raw_id.strip()
        if ":" in local_id:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} codegen target id cannot contain "
                    "':' in worker mode."
                ),
            )
        raw_name = target.get("name")
        if not isinstance(raw_name, str) or raw_name.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {self.plugin_id} codegen target name must be a string.",
            )
        name = raw_name.strip()
        raw_language = target.get("language")
        if not isinstance(raw_language, str) or raw_language.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (f"Plugin {self.plugin_id} codegen target language must be a string."),
            )
        language = raw_language.strip()
        raw_default_file_name = target.get("defaultFileName")
        default_file_name: str | None = None
        if raw_default_file_name is not None:
            if (
                not isinstance(raw_default_file_name, str)
                or raw_default_file_name.strip() == ""
            ):
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {self.plugin_id} codegen target defaultFileName "
                        "must be a non-empty string when provided."
                    ),
                )
            default_file_name = raw_default_file_name.strip()
        raw_generate = target.get("generate")
        if not callable(raw_generate):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} codegen target generate must be "
                    "callable in worker mode."
                ),
            )
        if local_id in self.codegen_target_generators:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} registered duplicate codegen "
                    f"target id: {local_id}"
                ),
            )
        self.codegen_target_generators[local_id] = raw_generate
        target_payload: dict[str, Any] = {
            "id": local_id,
            "name": name,
            "language": language,
            "handlerId": local_id,
        }
        if default_file_name is not None:
            target_payload["defaultFileName"] = default_file_name
        host_call(
            "host.register_codegen_target",
            {"target": target_payload},
        )

    def _register_ui_setting(
        self,
        *,
        setting: Any,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        if not isinstance(setting, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (f"Plugin {self.plugin_id} ui setting registration must be an object."),
            )
        allowed_keys = {
            "id",
            "title",
            "description",
            "paneId",
            "revealKey",
            "synonyms",
            "mutability",
            "valueSchema",
            "read",
            "write",
        }
        unknown_keys = sorted(set(setting.keys()) - allowed_keys)
        if len(unknown_keys) > 0:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} ui setting registration has "
                    f"unsupported keys: {', '.join(unknown_keys)}"
                ),
            )
        raw_local_id = setting.get("id")
        if not isinstance(raw_local_id, str) or raw_local_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {self.plugin_id} ui setting id must be a non-empty string.",
            )
        local_id = raw_local_id.strip()
        if "::" in local_id:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} ui setting id cannot contain "
                    "'::' in worker mode."
                ),
            )
        raw_title = setting.get("title")
        if not isinstance(raw_title, str) or raw_title.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {self.plugin_id} ui setting title must be a non-empty string.",
            )
        raw_description = setting.get("description")
        if not isinstance(raw_description, str) or raw_description.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} ui setting description must be "
                    "a non-empty string."
                ),
            )
        raw_pane_id = setting.get("paneId")
        if not isinstance(raw_pane_id, str) or raw_pane_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {self.plugin_id} ui setting paneId must be a non-empty string.",
            )
        pane_id = raw_pane_id.strip()
        raw_reveal_key = setting.get("revealKey")
        if not isinstance(raw_reveal_key, str) or raw_reveal_key.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} ui setting revealKey must be "
                    "a non-empty string."
                ),
            )
        reveal_key = raw_reveal_key.strip()
        raw_synonyms = setting.get("synonyms")
        synonyms: list[str] = []
        if raw_synonyms is not None:
            if not isinstance(raw_synonyms, list):
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {self.plugin_id} ui setting synonyms must be "
                        "a string array."
                    ),
                )
            for index, raw_synonym in enumerate(raw_synonyms):
                if not isinstance(raw_synonym, str) or raw_synonym.strip() == "":
                    raise WorkerError(
                        "PLUGIN_BACKEND_REGISTER_FAILED",
                        (
                            f"Plugin {self.plugin_id} ui setting synonym at index "
                            f"{index} must be a non-empty string."
                        ),
                    )
                synonyms.append(raw_synonym.strip())
        raw_mutability = setting.get("mutability")
        if raw_mutability is None:
            mutability: Literal["readOnly", "writable"] = "writable"
        elif raw_mutability in {"readOnly", "writable"}:
            mutability = raw_mutability
        else:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} ui setting mutability must be "
                    "readOnly or writable."
                ),
            )

        raw_value_schema = setting.get("valueSchema")
        if not isinstance(raw_value_schema, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (f"Plugin {self.plugin_id} ui setting valueSchema must be an object."),
            )
        value_schema_payload = _ensure_json_serializable(
            raw_value_schema,
            plugin_id=self.plugin_id,
            label="ui setting valueSchema",
        )
        if not isinstance(value_schema_payload, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} ui setting valueSchema must remain "
                    "an object after serialization."
                ),
            )

        read_handler = setting.get("read")
        if not callable(read_handler):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {self.plugin_id} ui setting read handler must be callable.",
            )
        if local_id in self.ui_setting_read_handlers:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} registered duplicate ui setting id: "
                    f"{local_id}"
                ),
            )

        write_handler_id: str | None = None
        write_handler: Callable[..., Any] | None = None
        if mutability == "writable":
            raw_write_handler = setting.get("write")
            if not callable(raw_write_handler):
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {self.plugin_id} writable ui setting requires "
                        "a callable write handler."
                    ),
                )
            if local_id in self.ui_setting_write_handlers:
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {self.plugin_id} registered duplicate ui setting "
                        f"write handler id: {local_id}"
                    ),
                )
            write_handler = raw_write_handler
            write_handler_id = local_id
        elif setting.get("write") is not None:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {self.plugin_id} readOnly ui setting cannot define "
                    "a write handler."
                ),
            )

        host_call(
            "host.register_ui_setting",
            {
                "setting": {
                    "id": local_id,
                    "title": raw_title.strip(),
                    "description": raw_description.strip(),
                    "paneId": pane_id,
                    "revealKey": reveal_key,
                    "synonyms": synonyms,
                    "mutability": mutability,
                    "valueSchema": value_schema_payload,
                    "readHandlerId": local_id,
                    "writeHandlerId": write_handler_id,
                }
            },
        )
        self.ui_setting_read_handlers[local_id] = read_handler
        if write_handler is not None:
            self.ui_setting_write_handlers[local_id] = write_handler

    def _build_route_call_kwargs(
        self,
        endpoint: Callable[..., Any],
        *,
        path_params: dict[str, Any],
        query_params: dict[str, Any],
        json_body: Any,
        raw_body: bytes | None,
        request_context: dict[str, Any] | None,
        route_path: str,
        route_id: str,
    ) -> dict[str, Any]:
        signature = inspect.signature(endpoint)
        body_bound_parameter_names = [
            param_name
            for param_name, parameter in signature.parameters.items()
            if self._route_parameter_is_body_bound(parameter)
        ]
        multiple_body_bound_parameters = len(body_bound_parameter_names) > 1
        kwargs: dict[str, Any] = {}
        request_object: Any = None
        unresolved_parameters: list[inspect.Parameter] = []
        for param_name, parameter in signature.parameters.items():
            if self._route_param_expects_request(parameter):
                if request_object is None:
                    request_object = self._build_route_request(
                        route_path=route_path,
                        path_params=path_params,
                        query_params=query_params,
                        json_body=json_body,
                        raw_body=raw_body,
                        request_context=request_context,
                    )
                kwargs[param_name] = request_object
                continue
            if param_name in path_params:
                kwargs[param_name] = self._coerce_route_parameter_value(
                    parameter=parameter,
                    value=path_params[param_name],
                    route_id=route_id,
                )
                continue
            if param_name in query_params:
                normalized_query_value = self._normalize_route_query_parameter_value(
                    parameter=parameter,
                    value=query_params[param_name],
                )
                kwargs[param_name] = self._coerce_route_parameter_value(
                    parameter=parameter,
                    value=normalized_query_value,
                    route_id=route_id,
                )
                continue
            parameter_is_body_bound = self._route_parameter_is_body_bound(parameter)
            if (
                parameter_is_body_bound
                and self._route_parameter_uses_embedded_json_field(
                    parameter=parameter,
                    multiple_body_bound_parameters=multiple_body_bound_parameters,
                )
                and isinstance(json_body, dict)
                and param_name in json_body
            ):
                kwargs[param_name] = self._coerce_route_parameter_value(
                    parameter=parameter,
                    value=json_body[param_name],
                    route_id=route_id,
                )
                continue
            if (
                parameter_is_body_bound
                and param_name == "body"
                and json_body is not None
            ):
                kwargs[param_name] = self._coerce_route_parameter_value(
                    parameter=parameter,
                    value=json_body,
                    route_id=route_id,
                )
                continue
            unresolved_parameters.append(parameter)

        unresolved_body_parameters = [
            parameter
            for parameter in unresolved_parameters
            if self._route_parameter_is_body_bound(parameter)
        ]
        unresolved_required_non_body_parameters = [
            parameter
            for parameter in unresolved_parameters
            if self._route_parameter_is_required(parameter)
            and not self._route_parameter_is_body_bound(parameter)
        ]
        if (
            json_body is not None
            and len(unresolved_body_parameters) == 1
            and len(unresolved_required_non_body_parameters) == 0
        ):
            fallback_parameter = unresolved_body_parameters[0]
            kwargs[fallback_parameter.name] = self._coerce_route_parameter_value(
                parameter=fallback_parameter,
                value=json_body,
                route_id=route_id,
            )
            unresolved_parameters = [
                parameter
                for parameter in unresolved_parameters
                if parameter.name != fallback_parameter.name
            ]

        for parameter in unresolved_parameters:
            is_required, default_value = self._resolve_route_parameter_default(
                parameter
            )
            if is_required:
                raise WorkerError(
                    "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                    (
                        f"Missing required parameter {parameter.name!r} for plugin "
                        f"route {route_id} in {self.plugin_id}."
                    ),
                )
            kwargs[parameter.name] = default_value
        return kwargs

    def _route_parameter_is_required(self, parameter: inspect.Parameter) -> bool:
        is_required, _default_value = self._resolve_route_parameter_default(parameter)
        return is_required

    def _route_parameter_is_body_bound(self, parameter: inspect.Parameter) -> bool:
        default_value = parameter.default
        if isinstance(default_value, _FastAPIBody):
            return True
        if isinstance(default_value, _FastAPIParam):
            return False
        return self._route_annotation_is_body_like(parameter.annotation)

    def _route_annotation_is_body_like(self, annotation: Any) -> bool:
        return not self._route_annotation_is_scalar(annotation)

    def _route_parameter_uses_embedded_json_field(
        self,
        *,
        parameter: inspect.Parameter,
        multiple_body_bound_parameters: bool,
    ) -> bool:
        default_value = parameter.default
        if isinstance(default_value, _FastAPIBody):
            embed_value = getattr(default_value, "embed", None)
            return bool(embed_value)
        return multiple_body_bound_parameters

    def _route_annotation_is_scalar(self, annotation: Any) -> bool:
        if annotation is inspect.Signature.empty or annotation is Any:
            return True
        if annotation is None:
            return True
        if annotation is type(None):
            return True
        origin = get_origin(annotation)
        if origin is not None:
            if origin is Literal:
                literal_values = [option for option in get_args(annotation)]
                if len(literal_values) == 0:
                    return True
                for option in literal_values:
                    if option is None:
                        continue
                    if not self._route_annotation_is_scalar(type(option)):
                        return False
                return True
            if origin is list or origin is tuple or origin is set or origin is dict:
                return False
            if origin is Union:
                annotation_options = [
                    option
                    for option in get_args(annotation)
                    if option is not type(None)
                ]
                if len(annotation_options) == 0:
                    return True
                return all(
                    self._route_annotation_is_scalar(option)
                    for option in annotation_options
                )
            origin_name = getattr(origin, "__qualname__", "")
            if origin_name == "UnionType":
                annotation_options = [
                    option
                    for option in get_args(annotation)
                    if option is not type(None)
                ]
                if len(annotation_options) == 0:
                    return True
                return all(
                    self._route_annotation_is_scalar(option)
                    for option in annotation_options
                )
            if origin_name == "Annotated":
                annotation_args = get_args(annotation)
                if len(annotation_args) == 0:
                    return True
                return self._route_annotation_is_scalar(annotation_args[0])
            annotation_options = [
                option for option in get_args(annotation) if option is not type(None)
            ]
            if len(annotation_options) == 0:
                return True
            return all(
                self._route_annotation_is_scalar(option)
                for option in annotation_options
            )
        if inspect.isclass(annotation):
            if issubclass(annotation, BaseModel):
                return False
            if is_dataclass(annotation):
                return False
            if issubclass(annotation, Enum):
                return True
            if issubclass(annotation, _ROUTE_SCALAR_ANNOTATION_TYPES):
                return True
            return False
        return True

    def _normalize_route_query_parameter_value(
        self,
        *,
        parameter: inspect.Parameter,
        value: Any,
    ) -> Any:
        annotation = parameter.annotation
        if annotation is inspect.Signature.empty or annotation is Any:
            return value
        if self._route_annotation_accepts_multiple_query_values(annotation):
            if isinstance(value, list):
                return value
            return [value]
        if isinstance(value, list):
            if len(value) == 0:
                return value
            return value[-1]
        return value

    def _route_annotation_accepts_multiple_query_values(self, annotation: Any) -> bool:
        if annotation is inspect.Signature.empty or annotation is Any:
            return False
        if annotation is None:
            return False
        if annotation is type(None):
            return False
        origin = get_origin(annotation)
        if origin is list or origin is tuple or origin is set:
            return True
        if origin is Union:
            annotation_options = [
                option for option in get_args(annotation) if option is not type(None)
            ]
            if len(annotation_options) == 0:
                return False
            return any(
                self._route_annotation_accepts_multiple_query_values(option)
                for option in annotation_options
            )
        origin_name = getattr(origin, "__qualname__", "")
        if origin_name == "UnionType":
            annotation_options = [
                option for option in get_args(annotation) if option is not type(None)
            ]
            if len(annotation_options) == 0:
                return False
            return any(
                self._route_annotation_accepts_multiple_query_values(option)
                for option in annotation_options
            )
        if origin_name == "Annotated":
            annotation_args = get_args(annotation)
            if len(annotation_args) == 0:
                return False
            return self._route_annotation_accepts_multiple_query_values(
                annotation_args[0]
            )
        return False

    def _resolve_route_parameter_default(
        self, parameter: inspect.Parameter
    ) -> tuple[bool, Any]:
        default_value = parameter.default
        if default_value is inspect.Signature.empty:
            return True, None
        if isinstance(default_value, _FastAPIParam):
            param_default = default_value.default
            if self._is_fastapi_required_default(param_default):
                return True, None
            return False, param_default
        return False, default_value

    def _is_fastapi_required_default(self, value: Any) -> bool:
        if value is Ellipsis:
            return True
        return value is _PydanticUndefined

    def _route_param_expects_request(self, parameter: inspect.Parameter) -> bool:
        annotation = parameter.annotation
        if annotation is inspect.Signature.empty:
            return False
        from starlette.requests import Request

        if inspect.isclass(annotation) and issubclass(annotation, Request):
            return True
        origin = get_origin(annotation)
        if origin is None:
            return False
        for option in get_args(annotation):
            if inspect.isclass(option) and issubclass(option, Request):
                return True
        return False

    def _route_endpoint_requires_raw_body(self, endpoint: Callable[..., Any]) -> bool:
        signature = inspect.signature(endpoint)
        for parameter in signature.parameters.values():
            if self._route_param_expects_request(parameter):
                return True
        return False

    def _coerce_route_parameter_value(
        self,
        *,
        parameter: inspect.Parameter,
        value: Any,
        route_id: str,
    ) -> Any:
        annotation = parameter.annotation
        if annotation is inspect.Signature.empty or annotation is Any:
            return value
        try:
            return TypeAdapter(annotation).validate_python(value)
        except Exception as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                (
                    f"Invalid value for parameter {parameter.name!r} for plugin "
                    f"route {route_id} in {self.plugin_id}: {exc}"
                ),
            ) from exc

    def _build_route_request(
        self,
        *,
        route_path: str,
        path_params: dict[str, Any],
        query_params: dict[str, Any],
        json_body: Any,
        raw_body: bytes | None,
        request_context: dict[str, Any] | None,
    ) -> Any:
        from starlette.requests import Request

        context = request_context if isinstance(request_context, dict) else {}
        raw_method = context.get("method")
        method = raw_method if isinstance(raw_method, str) else "GET"
        raw_path = context.get("path")
        path = raw_path if isinstance(raw_path, str) and raw_path else route_path
        raw_query_string = context.get("queryString")
        if isinstance(raw_query_string, str):
            query_string = raw_query_string.encode("utf-8")
        else:
            query_items: list[tuple[str, str]] = []
            for key, raw_value in query_params.items():
                if isinstance(raw_value, list):
                    for list_item in raw_value:
                        query_items.append((str(key), str(list_item)))
                    continue
                query_items.append((str(key), str(raw_value)))
            query_string = urlencode(query_items).encode("utf-8")
        raw_headers = context.get("headers")
        headers: list[tuple[bytes, bytes]] = []
        if isinstance(raw_headers, list):
            for item in raw_headers:
                if (
                    isinstance(item, (tuple, list))
                    and len(item) == 2
                    and isinstance(item[0], str)
                    and isinstance(item[1], str)
                ):
                    headers.append(
                        (item[0].lower().encode("utf-8"), item[1].encode("utf-8"))
                    )
        if len(headers) == 0:
            headers.append((b"content-type", b"application/json"))

        body_bytes = (
            raw_body
            if raw_body is not None
            else self._encode_route_request_body(json_body)
        )
        body_sent = False

        async def _receive() -> dict[str, Any]:
            nonlocal body_sent
            if body_sent:
                return {
                    "type": "http.request",
                    "body": b"",
                    "more_body": False,
                }
            body_sent = True
            return {
                "type": "http.request",
                "body": body_bytes,
                "more_body": False,
            }

        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": method.upper(),
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": query_string,
            "headers": headers,
            "client": ("127.0.0.1", 0),
            "server": ("setta-plugin-worker", 80),
            "path_params": path_params,
        }
        return Request(scope, _receive)

    def _encode_route_request_body(self, json_body: Any) -> bytes:
        if json_body is None:
            return b""
        if isinstance(json_body, bytes):
            return json_body
        if isinstance(json_body, str):
            return json_body.encode("utf-8")
        return json.dumps(json_body).encode("utf-8")

    def _invoke_route(self, params: Any) -> dict[str, Any]:
        if not isinstance(params, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "plugin.invoke_route params must be an object.",
            )
        route_id = params.get("routeId")
        if not isinstance(route_id, str) or route_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                "plugin.invoke_route missing routeId.",
            )
        route_handler = self.route_handlers.get(route_id)
        if route_handler is None:
            raise WorkerError(
                "PLUGIN_BACKEND_ROUTE_NOT_FOUND",
                f"Plugin route not found: {route_id}",
            )

        raw_path_params = params.get("pathParams", {})
        raw_query_params = params.get("queryParams", {})
        json_body = params.get("jsonBody")
        raw_body_base64 = params.get("rawBodyBase64")
        raw_request_context = params.get("requestContext")

        if not isinstance(raw_path_params, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                "plugin.invoke_route pathParams must be an object.",
            )
        if not isinstance(raw_query_params, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                "plugin.invoke_route queryParams must be an object.",
            )
        route_raw_body: bytes | None = None
        if raw_body_base64 is not None and route_handler.needs_raw_body:
            if not isinstance(raw_body_base64, str):
                raise WorkerError(
                    "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                    "plugin.invoke_route rawBodyBase64 must be a string.",
                )
            try:
                route_raw_body = base64.b64decode(raw_body_base64, validate=True)
            except Exception as exc:
                raise WorkerError(
                    "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                    "plugin.invoke_route rawBodyBase64 must be valid base64.",
                ) from exc
        request_context: dict[str, Any] | None = None
        if raw_request_context is not None:
            if not isinstance(raw_request_context, dict):
                raise WorkerError(
                    "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                    "plugin.invoke_route requestContext must be an object.",
                )
            request_context = raw_request_context

        kwargs = self._build_route_call_kwargs(
            route_handler.endpoint,
            path_params=raw_path_params,
            query_params=raw_query_params,
            json_body=json_body,
            raw_body=route_raw_body,
            request_context=request_context,
            route_path=route_handler.path,
            route_id=route_id,
        )
        from fastapi import HTTPException

        try:
            result = route_handler.endpoint(**kwargs)
        except HTTPException as exc:
            return self._normalize_http_exception_response(exc)
        except Exception as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_ROUTE_CALL_FAILED",
                f"Plugin route {route_id} execution failed for {self.plugin_id}: {exc}",
            ) from exc
        if inspect.isawaitable(result):
            try:
                result = self._run_route_awaitable(result, route_id=route_id)
            except HTTPException as exc:
                return self._normalize_http_exception_response(exc)
        return self._normalize_route_result(result)

    def _run_route_awaitable(self, awaitable: Any, *, route_id: str) -> Any:
        from fastapi import HTTPException

        if self._async_loop is None:
            self._async_loop = asyncio.new_event_loop()
        try:
            return self._async_loop.run_until_complete(awaitable)
        except HTTPException:
            raise
        except Exception as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_ROUTE_CALL_FAILED",
                (
                    f"Async plugin route {route_id} execution failed for "
                    f"{self.plugin_id}: {exc}"
                ),
            ) from exc

    def _normalize_http_exception_response(self, exc: Any) -> dict[str, Any]:
        response: dict[str, Any] = {
            "statusCode": exc.status_code,
            "body": {"detail": exc.detail},
            "mediaType": "application/json",
        }
        headers = self._normalize_route_response_headers(exc.headers or {})
        if len(headers) > 0:
            response["headers"] = headers
        return response

    def _normalize_route_result(self, result: Any) -> dict[str, Any]:
        from starlette.responses import Response

        if isinstance(result, Response):
            return self._normalize_starlette_response(result)
        return {
            "statusCode": 200,
            "body": result,
        }

    def _normalize_starlette_response(self, response: Any) -> dict[str, Any]:
        media_type = response.media_type
        content_type = (
            response.headers.get("content-type")
            if hasattr(response.headers, "get")
            else None
        )
        if (
            (not isinstance(media_type, str) or media_type.strip() == "")
            and isinstance(content_type, str)
            and content_type.strip() != ""
        ):
            media_type = content_type
        response_payload: dict[str, Any] = {
            "statusCode": response.status_code,
        }
        if isinstance(media_type, str) and media_type.strip() != "":
            response_payload["mediaType"] = media_type
        headers = self._normalize_route_response_headers(
            response.headers,
            include_content_type_header="mediaType" not in response_payload,
        )
        if len(headers) > 0:
            response_payload["headers"] = headers
        raw_body = getattr(response, "body", b"")
        body = bytes(raw_body) if raw_body is not None else b""
        if len(body) == 0:
            return response_payload
        charset = response.charset or "utf-8"
        if self._content_type_is_json(content_type):
            try:
                response_payload["body"] = json.loads(body.decode(charset))
            except (UnicodeDecodeError, json.JSONDecodeError):
                response_payload["body"] = body.decode(charset, errors="replace")
            return response_payload
        if self._content_type_is_text(content_type):
            response_payload["body"] = body.decode(charset, errors="replace")
            return response_payload
        try:
            response_payload["body"] = body.decode("utf-8")
        except UnicodeDecodeError:
            response_payload["body"] = base64.b64encode(body).decode("ascii")
            response_payload["bodyEncoding"] = "base64"
        return response_payload

    def _normalize_route_response_headers(
        self,
        headers: Any,
        *,
        include_content_type_header: bool = False,
    ) -> list[list[str]]:
        normalized: list[list[str]] = []
        if not hasattr(headers, "items"):
            return normalized
        skipped_headers = {
            "content-length",
            "transfer-encoding",
        }
        if not include_content_type_header:
            skipped_headers.add("content-type")
        for raw_name, raw_value in headers.items():
            if not isinstance(raw_name, str) or not isinstance(raw_value, str):
                continue
            header_name = raw_name.strip()
            if header_name == "":
                continue
            if header_name.lower() in skipped_headers:
                continue
            normalized.append([header_name, raw_value])
        return normalized

    def _content_type_is_json(self, raw_content_type: Any) -> bool:
        if not isinstance(raw_content_type, str):
            return False
        media_type = raw_content_type.split(";", 1)[0].strip().lower()
        return media_type == "application/json" or media_type.endswith("+json")

    def _content_type_is_text(self, raw_content_type: Any) -> bool:
        if not isinstance(raw_content_type, str):
            return False
        media_type = raw_content_type.split(";", 1)[0].strip().lower()
        return media_type.startswith("text/")

    def _invoke_mcp_tool(self, params: Any) -> dict[str, Any]:
        if not isinstance(params, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "plugin.invoke_mcp_tool params must be an object.",
            )
        tool_name = params.get("toolName")
        if not isinstance(tool_name, str) or tool_name.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "plugin.invoke_mcp_tool missing toolName.",
            )
        tool_fn = self.mcp_tools_by_name.get(tool_name)
        if tool_fn is None:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin MCP tool not found: {tool_name}",
            )

        raw_args = params.get("args", [])
        raw_kwargs = params.get("kwargs", {})
        if not isinstance(raw_args, list):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "plugin.invoke_mcp_tool args must be an array.",
            )
        if not isinstance(raw_kwargs, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "plugin.invoke_mcp_tool kwargs must be an object.",
            )

        try:
            result = tool_fn(*raw_args, **raw_kwargs)
        except Exception as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_MCP_TOOL_FAILED",
                (
                    f"Plugin MCP tool {tool_name} execution failed for "
                    f"{self.plugin_id}: {exc}"
                ),
            ) from exc
        if inspect.isawaitable(result):
            result = self._run_awaitable(
                result,
                code="PLUGIN_BACKEND_MCP_TOOL_FAILED",
                message_prefix=(
                    f"Async plugin MCP tool {tool_name} execution failed for "
                    f"{self.plugin_id}"
                ),
            )
        return {
            "result": result,
        }

    def _invoke_codegen_target(self, params: Any) -> dict[str, Any]:
        if not isinstance(params, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "plugin.invoke_codegen_target params must be an object.",
            )
        raw_handler_id = params.get("handlerId")
        if not isinstance(raw_handler_id, str) or raw_handler_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                "plugin.invoke_codegen_target missing handlerId.",
            )
        handler_id = raw_handler_id.strip()
        target_generator = self.codegen_target_generators.get(handler_id)
        if target_generator is None:
            raise WorkerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                f"Plugin codegen target handler not found: {handler_id}",
            )
        project_state = params.get("projectState")
        if not isinstance(project_state, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                "plugin.invoke_codegen_target projectState must be an object.",
            )
        raw_target_options = params.get("targetOptions", {})
        if not isinstance(raw_target_options, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                "plugin.invoke_codegen_target targetOptions must be an object.",
            )
        try:
            result = target_generator(project_state, raw_target_options)
        except Exception as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                (
                    f"Plugin codegen target {handler_id} execution failed for "
                    f"{self.plugin_id}: {exc}"
                ),
            ) from exc
        if inspect.isawaitable(result):
            result = self._run_awaitable(
                result,
                code="PLUGIN_BACKEND_CODEGEN_FAILED",
                message_prefix=(
                    f"Async plugin codegen target {handler_id} execution failed "
                    f"for {self.plugin_id}"
                ),
            )
        return _ensure_json_serializable(
            result,
            plugin_id=self.plugin_id,
            label="codegen target result",
        )

    def _invoke_ui_setting_handler(self, params: Any) -> dict[str, Any]:
        if not isinstance(params, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "plugin.invoke_ui_setting_handler params must be an object.",
            )
        raw_handler_id = params.get("handlerId")
        if not isinstance(raw_handler_id, str) or raw_handler_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "plugin.invoke_ui_setting_handler missing handlerId.",
            )
        handler_id = raw_handler_id.strip()
        raw_operation = params.get("operation")
        if raw_operation not in {"read", "write"}:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "plugin.invoke_ui_setting_handler operation must be read or write.",
            )
        operation: Literal["read", "write"] = raw_operation
        raw_project_config_id = params.get("projectConfigId")
        if (
            not isinstance(raw_project_config_id, str)
            or raw_project_config_id.strip() == ""
        ):
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "plugin.invoke_ui_setting_handler missing projectConfigId.",
            )
        project_config_id = raw_project_config_id.strip()

        if operation == "read":
            handler = self.ui_setting_read_handlers.get(handler_id)
            if handler is None:
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (f"Plugin ui setting read handler not found: {handler_id}"),
                )
            try:
                result = handler(project_config_id=project_config_id)
            except TypeError as exc:
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        "Plugin ui setting read handler rejected call signature for "
                        f"{handler_id}: {exc}"
                    ),
                ) from exc
            except Exception as exc:
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin ui setting read handler {handler_id} failed for "
                        f"{self.plugin_id}: {exc}"
                    ),
                ) from exc
            if inspect.isawaitable(result):
                result = self._run_awaitable(
                    result,
                    code="PLUGIN_BACKEND_REGISTER_FAILED",
                    message_prefix=(
                        "Async plugin ui setting read handler failed for "
                        f"{self.plugin_id}:{handler_id}"
                    ),
                )
            return {
                "value": _ensure_json_serializable(
                    result,
                    plugin_id=self.plugin_id,
                    label="ui setting read result",
                )
            }

        handler = self.ui_setting_write_handlers.get(handler_id)
        if handler is None:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (f"Plugin ui setting write handler not found: {handler_id}"),
            )
        value = params.get("value")
        try:
            result = handler(project_config_id=project_config_id, value=value)
        except TypeError as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin ui setting write handler rejected call signature for "
                    f"{handler_id}: {exc}"
                ),
            ) from exc
        except Exception as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin ui setting write handler {handler_id} failed for "
                    f"{self.plugin_id}: {exc}"
                ),
            ) from exc
        if inspect.isawaitable(result):
            result = self._run_awaitable(
                result,
                code="PLUGIN_BACKEND_REGISTER_FAILED",
                message_prefix=(
                    "Async plugin ui setting write handler failed for "
                    f"{self.plugin_id}:{handler_id}"
                ),
            )
        return {
            "result": _ensure_json_serializable(
                result,
                plugin_id=self.plugin_id,
                label="ui setting write result",
            )
        }

    def _run_awaitable(
        self,
        awaitable: Any,
        *,
        code: str,
        message_prefix: str,
    ) -> Any:
        if self._async_loop is None:
            self._async_loop = asyncio.new_event_loop()
        try:
            return self._async_loop.run_until_complete(awaitable)
        except Exception as exc:
            raise WorkerError(code, f"{message_prefix}: {exc}") from exc

    def _close_async_loop(self) -> None:
        if self._async_loop is None:
            return
        if self._async_loop.is_closed():
            self._async_loop = None
            return
        pending_tasks = asyncio.all_tasks(self._async_loop)
        for task in pending_tasks:
            task.cancel()
        if pending_tasks:
            self._async_loop.run_until_complete(
                asyncio.gather(*pending_tasks, return_exceptions=True)
            )
        self._async_loop.close()
        self._async_loop = None

    def call(
        self,
        method: str,
        *,
        params: Any,
        host_call: Callable[[str, dict[str, Any]], Any] | None,
    ) -> Any:
        if method == "plugin.initialize":
            self._load_module()
            return self._build_handshake_payload()
        if method == "plugin.register":
            module = self._load_module()
            register_fn = getattr(module, "register", None)
            if register_fn is None or not callable(register_fn):
                raise WorkerError(
                    "PLUGIN_BACKEND_IMPORT_FAILED",
                    (
                        f"Backend plugin {self.plugin_id} does not expose a callable "
                        "register(plugin) entrypoint."
                    ),
                )
            if host_call is None:
                raise WorkerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    "Host RPC caller is unavailable for plugin.register.",
                )
            context = _WorkerBackendPluginContext(self, host_call)
            try:
                result = register_fn(context)
            except WorkerError:
                raise
            except Exception as exc:
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    f"Backend plugin register failed for {self.plugin_id}: {exc}",
                ) from exc
            if inspect.isawaitable(result):
                raise WorkerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Backend plugin {self.plugin_id} returned an awaitable from "
                        "register(plugin); async register is not supported in MVP."
                    ),
                )
            return {"ok": True}
        if method == "plugin.shutdown":
            self._close_async_loop()
            return {"ok": True}
        if method == "plugin.invoke_route":
            return self._invoke_route(params)
        if method == "plugin.invoke_mcp_tool":
            return self._invoke_mcp_tool(params)
        if method == "plugin.invoke_codegen_target":
            return self._invoke_codegen_target(params)
        if method == "plugin.invoke_ui_setting_handler":
            return self._invoke_ui_setting_handler(params)
        raise WorkerError(
            "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            f"Unsupported worker method: {method}",
        )


class _WorkerBackendPluginContext:
    def __init__(
        self,
        state: _WorkerState,
        host_call: Callable[[str, dict[str, Any]], Any],
    ) -> None:
        self._state = state
        self._host_call = host_call
        self.plugin_id = state.plugin_id
        self.plugin_root = state.plugin_root
        self.server_mode: Literal["ide", "share", "app"] = state.server_mode
        self.requested_capabilities: list[str] = list(state.requested_capabilities)
        self.effective_capabilities: list[str] = list(state.effective_capabilities)

    @property
    def deployment_mode(self) -> bool:
        return self.server_mode in {"share", "app"}

    def register_router(self, router: Any, *, prefix: str | None = None) -> None:
        self._state._register_router(router, prefix=prefix, host_call=self._host_call)

    def register_static_dir(self, url_prefix: str, path: str | Path) -> None:
        self._state._register_static_dir(
            url_prefix=url_prefix,
            path=path,
            host_call=self._host_call,
        )

    def register_mcp_tool(
        self,
        func: Any,
        *,
        name: str | None = None,
        annotations: dict[str, Any] | None = None,
    ) -> None:
        self._state._register_mcp_tool(
            func=func,
            name=name,
            annotations=annotations,
            host_call=self._host_call,
        )

    def register_external_agent_adapter(self, adapter: Any) -> None:
        self._state._register_external_agent_adapter(
            adapter=adapter,
            host_call=self._host_call,
        )

    def register_language_server(self, provider: Any) -> None:
        self._state._register_language_server(
            provider=provider,
            host_call=self._host_call,
        )

    def register_codegen_target(self, target: Any) -> None:
        self._state._register_codegen_target(
            target=target,
            host_call=self._host_call,
        )

    def register_ui_setting(self, setting: Any) -> None:
        self._state._register_ui_setting(
            setting=setting,
            host_call=self._host_call,
        )

    def register_listener_endpoint(
        self, endpoint_name: str, *, route_id: str | None = None
    ) -> None:
        self._state._register_listener_endpoint(
            endpoint_name=endpoint_name,
            route_id=route_id,
            host_call=self._host_call,
        )

    def read_project_state(
        self,
        *,
        project_config_id: str,
        share_session_id: str | None = None,
        view: Literal["summary", "full"] = "summary",
    ) -> Any:
        if not isinstance(project_config_id, str) or project_config_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "read_project_state project_config_id must be a non-empty string.",
            )
        if view not in {"summary", "full"}:
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "read_project_state view must be 'summary' or 'full'.",
            )
        params: dict[str, Any] = {
            "projectConfigId": project_config_id.strip(),
            "view": view,
        }
        if share_session_id is not None:
            if not isinstance(share_session_id, str) or share_session_id.strip() == "":
                raise WorkerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    "read_project_state share_session_id must be non-empty when set.",
                )
            params["shareSessionId"] = share_session_id.strip()
        result = self._host_call("host.read_project_state", params)
        if not isinstance(result, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "Host read_project_state response must be an object.",
            )
        project_state = result.get("projectState")
        if not isinstance(project_state, dict):
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                "Host read_project_state response missing projectState object.",
            )
        return project_state

    def emit_listener_dependency_event(
        self,
        *,
        project_config_id: str,
        dependency_events: list[dict[str, Any]],
        share_session_id: str | None = None,
    ) -> None:
        if not isinstance(project_config_id, str) or project_config_id.strip() == "":
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    "emit_listener_dependency_event project_config_id must be "
                    "a non-empty string."
                ),
            )
        if not isinstance(dependency_events, list) or len(dependency_events) == 0:
            raise WorkerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    "emit_listener_dependency_event dependency_events must be a "
                    "non-empty list."
                ),
            )
        params: dict[str, Any] = {
            "projectConfigId": project_config_id.strip(),
            "dependencyEvents": _ensure_json_serializable(
                dependency_events,
                plugin_id=self.plugin_id,
                label="dependency events",
            ),
        }
        if share_session_id is not None:
            if not isinstance(share_session_id, str) or share_session_id.strip() == "":
                raise WorkerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        "emit_listener_dependency_event share_session_id must be "
                        "non-empty when set."
                    ),
                )
            params["shareSessionId"] = share_session_id.strip()
        self._host_call("host.emit_listener_dependency_event", params)

    def register_startup_task(self, _coro_fn: Any) -> None:
        raise WorkerError(
            "PLUGIN_BACKEND_REGISTER_FAILED",
            (
                f"Plugin {self.plugin_id} register_startup_task is not supported "
                "in isolated worker mode."
            ),
        )

    def register_shutdown_task(self, _coro_fn: Any) -> None:
        raise WorkerError(
            "PLUGIN_BACKEND_REGISTER_FAILED",
            (
                f"Plugin {self.plugin_id} register_shutdown_task is not supported "
                "in isolated worker mode."
            ),
        )


def _emit_response(payload: dict[str, Any]) -> None:
    try:
        serialized = json.dumps(payload)
    except TypeError:
        serialized = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": payload.get("id"),
                "error": {
                    "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    "message": "Worker failed to serialize JSON-RPC payload.",
                },
            }
        )
    _PROTOCOL_STDOUT.write(serialized + "\n")
    _PROTOCOL_STDOUT.flush()


def _redirect_plugin_stdout_to_stderr() -> None:
    # Plugin stdout must never share the JSON-RPC protocol stream.
    sys.stdout = sys.stderr


def main() -> int:
    parser = argparse.ArgumentParser(description="Setta plugin backend worker")
    parser.add_argument("--plugin-id", required=True)
    parser.add_argument("--plugin-version", required=True)
    parser.add_argument("--plugin-root", required=True)
    parser.add_argument("--entrypoint", required=True)
    parser.add_argument(
        "--server-mode",
        choices=["ide", "share", "app"],
        default="ide",
    )
    parser.add_argument(
        "--requested-capability",
        action="append",
        default=[],
    )
    parser.add_argument(
        "--effective-capability",
        action="append",
        default=[],
    )
    args = parser.parse_args()

    plugin_id = str(args.plugin_id).strip()
    plugin_version = str(args.plugin_version).strip()
    plugin_root = Path(args.plugin_root).expanduser().resolve(strict=False)
    entrypoint_path = Path(args.entrypoint).expanduser().resolve(strict=False)

    if not plugin_id:
        _emit_response(
            {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": "PLUGIN_BACKEND_IMPORT_FAILED",
                    "message": "Missing plugin id.",
                },
            }
        )
        return 1
    if not plugin_version:
        _emit_response(
            {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": "PLUGIN_BACKEND_IMPORT_FAILED",
                    "message": "Missing plugin version.",
                },
            }
        )
        return 1
    if not entrypoint_path.exists() or not entrypoint_path.is_file():
        _emit_response(
            {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": "PLUGIN_BACKEND_IMPORT_FAILED",
                    "message": f"Backend entrypoint not found: {entrypoint_path}",
                },
            }
        )
        return 1

    _redirect_plugin_stdout_to_stderr()

    state = _WorkerState(
        plugin_id=plugin_id,
        plugin_version=plugin_version,
        plugin_root=plugin_root,
        entrypoint_path=entrypoint_path,
        server_mode=args.server_mode,
        requested_capabilities=list(args.requested_capability),
        effective_capabilities=list(args.effective_capability),
    )
    host_rpc_caller = _HostRpcCaller()

    while True:
        raw_line = sys.stdin.readline()
        if raw_line == "":
            break
        line = raw_line.strip()
        if not line:
            continue
        try:
            request_payload = json.loads(line)
        except json.JSONDecodeError:
            _emit_response(
                {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {
                        "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                        "message": "Invalid JSON-RPC payload.",
                    },
                }
            )
            continue
        if not isinstance(request_payload, dict):
            _emit_response(
                {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {
                        "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                        "message": "JSON-RPC payload must be an object.",
                    },
                }
            )
            continue
        request_id = request_payload.get("id")
        method = request_payload.get("method")
        if not isinstance(method, str):
            _emit_response(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                        "message": "JSON-RPC method must be a string.",
                    },
                }
            )
            continue
        params = request_payload.get("params")
        try:
            result = state.call(
                method,
                params=params,
                host_call=host_rpc_caller.call,
            )
        except WorkerError as exc:
            _emit_response(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": exc.code,
                        "message": exc.message,
                    },
                }
            )
            continue
        except Exception as exc:
            _emit_response(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                        "message": f"Unhandled worker error: {exc}",
                    },
                }
            )
            continue
        _emit_response(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": result,
            }
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
