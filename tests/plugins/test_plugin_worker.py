import json
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from setta.plugins.worker import _WorkerState

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _copy_backend_fixture(tmp_path: Path, fixture_name: str = "backend") -> Path:
    plugin_root = tmp_path / "plugin"
    shutil.copytree(FIXTURE_PLUGIN_ROOT / fixture_name, plugin_root)
    return plugin_root


def _start_worker(
    plugin_root: Path,
) -> subprocess.Popen[str]:
    manifest = json.loads((plugin_root / "setta.plugin.json").read_text(encoding="utf-8"))
    entrypoint = plugin_root / "backend" / "entrypoint.py"
    command = [
        sys.executable,
        "-m",
        "setta.plugins.worker",
        "--plugin-id",
        manifest["id"],
        "--plugin-version",
        manifest["version"],
        "--entrypoint",
        str(entrypoint),
    ]
    return subprocess.Popen(
        command,
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


def _read_worker_response(worker: subprocess.Popen[str]) -> dict[str, Any]:
    assert worker.stdout is not None
    line = worker.stdout.readline()
    assert line != ""
    payload = json.loads(line)
    assert isinstance(payload, dict)
    return payload


def test_worker_state_initializes_async_loop_lazily(tmp_path: Path) -> None:
    # Worker state should create an async loop only when an async handler actually runs.
    state = _WorkerState(
        plugin_id="setta-fixture-backend",
        plugin_version="0.1.0",
        entrypoint_path=tmp_path / "entrypoint.py",
    )
    assert state._async_loop is None

    async def _fixture() -> int:
        return 7

    result = state._run_awaitable(
        _fixture(),
        code="PLUGIN_BACKEND_IMPORT_FAILED",
        message_prefix="fixture",
    )
    assert result == 7
    assert state._async_loop is not None
    state._close_async_loop()
    assert state._async_loop is None


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
        host_requests: list[dict[str, Any]] = []
        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_method_calls=host_method_calls,
            host_requests=host_requests,
        )
        assert register_response["id"] == 2
        assert register_response["result"] == {"ok": True}
        assert host_method_calls == [
            "host.register_mcp_tool",
            "host.register_mcp_tool",
        ]
        mcp_tool_requests = [
            request
            for request in host_requests
            if request.get("method") == "host.register_mcp_tool"
        ]
        assert len(mcp_tool_requests) == 2

        read_payload = mcp_tool_requests[0]["params"]["tool"]
        assert read_payload["name"] == "setta_fixture_backend_echo"
        assert read_payload["description"] == ""
        assert read_payload["inputSchema"]["type"] == "object"
        assert read_payload["inputSchema"]["required"] == ["value"]
        assert read_payload["metadata"]["kind"] == "discoverable"
        assert read_payload["metadata"]["accessType"] == "read"

        summary_payload = mcp_tool_requests[1]["params"]["tool"]
        assert summary_payload["name"] == "setta_fixture_backend_project_summary"
        assert summary_payload["inputSchema"]["type"] == "object"
        assert summary_payload["metadata"]["accessType"] == "read"
        assert summary_payload["metadata"]["searchCategory"] == "project"

        shutdown_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.shutdown",
        )
        assert shutdown_response["id"] == 3
        assert shutdown_response["result"] == {"ok": True}
    finally:
        _stop_worker(worker)


def test_worker_cli_probe_succeeds_without_plugin_metadata() -> None:
    # Runtime validation should be able to probe the worker command without plugin-specific arguments.
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "setta.plugins.worker",
            "--probe",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0
    assert completed.stdout == ""
    assert completed.stderr == ""


def test_worker_redirects_plugin_stdout_logs_to_stderr(tmp_path: Path) -> None:
    # Import-time plugin prints should not pollute the worker stdout JSON-RPC stream.
    plugin_root = _copy_backend_fixture(tmp_path)
    entrypoint = plugin_root / "backend" / "entrypoint.py"
    entrypoint.write_text(
        "print('plugin-import-log', flush=True)\n"
        + entrypoint.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        initialize_response = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        assert initialize_response["id"] == 1
        assert initialize_response["result"]["pluginId"] == "setta-fixture-backend"
        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
        )
        assert register_response["id"] == 2
        assert register_response["result"] == {"ok": True}
        assert worker.stderr is not None
        assert worker.stderr.readline().strip() == "plugin-import-log"
    finally:
        _stop_worker(worker)


def test_worker_register_supports_read_state_and_mcp_registration(
    tmp_path: Path,
) -> None:
    # Worker register should support host read_project_state and retained MCP registration.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    project_state = plugin.read_project_state(project_config_id='fixture-project', view='summary')\n"
        "    assert project_state['projectConfig']['id'] == 'fixture-project'\n"
        "    def fixture_tool(*, value: str) -> str:\n"
        "        return f\"{plugin.plugin_id}:{value}\"\n"
        "    plugin.register_mcp_tool(\n"
        "        fixture_tool,\n"
        "        name='fixture_tool',\n"
        "        annotations={'accessType': 'read'},\n"
        "    )\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        host_method_calls: list[str] = []
        host_requests: list[dict[str, Any]] = []

        def _host_response(
            payload: dict[str, Any], _worker: subprocess.Popen[str]
        ) -> dict[str, Any]:
            nested_id = payload["id"]
            nested_method = payload["method"]
            if nested_method == "host.read_project_state":
                return {
                    "jsonrpc": "2.0",
                    "id": nested_id,
                    "result": {
                        "projectState": {
                            "projectConfig": {
                                "id": "fixture-project",
                            }
                        },
                        "view": "summary",
                    },
                }
            return {
                "jsonrpc": "2.0",
                "id": nested_id,
                "result": {"ok": True},
            }

        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_method_calls=host_method_calls,
            host_requests=host_requests,
            host_response_factory=_host_response,
        )
        assert register_response["id"] == 2
        assert register_response["result"] == {"ok": True}
        assert host_method_calls == [
            "host.read_project_state",
            "host.register_mcp_tool",
        ]
        read_request = next(
            request
            for request in host_requests
            if request["method"] == "host.read_project_state"
        )
        assert read_request["params"] == {
            "projectConfigId": "fixture-project",
            "view": "summary",
        }
        register_request = next(
            request
            for request in host_requests
            if request["method"] == "host.register_mcp_tool"
        )
        assert register_request["params"]["tool"]["name"] == "fixture_tool"
        assert register_request["params"]["tool"]["metadata"]["accessType"] == "read"
    finally:
        _stop_worker(worker)


def test_worker_register_rejects_invalid_read_project_state_host_response(
    tmp_path: Path,
) -> None:
    # Worker read_project_state should fail fast when host omits projectState from RPC result.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    plugin.read_project_state(project_config_id='fixture-project')\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )

        def _host_response(
            payload: dict[str, Any], _worker: subprocess.Popen[str]
        ) -> dict[str, Any]:
            nested_id = payload["id"]
            return {
                "jsonrpc": "2.0",
                "id": nested_id,
                "result": {
                    "view": "summary",
                },
            }

        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_response_factory=_host_response,
        )
        assert register_response["id"] == 2
        assert (
            register_response["error"]["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )
        assert "missing projectState object" in register_response["error"]["message"]
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


def test_worker_main_loop_rejects_invalid_json_payload(tmp_path: Path) -> None:
    # Main loop should reject invalid JSON input while keeping worker transport alive.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        assert worker.stdin is not None
        worker.stdin.write("{not-json\n")
        worker.stdin.flush()
        response = _read_worker_response(worker)
        assert response["id"] is None
        assert response["error"]["code"] == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        assert "Invalid JSON-RPC payload." in response["error"]["message"]
    finally:
        _stop_worker(worker)


def test_worker_main_loop_rejects_non_object_json_payload(tmp_path: Path) -> None:
    # Main loop should reject non-object JSON-RPC payloads deterministically.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        assert worker.stdin is not None
        worker.stdin.write("[]\n")
        worker.stdin.flush()
        response = _read_worker_response(worker)
        assert response["id"] is None
        assert response["error"]["code"] == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        assert "JSON-RPC payload must be an object." in response["error"]["message"]
    finally:
        _stop_worker(worker)


def test_worker_main_loop_rejects_non_string_method(tmp_path: Path) -> None:
    # Main loop should reject JSON-RPC requests whose method is not a string.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        assert worker.stdin is not None
        worker.stdin.write(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": 42,
                    "method": 123,
                    "params": {},
                }
            )
            + "\n"
        )
        worker.stdin.flush()
        response = _read_worker_response(worker)
        assert response["id"] == 42
        assert response["error"]["code"] == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        assert "JSON-RPC method must be a string." in response["error"]["message"]
    finally:
        _stop_worker(worker)


@pytest.mark.parametrize(
    ("plugin_id", "plugin_version", "expected_message"),
    [
        ("   ", "0.1.0", "Missing plugin id."),
        ("setta-fixture-backend", "   ", "Missing plugin version."),
    ],
)
def test_worker_cli_rejects_missing_identity_args(
    tmp_path: Path,
    plugin_id: str,
    plugin_version: str,
    expected_message: str,
) -> None:
    # Worker startup should fail fast when plugin id/version args are blank.
    entrypoint = tmp_path / "entrypoint.py"
    entrypoint.write_text("def register(plugin):\n    return None\n", encoding="utf-8")

    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "setta.plugins.worker",
            "--plugin-id",
            plugin_id,
            "--plugin-version",
            plugin_version,
            "--entrypoint",
            str(entrypoint),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 1
    payload = json.loads(completed.stdout.strip())
    assert payload["error"]["code"] == "PLUGIN_BACKEND_IMPORT_FAILED"
    assert expected_message in payload["error"]["message"]


def test_worker_cli_rejects_missing_entrypoint(tmp_path: Path) -> None:
    # Worker startup should fail when backend entrypoint path does not exist.
    missing_entrypoint = tmp_path / "missing-entrypoint.py"

    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "setta.plugins.worker",
            "--plugin-id",
            "setta-fixture-backend",
            "--plugin-version",
            "0.1.0",
            "--entrypoint",
            str(missing_entrypoint),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 1
    payload = json.loads(completed.stdout.strip())
    assert payload["error"]["code"] == "PLUGIN_BACKEND_IMPORT_FAILED"
    assert "Backend entrypoint not found" in payload["error"]["message"]


@pytest.mark.parametrize(
    ("entrypoint_source", "expected_message_fragment"),
    [
        (
            "def register(plugin):\n"
            "    def tool() -> str:\n"
            "        return 'ok'\n"
            "    plugin.register_mcp_tool(tool, annotations=['bad'])\n",
            "invalid MCP annotations payload",
        ),
        (
            "def register(plugin):\n"
            "    plugin.register_codegen_target({\n"
            "        'id': 'typescript',\n"
            "        'name': 'TypeScript',\n"
            "        'language': 'typescript',\n"
            "        'generate': lambda _state, _options: {'files': []},\n"
            "    })\n"
            "    plugin.register_codegen_target({\n"
            "        'id': 'typescript',\n"
            "        'name': 'TypeScript Duplicate',\n"
            "        'language': 'typescript',\n"
            "        'generate': lambda _state, _options: {'files': []},\n"
            "    })\n",
            "duplicate codegen target id",
        ),
        (
            "def register(plugin):\n"
            "    plugin.register_codegen_target({\n"
            "        'id': 'bad:id',\n"
            "        'name': 'TypeScript',\n"
            "        'language': 'typescript',\n"
            "        'generate': lambda _state, _options: {'files': []},\n"
            "    })\n",
            "cannot contain ':' in worker mode",
        ),
    ],
)
def test_worker_register_rejects_invalid_registration_contracts(
    tmp_path: Path,
    entrypoint_source: str,
    expected_message_fragment: str,
) -> None:
    # Worker registration should reject unsupported registration contracts in MVP.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        entrypoint_source,
        encoding="utf-8",
    )
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
        )
        assert register_response["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"
        assert expected_message_fragment in register_response["error"]["message"]
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


def test_worker_register_surfaces_host_rpc_non_object_response(tmp_path: Path) -> None:
    # Host RPC responses that are valid JSON but not objects should map to transport errors.
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
            host_response_factory=lambda _payload, _worker: [1, 2, 3],
        )
        assert register_response["id"] == 2
        assert (
            register_response["error"]["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )
        assert "non-object JSON-RPC response" in register_response["error"]["message"]
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


def test_worker_register_surfaces_host_rpc_invalid_error_payload(
    tmp_path: Path,
) -> None:
    # Host RPC error payloads with invalid code/message types should map to transport errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )

        def _invalid_error_payload(
            payload: dict[str, Any], _worker: subprocess.Popen[str]
        ) -> dict[str, Any]:
            nested_id = payload.get("id")
            return {
                "jsonrpc": "2.0",
                "id": nested_id,
                "error": {
                    "code": 123,
                    "message": ["bad"],
                },
            }

        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_response_factory=_invalid_error_payload,
        )
        assert register_response["id"] == 2
        assert (
            register_response["error"]["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )
        assert (
            "invalid JSON-RPC error payload"
            in register_response["error"]["message"]
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


def test_worker_reuses_single_event_loop_for_async_tool_invocations(
    tmp_path: Path,
) -> None:
    # Async worker calls should run on one persistent loop, not one loop per invocation.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "import asyncio\n\n"
        "_seen_loops = []\n\n"
        "def register(plugin):\n"
        "    async def async_loop_count(*, value: str) -> str:\n"
        "        loop = asyncio.get_running_loop()\n"
        "        _seen_loops.append(loop)\n"
        "        unique_loop_count = len({id(item) for item in _seen_loops})\n"
        "        return f'loop-count:{value}:{unique_loop_count}'\n\n"
        "    plugin.register_mcp_tool(async_loop_count, name='async_loop_count')\n",
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
        first = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_mcp_tool",
            params={
                "toolName": "async_loop_count",
                "args": [],
                "kwargs": {"value": "first"},
            },
        )
        second = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_mcp_tool",
            params={
                "toolName": "async_loop_count",
                "args": [],
                "kwargs": {"value": "second"},
            },
        )
        assert first["result"] == {"result": "loop-count:first:1"}
        assert second["result"] == {"result": "loop-count:second:1"}
    finally:
        _stop_worker(worker)


@pytest.mark.parametrize(
    ("entrypoint_source", "expected_payload_label"),
    [
        (
            "def register(plugin):\n"
            "    class NotSerializable:\n"
            "        pass\n\n"
            "    def tool() -> str:\n"
            "        return 'ok'\n\n"
            "    plugin.register_mcp_tool(\n"
            "        tool,\n"
            "        name='tool_with_bad_annotations',\n"
            "        annotations={'bad': NotSerializable()},\n"
            "    )\n",
            "MCP annotations payload",
        ),
        (
            "def register(plugin):\n"
            "    class NotSerializable:\n"
            "        pass\n\n"
            "    plugin.register_external_agent_adapter(\n"
            "        {\n"
            "            'id': 'fixture-agent',\n"
            "            'name': 'Fixture Agent',\n"
            "            'runModes': ['sdk'],\n"
            "            'command': 'python',\n"
            "            'args': ['agent.py'],\n"
            "            'envVarWhitelist': ['OPENAI_API_KEY'],\n"
            "            'defaultModel': NotSerializable(),\n"
            "        }\n"
            "    )\n",
            "external agent adapter payload",
        ),
    ],
)
def test_worker_register_rejects_non_json_serializable_registration_payloads(
    tmp_path: Path,
    entrypoint_source: str,
    expected_payload_label: str,
) -> None:
    # Worker registration should reject non-JSON-serializable host registration payloads.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        entrypoint_source,
        encoding="utf-8",
    )
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
        )
        assert register_response["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"
        assert "non-JSON-serializable" in register_response["error"]["message"]
        assert expected_payload_label in register_response["error"]["message"]
    finally:
        _stop_worker(worker)


def test_worker_register_rejects_async_register(tmp_path: Path) -> None:
    # Worker registration should reject async register(plugin) contracts in MVP.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "async def register(_plugin):\n"
        "    return None\n",
        encoding="utf-8",
    )
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
        )
        assert register_response["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"
        assert "async register is not supported" in register_response["error"]["message"]
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


def test_worker_invoke_codegen_target_rejects_non_json_serializable_result(
    tmp_path: Path,
) -> None:
    # Codegen invocation should reject result payloads that cannot be JSON serialized.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    plugin.register_codegen_target(\n"
        "        {\n"
        "            'id': 'typescript',\n"
        "            'name': 'TypeScript',\n"
        "            'language': 'typescript',\n"
        "            'defaultFileName': 'setta_gen.ts',\n"
        "            'generate': lambda _state, _options: {'files': [], 'bad': {1, 2}},\n"
        "        }\n"
        "    )\n",
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
            method="plugin.invoke_codegen_target",
            params={
                "handlerId": "typescript",
                "projectState": {"projectConfig": {"name": "WorkerFixture"}},
                "targetOptions": {},
            },
        )
        assert response["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"
        assert "codegen target result payload" in response["error"]["message"]
    finally:
        _stop_worker(worker)
