#!/usr/bin/env python3

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from typing import Any

from setta.plugin_runtime import watch_code
from setta.types.generated import go_shared_constants as C

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
BACKEND_RUNTIME_ARG = "--setta-plugin-backend-runtime"

INPUT_ROUTE_KEYS = frozenset(("projectConfigId", "folders", "files", "frontendOpId"))
FOLDER_KEYS = frozenset(("path", "recursive"))


class WatchCodeBackendRequestError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = (
            status_code
            if status_code is not None
            else C.WATCH_CODE_BACKEND_ERROR_HTTP_STATUS_BY_CODE.get(code, 500)
        )
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
    return f"/plugins/{plugin_id}{C.WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/{suffix}"


def _with_ui_setting_handlers(setting: dict[str, Any]) -> dict[str, Any]:
    setting_id = str(setting["id"])
    return {
        **setting,
        "readHandlerId": C.WATCH_CODE_BACKEND_READ_HANDLER_BY_LOCAL_SETTING_ID[
            setting_id
        ],
        "writeHandlerId": C.WATCH_CODE_BACKEND_WRITE_HANDLER_BY_LOCAL_SETTING_ID[
            setting_id
        ],
    }


def _ui_settings() -> list[dict[str, Any]]:
    return [
        _with_ui_setting_handlers(
            {
                "id": C.WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS,
                "title": "Watch Code Folders",
                "description": "List of folders watched by Watch Code.",
                "synonyms": ["watch folders", "watch code folders"],
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
            }
        ),
        _with_ui_setting_handlers(
            {
                "id": C.WATCH_CODE_BACKEND_LOCAL_SETTING_FILES,
                "title": "Watch Code Files",
                "description": "List of explicit files watched by Watch Code.",
                "synonyms": ["watch files", "watch code files"],
                "revealKey": "watch-code-settings",
                "mutability": "writable",
                "valueSchema": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            }
        ),
    ]


def _probe_payload() -> dict[str, Any]:
    plugin_id = _plugin_id()
    return {
        "schemaVersion": 1,
        "watchCodeBackend": {
            "contractVersion": C.WATCH_CODE_BACKEND_CONTRACT_VERSION,
            "dataSchemaVersion": C.WATCH_CODE_BACKEND_DATA_SCHEMA_VERSION,
            "languages": ["python"],
            "requiresLanguageServer": True,
        },
        "routes": [
            {"path": _route(plugin_id, suffix), "methods": ["POST"]}
            for suffix in C.WATCH_CODE_BACKEND_ROUTE_SUFFIXES
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
                C.WATCH_CODE_BACKEND_ERROR_METHOD_NOT_ALLOWED,
                "Method not allowed.",
            )

        path = str(request.get("path", "")).strip()
        if path == _route(plugin_id, C.WATCH_CODE_BACKEND_ROUTE_SUFFIX_INPUTS):
            body = _decode_http_json_body(request)
            context = _request_context(request)
            result = _handle_set_inputs(body, context, plugin_id)
            return _http_json_response(200, {"projectData": result})
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_NOT_FOUND,
            "Route not found.",
        )
    except WatchCodeBackendRequestError as error:
        return _http_error_response(error.status_code, error)
    except watch_code.WatchCodeCommandError as error:
        return _http_error_response(_http_status_for_local_core_error(error), error)


def _handle_ui_setting_request(
    request: dict[str, Any],
    plugin_id: str,
) -> dict[str, Any]:
    try:
        operation = str(request.get("operation", "")).strip()
        handler_id = _required_string(
            request,
            "handlerId",
            C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
        )
        project_config_id = _required_project_config_id(request)
        context = _request_context(request)
        if operation == "read":
            setting_id = watch_code.setting_id_for_read_handler(handler_id)
            project_data = watch_code.get_project_data(
                setta_files_root=_required_context_string(context, "settaFilesRoot"),
                runtime_root=_optional_context_string(context, "runtimeRoot"),
                plugin_id=plugin_id,
                project_config_id=project_config_id,
            )
            return {"value": watch_code.value_for_setting(project_data, setting_id)}
        if operation == "write":
            setting_id = watch_code.setting_id_for_write_handler(handler_id)
            result = _write_ui_setting_value(
                setting_id,
                request.get("value"),
                context,
                plugin_id,
                project_config_id,
            )
            return {"value": watch_code.value_for_setting(result, setting_id)}
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
            f"unsupported ui setting operation {operation!r}",
        )
    except KeyError as error:
        return {
            "error": _error_payload(
                C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
                str(error),
            )
        }
    except WatchCodeBackendRequestError as error:
        return {"error": _error_payload(error.code, error.message, error.details)}
    except watch_code.WatchCodeCommandError as error:
        return {"error": _local_core_error_payload(error)}


def _handle_set_inputs(
    payload: dict[str, Any],
    context: dict[str, Any],
    plugin_id: str,
) -> Any:
    _reject_unknown_keys(
        payload,
        INPUT_ROUTE_KEYS,
        C.WATCH_CODE_BACKEND_ERROR_INVALID_WATCH_CODE_INPUT,
        "Invalid Watch Code input.",
    )
    project_config_id = _required_project_config_id(payload)
    folders = _required_folders(payload.get("folders"), "folders")
    files = _required_files(payload.get("files"), "files")
    frontend_op_id = _optional_string(payload, "frontendOpId")
    return watch_code.set_inputs(
        setta_files_root=_required_context_string(context, "settaFilesRoot"),
        workspace_root=_required_context_string(context, "workspaceRoot"),
        runtime_root=_optional_context_string(context, "runtimeRoot"),
        plugin_id=plugin_id,
        project_config_id=project_config_id,
        folders=folders,
        files=files,
        frontend_op_id=frontend_op_id,
    )


def _write_ui_setting_value(
    setting_id: str,
    value: Any,
    context: dict[str, Any],
    plugin_id: str,
    project_config_id: str,
) -> Any:
    if setting_id == C.WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS:
        return watch_code.set_folders(
            setta_files_root=_required_context_string(context, "settaFilesRoot"),
            workspace_root=_required_context_string(context, "workspaceRoot"),
            runtime_root=_optional_context_string(context, "runtimeRoot"),
            plugin_id=plugin_id,
            project_config_id=project_config_id,
            folders=_required_folders(value, "value"),
        )
    if setting_id == C.WATCH_CODE_BACKEND_LOCAL_SETTING_FILES:
        return watch_code.set_files(
            setta_files_root=_required_context_string(context, "settaFilesRoot"),
            workspace_root=_required_context_string(context, "workspaceRoot"),
            runtime_root=_optional_context_string(context, "runtimeRoot"),
            plugin_id=plugin_id,
            project_config_id=project_config_id,
            files=_required_files(value, "value"),
        )
    raise WatchCodeBackendRequestError(
        C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
        f"unknown watch code setting {setting_id!r}",
    )


def _decode_http_json_body(request: dict[str, Any]) -> dict[str, Any]:
    raw_body = str(request.get("bodyBase64", "")).strip()
    if not raw_body:
        return {}
    try:
        body = base64.b64decode(raw_body, validate=True)
    except ValueError as error:
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
            f"bodyBase64 is invalid: {error}",
        ) from error
    if not body.strip():
        return {}
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INVALID_JSON,
            "Invalid JSON payload.",
        ) from error
    if not isinstance(payload, dict):
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
            "JSON payload must be an object.",
        )
    return payload


def _request_context(request: dict[str, Any]) -> dict[str, Any]:
    context = request.get("context")
    if not isinstance(context, dict):
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INTERNAL,
            "backend runtime request context is required.",
        )
    return context


def _required_project_config_id(payload: dict[str, Any]) -> str:
    return _required_string(
        payload,
        "projectConfigId",
        C.WATCH_CODE_BACKEND_ERROR_PROJECT_CONFIG_ID_REQUIRED,
        "Project config id is required.",
    )


def _required_folders(value: Any, label: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
            f"{label} must be an array of objects.",
        )
    folders: list[dict[str, Any]] = []
    for folder in value:
        _reject_unknown_keys(
            folder,
            FOLDER_KEYS,
            C.WATCH_CODE_BACKEND_ERROR_INVALID_WATCH_CODE_INPUT,
            "Invalid Watch Code input.",
        )
        folders.append(dict(folder))
    return folders


def _required_files(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
            f"{label} must be an array of strings.",
        )
    return list(value)


def _reject_unknown_keys(
    payload: dict[str, Any],
    allowed_keys: frozenset[str],
    code: str,
    message: str,
) -> None:
    unknown_keys = sorted(str(key) for key in payload if key not in allowed_keys)
    if not unknown_keys:
        return
    raise WatchCodeBackendRequestError(
        code,
        f"{message} Unknown field(s): {', '.join(unknown_keys)}.",
    )


def _required_context_string(context: dict[str, Any], key: str) -> str:
    return _required_string(
        context,
        key,
        C.WATCH_CODE_BACKEND_ERROR_INTERNAL,
        f"backend runtime context {key} is required.",
    )


def _optional_context_string(context: dict[str, Any], key: str) -> str | None:
    value = context.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INTERNAL,
            f"backend runtime context {key} must be a string when provided.",
        )
    return value


def _required_string(
    payload: dict[str, Any],
    key: str,
    code: str,
    message: str | None = None,
) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise WatchCodeBackendRequestError(
            code,
            message or f"{key} is required.",
        )
    return value.strip()


def _optional_string(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise WatchCodeBackendRequestError(
            C.WATCH_CODE_BACKEND_ERROR_INVALID_REQUEST,
            f"{key} must be a string when provided.",
        )
    return value


def _http_status_for_local_core_error(error: watch_code.WatchCodeCommandError) -> int:
    code = str(error.code or C.WATCH_CODE_BACKEND_ERROR_INTERNAL).strip()
    return C.WATCH_CODE_BACKEND_ERROR_HTTP_STATUS_BY_CODE.get(code, 500)


def _http_json_response(status_code: int, payload: Any) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": ["application/json"]},
        "bodyBase64": base64.b64encode(body).decode("ascii"),
    }


def _http_error_response(
    status_code: int,
    error: Exception,
) -> dict[str, Any]:
    if isinstance(error, WatchCodeBackendRequestError):
        payload = _error_payload(error.code, error.message, error.details)
    elif isinstance(error, watch_code.WatchCodeCommandError):
        payload = _local_core_error_payload(error)
    else:
        payload = _error_payload(
            C.WATCH_CODE_BACKEND_ERROR_INTERNAL,
            "Internal Server Error",
        )
    return _http_json_response(
        status_code,
        {"error": payload},
    )


def _local_core_error_payload(
    error: watch_code.WatchCodeCommandError,
) -> dict[str, Any]:
    code = str(error.code or C.WATCH_CODE_BACKEND_ERROR_INTERNAL).strip()
    return _error_payload(
        code,
        str(error) or "Setta local core command failed",
        error.details,
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
