import argparse
import asyncio
import importlib.util
import inspect
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal

BACKEND_PLUGIN_API_VERSION = 1
SUPPORTED_RPC_METHODS: tuple[str, ...] = (
    "plugin.initialize",
    "plugin.register",
    "plugin.shutdown",
    "plugin.invoke_route",
    "plugin.invoke_mcp_tool",
    "plugin.invoke_codegen_target",
    "host.register_router",
    "host.register_listener_endpoint",
    "host.register_static_dir",
    "host.register_mcp_tool",
    "host.register_language_server",
    "host.register_external_agent_adapter",
    "host.register_codegen_target",
    "host.read_project_state",
    "host.emit_listener_dependency_event",
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
    route_id: str
    path: str
    methods: list[str]
    endpoint: Callable[..., Any]


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
    _next_route_counter: int = 0

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
            self.route_handlers[route_id] = _WorkerRouteHandler(
                route_id=route_id,
                path=route.path,
                methods=methods,
                endpoint=route.endpoint,
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

    def _build_route_call_kwargs(
        self,
        endpoint: Callable[..., Any],
        *,
        path_params: dict[str, Any],
        query_params: dict[str, Any],
        json_body: Any,
        route_id: str,
    ) -> dict[str, Any]:
        signature = inspect.signature(endpoint)
        kwargs: dict[str, Any] = {}
        for param_name, parameter in signature.parameters.items():
            if param_name in path_params:
                kwargs[param_name] = path_params[param_name]
                continue
            if param_name in query_params:
                kwargs[param_name] = query_params[param_name]
                continue
            if isinstance(json_body, dict) and param_name in json_body:
                kwargs[param_name] = json_body[param_name]
                continue
            if param_name == "body" and json_body is not None:
                kwargs[param_name] = json_body
                continue
            if parameter.default is inspect.Signature.empty:
                raise WorkerError(
                    "PLUGIN_BACKEND_ROUTE_CALL_INVALID",
                    (
                        f"Missing required parameter {param_name!r} for plugin "
                        f"route {route_id} in {self.plugin_id}."
                    ),
                )
        return kwargs

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

        kwargs = self._build_route_call_kwargs(
            route_handler.endpoint,
            path_params=raw_path_params,
            query_params=raw_query_params,
            json_body=json_body,
            route_id=route_id,
        )
        try:
            result = route_handler.endpoint(**kwargs)
        except Exception as exc:
            raise WorkerError(
                "PLUGIN_BACKEND_ROUTE_CALL_FAILED",
                f"Plugin route {route_id} execution failed for {self.plugin_id}: {exc}",
            ) from exc
        if inspect.isawaitable(result):
            try:
                result = asyncio.run(result)
            except Exception as exc:
                raise WorkerError(
                    "PLUGIN_BACKEND_ROUTE_CALL_FAILED",
                    (
                        f"Async plugin route {route_id} execution failed for "
                        f"{self.plugin_id}: {exc}"
                    ),
                ) from exc
        return {
            "statusCode": 200,
            "body": result,
        }

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
            try:
                result = asyncio.run(result)
            except Exception as exc:
                raise WorkerError(
                    "PLUGIN_BACKEND_MCP_TOOL_FAILED",
                    (
                        f"Async plugin MCP tool {tool_name} execution failed for "
                        f"{self.plugin_id}: {exc}"
                    ),
                ) from exc
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
            try:
                result = asyncio.run(result)
            except Exception as exc:
                raise WorkerError(
                    "PLUGIN_BACKEND_CODEGEN_FAILED",
                    (
                        f"Async plugin codegen target {handler_id} execution failed "
                        f"for {self.plugin_id}: {exc}"
                    ),
                ) from exc
        return _ensure_json_serializable(
            result,
            plugin_id=self.plugin_id,
            label="codegen target result",
        )

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
            return {"ok": True}
        if method == "plugin.invoke_route":
            return self._invoke_route(params)
        if method == "plugin.invoke_mcp_tool":
            return self._invoke_mcp_tool(params)
        if method == "plugin.invoke_codegen_target":
            return self._invoke_codegen_target(params)
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
        _ = self._host_call("host.emit_listener_dependency_event", params)

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
    sys.stdout.write(serialized + "\n")
    sys.stdout.flush()


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
