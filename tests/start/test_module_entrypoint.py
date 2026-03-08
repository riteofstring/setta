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


def test_resolve_go_dispatch_command_leaves_python_owned_commands_local() -> None:
    # Python-owned commands must stay on the Python side of the explicit wrapper.
    command = resolve_go_dispatch_command(["share"])

    assert command is None


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
