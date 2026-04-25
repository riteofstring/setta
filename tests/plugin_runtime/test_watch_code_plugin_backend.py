from __future__ import annotations

import base64
import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest


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


def test_watch_code_backend_http_routes_call_local_core_helpers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend = _load_backend()
    calls: list[tuple[str, dict[str, Any]]] = []

    def _set_enabled(**kwargs: Any) -> dict[str, Any]:
        calls.append(("set_enabled", kwargs))
        return {"enabled": kwargs["enabled"]}

    def _set_inputs(**kwargs: Any) -> dict[str, Any]:
        calls.append(("set_inputs", kwargs))
        return {
            "folders": kwargs["watch_code_folders"],
            "files": kwargs["watch_code_files"],
        }

    monkeypatch.setattr(backend.watch_code, "set_enabled", _set_enabled)
    monkeypatch.setattr(backend.watch_code, "set_inputs", _set_inputs)

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
    assert enabled_response["http"]["statusCode"] == 200
    assert _decode_http_body(enabled_response)["projectData"] == {"enabled": True}

    inputs_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "POST",
                "path": f"/plugins/{PLUGIN_ID}/watch-code/inputs",
                "bodyBase64": _body(
                    {
                        "projectConfigId": "project-alpha",
                        "watchCodeFolders": [{"path": "pkg", "recursive": True}],
                        "watchCodeFiles": ["pkg/main.py"],
                    }
                ),
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert inputs_response["http"]["statusCode"] == 200
    assert _decode_http_body(inputs_response)["projectData"] == {
        "folders": [{"path": "pkg", "recursive": True}],
        "files": ["pkg/main.py"],
    }

    assert calls == [
        (
            "set_enabled",
            {
                "setta_files_root": "/tmp/setta_files",
                "workspace_root": "/tmp/workspace",
                "plugin_id": PLUGIN_ID,
                "project_config_id": "project-alpha",
                "enabled": True,
                "frontend_op_id": "op-1",
            },
        ),
        (
            "set_inputs",
            {
                "setta_files_root": "/tmp/setta_files",
                "workspace_root": "/tmp/workspace",
                "plugin_id": PLUGIN_ID,
                "project_config_id": "project-alpha",
                "watch_code_folders": [{"path": "pkg", "recursive": True}],
                "watch_code_files": ["pkg/main.py"],
                "frontend_op_id": None,
            },
        ),
    ]


def test_watch_code_backend_ui_settings_call_local_core_helpers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend = _load_backend()
    calls: list[tuple[str, dict[str, Any]]] = []

    def _read_setting(**kwargs: Any) -> Any:
        calls.append(("read_setting", kwargs))
        return ["pkg/main.py"]

    def _write_setting(**kwargs: Any) -> Any:
        calls.append(("write_setting", kwargs))
        return {"files": kwargs["value"]}

    monkeypatch.setattr(backend.watch_code, "read_setting", _read_setting)
    monkeypatch.setattr(backend.watch_code, "write_setting", _write_setting)

    read_response = backend._handle_runtime_request(
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
    assert read_response["uiSetting"] == {"value": ["pkg/main.py"]}

    write_response = backend._handle_runtime_request(
        {
            "kind": "ui_setting",
            "uiSetting": {
                "context": _runtime_context(),
                "operation": "write",
                "handlerId": "write_files",
                "projectConfigId": "project-alpha",
                "value": ["pkg/main.py"],
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert write_response["uiSetting"] == {"value": {"files": ["pkg/main.py"]}}

    assert calls == [
        (
            "read_setting",
            {
                "setta_files_root": "/tmp/setta_files",
                "plugin_id": PLUGIN_ID,
                "project_config_id": "project-alpha",
                "setting_id": "files",
            },
        ),
        (
            "write_setting",
            {
                "setta_files_root": "/tmp/setta_files",
                "workspace_root": "/tmp/workspace",
                "plugin_id": PLUGIN_ID,
                "project_config_id": "project-alpha",
                "setting_id": "files",
                "value": ["pkg/main.py"],
                "frontend_op_id": None,
            },
        ),
    ]


def test_watch_code_backend_returns_structured_http_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend = _load_backend()

    invalid_json_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "POST",
                "path": f"/plugins/{PLUGIN_ID}/watch-code/enabled",
                "bodyBase64": base64.b64encode(b"{bad-json").decode("ascii"),
            },
        },
        plugin_id=PLUGIN_ID,
    )
    assert invalid_json_response["http"]["statusCode"] == 400
    assert _decode_http_body(invalid_json_response)["error"]["code"] == "invalid_json"

    def _set_enabled(**_: Any) -> Any:
        raise backend.LocalCoreCommandError(
            "Project config not found.",
            code="project_config_not_found",
            details={"projectConfigId": "missing"},
        )

    monkeypatch.setattr(backend.watch_code, "set_enabled", _set_enabled)
    missing_project_response = backend._handle_runtime_request(
        {
            "kind": "http",
            "http": {
                "context": _runtime_context(),
                "method": "POST",
                "path": f"/plugins/{PLUGIN_ID}/watch-code/enabled",
                "bodyBase64": _body(
                    {"projectConfigId": "missing", "enabled": True}
                ),
            },
        },
        plugin_id=PLUGIN_ID,
    )

    assert missing_project_response["http"]["statusCode"] == 404
    error = _decode_http_body(missing_project_response)["error"]
    assert error == {
        "code": "project_config_not_found",
        "message": "Project config not found.",
        "details": {"projectConfigId": "missing"},
    }


def test_watch_code_backend_returns_structured_ui_setting_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend = _load_backend()

    def _write_setting(**_: Any) -> Any:
        raise backend.LocalCoreCommandError(
            "Invalid watch path.",
            code="invalid_watch_code_input",
        )

    monkeypatch.setattr(backend.watch_code, "write_setting", _write_setting)

    response = backend._handle_runtime_request(
        {
            "kind": "ui_setting",
            "uiSetting": {
                "context": _runtime_context(),
                "operation": "write",
                "handlerId": "write_files",
                "projectConfigId": "project-alpha",
                "value": ["../outside.py"],
            },
        },
        plugin_id=PLUGIN_ID,
    )

    assert response == {
        "schemaVersion": 1,
        "uiSetting": {
            "error": {
                "code": "invalid_watch_code_input",
                "message": "Invalid watch path.",
            }
        },
    }
