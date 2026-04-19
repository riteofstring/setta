#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

from setta.entrypoint import resolve_go_cli_command, resolve_go_cli_env
from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_CATALOG_ID,
    LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_PATH,
    LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_VERSION,
    LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_THEME_MODE,
    LOCAL_CORE_COMMAND_GET_APP_DEFINITION,
    LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_DEFINITION,
    LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_SPEC_PATH,
    LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_THEME_MODE,
    LOCAL_CORE_COMMAND_SET_APP_DEFINITION,
    LOCAL_CORE_COMMAND_STREAM_APP_DEFINITION,
    LOCAL_CORE_COMMAND_UPDATE_APP_DEFINITION,
    LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION,
    LOCAL_CORE_PROTOCOL_VERSION,
)

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
BACKEND_RUNTIME_ARG = "--setta-plugin-backend-runtime"
APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION = 1

LISTENER_ENDPOINT_GET_APP_DEFINITION = "appsubsystem_get_app_definition"
LISTENER_ENDPOINT_GET_EFFECTIVE_APP_DEFINITION = (
    "appsubsystem_get_effective_app_definition"
)
LISTENER_ENDPOINT_GET_EFFECTIVE_APP_SPEC_PATH = (
    "appsubsystem_get_effective_app_spec_path"
)
LISTENER_ENDPOINT_GET_EFFECTIVE_APP_THEME_MODE = (
    "appsubsystem_get_effective_app_theme_mode"
)
LISTENER_ENDPOINT_VALIDATE_APP_DEFINITION = "appsubsystem_validate_app_definition"
LISTENER_ENDPOINT_SET_APP_DEFINITION = "appsubsystem_set_app_definition"
LISTENER_ENDPOINT_STREAM_APP_DEFINITION = "appsubsystem_stream_app_definition"
LISTENER_ENDPOINT_UPDATE_APP_DEFINITION = "appsubsystem_update_app_definition"
LISTENER_ENDPOINT_COMPARE_AND_SET_CATALOG_ID = "appsubsystem_compare_and_set_catalog_id"
LISTENER_ENDPOINT_COMPARE_AND_SET_SPEC_VERSION = (
    "appsubsystem_compare_and_set_spec_version"
)
LISTENER_ENDPOINT_COMPARE_AND_SET_SPEC_PATH = "appsubsystem_compare_and_set_spec_path"
LISTENER_ENDPOINT_COMPARE_AND_SET_THEME_MODE = "appsubsystem_compare_and_set_theme_mode"


class LocalCoreCommandError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


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
    return [
        {"name": LISTENER_ENDPOINT_GET_APP_DEFINITION},
        {"name": LISTENER_ENDPOINT_GET_EFFECTIVE_APP_DEFINITION},
        {"name": LISTENER_ENDPOINT_GET_EFFECTIVE_APP_SPEC_PATH},
        {"name": LISTENER_ENDPOINT_GET_EFFECTIVE_APP_THEME_MODE},
        {"name": LISTENER_ENDPOINT_VALIDATE_APP_DEFINITION},
        {"name": LISTENER_ENDPOINT_SET_APP_DEFINITION},
        {"name": LISTENER_ENDPOINT_STREAM_APP_DEFINITION},
        {"name": LISTENER_ENDPOINT_UPDATE_APP_DEFINITION},
        {"name": LISTENER_ENDPOINT_COMPARE_AND_SET_CATALOG_ID},
        {"name": LISTENER_ENDPOINT_COMPARE_AND_SET_SPEC_VERSION},
        {"name": LISTENER_ENDPOINT_COMPARE_AND_SET_SPEC_PATH},
        {"name": LISTENER_ENDPOINT_COMPARE_AND_SET_THEME_MODE},
    ]


def _listener_command(endpoint_name: str) -> str:
    commands = {
        LISTENER_ENDPOINT_GET_APP_DEFINITION: LOCAL_CORE_COMMAND_GET_APP_DEFINITION,
        LISTENER_ENDPOINT_GET_EFFECTIVE_APP_DEFINITION: LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_DEFINITION,
        LISTENER_ENDPOINT_GET_EFFECTIVE_APP_SPEC_PATH: LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_SPEC_PATH,
        LISTENER_ENDPOINT_GET_EFFECTIVE_APP_THEME_MODE: LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_THEME_MODE,
        LISTENER_ENDPOINT_VALIDATE_APP_DEFINITION: LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION,
        LISTENER_ENDPOINT_SET_APP_DEFINITION: LOCAL_CORE_COMMAND_SET_APP_DEFINITION,
        LISTENER_ENDPOINT_STREAM_APP_DEFINITION: LOCAL_CORE_COMMAND_STREAM_APP_DEFINITION,
        LISTENER_ENDPOINT_UPDATE_APP_DEFINITION: LOCAL_CORE_COMMAND_UPDATE_APP_DEFINITION,
        LISTENER_ENDPOINT_COMPARE_AND_SET_CATALOG_ID: LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_CATALOG_ID,
        LISTENER_ENDPOINT_COMPARE_AND_SET_SPEC_VERSION: LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_VERSION,
        LISTENER_ENDPOINT_COMPARE_AND_SET_SPEC_PATH: LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_PATH,
        LISTENER_ENDPOINT_COMPARE_AND_SET_THEME_MODE: LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_THEME_MODE,
    }
    try:
        return commands[endpoint_name]
    except KeyError as error:
        raise KeyError(f"unknown listener endpoint {endpoint_name!r}") from error


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


def _run_local_core_command(command_name: str, payload: dict[str, Any]) -> Any:
    command, command_cwd = resolve_go_cli_command()
    env = {**os.environ, **resolve_go_cli_env(command_cwd)}
    process = subprocess.Popen(
        [*command, "sdk-local-core"],
        cwd=command_cwd,
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        handshake = json.loads(_read_local_core_line(process))
        protocol_version = handshake.get("protocolVersion")
        if protocol_version != LOCAL_CORE_PROTOCOL_VERSION:
            raise RuntimeError(
                "Setta local core protocol mismatch: "
                f"plugin={LOCAL_CORE_PROTOCOL_VERSION} local_core={protocol_version}"
            )

        if process.stdin is None:
            raise RuntimeError("Setta local core stdin is unavailable")
        json.dump(
            {
                "callId": uuid4().hex,
                "commandName": command_name,
                "payload": payload,
            },
            process.stdin,
        )
        process.stdin.write("\n")
        process.stdin.flush()

        result = json.loads(_read_local_core_line(process))
        if result.get("ok"):
            return result.get("result")

        details = result.get("details")
        if not isinstance(details, dict):
            details = {}
        raw_code = details.get("code")
        code = (
            raw_code.strip() if isinstance(raw_code, str) and raw_code.strip() else None
        )
        raise LocalCoreCommandError(
            str(result.get("error") or "Setta local core command failed"),
            code=code,
            details=details,
        )
    finally:
        _terminate_local_core_process(process)


def _read_local_core_line(process: subprocess.Popen[str]) -> str:
    if process.stdout is None:
        raise RuntimeError("Setta local core stdout is unavailable")
    line = process.stdout.readline()
    if line:
        return line

    stderr_text = ""
    if process.stderr is not None:
        stderr_text = process.stderr.read().strip()
    returncode = process.poll()
    if returncode is None:
        raise RuntimeError("Setta local core closed stdout unexpectedly")
    if stderr_text:
        raise RuntimeError(f"Setta local core exited before responding: {stderr_text}")
    raise RuntimeError(
        f"Setta local core exited before responding (exit code {returncode})"
    )


def _terminate_local_core_process(process: subprocess.Popen[str]) -> None:
    for pipe in (process.stdin, process.stdout, process.stderr):
        if pipe is not None:
            pipe.close()
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=1)


def _handle_listener_endpoint(request: dict[str, Any]) -> dict[str, Any]:
    endpoint_name = str(request.get("endpointName", "")).strip()
    request_context = _request_context(request)
    payload = _request_payload(request)
    command_name = _listener_command(endpoint_name)
    try:
        result = _run_local_core_command(
            command_name,
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
                    "contractVersion": APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION
                },
                "codegenTargets": [],
                "languageServers": [],
                "uiSettings": [],
                "routes": [],
                "staticDirs": [],
                "listenerEndpoints": _listener_endpoints(),
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
