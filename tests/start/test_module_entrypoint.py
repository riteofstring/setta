import os
import subprocess
import sys
from pathlib import Path

from setta.entrypoint import resolve_go_dispatch_command


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


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


def test_resolve_go_dispatch_command_uses_first_non_global_token() -> None:
    # Global runtime flags should not stop dispatch to the Go-owned command set.
    command = resolve_go_dispatch_command(
        [
            "--profile-lookup-home",
            "/tmp/.setta-profiles",
            "--setta-home",
            "/tmp/.setta",
            "--workspace",
            "/tmp/workspace",
            "status",
        ]
    )

    assert command == "status"


def test_resolve_go_dispatch_command_routes_share_to_go() -> None:
    # Share is now owned by the shipped Go CLI runtime boundary.
    command = resolve_go_dispatch_command(["share"])

    assert command == "share"


def test_resolve_go_dispatch_command_routes_backups_to_go() -> None:
    # Backups is now owned by the shipped Go CLI maintenance-command boundary.
    command = resolve_go_dispatch_command(["backups", "list"])

    assert command == "backups"


def test_resolve_go_dispatch_command_routes_export_db_to_go() -> None:
    # Export-db is now owned by the shipped Go CLI readable-export boundary.
    command = resolve_go_dispatch_command(["export-db", "--readable"])

    assert command == "export-db"


def test_resolve_go_dispatch_command_routes_completed_plugins_status_subcommands_to_go() -> None:
    # The first bounded plugins slice only routes the completed status subcommands to Go.
    command = resolve_go_dispatch_command(["plugins", "list", "--json"])

    assert command == "plugins"


def test_resolve_go_dispatch_command_routes_completed_plugins_lifecycle_subcommands_to_go() -> None:
    # The lifecycle-controls slice now routes enable/disable/uninstall/rollback to Go as well.
    command = resolve_go_dispatch_command(["plugins", "uninstall", "setta-fixture-frontend"])

    assert command == "plugins"


def test_resolve_go_dispatch_command_routes_completed_plugins_authoring_subcommands_to_go() -> None:
    # The Stage 5 authoring slice now routes init/validate/link to Go as well.
    command = resolve_go_dispatch_command(["plugins", "link", "./local-plugin", "--json"])

    assert command == "plugins"


def test_resolve_go_dispatch_command_routes_completed_plugins_lock_write_to_go() -> None:
    # The Stage 6 lockfile-write slice now routes plugins lock write to Go.
    command = resolve_go_dispatch_command(["plugins", "lock", "write", "--json"])

    assert command == "plugins"


def test_resolve_go_dispatch_command_keeps_unported_plugins_subcommands_on_python() -> None:
    # Source-acquisition and restart work still stay on the Python CLI path for now.
    command = resolve_go_dispatch_command(["plugins", "install", "github:owner/repo#v1"])

    assert command is None


def test_resolve_go_dispatch_command_keeps_plugins_lock_apply_on_python() -> None:
    # Lock apply remains on Python until the candidate-provider-backed convergence slice lands.
    command = resolve_go_dispatch_command(["plugins", "lock", "apply", "--check"])

    assert command is None


def test_resolve_go_dispatch_command_routes_app_to_go() -> None:
    # App is now owned by the shipped Go CLI runtime boundary.
    command = resolve_go_dispatch_command(["app"])

    assert command == "app"


def test_resolve_go_dispatch_command_routes_root_start_without_subcommand() -> None:
    # The default local start path is now Go-owned even when no subcommand token appears.
    command = resolve_go_dispatch_command(
        ["--workspace", "/tmp/workspace", "--host", "0.0.0.0", "--no-open"]
    )

    assert command == ""


def test_resolve_go_dispatch_command_routes_empty_argv_to_go_root() -> None:
    # A bare `setta` invocation is now the Go-owned default local start path.
    command = resolve_go_dispatch_command([])

    assert command == ""


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
    assert args_capture_path.read_text(encoding="utf-8").strip() == "backups list --json"


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
    assert args_capture_path.read_text(encoding="utf-8").strip() == "export-db --readable"


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
