#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from setta.plugin_runtime import (
    APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION,
    LocalCoreCommandError,
    listener_endpoint_names,
    local_core_command_for_listener_endpoint,
    run_local_core_command,
)

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
BACKEND_RUNTIME_ARG = "--setta-plugin-backend-runtime"


def write_json(payload: object) -> None:
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    sys.stdout.flush()


def fail(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.exit(1)


def _plugin_root() -> Path:
    return Path(__file__).resolve(strict=False).parents[1]


def _plugin_id() -> str:
    manifest_path = _plugin_root() / "setta.plugin.json"
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin_id = str(payload.get("id", "")).strip()
    if not plugin_id:
        raise RuntimeError(f"plugin manifest is missing id: {manifest_path}")
    return plugin_id


def _listener_endpoints() -> list[dict[str, str]]:
    return [{"name": name} for name in listener_endpoint_names()]


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
    request_context: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    setta_files_root = str(request_context.get("settaFilesRoot", "")).strip()
    if not setta_files_root:
        raise RuntimeError("backend runtime request context is missing settaFilesRoot")
    return {
        **payload,
        "settaFilesRoot": setta_files_root,
        "pluginId": _plugin_id(),
    }


def _handle_listener_endpoint(request: dict[str, Any]) -> dict[str, Any]:
    endpoint_name = str(request.get("endpointName", "")).strip()
    request_context = _request_context(request)
    payload = _request_payload(request)
    try:
        result = run_local_core_command(
            local_core_command_for_listener_endpoint(endpoint_name),
            _local_core_payload(request_context, payload),
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


def _handle_runtime_request(request: dict[str, Any]) -> dict[str, Any]:
    kind = str(request.get("kind", "")).strip()
    response: dict[str, Any] = {"schemaVersion": 1}
    if kind == "listener_endpoint":
        listener_request = request.get("listenerEndpoint")
        if not isinstance(listener_request, dict):
            fail("listener endpoint runtime payload is required")
        response["listenerEndpoint"] = _handle_listener_endpoint(listener_request)
        return response
    if kind == "http":
        response["http"] = {"statusCode": 404, "headers": {}}
        return response
    fail(f"unsupported backend runtime kind {kind!r}")
    raise AssertionError("unreachable")


def main() -> None:
    if len(sys.argv) != 2:
        return

    command = sys.argv[1]
    if command == BACKEND_PROBE_ARG:
        write_json(
            {
                "schemaVersion": 1,
                "appSubsystemBackend": {
                    "contractVersion": APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION,
                    "listenerEndpoints": _listener_endpoints(),
                },
                "codegenTargets": [],
                "languageServers": [],
                "uiSettings": [],
                "routes": [],
                "staticDirs": [],
                "listenerEndpoints": [],
            }
        )
        return

    if command != BACKEND_RUNTIME_ARG:
        return

    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        fail(f"decode backend runtime request: {error}")
    if not isinstance(request, dict):
        fail("backend runtime request must be an object")

    write_json(_handle_runtime_request(request))


if __name__ == "__main__":
    main()
