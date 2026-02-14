import json
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _copy_backend_fixture(tmp_path: Path, fixture_name: str = "backend") -> Path:
    plugin_root = tmp_path / "plugin"
    shutil.copytree(FIXTURE_PLUGIN_ROOT / fixture_name, plugin_root)
    return plugin_root


def _start_worker(plugin_root: Path) -> subprocess.Popen[str]:
    manifest = json.loads((plugin_root / "setta.plugin.json").read_text(encoding="utf-8"))
    entrypoint = plugin_root / "backend" / "entrypoint.py"
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "setta.plugins.worker",
            "--plugin-id",
            manifest["id"],
            "--plugin-version",
            manifest["version"],
            "--plugin-root",
            str(plugin_root),
            "--entrypoint",
            str(entrypoint),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )


def _rpc_call(
    worker: subprocess.Popen[str],
    *,
    request_id: int,
    method: str,
    params: dict[str, Any] | None = None,
    host_method_calls: list[str] | None = None,
    host_requests: list[dict[str, Any]] | None = None,
    host_response_factory: (
        Callable[[dict[str, Any], subprocess.Popen[str]], Any] | None
    ) = None,
) -> dict[str, Any]:
    assert worker.stdin is not None
    assert worker.stdout is not None
    worker.stdin.write(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": {} if params is None else params,
            }
        )
        + "\n"
    )
    worker.stdin.flush()
    while True:
        line = worker.stdout.readline()
        assert line != ""
        payload = json.loads(line)
        assert isinstance(payload, dict)
        nested_method = payload.get("method")
        if isinstance(nested_method, str):
            if host_method_calls is not None:
                host_method_calls.append(nested_method)
            if host_requests is not None:
                host_requests.append(payload)
            if host_response_factory is not None:
                host_response = host_response_factory(payload, worker)
                if host_response is None:
                    continue
                if isinstance(host_response, str):
                    worker.stdin.write(host_response + "\n")
                else:
                    worker.stdin.write(json.dumps(host_response) + "\n")
                worker.stdin.flush()
            else:
                nested_request_id = payload.get("id")
                worker.stdin.write(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": nested_request_id,
                            "result": {"ok": True},
                        }
                    )
                    + "\n"
                )
                worker.stdin.flush()
            continue
        return payload


def _stop_worker(worker: subprocess.Popen[str]) -> None:
    if worker.stdin is not None:
        worker.stdin.close()
    if worker.poll() is None:
        worker.terminate()
        worker.wait(timeout=2.0)
    if worker.stdout is not None:
        worker.stdout.close()
    if worker.stderr is not None:
        worker.stderr.close()


def test_worker_initialize_register_shutdown_roundtrip(tmp_path: Path) -> None:
    # Worker should handle initialize/register/shutdown RPC methods over stdio.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        initialize_response = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        assert initialize_response["id"] == 1
        initialize_result = initialize_response["result"]
        assert initialize_result["pluginId"] == "setta-fixture-backend"
        assert initialize_result["pluginVersion"] == "0.1.0"
        assert initialize_result["backendPluginApiVersion"] == 1
        assert "plugin.register" in initialize_result["supportedRpcMethods"]
        assert "host.register_mcp_tool" in initialize_result["supportedRpcMethods"]

        host_method_calls: list[str] = []
        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_method_calls=host_method_calls,
        )
        assert register_response["id"] == 2
        assert register_response["result"] == {"ok": True}
        assert host_method_calls == [
            "host.register_router",
            "host.register_mcp_tool",
        ]

        shutdown_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.shutdown",
        )
        assert shutdown_response["id"] == 3
        assert shutdown_response["result"] == {"ok": True}
    finally:
        _stop_worker(worker)


def test_worker_returns_error_for_unknown_method(tmp_path: Path) -> None:
    # Unknown worker RPC methods should return deterministic transport errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        response = _rpc_call(
            worker,
            request_id=1,
            method="plugin.unknown",
        )
        assert response["id"] == 1
        assert response["error"]["code"] == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    finally:
        _stop_worker(worker)


def test_worker_register_surfaces_host_rpc_invalid_json_response(tmp_path: Path) -> None:
    # Host RPC invalid JSON responses should map to transport errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_response_factory=lambda _payload, _worker: "{not-json",
        )
        assert register_response["id"] == 2
        assert (
            register_response["error"]["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )
    finally:
        _stop_worker(worker)


def test_worker_register_surfaces_host_rpc_response_id_mismatch(tmp_path: Path) -> None:
    # Host RPC response id mismatches should map to transport errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )

        def _id_mismatch_response(
            payload: dict[str, Any], _worker: subprocess.Popen[str]
        ) -> dict[str, Any]:
            nested_id = payload.get("id")
            assert isinstance(nested_id, int)
            return {
                "jsonrpc": "2.0",
                "id": nested_id + 1,
                "result": {"ok": True},
            }

        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_response_factory=_id_mismatch_response,
        )
        assert register_response["id"] == 2
        assert (
            register_response["error"]["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )
    finally:
        _stop_worker(worker)


def test_worker_register_surfaces_host_rpc_missing_result_field(tmp_path: Path) -> None:
    # Host RPC responses without a result should map to transport errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )

        def _missing_result_response(
            payload: dict[str, Any], _worker: subprocess.Popen[str]
        ) -> dict[str, Any]:
            nested_id = payload.get("id")
            return {
                "jsonrpc": "2.0",
                "id": nested_id,
            }

        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_response_factory=_missing_result_response,
        )
        assert register_response["id"] == 2
        assert (
            register_response["error"]["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )
    finally:
        _stop_worker(worker)


def test_worker_register_surfaces_host_rpc_transport_close(tmp_path: Path) -> None:
    # Host transport closure during nested host RPC should map to transport errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )

        def _close_host_transport(
            _payload: dict[str, Any], process: subprocess.Popen[str]
        ) -> None:
            assert process.stdin is not None
            process.stdin.close()
            return None

        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_response_factory=_close_host_transport,
        )
        assert register_response["id"] == 2
        assert (
            register_response["error"]["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )
    finally:
        _stop_worker(worker)


def test_worker_handshake_override_payload(tmp_path: Path) -> None:
    # Worker handshake should include override payload data when present.
    plugin_root = _copy_backend_fixture(tmp_path)
    override_path = plugin_root / "backend" / "handshake.override.json"
    override_path.write_text(
        json.dumps({"backendPluginApiVersion": 99}, indent=2),
        encoding="utf-8",
    )

    worker = _start_worker(plugin_root)
    try:
        response = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        assert response["id"] == 1
        assert response["result"]["backendPluginApiVersion"] == 99
    finally:
        _stop_worker(worker)


def test_worker_register_codegen_target_and_invoke_codegen_target(
    tmp_path: Path,
) -> None:
    # Worker should register codegen targets and invoke generation over RPC.
    plugin_root = _copy_backend_fixture(tmp_path, fixture_name="backend-codegen")
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        host_method_calls: list[str] = []
        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_method_calls=host_method_calls,
        )
        assert register_response["id"] == 2
        assert register_response["result"] == {"ok": True}
        assert host_method_calls == ["host.register_codegen_target"]

        codegen_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_codegen_target",
            params={
                "handlerId": "typescript",
                "projectState": {"projectConfig": {"name": "WorkerFixture"}},
                "targetOptions": {"className": "WorkerState"},
            },
        )
        assert codegen_response["id"] == 3
        assert codegen_response["result"] == {
            "files": [
                {
                    "relativePath": "setta_gen.ts",
                    "content": (
                        "export class WorkerState {\n"
                        "  readonly projectName = 'WorkerFixture';\n"
                        "}\n"
                    ),
                }
            ]
        }
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_success_and_validation_errors(tmp_path: Path) -> None:
    # Route invocation should roundtrip registered handlers and reject bad payloads.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        host_requests: list[dict[str, Any]] = []
        _ = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_requests=host_requests,
        )
        router_registration = next(
            payload
            for payload in host_requests
            if payload.get("method") == "host.register_router"
        )
        routes = router_registration["params"]["routes"]
        route_id = routes[0]["routeId"]

        invoke_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id,
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert invoke_response["result"]["statusCode"] == 200
        assert invoke_response["result"]["body"] == {
            "pluginId": "setta-fixture-backend",
            "status": "ok",
        }

        missing_route = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_route",
            params={"routeId": "route_missing", "pathParams": {}, "queryParams": {}},
        )
        assert missing_route["error"]["code"] == "PLUGIN_BACKEND_ROUTE_NOT_FOUND"

        missing_route_id = _rpc_call(
            worker,
            request_id=5,
            method="plugin.invoke_route",
            params={"pathParams": {}, "queryParams": {}},
        )
        assert (
            missing_route_id["error"]["code"] == "PLUGIN_BACKEND_ROUTE_CALL_INVALID"
        )

        invalid_query_params = _rpc_call(
            worker,
            request_id=6,
            method="plugin.invoke_route",
            params={
                "routeId": route_id,
                "pathParams": {},
                "queryParams": [],
            },
        )
        assert (
            invalid_query_params["error"]["code"] == "PLUGIN_BACKEND_ROUTE_CALL_INVALID"
        )
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_surfaces_handler_exceptions(tmp_path: Path) -> None:
    # Route handler exceptions should map to deterministic route-call-failed errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.get('/boom')\n"
        "    def boom() -> dict[str, str]:\n"
        "        raise RuntimeError('fixture boom')\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        host_requests: list[dict[str, Any]] = []
        _ = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_requests=host_requests,
        )
        router_registration = next(
            payload
            for payload in host_requests
            if payload.get("method") == "host.register_router"
        )
        route_id = router_registration["params"]["routes"][0]["routeId"]
        invoke_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={"routeId": route_id, "pathParams": {}, "queryParams": {}},
        )
        assert invoke_response["error"]["code"] == "PLUGIN_BACKEND_ROUTE_CALL_FAILED"
    finally:
        _stop_worker(worker)


def test_worker_invoke_mcp_tool_surfaces_execution_failure(tmp_path: Path) -> None:
    # MCP tool runtime exceptions should map to deterministic MCP tool failure errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    def explode(*, value: str) -> str:\n"
        "        raise RuntimeError(f'boom:{value}')\n\n"
        "    plugin.register_mcp_tool(explode, name='explode_tool')\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        _ = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
        )
        invoke_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_mcp_tool",
            params={"toolName": "explode_tool", "args": [], "kwargs": {"value": "x"}},
        )
        assert invoke_response["error"]["code"] == "PLUGIN_BACKEND_MCP_TOOL_FAILED"
    finally:
        _stop_worker(worker)


def test_worker_invoke_mcp_tool_success_and_validation_errors(tmp_path: Path) -> None:
    # MCP tool invocation should support success and reject malformed payloads.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        _ = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
        )

        success_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_mcp_tool",
            params={
                "toolName": "setta_fixture_backend_echo",
                "args": [],
                "kwargs": {"value": "ok"},
            },
        )
        assert success_response["id"] == 3
        assert success_response["result"] == {"result": "setta-fixture-backend:ok"}

        invalid_params_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_mcp_tool",
            params=[],
        )
        assert (
            invalid_params_response["error"]["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )

        missing_tool_name = _rpc_call(
            worker,
            request_id=5,
            method="plugin.invoke_mcp_tool",
            params={"args": [], "kwargs": {}},
        )
        assert missing_tool_name["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"

        missing_tool = _rpc_call(
            worker,
            request_id=6,
            method="plugin.invoke_mcp_tool",
            params={"toolName": "missing_tool", "args": [], "kwargs": {}},
        )
        assert missing_tool["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"

        invalid_args = _rpc_call(
            worker,
            request_id=7,
            method="plugin.invoke_mcp_tool",
            params={
                "toolName": "setta_fixture_backend_echo",
                "args": {},
                "kwargs": {"value": "x"},
            },
        )
        assert invalid_args["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"

        invalid_kwargs = _rpc_call(
            worker,
            request_id=8,
            method="plugin.invoke_mcp_tool",
            params={
                "toolName": "setta_fixture_backend_echo",
                "args": [],
                "kwargs": [],
            },
        )
        assert invalid_kwargs["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"
    finally:
        _stop_worker(worker)


def test_worker_invoke_mcp_tool_supports_async_tools(tmp_path: Path) -> None:
    # MCP tool invocation should support async tools in worker mode.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    async def async_echo(*, value: str) -> str:\n"
        "        return f'async:{value}'\n\n"
        "    plugin.register_mcp_tool(async_echo, name='async_echo')\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        _ = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
        )
        response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_mcp_tool",
            params={"toolName": "async_echo", "args": [], "kwargs": {"value": "ok"}},
        )
        assert response["id"] == 3
        assert response["result"] == {"result": "async:ok"}
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_supports_json_body_and_async_handlers(
    tmp_path: Path,
) -> None:
    # Route invocation should support jsonBody argument mapping and async handlers.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/from-body')\n"
        "    def from_body(value: str) -> dict[str, str]:\n"
        "        return {'value': value}\n\n"
        "    @router.get('/async-ok')\n"
        "    async def async_ok() -> dict[str, str]:\n"
        "        return {'status': 'ok'}\n\n"
        "    @router.get('/async-boom')\n"
        "    async def async_boom() -> dict[str, str]:\n"
        "        raise RuntimeError('async boom')\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        host_requests: list[dict[str, Any]] = []
        _ = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_requests=host_requests,
        )
        router_registration = next(
            payload
            for payload in host_requests
            if payload.get("method") == "host.register_router"
        )
        routes = router_registration["params"]["routes"]
        route_id_by_path = {route["path"]: route["routeId"] for route in routes}

        from_body_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/from-body"],
                "pathParams": {},
                "queryParams": {},
                "jsonBody": {"value": "from_json_body"},
            },
        )
        assert from_body_response["result"]["statusCode"] == 200
        assert from_body_response["result"]["body"] == {"value": "from_json_body"}

        async_ok_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/async-ok"],
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert async_ok_response["result"]["statusCode"] == 200
        assert async_ok_response["result"]["body"] == {"status": "ok"}

        async_boom_response = _rpc_call(
            worker,
            request_id=5,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/async-boom"],
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert async_boom_response["error"]["code"] == "PLUGIN_BACKEND_ROUTE_CALL_FAILED"
    finally:
        _stop_worker(worker)


def test_worker_invoke_codegen_target_validates_handler_and_payload(
    tmp_path: Path,
) -> None:
    # Codegen invocation should reject unknown handlers and malformed payloads.
    plugin_root = _copy_backend_fixture(tmp_path, fixture_name="backend-codegen")
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        _ = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
        )

        missing_handler_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_codegen_target",
            params={
                "handlerId": "missing",
                "projectState": {"projectConfig": {"name": "WorkerFixture"}},
                "targetOptions": {},
            },
        )
        assert missing_handler_response["error"]["code"] == "PLUGIN_BACKEND_CODEGEN_FAILED"

        invalid_project_state_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_codegen_target",
            params={
                "handlerId": "typescript",
                "projectState": "invalid",
                "targetOptions": {},
            },
        )
        assert (
            invalid_project_state_response["error"]["code"]
            == "PLUGIN_BACKEND_CODEGEN_FAILED"
        )
    finally:
        _stop_worker(worker)
