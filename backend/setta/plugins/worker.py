import argparse
import asyncio
import importlib.util
import inspect
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

BACKEND_PLUGIN_API_VERSION = 1
SUPPORTED_RPC_METHODS: tuple[str, ...] = (
    "plugin.initialize",
    "plugin.register",
    "plugin.shutdown",
    "plugin.invoke_codegen_target",
    "host.register_language_server",
    "host.register_external_agent_adapter",
    "host.register_codegen_target",
)
_PROTOCOL_STDOUT = sys.stdout


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
class _WorkerState:
    plugin_id: str
    plugin_version: str
    entrypoint_path: Path
    module: Any | None = None
    codegen_target_generators: dict[str, Callable[..., Any]] = field(
        default_factory=dict
    )
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
        return {
            "pluginId": self.plugin_id,
            "pluginVersion": self.plugin_version,
            "backendPluginApiVersion": BACKEND_PLUGIN_API_VERSION,
            "supportedRpcMethods": list(SUPPORTED_RPC_METHODS),
        }

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
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--plugin-id")
    parser.add_argument("--plugin-version")
    parser.add_argument("--entrypoint")
    args = parser.parse_args()

    if args.probe:
        return 0

    plugin_id = str(args.plugin_id).strip()
    plugin_version = str(args.plugin_version).strip()
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
