import base64
import json
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal

import pytest
from setta.plugins.worker import _WorkerState

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _copy_backend_fixture(tmp_path: Path, fixture_name: str = "backend") -> Path:
    plugin_root = tmp_path / "plugin"
    shutil.copytree(FIXTURE_PLUGIN_ROOT / fixture_name, plugin_root)
    return plugin_root


def _start_worker(
    plugin_root: Path,
    *,
    server_mode: Literal["ide", "share", "app"] = "ide",
    requested_capabilities: list[str] | None = None,
    effective_capabilities: list[str] | None = None,
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
        "--plugin-root",
        str(plugin_root),
        "--entrypoint",
        str(entrypoint),
        "--server-mode",
        server_mode,
    ]
    for capability in requested_capabilities or []:
        command.extend(["--requested-capability", capability])
    for capability in effective_capabilities or []:
        command.extend(["--effective-capability", capability])
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
        plugin_root=tmp_path,
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
            "host.register_listener_endpoint",
            "host.register_mcp_tool",
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


def test_worker_register_supports_read_state_emit_and_listener_endpoint(
    tmp_path: Path,
) -> None:
    # Worker register should support host read_project_state, emit_listener_dependency_event, and listener endpoint registration.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/listener-echo')\n"
        "    def fixture_listener_echo(projectConfigId: str):\n"
        "        return {'projectConfigId': projectConfigId}\n\n"
        "    plugin.register_router(router)\n"
        "    plugin.register_listener_endpoint('fixture_listener_echo')\n"
        "    project_state = plugin.read_project_state(project_config_id='fixture-project', view='summary')\n"
        "    assert project_state['projectConfig']['id'] == 'fixture-project'\n"
        "    plugin.emit_listener_dependency_event(\n"
        "        project_config_id='fixture-project',\n"
        "        dependency_events=[\n"
        "            {\n"
        "                'dependencyKey': {'type': 'Section', 'sectionId': 'fixture-section'},\n"
        "                'payload': {'type': 'Literal', 'payload': 'hello'},\n"
        "                'timestampMs': 123,\n"
        "            }\n"
        "        ],\n"
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
            "host.register_router",
            "host.register_listener_endpoint",
            "host.read_project_state",
            "host.emit_listener_dependency_event",
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
        emit_request = next(
            request
            for request in host_requests
            if request["method"] == "host.emit_listener_dependency_event"
        )
        assert emit_request["params"]["projectConfigId"] == "fixture-project"
        assert isinstance(emit_request["params"]["dependencyEvents"], list)
        assert len(emit_request["params"]["dependencyEvents"]) == 1
    finally:
        _stop_worker(worker)


def test_worker_context_reflects_server_mode_and_capabilities(tmp_path: Path) -> None:
    # Worker register context should expose host-provided mode/capabilities metadata.
    plugin_root = _copy_backend_fixture(tmp_path)
    marker_path = plugin_root / "backend" / "context.marker.json"
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "import json\n"
        "from pathlib import Path\n\n"
        "def register(plugin):\n"
        "    payload = {\n"
        "        'serverMode': plugin.server_mode,\n"
        "        'deploymentMode': plugin.deployment_mode,\n"
        "        'requestedCapabilities': list(plugin.requested_capabilities),\n"
        "        'effectiveCapabilities': list(plugin.effective_capabilities),\n"
        "    }\n"
        "    Path(plugin.plugin_root, 'backend', 'context.marker.json').write_text(\n"
        "        json.dumps(payload),\n"
        "        encoding='utf-8',\n"
        "    )\n",
        encoding="utf-8",
    )
    worker = _start_worker(
        plugin_root,
        server_mode="share",
        requested_capabilities=["registerPane", "readProjectState"],
        effective_capabilities=["registerPane"],
    )
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
        register_response = _rpc_call(worker, request_id=2, method="plugin.register")
        assert register_response["result"] == {"ok": True}
    finally:
        _stop_worker(worker)

    payload = json.loads(marker_path.read_text(encoding="utf-8"))
    assert payload == {
        "serverMode": "share",
        "deploymentMode": True,
        "requestedCapabilities": ["registerPane", "readProjectState"],
        "effectiveCapabilities": ["registerPane"],
    }


def test_worker_register_ui_setting_and_invoke_handler_roundtrip(
    tmp_path: Path,
) -> None:
    # Worker should expose register_ui_setting and invoke registered read/write handlers.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_setting(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_setting(*, project_config_id: str, value):\n"
        "    _STATE['enabled'] = bool(value)\n"
        "    return {'ok': True, 'projectConfigId': project_config_id}\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend setting behavior.',\n"
        "            'paneId': 'full-settings-pane',\n"
        "            'revealKey': 'full-settings',\n"
        "            'synonyms': ['backend enabled'],\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_setting,\n"
        "            'write': _write_setting,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )
    worker = _start_worker(
        plugin_root,
        requested_capabilities=["registerPane"],
        effective_capabilities=["registerPane"],
    )
    try:
        _ = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        host_method_calls: list[str] = []
        host_requests: list[dict[str, Any]] = []
        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
            host_method_calls=host_method_calls,
            host_requests=host_requests,
        )
        assert register_response["result"] == {"ok": True}
        assert host_method_calls == ["host.register_ui_setting"]
        setting_payload = host_requests[0]["params"]["setting"]
        assert setting_payload["id"] == "backend_enabled"
        assert setting_payload["readHandlerId"] == "backend_enabled"
        assert setting_payload["writeHandlerId"] == "backend_enabled"

        first_read = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_ui_setting_handler",
            params={
                "handlerId": "backend_enabled",
                "operation": "read",
                "projectConfigId": "project-a",
            },
        )
        assert first_read["result"]["value"] is False

        write_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_ui_setting_handler",
            params={
                "handlerId": "backend_enabled",
                "operation": "write",
                "projectConfigId": "project-a",
                "value": True,
            },
        )
        assert write_response["result"]["result"]["ok"] is True

        second_read = _rpc_call(
            worker,
            request_id=5,
            method="plugin.invoke_ui_setting_handler",
            params={
                "handlerId": "backend_enabled",
                "operation": "read",
                "projectConfigId": "project-a",
            },
        )
        assert second_read["result"]["value"] is True
    finally:
        _stop_worker(worker)


def test_worker_register_ui_setting_does_not_commit_handlers_when_host_rejects(
    tmp_path: Path,
) -> None:
    # Host registration failures must not leak partially installed UI setting handlers.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_setting(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_setting(*, project_config_id: str, value):\n"
        "    _STATE['enabled'] = bool(value)\n"
        "    return {'ok': True, 'projectConfigId': project_config_id}\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend setting behavior.',\n"
        "            'paneId': 'full-settings-pane',\n"
        "            'revealKey': 'full-settings',\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_setting,\n"
        "            'write': _write_setting,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )
    worker = _start_worker(
        plugin_root,
        requested_capabilities=["registerPane"],
        effective_capabilities=["registerPane"],
    )
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
            if payload.get("method") == "host.register_ui_setting":
                return {
                    "jsonrpc": "2.0",
                    "id": nested_id,
                    "error": {
                        "code": "PLUGIN_BACKEND_REGISTER_FAILED",
                        "message": "host rejected ui setting registration",
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
            host_response_factory=_host_response,
        )
        assert register_response["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"
        assert (
            "host rejected ui setting registration"
            in register_response["error"]["message"]
        )

        # Read should fail because handler installation must remain atomic with host commit.
        read_after_failure = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_ui_setting_handler",
            params={
                "handlerId": "backend_enabled",
                "operation": "read",
                "projectConfigId": "project-a",
            },
        )
        assert read_after_failure["error"]["code"] == "PLUGIN_BACKEND_REGISTER_FAILED"
        assert (
            "Plugin ui setting read handler not found: backend_enabled"
            in read_after_failure["error"]["message"]
        )
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
    plugin_root = tmp_path / "plugin-root"
    plugin_root.mkdir(parents=True, exist_ok=True)
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
            "--plugin-root",
            str(plugin_root),
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
    plugin_root = tmp_path / "plugin-root"
    plugin_root.mkdir(parents=True, exist_ok=True)
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
            "--plugin-root",
            str(plugin_root),
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
            "    plugin.register_router('not-a-router')\n",
            "invalid router",
        ),
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
        (
            "def register(plugin):\n"
            "    plugin.register_startup_task(lambda: None)\n",
            "register_startup_task is not supported",
        ),
        (
            "def register(plugin):\n"
            "    plugin.register_shutdown_task(lambda: None)\n",
            "register_shutdown_task is not supported",
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


@pytest.mark.parametrize(
    ("override_content", "expected_message_fragment"),
    [
        ("{not-json", "Invalid handshake override JSON"),
        ("[]", "must be an object"),
    ],
)
def test_worker_initialize_rejects_invalid_handshake_override_payload(
    tmp_path: Path,
    override_content: str,
    expected_message_fragment: str,
) -> None:
    # Handshake override payload must be valid JSON object when override file is present.
    plugin_root = _copy_backend_fixture(tmp_path)
    override_path = plugin_root / "backend" / "handshake.override.json"
    override_path.write_text(override_content, encoding="utf-8")

    worker = _start_worker(plugin_root)
    try:
        response = _rpc_call(
            worker,
            request_id=1,
            method="plugin.initialize",
        )
        assert response["id"] == 1
        assert response["error"]["code"] == "PLUGIN_BACKEND_HANDSHAKE_INVALID"
        assert expected_message_fragment in response["error"]["message"]
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


def test_worker_emits_transport_error_for_non_json_serializable_route_result(
    tmp_path: Path,
) -> None:
    # Non-serializable route return values should map to worker transport errors.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.get('/non-serializable')\n"
        "    def non_serializable() -> set[int]:\n"
        "        return {1, 2, 3}\n\n"
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

        response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id,
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert response["error"]["code"] == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        assert (
            response["error"]["message"]
            == "Worker failed to serialize JSON-RPC payload."
        )
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


def test_worker_invoke_route_supports_json_body_and_async_handlers(
    tmp_path: Path,
) -> None:
    # Route invocation should support jsonBody argument mapping and async handlers.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter, Body\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/from-body')\n"
        "    def from_body(value: str = Body(..., embed=True)) -> dict[str, str]:\n"
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


def test_worker_invoke_route_rejects_query_params_satisfied_only_from_json_body(
    tmp_path: Path,
) -> None:
    # Required query params should not be accepted from jsonBody payload fields.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter, Query\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/mix')\n"
        "    def mix(limit: int = Query(...)) -> dict[str, int]:\n"
        "        return {'limit': limit}\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
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

        missing_query_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/mix"],
                "pathParams": {},
                "queryParams": {},
                "jsonBody": {"limit": 5},
            },
        )
        assert (
            missing_query_response["error"]["code"]
            == "PLUGIN_BACKEND_ROUTE_CALL_INVALID"
        )
        assert "Missing required parameter 'limit'" in missing_query_response["error"][
            "message"
        ]

        query_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/mix"],
                "pathParams": {},
                "queryParams": {"limit": "7"},
                "jsonBody": {"limit": 5},
            },
        )
        assert query_response["result"]["statusCode"] == 200
        assert query_response["result"]["body"] == {"limit": 7}
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_coerces_typed_params_and_supports_request_injection(
    tmp_path: Path,
) -> None:
    # Route invocation should coerce typed params and inject Request objects.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter, Request\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.get('/typed/{itemId}')\n"
        "    def typed(\n"
        "        itemId: int,\n"
        "        limit: int,\n"
        "        values: list[int],\n"
        "        request: Request,\n"
        "    ) -> dict[str, object]:\n"
        "        return {\n"
        "            'itemId': itemId,\n"
        "            'itemIdType': type(itemId).__name__,\n"
        "            'limit': limit,\n"
        "            'limitType': type(limit).__name__,\n"
        "            'values': values,\n"
        "            'valuesType': type(values[0]).__name__,\n"
        "            'method': request.method,\n"
        "            'headerValue': request.headers.get('x-test'),\n"
        "        }\n\n"
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

        invoke_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/typed/{itemId}"],
                "pathParams": {"itemId": "7"},
                "queryParams": {
                    "limit": "5",
                    "values": ["1", "2", "3"],
                },
                "requestContext": {
                    "method": "GET",
                    "path": "/typed/7",
                    "queryString": "limit=5&values=1&values=2&values=3",
                    "headers": [["x-test", "fixture"]],
                },
            },
        )
        assert invoke_response["result"]["statusCode"] == 200
        assert invoke_response["result"]["body"] == {
            "itemId": 7,
            "itemIdType": "int",
            "limit": 5,
            "limitType": "int",
            "values": [1, 2, 3],
            "valuesType": "int",
            "method": "GET",
            "headerValue": "fixture",
        }

        normalized_query_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/typed/{itemId}"],
                "pathParams": {"itemId": "9"},
                "queryParams": {
                    "limit": ["1", "2"],
                    "values": "4",
                },
            },
        )
        assert normalized_query_response["result"]["statusCode"] == 200
        assert normalized_query_response["result"]["body"] == {
            "itemId": 9,
            "itemIdType": "int",
            "limit": 2,
            "limitType": "int",
            "values": [4],
            "valuesType": "int",
            "method": "GET",
            "headerValue": None,
        }

        invalid_response = _rpc_call(
            worker,
            request_id=5,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/typed/{itemId}"],
                "pathParams": {"itemId": "7"},
                "queryParams": {"limit": "not-an-int", "values": ["1"]},
            },
        )
        assert invalid_response["error"]["code"] == "PLUGIN_BACKEND_ROUTE_CALL_INVALID"
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_supports_model_body_and_query_defaults(
    tmp_path: Path,
) -> None:
    # Route invocation should map unnamed body-model params and unwrap Query defaults.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter, Query\n"
        "from pydantic import BaseModel\n\n"
        "class Payload(BaseModel):\n"
        "    value: str\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/from-model')\n"
        "    def from_model(payload: Payload) -> dict[str, str]:\n"
        "        return {'value': payload.value}\n\n"
        "    @router.get('/query-default')\n"
        "    def query_default(limit: int = Query(10, ge=1)) -> dict[str, int]:\n"
        "        return {'limit': limit}\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
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

        model_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/from-model"],
                "pathParams": {},
                "queryParams": {},
                "jsonBody": {"value": "from-model"},
            },
        )
        assert model_response["result"]["statusCode"] == 200
        assert model_response["result"]["body"] == {"value": "from-model"}

        query_default_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/query-default"],
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert query_default_response["result"]["statusCode"] == 200
        assert query_default_response["result"]["body"] == {"limit": 10}
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_binds_optional_single_body_parameter(
    tmp_path: Path,
) -> None:
    # Optional body params should still bind jsonBody when they are the sole body-bound argument.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/optional-body')\n"
        "    def optional_body(payload: dict | None = None) -> dict[str, object]:\n"
        "        return {\n"
        "            'payload': payload,\n"
        "            'payloadIsNone': payload is None,\n"
        "        }\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
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

        with_body_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/optional-body"],
                "pathParams": {},
                "queryParams": {},
                "jsonBody": {"value": "from-optional"},
            },
        )
        assert with_body_response["result"]["statusCode"] == 200
        assert with_body_response["result"]["body"] == {
            "payload": {"value": "from-optional"},
            "payloadIsNone": False,
        }

        without_body_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/optional-body"],
                "pathParams": {},
                "queryParams": {},
                "jsonBody": None,
            },
        )
        assert without_body_response["result"]["statusCode"] == 200
        assert without_body_response["result"]["body"] == {
            "payload": None,
            "payloadIsNone": True,
        }
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_normalizes_responses_and_http_exceptions(
    tmp_path: Path,
) -> None:
    # Route invocation should preserve response status/headers and normalize HTTPException payloads.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter, HTTPException\n"
        "from fastapi.responses import JSONResponse, Response\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/created')\n"
        "    def created() -> JSONResponse:\n"
        "        return JSONResponse(\n"
        "            status_code=201,\n"
        "            content={'ok': True},\n"
        "            headers={'x-fixture': 'created'},\n"
        "        )\n\n"
        "    @router.get('/empty')\n"
        "    def empty() -> Response:\n"
        "        return Response(status_code=200, content=b'', media_type='application/json')\n\n"
        "    @router.get('/missing')\n"
        "    def missing() -> None:\n"
        "        raise HTTPException(status_code=404, detail='not found')\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
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

        created_response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/created"],
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert created_response["result"]["statusCode"] == 201
        assert created_response["result"]["body"] == {"ok": True}
        assert created_response["result"]["mediaType"] == "application/json"
        assert created_response["result"]["headers"] == [["x-fixture", "created"]]

        empty_response = _rpc_call(
            worker,
            request_id=4,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/empty"],
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert empty_response["result"]["statusCode"] == 200
        assert empty_response["result"]["mediaType"] == "application/json"
        assert "body" not in empty_response["result"]

        missing_response = _rpc_call(
            worker,
            request_id=5,
            method="plugin.invoke_route",
            params={
                "routeId": route_id_by_path["/missing"],
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert missing_response["result"]["statusCode"] == 404
        assert missing_response["result"]["body"] == {"detail": "not found"}
        assert missing_response["result"]["mediaType"] == "application/json"
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_promotes_header_only_content_type_to_media_type(
    tmp_path: Path,
) -> None:
    # Route normalization should preserve content-type headers even when media_type is unset.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter\n"
        "from fastapi.responses import Response\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.get('/header-only-content-type')\n"
        "    def header_only_content_type() -> Response:\n"
        "        return Response(\n"
        "            content='ok',\n"
        "            headers={'content-type': 'application/x-custom'},\n"
        "        )\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
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

        response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id,
                "pathParams": {},
                "queryParams": {},
            },
        )
        assert response["result"]["statusCode"] == 200
        assert response["result"]["body"] == "ok"
        assert response["result"]["mediaType"] == "application/x-custom"
        assert response["result"].get("headers") is None
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_prefers_raw_body_for_request_payload(
    tmp_path: Path,
) -> None:
    # Request injection should preserve raw request bytes even when payload is non-UTF8.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "import base64\n"
        "from fastapi import APIRouter, Request\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/raw-body')\n"
        "    async def raw_body(request: Request) -> dict[str, str]:\n"
        "        payload = await request.body()\n"
        "        return {'bodyBase64': base64.b64encode(payload).decode('ascii')}\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
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
        raw_payload = b"\xffabc\xfe"
        encoded_payload = base64.b64encode(raw_payload).decode("ascii")
        response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id,
                "pathParams": {},
                "queryParams": {},
                "rawBodyBase64": encoded_payload,
            },
        )
        assert response["result"]["statusCode"] == 200
        assert response["result"]["body"] == {
            "bodyBase64": encoded_payload,
        }
    finally:
        _stop_worker(worker)


def test_worker_register_reports_needs_raw_body_by_route_signature(
    tmp_path: Path,
) -> None:
    # Route registration should expose raw-body needs for request-injected handlers only.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter, Body, Request\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/raw-body')\n"
        "    async def raw_body(request: Request) -> dict[str, bool]:\n"
        "        await request.body()\n"
        "        return {'ok': True}\n\n"
        "    @router.post('/json-body')\n"
        "    def json_body(payload: dict[str, object] = Body(default_factory=dict)) -> dict[str, object]:\n"
        "        return payload\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
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
        needs_raw_body_by_path = {
            route["path"]: route.get("needsRawBody")
            for route in routes
        }
        assert needs_raw_body_by_path["/raw-body"] is True
        assert needs_raw_body_by_path["/json-body"] is False
    finally:
        _stop_worker(worker)


def test_worker_invoke_route_skips_raw_body_decode_when_not_needed(
    tmp_path: Path,
) -> None:
    # Non-request route handlers should not decode rawBodyBase64 inputs.
    plugin_root = _copy_backend_fixture(tmp_path)
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "from fastapi import APIRouter, Body\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.post('/json-body')\n"
        "    def json_body(payload: dict[str, object] = Body(default_factory=dict)) -> dict[str, object]:\n"
        "        return payload\n\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )
    worker = _start_worker(plugin_root)
    try:
        _ = _rpc_call(worker, request_id=1, method="plugin.initialize")
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
        route_id = next(
            route["routeId"]
            for route in router_registration["params"]["routes"]
            if route["path"] == "/json-body"
        )

        response = _rpc_call(
            worker,
            request_id=3,
            method="plugin.invoke_route",
            params={
                "routeId": route_id,
                "pathParams": {},
                "queryParams": {},
                "jsonBody": {"value": "hello"},
                "rawBodyBase64": "not-valid-base64",
            },
        )
        assert response["result"]["statusCode"] == 200
        assert response["result"]["body"] == {"value": "hello"}
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
