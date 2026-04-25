#!/usr/bin/env python3

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from typing import Any

from setta.local_core_client import LocalCoreCommandError
from setta.plugin_runtime import watch_code

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
BACKEND_RUNTIME_ARG = "--setta-plugin-backend-runtime"

ERROR_INVALID_JSON = "invalid_json"
ERROR_INVALID_REQUEST = "invalid_request"
ERROR_INTERNAL = "internal_error"
ERROR_METHOD_NOT_ALLOWED = "method_not_allowed"
ERROR_NOT_FOUND = "not_found"
ERROR_PROJECT_CONFIG_ID_REQUIRED = "project_config_id_required"
ERROR_PROJECT_CONFIG_NOT_FOUND = "project_config_not_found"
ERROR_INVALID_WATCH_CODE_INPUT = "invalid_watch_code_input"
ERROR_WATCH_CODE_PROVIDER_REQUIRED = "watch_code_provider_required"

LOCAL_CORE_HTTP_STATUS = {
    ERROR_PROJECT_CONFIG_ID_REQUIRED: 400,
    ERROR_INVALID_WATCH_CODE_INPUT: 400,
    ERROR_INVALID_REQUEST: 400,
    ERROR_PROJECT_CONFIG_NOT_FOUND: 404,
    ERROR_WATCH_CODE_PROVIDER_REQUIRED: 409,
    ERROR_INTERNAL: 500,
}


class WatchCodeBackendRequestError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def _plugin_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _plugin_id() -> str:
    manifest_path = _plugin_root() / "setta.plugin.json"
    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    plugin_id = str(manifest.get("id", "")).strip()
    if not plugin_id:
        raise RuntimeError("setta-watch-code manifest id is required")
    return plugin_id


def _write_json(payload: dict[str, Any]) -> None:
    json.dump(payload, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _route(plugin_id: str, suffix: str) -> str:
    return f"/plugins/{plugin_id}/watch-code/{suffix}"


def _ui_settings() -> list[dict[str, Any]]:
    return [
        {
            "id": "enabled",
            "title": "Watch Code Enabled",
            "description": "Enable or disable Watch Code for the project.",
            "synonyms": ["watch code", "watch mode", "watch toggle"],
            "paneId": "left",
            "revealKey": "watch-code-settings",
            "mutability": "writable",
            "valueSchema": {"type": "boolean"},
            "readHandlerId": "read_enabled",
            "writeHandlerId": "write_enabled",
        },
        {
            "id": "folders",
            "title": "Watch Code Folders",
            "description": "List of folders watched by Watch Code.",
            "synonyms": ["watch folders", "watch code folders"],
            "paneId": "left",
            "revealKey": "watch-code-settings",
            "mutability": "writable",
            "valueSchema": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "recursive": {"type": "boolean"},
                    },
                    "required": ["path"],
                    "additionalProperties": False,
                },
            },
            "readHandlerId": "read_folders",
            "writeHandlerId": "write_folders",
        },
        {
            "id": "files",
            "title": "Watch Code Files",
            "description": "List of explicit files watched by Watch Code.",
            "synonyms": ["watch files", "watch code files"],
            "paneId": "left",
            "revealKey": "watch-code-settings",
            "mutability": "writable",
            "valueSchema": {
                "type": "array",
                "items": {"type": "string"},
            },
            "readHandlerId": "read_files",
            "writeHandlerId": "write_files",
        },
    ]


def _probe_payload() -> dict[str, Any]:
    plugin_id = _plugin_id()
    return {
        "schemaVersion": 1,
        "watchCodeBackend": {
            "contractVersion": 1,
            "dataSchemaVersion": 1,
            "languages": ["python"],
            "requiresLanguageServer": True,
        },
        "routes": [
            {"path": _route(plugin_id, "enabled"), "methods": ["POST"]},
            {"path": _route(plugin_id, "inputs"), "methods": ["POST"]},
        ],
        "uiSettings": _ui_settings(),
    }


def _probe() -> None:
    _write_json(_probe_payload())


def _runtime() -> None:
    request = _runtime_request()
    _write_json(_handle_runtime_request(request, plugin_id=_plugin_id()))


def _runtime_request() -> dict[str, Any]:
    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        _fail(f"decode backend runtime request: {error}")
    if not isinstance(request, dict):
        _fail("backend runtime request must be an object")
    if request.get("schemaVersion") != 1:
        _fail(
            f"unsupported backend runtime schemaVersion {request.get('schemaVersion')!r}"
        )
    return request


def _handle_runtime_request(
    request: dict[str, Any],
    *,
    plugin_id: str,
) -> dict[str, Any]:
    kind = str(request.get("kind", "")).strip()
    if kind == "http":
        http_request = request.get("http")
        if not isinstance(http_request, dict):
            _fail("http runtime payload is required")
        return {
            "schemaVersion": 1,
            "http": _handle_http_request(http_request, plugin_id),
        }
    if kind == "ui_setting":
        ui_setting_request = request.get("uiSetting")
        if not isinstance(ui_setting_request, dict):
            _fail("ui setting runtime payload is required")
        return {
            "schemaVersion": 1,
            "uiSetting": _handle_ui_setting_request(ui_setting_request, plugin_id),
        }
    _fail(f"unsupported backend runtime kind {kind!r}")
    raise AssertionError("unreachable")


def _handle_http_request(
    request: dict[str, Any],
    plugin_id: str,
) -> dict[str, Any]:
    try:
        method = str(request.get("method", "")).strip().upper()
        if method != "POST":
            raise WatchCodeBackendRequestError(
                ERROR_METHOD_NOT_ALLOWED,
                "Method not allowed.",
                status_code=405,
            )

        path = str(request.get("path", "")).strip()
        body = _decode_http_json_body(request)
        context = _request_context(request)
        if path == _route(plugin_id, "enabled"):
            result = _handle_set_enabled(body, context, plugin_id)
            return _http_json_response(200, {"projectData": result})
        if path == _route(plugin_id, "inputs"):
            result = _handle_set_inputs(body, context, plugin_id)
            return _http_json_response(200, {"projectData": result})
        raise WatchCodeBackendRequestError(
            ERROR_NOT_FOUND,
            "Route not found.",
            status_code=404,
        )
    except WatchCodeBackendRequestError as error:
        return _http_error_response(error.status_code, error)
    except LocalCoreCommandError as error:
        return _http_error_response(_http_status_for_local_core_error(error), error)


def _handle_set_enabled(
    payload: dict[str, Any],
    context: dict[str, Any],
    plugin_id: str,
) -> Any:
    project_config_id = _required_project_config_id(payload)
    enabled = payload.get("enabled")
    if not isinstance(enabled, bool):
        raise WatchCodeBackendRequestError(
            ERROR_INVALID_REQUEST,
            "enabled must be a boolean.",
        )
    frontend_op_id = _optional_string(payload, "frontendOpId")
    return watch_code.set_enabled(
        setta_files_root=_required_context_string(context, "settaFilesRoot"),
        workspace_root=_required_context_string(context, "workspaceRoot"),
        plugin_id=plugin_id,
        project_config_id=project_config_id,
        enabled=enabled,
        frontend_op_id=frontend_op_id,
    )


def _handle_set_inputs(
    payload: dict[str, Any],
    context: dict[str, Any],
    plugin_id: str,
) -> Any:
    project_config_id = _required_project_config_id(payload)
    folders = payload.get("watchCodeFolders")
    if not isinstance(folders, list) or not all(
        isinstance(folder, dict) for folder in folders
    ):
        raise WatchCodeBackendRequestError(
            ERROR_INVALID_REQUEST,
            "watchCodeFolders must be an array of objects.",
        )
    files = payload.get("watchCodeFiles")
    if not isinstance(files, list) or not all(isinstance(file, str) for file in files):
        raise WatchCodeBackendRequestError(
            ERROR_INVALID_REQUEST,
            "watchCodeFiles must be an array of strings.",
        )
    frontend_op_id = _optional_string(payload, "frontendOpId")
    return watch_code.set_inputs(
        setta_files_root=_required_context_string(context, "settaFilesRoot"),
        workspace_root=_required_context_string(context, "workspaceRoot"),
        plugin_id=plugin_id,
        project_config_id=project_config_id,
        watch_code_folders=folders,
        watch_code_files=files,
        frontend_op_id=frontend_op_id,
    )


def _handle_ui_setting_request(
    request: dict[str, Any],
    plugin_id: str,
) -> dict[str, Any]:
    try:
        operation = str(request.get("operation", "")).strip()
        handler_id = _required_string(request, "handlerId", ERROR_INVALID_REQUEST)
        project_config_id = _required_project_config_id(request)
        context = _request_context(request)
        if operation == "read":
            setting_id = watch_code.setting_id_for_read_handler(handler_id)
            value = watch_code.read_setting(
                setta_files_root=_required_context_string(context, "settaFilesRoot"),
                plugin_id=plugin_id,
                project_config_id=project_config_id,
                setting_id=setting_id,
            )
            return {"value": value}
        if operation == "write":
            setting_id = watch_code.setting_id_for_write_handler(handler_id)
            value = request.get("value")
            result = watch_code.write_setting(
                setta_files_root=_required_context_string(context, "settaFilesRoot"),
                workspace_root=_required_context_string(context, "workspaceRoot"),
                plugin_id=plugin_id,
                project_config_id=project_config_id,
                setting_id=setting_id,
                value=value,
                frontend_op_id=None,
            )
            return {"value": result}
        raise WatchCodeBackendRequestError(
            ERROR_INVALID_REQUEST,
            f"unsupported ui setting operation {operation!r}",
        )
    except KeyError as error:
        return {"error": _error_payload(ERROR_INVALID_REQUEST, str(error))}
    except WatchCodeBackendRequestError as error:
        return {"error": _error_payload(error.code, error.message, error.details)}
    except LocalCoreCommandError as error:
        return {"error": _local_core_error_payload(error)}


def _decode_http_json_body(request: dict[str, Any]) -> dict[str, Any]:
    raw_body = str(request.get("bodyBase64", "")).strip()
    if not raw_body:
        return {}
    try:
        body = base64.b64decode(raw_body, validate=True)
    except ValueError as error:
        raise WatchCodeBackendRequestError(
            ERROR_INVALID_REQUEST,
            f"bodyBase64 is invalid: {error}",
        ) from error
    if not body.strip():
        return {}
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WatchCodeBackendRequestError(
            ERROR_INVALID_JSON,
            "Invalid JSON payload.",
        ) from error
    if not isinstance(payload, dict):
        raise WatchCodeBackendRequestError(
            ERROR_INVALID_REQUEST,
            "JSON payload must be an object.",
        )
    return payload


def _request_context(request: dict[str, Any]) -> dict[str, Any]:
    context = request.get("context")
    if not isinstance(context, dict):
        raise WatchCodeBackendRequestError(
            ERROR_INTERNAL,
            "backend runtime request context is required.",
            status_code=500,
        )
    return context


def _required_project_config_id(payload: dict[str, Any]) -> str:
    return _required_string(
        payload,
        "projectConfigId",
        ERROR_PROJECT_CONFIG_ID_REQUIRED,
        "Project config id is required.",
    )


def _required_context_string(context: dict[str, Any], key: str) -> str:
    return _required_string(
        context,
        key,
        ERROR_INTERNAL,
        f"backend runtime context {key} is required.",
        status_code=500,
    )


def _required_string(
    payload: dict[str, Any],
    key: str,
    code: str,
    message: str | None = None,
    *,
    status_code: int = 400,
) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise WatchCodeBackendRequestError(
            code,
            message or f"{key} is required.",
            status_code=status_code,
        )
    return value.strip()


def _optional_string(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise WatchCodeBackendRequestError(
            ERROR_INVALID_REQUEST,
            f"{key} must be a string when provided.",
        )
    return value


def _http_status_for_local_core_error(error: LocalCoreCommandError) -> int:
    code = str(error.code or ERROR_INTERNAL).strip() or ERROR_INTERNAL
    return LOCAL_CORE_HTTP_STATUS.get(code, 500)


def _http_json_response(status_code: int, payload: Any) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": ["application/json"]},
        "bodyBase64": base64.b64encode(body).decode("ascii"),
    }


def _http_error_response(status_code: int, error: Exception) -> dict[str, Any]:
    if isinstance(error, WatchCodeBackendRequestError):
        payload = _error_payload(error.code, error.message, error.details)
    elif isinstance(error, LocalCoreCommandError):
        payload = _local_core_error_payload(error)
    else:
        payload = _error_payload(ERROR_INTERNAL, "Internal Server Error")
    return _http_json_response(status_code, {"error": payload})


def _local_core_error_payload(error: LocalCoreCommandError) -> dict[str, Any]:
    code = str(error.code or ERROR_INTERNAL).strip() or ERROR_INTERNAL
    return _error_payload(
        code, str(error) or "Setta local core command failed", error.details
    )


def _error_payload(
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return payload


def _fail(message: str) -> None:
    sys.stderr.write(message.strip() + "\n")
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 2:
        return
    command = sys.argv[1]
    if command == BACKEND_PROBE_ARG:
        _probe()
        return
    if command == BACKEND_RUNTIME_ARG:
        _runtime()


if __name__ == "__main__":
    main()
