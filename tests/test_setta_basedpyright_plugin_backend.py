import json
import os
import subprocess
import sys
from pathlib import Path


def _backend_script() -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "plugins"
        / "setta-basedpyright"
        / "backend"
        / "main.py"
    )


def _run_probe_process(extra_env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(extra_env)
    return subprocess.run(
        [sys.executable, str(_backend_script()), "--setta-plugin-backend-probe"],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


def _run_probe(extra_env: dict[str, str]) -> dict[str, object]:
    result = _run_probe_process(extra_env)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}".strip()
    return json.loads(result.stdout)


def test_basedpyright_plugin_backend_probe_honors_explicit_command_override(
    tmp_path: Path,
) -> None:
    explicit_command = tmp_path / "basedpyright-langserver"
    explicit_command.write_text("", encoding="utf-8")
    explicit_command.chmod(0o755)

    payload = _run_probe(
        {
            "SETTA_LSP_COMMAND": str(explicit_command),
            "SETTA_LSP_ARGS": "--stdio --log-level debug",
        }
    )

    assert payload["schemaVersion"] == 1
    language_servers = payload["languageServers"]
    assert language_servers == [
        {
            "name": "basedpyright",
            "language": "python",
            "command": str(explicit_command.resolve()),
            "args": ["--stdio", "--log-level", "debug"],
            "settingsKey": "basedpyright",
        }
    ]


def test_basedpyright_plugin_backend_probe_defaults_to_running_interpreter() -> None:
    payload = _run_probe({})

    language_servers = payload["languageServers"]
    assert len(language_servers) == 1
    server = language_servers[0]
    assert server["command"] == sys.executable
    assert server["args"] == [
        "-c",
        "from basedpyright.langserver import main; main()",
        "--stdio",
    ]
    assert server["settingsKey"] == "basedpyright"


def test_basedpyright_plugin_backend_probe_rejects_missing_path_override(
    tmp_path: Path,
) -> None:
    for command in (
        str(tmp_path / "missing-basedpyright"),
        "./missing-basedpyright",
    ):
        result = _run_probe_process({"SETTA_LSP_COMMAND": command})
        assert result.returncode != 0
        assert "not found" in result.stderr
