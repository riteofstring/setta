import json
import shutil
import subprocess
import sys
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
) -> dict[str, Any]:
    assert worker.stdin is not None
    assert worker.stdout is not None
    worker.stdin.write(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params or {},
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
