import json
import sys
from pathlib import Path
from typing import Any

from setta.plugin_runtime.local_core import (
    LocalCoreCommandError,
    run_local_core_command,
)
from setta.types.generated.go_shared_constants import (
    APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION as _GENERATED_APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION,
)
from setta.types.generated.go_shared_constants import (
    APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_NAMES,
    APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND,
)

APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION = (
    _GENERATED_APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION
)
BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
BACKEND_RUNTIME_ARG = "--setta-plugin-backend-runtime"


def listener_endpoint_names() -> tuple[str, ...]:
    return tuple(APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_NAMES)


def local_core_command_for_listener_endpoint(endpoint_name: str) -> str:
    try:
        return APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND[
            endpoint_name
        ]
    except KeyError as error:
        raise KeyError(f"unknown listener endpoint {endpoint_name!r}") from error


def run_app_subsystem_backend(entrypoint_file: str | Path) -> None:
    if len(sys.argv) != 2:
        return

    command = sys.argv[1]
    if command == BACKEND_PROBE_ARG:
        _write_json(_backend_probe_payload())
        return
    if command != BACKEND_RUNTIME_ARG:
        return

    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        _fail(f"decode backend runtime request: {error}")
    if not isinstance(request, dict):
        _fail("backend runtime request must be an object")

    _write_json(
        _handle_runtime_request(
            request,
            plugin_id=_plugin_id_for_entrypoint(entrypoint_file),
        )
    )


def _write_json(payload: object) -> None:
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    sys.stdout.flush()


def _fail(message: str) -> None:
    sys.stderr.write(message + "\n")
    raise SystemExit(1)


def _plugin_id_for_entrypoint(entrypoint_file: str | Path) -> str:
    manifest_path = Path(entrypoint_file).resolve(strict=False).parents[1] / (
        "setta.plugin.json"
    )
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin_id = str(payload.get("id", "")).strip()
    if not plugin_id:
        raise RuntimeError(f"plugin manifest is missing id: {manifest_path}")
    return plugin_id


def _backend_probe_payload() -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "appSubsystemBackend": {
            "contractVersion": APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION,
            "listenerEndpoints": [{"name": name} for name in listener_endpoint_names()],
        },
        "codegenTargets": [],
        "languageServers": [],
        "uiSettings": [],
        "routes": [],
        "staticDirs": [],
        "listenerEndpoints": [],
    }


def _request_context(request: dict[str, Any]) -> dict[str, Any]:
    payload = request.get("context")
    if not isinstance(payload, dict):
        raise RuntimeError("backend runtime listener request is missing context")
    return payload


def _request_payload(request: dict[str, Any]) -> dict[str, Any]:
    payload = request.get("payload")
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise RuntimeError("backend runtime listener payload must be an object")
    return dict(payload)


def _local_core_payload(
    plugin_id: str,
    request_context: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    setta_files_root = str(request_context.get("settaFilesRoot", "")).strip()
    if not setta_files_root:
        raise RuntimeError("backend runtime request context is missing settaFilesRoot")
    return {
        **payload,
        "settaFilesRoot": setta_files_root,
        "pluginId": plugin_id,
    }


def _handle_listener_endpoint(
    request: dict[str, Any],
    plugin_id: str,
) -> dict[str, Any]:
    endpoint_name = str(request.get("endpointName", "")).strip()
    request_context = _request_context(request)
    payload = _request_payload(request)
    try:
        result = run_local_core_command(
            local_core_command_for_listener_endpoint(endpoint_name),
            _local_core_payload(plugin_id, request_context, payload),
        )
    except LocalCoreCommandError as error:
        response_error: dict[str, Any] = {
            "message": str(error) or "Setta local core command failed"
        }
        if error.code:
            response_error["code"] = error.code
        if error.details:
            response_error["details"] = error.details
        return {"result": None, "error": response_error}
    except Exception as error:  # noqa: BLE001
        return {
            "result": None,
            "error": {"code": "internal_error", "message": str(error)},
        }
    return {"result": result}


def _handle_runtime_request(
    request: dict[str, Any],
    plugin_id: str,
) -> dict[str, Any]:
    kind = str(request.get("kind", "")).strip()
    response: dict[str, Any] = {"schemaVersion": 1}
    if kind == "listener_endpoint":
        listener_request = request.get("listenerEndpoint")
        if not isinstance(listener_request, dict):
            _fail("listener endpoint runtime payload is required")
        response["listenerEndpoint"] = _handle_listener_endpoint(
            listener_request,
            plugin_id,
        )
        return response
    if kind == "http":
        response["http"] = {"statusCode": 404, "headers": {}}
        return response
    _fail(f"unsupported backend runtime kind {kind!r}")
    raise AssertionError("unreachable")
