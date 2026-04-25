import json
from pathlib import Path

import pytest

from setta import __version__
from setta import local_core_client as shared_local_core
from setta.api.runtime_compat import RuntimeCompatibilityError
from setta.plugin_runtime import app_subsystem, local_core
from setta.sdk_contracts.generated import SETTA_SDK_CONTRACT_VERSION
from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION,
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


def _result_envelope(*, ok: bool, result: object | None = None, error: str | None = None, details: dict[str, object] | None = None) -> str:
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

    result = local_core.run_local_core_command(
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
    monkeypatch.setattr(shared_local_core, "resolve_go_cli_env", lambda _command_cwd: {})
    monkeypatch.setattr(shared_local_core.subprocess, "Popen", lambda *args, **kwargs: fake_process)

    with pytest.raises(local_core.LocalCoreCommandError) as excinfo:
        local_core.run_local_core_command("validate_app_definition", {})

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
    monkeypatch.setattr(shared_local_core, "resolve_go_cli_env", lambda _command_cwd: {})
    monkeypatch.setattr(shared_local_core.subprocess, "Popen", lambda *args, **kwargs: fake_process)

    with pytest.raises(RuntimeCompatibilityError, match="SDK/local core version mismatch"):
        local_core.run_local_core_command("validate_app_definition", {})

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
    monkeypatch.setattr(shared_local_core, "resolve_go_cli_env", lambda _command_cwd: {})
    monkeypatch.setattr(shared_local_core.subprocess, "Popen", lambda *args, **kwargs: fake_process)

    with pytest.raises(RuntimeCompatibilityError, match="local core contract mismatch"):
        local_core.run_local_core_command("validate_app_definition", {})

    assert fake_process.stdin.contents == ""


def test_app_subsystem_endpoint_mapping_uses_go_owned_constants() -> None:
    assert "appsubsystem_validate_app_definition" in app_subsystem.listener_endpoint_names()
    assert (
        app_subsystem.local_core_command_for_listener_endpoint(
            "appsubsystem_validate_app_definition"
        )
        == LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION
    )
    with pytest.raises(KeyError):
        app_subsystem.local_core_command_for_listener_endpoint("missing_endpoint")
