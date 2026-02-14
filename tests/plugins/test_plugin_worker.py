import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _copy_backend_fixture(tmp_path: Path) -> Path:
    plugin_root = tmp_path / "plugin"
    shutil.copytree(FIXTURE_PLUGIN_ROOT / "backend", plugin_root)
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
) -> dict[str, Any]:
    assert worker.stdin is not None
    assert worker.stdout is not None
    worker.stdin.write(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": {},
            }
        )
        + "\n"
    )
    worker.stdin.flush()
    line = worker.stdout.readline()
    assert line != ""
    payload = json.loads(line)
    assert isinstance(payload, dict)
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

        register_response = _rpc_call(
            worker,
            request_id=2,
            method="plugin.register",
        )
        assert register_response["id"] == 2
        assert register_response["result"] == {"ok": True}

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
