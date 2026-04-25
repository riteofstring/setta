import json
from pathlib import Path

import pytest
from setta import __version__
from setta import local_core_client as shared_local_core
from setta import plugin_runtime
from setta.plugin_runtime import app_subsystem
from setta.plugin_runtime import watch_code
from setta.runtime_compat import RuntimeCompatibilityError
from setta.sdk_contracts.generated import SETTA_SDK_CONTRACT_VERSION
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
    LOCAL_CORE_COMMAND_WATCH_CODE_GET_PROJECT_DATA,
    LOCAL_CORE_COMMAND_WATCH_CODE_READ_SETTING,
    LOCAL_CORE_COMMAND_WATCH_CODE_SET_ENABLED,
    LOCAL_CORE_COMMAND_WATCH_CODE_SET_INPUTS,
    LOCAL_CORE_COMMAND_WATCH_CODE_WRITE_SETTING,
)


class _WritePipe:
    def __init__(self) -> None:
        self.contents = ""

    def write(self, data: str) -> int:
        self.contents += data
        return len(data)

    def flush(self) -> None:
        return None

    def close(self) -> None:
        return None


class _ReadPipe:
    def __init__(self, lines: list[str] | None = None, *, text: str = "") -> None:
        self._lines = list(lines or [])
        self._text = text

    def readline(self) -> str:
        if not self._lines:
            return ""
        return self._lines.pop(0)

    def read(self) -> str:
        text = self._text
        self._text = ""
        return text

    def close(self) -> None:
        return None


class _FakeProcess:
    def __init__(self, stdout_lines: list[str], *, stderr_text: str = "") -> None:
        self.stdin = _WritePipe()
        self.stdout = _ReadPipe(stdout_lines)
        self.stderr = _ReadPipe(text=stderr_text)
        self.returncode: int | None = None

    def poll(self) -> int | None:
        return self.returncode

    def terminate(self) -> None:
        self.returncode = 0

    def wait(self, timeout: float | None = None) -> int:
        del timeout
        if self.returncode is None:
            self.returncode = 0
        return self.returncode

    def kill(self) -> None:
        self.returncode = -9


def _handshake(
    *,
    sdk_version: str = __version__,
    sdk_contract_version: int = SETTA_SDK_CONTRACT_VERSION,
) -> str:
    return (
        json.dumps(
            {
                "protocolVersion": 1,
                "sdkVersion": sdk_version,
                "sdkContractVersion": sdk_contract_version,
                "coreVersion": "test-core",
            }
        )
        + "\n"
    )


def _result_envelope(
    *,
    ok: bool,
    result: object | None = None,
    error: str | None = None,
    details: dict[str, object] | None = None,
) -> str:
    return (
        json.dumps(
            {
                "callId": "test-call-id",
                "ok": ok,
                "result": result,
                "error": error,
                "details": details or {},
            }
        )
        + "\n"
    )


def test_run_local_core_command_dispatches_through_packaged_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_process = _FakeProcess(
        [
            _handshake(),
            _result_envelope(ok=True, result={"status": "ok"}),
        ]
    )
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        shared_local_core,
        "resolve_go_cli_command",
        lambda: (["/tmp/setta"], Path("/tmp/repo")),
    )
    monkeypatch.setattr(
        shared_local_core,
        "resolve_go_cli_env",
        lambda command_cwd: {"SETTA_SERVER_BIN": str(command_cwd / "setta-server")},
    )

    def _fake_popen(
        args: list[str],
        *,
        cwd: Path | None,
        env: dict[str, str],
        stdin: int,
        stdout: int,
        stderr: int,
        text: bool,
    ) -> _FakeProcess:
        captured["args"] = args
        captured["cwd"] = cwd
        captured["env"] = env
        captured["stdin"] = stdin
        captured["stdout"] = stdout
        captured["stderr"] = stderr
        captured["text"] = text
        return fake_process

    monkeypatch.setattr(shared_local_core.subprocess, "Popen", _fake_popen)

    result = shared_local_core.run_local_core_command_once(
        "validate_app_definition",
        {"pluginId": "setta-json-render-app-gen"},
    )

    assert result == {"status": "ok"}
    assert captured["args"] == ["/tmp/setta", "sdk-local-core"]
    assert captured["cwd"] == Path("/tmp/repo")
    assert captured["text"] is True
    assert captured["env"]["SETTA_SERVER_BIN"] == "/tmp/repo/setta-server"

    written_line = fake_process.stdin.contents.splitlines()[0]
    payload = json.loads(written_line)
    assert payload["commandName"] == "validate_app_definition"
    assert payload["payload"] == {"pluginId": "setta-json-render-app-gen"}
    assert isinstance(payload["callId"], str) and payload["callId"]


def test_local_core_client_keeps_source_only_typed_helpers_out_of_packaged_boundary() -> (
    None
):
    assert not hasattr(
        shared_local_core.LocalCoreClient,
        "render_realtime_dependency_values",
    )


def test_run_local_core_command_surfaces_structured_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_process = _FakeProcess(
        [
            _handshake(),
            _result_envelope(
                ok=False,
                error="validation failed",
                details={"code": "invalid_request", "field": "catalogId"},
            ),
        ]
    )

    monkeypatch.setattr(
        shared_local_core,
        "resolve_go_cli_command",
        lambda: (["/tmp/setta"], None),
    )
    monkeypatch.setattr(
        shared_local_core, "resolve_go_cli_env", lambda _command_cwd: {}
    )
    monkeypatch.setattr(
        shared_local_core.subprocess, "Popen", lambda *args, **kwargs: fake_process
    )

    with pytest.raises(shared_local_core.LocalCoreCommandError) as excinfo:
        shared_local_core.run_local_core_command_once("validate_app_definition", {})

    assert str(excinfo.value) == "validation failed"
    assert excinfo.value.code == "invalid_request"
    assert excinfo.value.details == {"code": "invalid_request", "field": "catalogId"}


def test_run_local_core_command_rejects_sdk_version_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_process = _FakeProcess([_handshake(sdk_version="9.9.9")])

    monkeypatch.setattr(
        shared_local_core,
        "resolve_go_cli_command",
        lambda: (["/tmp/setta"], None),
    )
    monkeypatch.setattr(
        shared_local_core, "resolve_go_cli_env", lambda _command_cwd: {}
    )
    monkeypatch.setattr(
        shared_local_core.subprocess, "Popen", lambda *args, **kwargs: fake_process
    )

    with pytest.raises(
        RuntimeCompatibilityError, match="SDK/local core version mismatch"
    ):
        shared_local_core.run_local_core_command_once("validate_app_definition", {})

    assert fake_process.stdin.contents == ""


def test_run_local_core_command_rejects_sdk_contract_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_process = _FakeProcess(
        [_handshake(sdk_contract_version=SETTA_SDK_CONTRACT_VERSION + 1)]
    )

    monkeypatch.setattr(
        shared_local_core,
        "resolve_go_cli_command",
        lambda: (["/tmp/setta"], None),
    )
    monkeypatch.setattr(
        shared_local_core, "resolve_go_cli_env", lambda _command_cwd: {}
    )
    monkeypatch.setattr(
        shared_local_core.subprocess, "Popen", lambda *args, **kwargs: fake_process
    )

    with pytest.raises(RuntimeCompatibilityError, match="local core contract mismatch"):
        shared_local_core.run_local_core_command_once("validate_app_definition", {})

    assert fake_process.stdin.contents == ""


def test_app_subsystem_endpoint_mapping_uses_go_owned_constants() -> None:
    expected_commands = {
        "appsubsystem_get_app_definition": LOCAL_CORE_COMMAND_GET_APP_DEFINITION,
        "appsubsystem_get_effective_app_definition": LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_DEFINITION,
        "appsubsystem_get_effective_app_spec_path": LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_SPEC_PATH,
        "appsubsystem_get_effective_app_theme_mode": LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_THEME_MODE,
        "appsubsystem_validate_app_definition": LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION,
        "appsubsystem_set_app_definition": LOCAL_CORE_COMMAND_SET_APP_DEFINITION,
        "appsubsystem_stream_app_definition": LOCAL_CORE_COMMAND_STREAM_APP_DEFINITION,
        "appsubsystem_update_app_definition": LOCAL_CORE_COMMAND_UPDATE_APP_DEFINITION,
        "appsubsystem_compare_and_set_catalog_id": LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_CATALOG_ID,
        "appsubsystem_compare_and_set_spec_version": LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_VERSION,
        "appsubsystem_compare_and_set_spec_path": LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_PATH,
        "appsubsystem_compare_and_set_theme_mode": LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_THEME_MODE,
    }

    assert tuple(expected_commands) == app_subsystem.listener_endpoint_names()
    for endpoint_name, command_name in expected_commands.items():
        assert (
            app_subsystem.local_core_command_for_listener_endpoint(endpoint_name)
            == command_name
        )
    with pytest.raises(KeyError):
        app_subsystem.local_core_command_for_listener_endpoint("missing_endpoint")


def test_watch_code_runtime_helper_uses_go_owned_local_core_commands(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[tuple[str, dict[str, object]]] = []

    def _fake_run(command_name: str, payload: dict[str, object]) -> object:
        captured.append((command_name, payload))
        return {"command": command_name, "payload": payload}

    monkeypatch.setattr(watch_code, "run_local_core_command_once", _fake_run)

    assert watch_code.setting_id_for_read_handler(" read_enabled ") == "enabled"
    assert watch_code.setting_id_for_write_handler("write_files") == "files"
    with pytest.raises(KeyError):
        watch_code.setting_id_for_read_handler("missing")

    assert watch_code.get_project_data(
        setta_files_root="/tmp/setta_files",
        plugin_id="setta-fixture-watch-code",
        project_config_id="project-alpha",
    ) == {
        "command": LOCAL_CORE_COMMAND_WATCH_CODE_GET_PROJECT_DATA,
        "payload": {
            "settaFilesRoot": "/tmp/setta_files",
            "pluginId": "setta-fixture-watch-code",
            "projectConfigId": "project-alpha",
        },
    }
    assert watch_code.set_enabled(
        setta_files_root="/tmp/setta_files",
        workspace_root="/tmp/workspace",
        plugin_id="setta-fixture-watch-code",
        project_config_id="project-alpha",
        enabled=True,
        frontend_op_id="op-1",
    )["command"] == LOCAL_CORE_COMMAND_WATCH_CODE_SET_ENABLED
    assert watch_code.set_inputs(
        setta_files_root="/tmp/setta_files",
        workspace_root="/tmp/workspace",
        plugin_id="setta-fixture-watch-code",
        project_config_id="project-alpha",
        watch_code_folders=[{"path": "pkg", "recursive": True}],
        watch_code_files=["pkg/file.py"],
    )["command"] == LOCAL_CORE_COMMAND_WATCH_CODE_SET_INPUTS
    assert watch_code.read_setting(
        setta_files_root="/tmp/setta_files",
        plugin_id="setta-fixture-watch-code",
        project_config_id="project-alpha",
        setting_id="files",
    )["command"] == LOCAL_CORE_COMMAND_WATCH_CODE_READ_SETTING
    assert watch_code.write_setting(
        setta_files_root="/tmp/setta_files",
        workspace_root="/tmp/workspace",
        plugin_id="setta-fixture-watch-code",
        project_config_id="project-alpha",
        setting_id="files",
        value=["pkg/file.py"],
    )["command"] == LOCAL_CORE_COMMAND_WATCH_CODE_WRITE_SETTING

    set_inputs_payload = captured[2][1]
    assert set_inputs_payload == {
        "settaFilesRoot": "/tmp/setta_files",
        "workspaceRoot": "/tmp/workspace",
        "pluginId": "setta-fixture-watch-code",
        "projectConfigId": "project-alpha",
        "watchCodeFolders": [{"path": "pkg", "recursive": True}],
        "watchCodeFiles": ["pkg/file.py"],
    }


def test_watch_code_runtime_helper_exports_from_package_root() -> None:
    assert plugin_runtime.WATCH_CODE_SETTING_ENABLED == "enabled"
    assert plugin_runtime.watch_code_set_enabled is watch_code.set_enabled
    assert (
        plugin_runtime.watch_code_setting_id_for_write_handler("write_folders")
        == "folders"
    )
