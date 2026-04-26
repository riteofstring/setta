from __future__ import annotations

import base64
import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
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
        "runtimeRoot": "/tmp/runtime",
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


def test_watch_code_backend_runtime_executes_inputs_through_plugin_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend = _load_backend()
    captured: dict[str, Any] = {}

    def _set_inputs(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {
            "folders": kwargs["folders"],
            "files": kwargs["files"],
            "registry": {},
            "baselineByPath": {},
        }

    monkeypatch.setattr(backend.watch_code, "set_inputs", _set_inputs)

    inputs_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "POST",
                "path": (
                    f"/plugins/{PLUGIN_ID}{C.WATCH_CODE_BACKEND_ROUTE_BASE_PATH}/"
                    f"{C.WATCH_CODE_BACKEND_ROUTE_SUFFIXES[0]}"
                ),
                "bodyBase64": _body(
                    {
                        "projectConfigId": "project-alpha",
                        "folders": [],
                        "files": ["pkg/watch.py"],
                        "frontendOpId": "op-1",
                    }
                ),
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert inputs_response["http"]["statusCode"] == 200
    assert _decode_http_body(inputs_response) == {
        "projectData": {
            "folders": [],
            "files": ["pkg/watch.py"],
            "registry": {},
            "baselineByPath": {},
        }
    }
    assert captured == {
        "setta_files_root": "/tmp/setta_files",
        "workspace_root": "/tmp/workspace",
        "runtime_root": "/tmp/runtime",
        "plugin_id": PLUGIN_ID,
        "project_config_id": "project-alpha",
        "folders": [],
        "files": ["pkg/watch.py"],
        "frontend_op_id": "op-1",
    }


def test_watch_code_backend_runtime_executes_ui_settings_through_plugin_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend = _load_backend()
    captured: dict[str, Any] = {}

    def _get_project_data(**kwargs: Any) -> dict[str, Any]:
        captured["read"] = kwargs
        return {
            "folders": [{"path": "pkg", "recursive": True}],
            "files": ["pkg/watch.py"],
        }

    def _set_files(**kwargs: Any) -> dict[str, Any]:
        captured["write"] = kwargs
        return {
            "folders": [{"path": "pkg", "recursive": True}],
            "files": kwargs["files"],
        }

    monkeypatch.setattr(backend.watch_code, "get_project_data", _get_project_data)
    monkeypatch.setattr(backend.watch_code, "set_files", _set_files)
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
    assert ui_setting_response["uiSetting"] == {"value": ["pkg/watch.py"]}
    assert captured["read"] == {
        "setta_files_root": "/tmp/setta_files",
        "runtime_root": "/tmp/runtime",
        "plugin_id": PLUGIN_ID,
        "project_config_id": "project-alpha",
    }

    write_response = backend._handle_runtime_request(
        {
            "kind": "ui_setting",
            "uiSetting": {
                "context": _runtime_context(),
                "operation": "write",
                "handlerId": C.WATCH_CODE_BACKEND_WRITE_HANDLER_BY_LOCAL_SETTING_ID[
                    C.WATCH_CODE_BACKEND_LOCAL_SETTING_FILES
                ],
                "projectConfigId": "project-alpha",
                "value": ["pkg/updated.py"],
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert write_response["uiSetting"] == {"value": ["pkg/updated.py"]}
    assert captured["write"] == {
        "setta_files_root": "/tmp/setta_files",
        "workspace_root": "/tmp/workspace",
        "runtime_root": "/tmp/runtime",
        "plugin_id": PLUGIN_ID,
        "project_config_id": "project-alpha",
        "files": ["pkg/updated.py"],
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
                    f"{C.WATCH_CODE_BACKEND_ROUTE_SUFFIXES[0]}"
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
