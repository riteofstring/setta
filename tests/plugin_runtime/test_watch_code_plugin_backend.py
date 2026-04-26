from __future__ import annotations

import base64
import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any

from setta.types.generated import go_shared_constants as C


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_MAIN = PROJECT_ROOT / "plugins" / "setta-watch-code" / "backend" / "main.py"
PLUGIN_ID = "setta-watch-code"


def _load_backend() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "setta_watch_code_backend_main_for_test",
        BACKEND_MAIN,
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _body(payload: dict[str, Any]) -> str:
    return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def _decode_http_body(response: dict[str, Any]) -> dict[str, Any]:
    encoded = response["http"]["bodyBase64"]
    decoded = base64.b64decode(encoded).decode("utf-8")
    payload = json.loads(decoded)
    assert isinstance(payload, dict)
    return payload


def _runtime_context() -> dict[str, str]:
    return {
        "settaFilesRoot": "/tmp/setta_files",
        "workspaceRoot": "/tmp/workspace",
    }


def test_watch_code_backend_probe_declares_routes_and_ui_settings() -> None:
    backend = _load_backend()

    payload = backend._probe_payload()

    assert payload["schemaVersion"] == 1
    assert payload["watchCodeBackend"] == {
        "contractVersion": C.WATCH_CODE_BACKEND_CONTRACT_VERSION,
        "dataSchemaVersion": C.WATCH_CODE_BACKEND_DATA_SCHEMA_VERSION,
        "languages": ["python"],
        "requiresLanguageServer": True,
    }
    assert payload["routes"] == [
        {
            "path": (
                f"/plugins/{PLUGIN_ID}{C.WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/"
                f"{suffix}"
            ),
            "methods": ["POST"],
        }
        for suffix in C.WATCH_CODE_BACKEND_ROUTE_SUFFIXES
    ]
    assert {setting["id"] for setting in payload["uiSettings"]} == {
        C.WATCH_CODE_BACKEND_LOCAL_SETTING_ENABLED,
        C.WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS,
        C.WATCH_CODE_BACKEND_LOCAL_SETTING_FILES,
    }
    assert all("paneId" not in setting for setting in payload["uiSettings"])
    handlers_by_setting = {
        setting["id"]: (setting["readHandlerId"], setting["writeHandlerId"])
        for setting in payload["uiSettings"]
    }
    assert handlers_by_setting == {
        setting_id: (
            C.WATCH_CODE_BACKEND_READ_HANDLER_BY_LOCAL_SETTING_ID[setting_id],
            C.WATCH_CODE_BACKEND_WRITE_HANDLER_BY_LOCAL_SETTING_ID[setting_id],
        )
        for setting_id in C.WATCH_CODE_BACKEND_LOCAL_SETTING_IDS
    }


def test_watch_code_backend_runtime_fails_closed_without_go_host() -> None:
    backend = _load_backend()

    enabled_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "POST",
                "path": (
                    f"/plugins/{PLUGIN_ID}{C.WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/"
                    f"{C.WATCH_CODE_BACKEND_ROUTE_SUFFIX_ENABLED}"
                ),
                "bodyBase64": _body(
                    {
                        "projectConfigId": "project-alpha",
                        "enabled": True,
                        "frontendOpId": "op-1",
                    }
                ),
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert enabled_response["http"]["statusCode"] == 409
    assert _decode_http_body(enabled_response)["error"] == {
        "code": C.WATCH_CODE_BACKEND_ERROR_PROVIDER_REQUIRED,
        "message": "Watch Code mutations are handled by the active Setta Go host.",
    }

    ui_setting_response = backend._handle_runtime_request(
        {
            "kind": "ui_setting",
            "uiSetting": {
                "context": _runtime_context(),
                "operation": "read",
                "handlerId": C.WATCH_CODE_BACKEND_READ_HANDLER_BY_LOCAL_SETTING_ID[
                    C.WATCH_CODE_BACKEND_LOCAL_SETTING_FILES
                ],
                "projectConfigId": "project-alpha",
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert ui_setting_response["uiSetting"] == {
        "error": {
            "code": C.WATCH_CODE_BACKEND_ERROR_PROVIDER_REQUIRED,
            "message": "Watch Code mutations are handled by the active Setta Go host.",
        }
    }


def test_watch_code_backend_returns_structured_http_route_errors() -> None:
    backend = _load_backend()

    wrong_method_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "GET",
                "path": (
                    f"/plugins/{PLUGIN_ID}{C.WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/"
                    f"{C.WATCH_CODE_BACKEND_ROUTE_SUFFIX_ENABLED}"
                ),
                "bodyBase64": _body({}),
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert wrong_method_response["http"]["statusCode"] == 405
    assert _decode_http_body(wrong_method_response)["error"]["code"] == (
        C.WATCH_CODE_BACKEND_ERROR_METHOD_NOT_ALLOWED
    )

    missing_route_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "POST",
                "path": f"/plugins/{PLUGIN_ID}{C.WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/missing",
                "bodyBase64": _body({}),
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert missing_route_response["http"]["statusCode"] == 404
    assert _decode_http_body(missing_route_response)["error"]["code"] == (
        C.WATCH_CODE_BACKEND_ERROR_NOT_FOUND
    )
