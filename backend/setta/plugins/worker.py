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
    "host.register_router",
    "host.register_static_dir",
    "host.register_mcp_tool",
    "host.register_language_server",
    "host.register_external_agent_adapter",
    "host.register_codegen_target",
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
    module: Any | None = None
    route_handlers: dict[str, _WorkerRouteHandler] = field(default_factory=dict)
    mcp_tools_by_name: dict[str, Callable[..., Any]] = field(default_factory=dict)
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
                method
                for method in raw_methods
                if method not in {"HEAD", "OPTIONS"}
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
        host_call(
            "host.register_codegen_target",
            {
                "target": _ensure_json_serializable(
                    target,
                    plugin_id=self.plugin_id,
                    label="codegen target",
                )
            },
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
        self.server_mode: Literal["ide", "share", "app"] = "ide"
        self.requested_capabilities: list[str] = []
        self.effective_capabilities: list[str] = []

    @property
    def deployment_mode(self) -> bool:
        return False

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
