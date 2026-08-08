import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace

from setta import entrypoint


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _select_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _wait_for_port(host: str, port: int, process: subprocess.Popen[str]) -> None:
    deadline = time.monotonic() + 45.0
    while time.monotonic() < deadline:
        if process.poll() is not None:
            output = ""
            if process.stdout is not None:
                output = process.stdout.read()
            raise AssertionError(
                f"setta process exited before port became ready:\n{output}"
            )
        try:
            with socket.create_connection((host, port), timeout=0.2):
                return
        except OSError:
            time.sleep(0.1)
    raise AssertionError(f"timed out waiting for {host}:{port} to accept connections")


def _write_go_stub(*, path: Path, args_capture_path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{args_capture_path}"
printf 'setta version from go\\n'
""",
        encoding="utf-8",
    )
    path.chmod(0o755)
    return path


def test_python_module_entrypoint_resolves_source_checkout_root() -> None:
    assert (
        entrypoint.resolve_source_checkout_root(_repo_root() / "backend" / "setta")
        == _repo_root()
    )


def test_python_module_entrypoint_prefers_source_checkout_command() -> None:
    command, command_cwd = entrypoint.resolve_go_cli_command()

    assert command[0] == str(_repo_root() / "scripts" / "go.sh")
    assert command[1:] == ["run", "./cmd/setta"]
    assert command_cwd == _repo_root()


def test_python_module_entrypoint_sets_source_checkout_server_wrapper(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_run(
        args: list[str],
        *,
        check: bool,
        cwd: Path | None,
        env: dict[str, str],
    ) -> SimpleNamespace:
        captured["args"] = list(args)
        captured["check"] = check
        captured["cwd"] = cwd
        captured["env"] = dict(env)
        return SimpleNamespace(returncode=0)

    monkeypatch.delenv("SETTA_GO_CLI_BIN", raising=False)
    monkeypatch.delenv("SETTA_SERVER_BIN", raising=False)
    monkeypatch.setattr(entrypoint.subprocess, "run", fake_run)

    exit_code = entrypoint.run_go_dispatch(["--no-open"])

    assert exit_code == 0
    assert captured["args"] == [
        str(_repo_root() / "scripts" / "go.sh"),
        "run",
        "./cmd/setta",
        "--no-open",
    ]
    assert captured["check"] is False
    assert captured["cwd"] == _repo_root()
    env = captured["env"]
    assert isinstance(env, dict)
    assert env["SETTA_SERVER_BIN"] == str(
        _repo_root() / "scripts" / "run_setta_server.sh"
    )


def test_python_module_entrypoint_preserves_explicit_server_override(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}
    explicit_server = "/tmp/custom-setta-server"

    def fake_run(
        args: list[str],
        *,
        check: bool,
        cwd: Path | None,
        env: dict[str, str],
    ) -> SimpleNamespace:
        captured["args"] = list(args)
        captured["check"] = check
        captured["cwd"] = cwd
        captured["env"] = dict(env)
        return SimpleNamespace(returncode=0)

    monkeypatch.delenv("SETTA_GO_CLI_BIN", raising=False)
    monkeypatch.setenv("SETTA_SERVER_BIN", explicit_server)
    monkeypatch.setattr(entrypoint.subprocess, "run", fake_run)

    exit_code = entrypoint.run_go_dispatch(["launch", "--json"])

    assert exit_code == 0
    assert captured["args"] == [
        str(_repo_root() / "scripts" / "go.sh"),
        "run",
        "./cmd/setta",
        "launch",
        "--json",
    ]
    assert captured["check"] is False
    assert captured["cwd"] == _repo_root()
    env = captured["env"]
    assert isinstance(env, dict)
    assert env["SETTA_SERVER_BIN"] == explicit_server


def test_python_module_entrypoint_exits_cleanly_on_keyboard_interrupt(
    monkeypatch,
) -> None:
    def fake_run(
        args: list[str],
        *,
        check: bool,
        cwd: Path | None,
        env: dict[str, str],
    ) -> SimpleNamespace:
        assert args
        assert check is False
        assert cwd == _repo_root()
        assert isinstance(env, dict)
        raise KeyboardInterrupt()

    monkeypatch.delenv("SETTA_GO_CLI_BIN", raising=False)
    monkeypatch.setattr(entrypoint.subprocess, "run", fake_run)

    exit_code = entrypoint.run_go_dispatch(["--no-open"])

    assert exit_code == 0


def test_python_module_entrypoint_dispatches_go_owned_version_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "version"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert args_capture_path.read_text(encoding="utf-8").strip() == "version"


def test_python_module_entrypoint_dispatches_go_owned_launch_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "launch", "--json"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert args_capture_path.read_text(encoding="utf-8").strip() == "launch --json"


def test_python_module_entrypoint_dispatches_go_owned_share_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "setta",
            "share",
            "--deployment-name",
            "demo-share",
            "--latest",
        ],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "share --deployment-name demo-share --latest"
    )


def test_python_module_entrypoint_dispatches_go_owned_backups_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "backups", "list", "--json"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip() == "backups list --json"
    )


def test_python_module_entrypoint_dispatches_go_owned_export_db_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "export-db", "--readable"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip() == "export-db --readable"
    )


def test_python_module_entrypoint_dispatches_go_owned_plugins_status_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "plugins", "restart-required", "--json"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "plugins restart-required --json"
    )


def test_python_module_entrypoint_dispatches_go_owned_plugins_lifecycle_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "plugins", "disable", "setta-fixture-frontend"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "plugins disable setta-fixture-frontend"
    )


def test_python_module_entrypoint_dispatches_go_owned_plugins_authoring_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "plugins", "validate", "./plugin-root"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "plugins validate ./plugin-root"
    )


def test_python_module_entrypoint_dispatches_go_owned_plugins_lock_write_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "plugins", "lock", "write", "--json"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "plugins lock write --json"
    )


def test_python_module_entrypoint_dispatches_go_owned_plugins_install_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "plugins", "install", "github:acme/demo#v1"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "plugins install github:acme/demo#v1"
    )


def test_python_module_entrypoint_dispatches_go_owned_plugins_lock_apply_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "plugins", "lock", "apply", "--check"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "plugins lock apply --check"
    )


def test_python_module_entrypoint_dispatches_go_owned_plugins_restart_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "plugins", "restart", "--json"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "plugins restart --json"
    )


def test_python_module_entrypoint_dispatches_go_owned_app_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "setta",
            "app",
            "--deployment-name",
            "demo-app",
            "--latest",
        ],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "app --deployment-name demo-app --latest"
    )


def test_python_module_entrypoint_dispatches_root_help_to_go(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "--help"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert args_capture_path.read_text(encoding="utf-8").strip() == "--help"


def test_python_module_entrypoint_dispatches_plugins_help_navigation_to_go(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "plugins", "--help"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert args_capture_path.read_text(encoding="utf-8").strip() == "plugins --help"


def test_python_module_entrypoint_dispatches_invalid_root_argv_to_go(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "unknown-command"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert args_capture_path.read_text(encoding="utf-8").strip() == "unknown-command"


def test_python_module_entrypoint_dispatches_go_owned_default_start_command(
    tmp_path: Path,
) -> None:
    args_capture_path = tmp_path / "go-args.txt"
    go_stub = _write_go_stub(
        path=tmp_path / "bin" / "setta-go",
        args_capture_path=args_capture_path,
    )

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    result = subprocess.run(
        [sys.executable, "-m", "setta", "--no-open", "--host", "0.0.0.0"],
        cwd=_repo_root(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (result.stderr or result.stdout).strip()
    assert "setta version from go" in result.stdout
    assert (
        args_capture_path.read_text(encoding="utf-8").strip()
        == "--no-open --host 0.0.0.0"
    )


def test_python_module_entrypoint_source_checkout_start_registers_visible_session(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    port = _select_free_port()

    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "setta",
            "--workspace",
            str(workspace),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--no-open",
        ],
        cwd=_repo_root(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait_for_port("127.0.0.1", port, process)

        auth_result = subprocess.run(
            [
                sys.executable,
                "-m",
                "setta",
                "--workspace",
                str(workspace),
                "auth",
                "--latest",
            ],
            cwd=_repo_root(),
            capture_output=True,
            text=True,
            check=False,
        )

        assert auth_result.returncode == 0, (
            f"{auth_result.stdout}\n{auth_result.stderr}"
        ).strip()
        assert f"Base URL: http://127.0.0.1:{port}" in auth_result.stdout

        status_result = subprocess.run(
            [
                sys.executable,
                "-m",
                "setta",
                "--workspace",
                str(workspace),
                "status",
                "--connect-info",
                "--latest",
            ],
            cwd=_repo_root(),
            capture_output=True,
            text=True,
            check=False,
        )

        assert status_result.returncode == 0, (
            f"{status_result.stdout}\n{status_result.stderr}"
        ).strip()
        assert f"http://127.0.0.1:{port}/__setta__/bootstrap" in status_result.stdout
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)
