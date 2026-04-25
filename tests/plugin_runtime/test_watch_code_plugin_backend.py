from __future__ import annotations

import base64
import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any


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
        "contractVersion": 1,
        "dataSchemaVersion": 1,
        "languages": ["python"],
        "requiresLanguageServer": True,
    }
    assert payload["routes"] == [
        {"path": f"/plugins/{PLUGIN_ID}/watch-code/enabled", "methods": ["POST"]},
        {"path": f"/plugins/{PLUGIN_ID}/watch-code/inputs", "methods": ["POST"]},
    ]
    assert {setting["id"] for setting in payload["uiSettings"]} == {
        "enabled",
        "folders",
        "files",
    }


def test_watch_code_backend_runtime_fails_closed_without_go_host() -> None:
    backend = _load_backend()

    enabled_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "POST",
                "path": f"/plugins/{PLUGIN_ID}/watch-code/enabled",
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
        "code": "watch_code_provider_required",
        "message": "Watch Code mutations are handled by the active Setta Go host.",
    }

    ui_setting_response = backend._handle_runtime_request(
        {
            "kind": "ui_setting",
            "uiSetting": {
                "context": _runtime_context(),
                "operation": "read",
                "handlerId": "read_files",
                "projectConfigId": "project-alpha",
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert ui_setting_response["uiSetting"] == {
        "error": {
            "code": "watch_code_provider_required",
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
                "path": f"/plugins/{PLUGIN_ID}/watch-code/enabled",
                "bodyBase64": _body({}),
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert wrong_method_response["http"]["statusCode"] == 405
    assert _decode_http_body(wrong_method_response)["error"]["code"] == (
        "method_not_allowed"
    )

    missing_route_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "POST",
                "path": f"/plugins/{PLUGIN_ID}/watch-code/missing",
                "bodyBase64": _body({}),
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert missing_route_response["http"]["statusCode"] == 404
    assert _decode_http_body(missing_route_response)["error"]["code"] == "not_found"
