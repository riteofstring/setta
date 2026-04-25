#!/usr/bin/env python3

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from typing import Any

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
BACKEND_RUNTIME_ARG = "--setta-plugin-backend-runtime"

ERROR_METHOD_NOT_ALLOWED = "method_not_allowed"
ERROR_NOT_FOUND = "not_found"
ERROR_WATCH_CODE_PROVIDER_REQUIRED = "watch_code_provider_required"
GO_HOST_REQUIRED_MESSAGE = (
    "Watch Code mutations are handled by the active Setta Go host."
)


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
    method = str(request.get("method", "")).strip().upper()
    if method != "POST":
        return _http_error_response(
            405,
            ERROR_METHOD_NOT_ALLOWED,
            "Method not allowed.",
        )

    path = str(request.get("path", "")).strip()
    if path not in {
        _route(plugin_id, "enabled"),
        _route(plugin_id, "inputs"),
    }:
        return _http_error_response(
            404,
            ERROR_NOT_FOUND,
            "Route not found.",
        )
    return _http_error_response(
        409,
        ERROR_WATCH_CODE_PROVIDER_REQUIRED,
        GO_HOST_REQUIRED_MESSAGE,
    )


def _handle_ui_setting_request(
    request: dict[str, Any],
    plugin_id: str,
) -> dict[str, Any]:
    _ = request
    _ = plugin_id
    return {
        "error": _error_payload(
            ERROR_WATCH_CODE_PROVIDER_REQUIRED,
            GO_HOST_REQUIRED_MESSAGE,
        )
    }


def _http_json_response(status_code: int, payload: Any) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": ["application/json"]},
        "bodyBase64": base64.b64encode(body).decode("ascii"),
    }


def _http_error_response(
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return _http_json_response(
        status_code,
        {"error": _error_payload(code, message, details)},
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
