import importlib.util
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


def _backend_module():
    spec = importlib.util.spec_from_file_location(
        "setta_basedpyright_backend_main", _backend_script()
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_probe_process(
    extra_env: dict[str, str], cwd: Path | None = None
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(extra_env)
    return subprocess.run(
        [sys.executable, str(_backend_script()), "--setta-plugin-backend-probe"],
        capture_output=True,
        text=True,
        check=False,
        env=env,
        cwd=cwd,
    )


def _run_probe(
    extra_env: dict[str, str], cwd: Path | None = None
) -> dict[str, object]:
    result = _run_probe_process(extra_env, cwd=cwd)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}".strip()
    return json.loads(result.stdout)


def test_split_language_server_args_preserves_windows_backslash_paths() -> None:
    backend = _backend_module()

    args = backend.split_language_server_args(
        r"--config C:\tmp\cfg.json", platform="nt"
    )

    assert args == ["--config", r"C:\tmp\cfg.json"]


def test_split_language_server_args_preserves_quoted_windows_paths() -> None:
    backend = _backend_module()

    args = backend.split_language_server_args(
        r'--config "C:\Program Files\cfg.json"', platform="nt"
    )

    assert args == ["--config", r"C:\Program Files\cfg.json"]


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


def test_basedpyright_plugin_backend_probe_defaults_to_running_interpreter(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "pythonpath"
    langserver_dir = package_root / "basedpyright"
    langserver_dir.mkdir(parents=True)
    (langserver_dir / "__init__.py").write_text("", encoding="utf-8")
    (langserver_dir / "langserver.py").write_text(
        "def main():\n    return None\n",
        encoding="utf-8",
    )

    existing_pythonpath = os.environ.get("PYTHONPATH", "").strip()
    pythonpath = str(package_root)
    if existing_pythonpath:
        pythonpath = os.pathsep.join([pythonpath, existing_pythonpath])

    payload = _run_probe({"PYTHONPATH": pythonpath})

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


def test_basedpyright_plugin_backend_probe_rejects_default_interpreter_without_basedpyright(
    tmp_path: Path,
) -> None:
    venv_root = tmp_path / "clean-venv"
    subprocess.run(
        [sys.executable, "-m", "venv", str(venv_root)],
        check=True,
        capture_output=True,
        text=True,
    )
    venv_python = (
        venv_root / "Scripts" / "python.exe"
        if sys.platform.startswith("win")
        else venv_root / "bin" / "python"
    )

    result = subprocess.run(
        [str(venv_python), str(_backend_script()), "--setta-plugin-backend-probe"],
        capture_output=True,
        text=True,
        check=False,
        env=os.environ.copy(),
    )

    assert result.returncode != 0
    assert "cannot import basedpyright.langserver" in result.stderr


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


def test_basedpyright_plugin_backend_probe_preserves_relative_command_escape_for_go_validation(
    tmp_path: Path,
) -> None:
    plugin_root = tmp_path / "plugin-root"
    outside_dir = tmp_path / "outside"
    plugin_root.mkdir()
    outside_dir.mkdir()
    escape_command = outside_dir / "basedpyright-langserver"
    escape_command.write_text("", encoding="utf-8")
    escape_command.chmod(0o755)

    payload = _run_probe(
        {"SETTA_LSP_COMMAND": "../outside/basedpyright-langserver"},
        cwd=plugin_root,
    )

    assert payload["languageServers"] == [
        {
            "name": "basedpyright",
            "language": "python",
            "command": "../outside/basedpyright-langserver",
            "args": [],
            "settingsKey": "basedpyright",
        }
    ]
