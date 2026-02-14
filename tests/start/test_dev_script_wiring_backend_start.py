import os
from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    ensure_dev_dependencies_or_skip,
    repo_root,
    run_script,
    write_stub_executable,
)


def test_backend_start_forwards_profile_and_explicit_root(tmp_path: Path) -> None:
    ensure_dev_dependencies_or_skip()
    root = repo_root()
    capture_args = tmp_path / "setta_args.txt"
    setta_stub = tmp_path / "setta-stub.sh"

    write_stub_executable(
        setta_stub,
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_args}"
""",
    )

    env = os.environ.copy()
    env["SETTA_BIN"] = str(setta_stub)
    env["SETTA_BACKEND_LOG_FILE"] = str(tmp_path / "backend.log")
    env["SETTA_PROFILE"] = "dev"
    env["SETTA_FILES_ROOT"] = str(tmp_path / "state_root")
    # When both are provided through env, backendStart should pass only explicit root.
    env["SETTA_FILES_LOCATION"] = "global"

    result = run_script(
        ["bash", str(root / "frontend" / "backendStart.sh"), "--no-open"],
        cwd=root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    args = capture_args.read_text(encoding="utf-8")
    assert "--profile dev" in args
    assert f"--setta-files-root {tmp_path / 'state_root'}" in args
    assert "--setta-files-location global" not in args
    assert "--log-level debug" in args


def test_backend_start_cli_location_overrides_env_root(tmp_path: Path) -> None:
    ensure_dev_dependencies_or_skip()
    root = repo_root()
    capture_args = tmp_path / "setta_args.txt"
    setta_stub = tmp_path / "setta-stub.sh"

    write_stub_executable(
        setta_stub,
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_args}"
""",
    )

    env = os.environ.copy()
    env["SETTA_BIN"] = str(setta_stub)
    env["SETTA_BACKEND_LOG_FILE"] = str(tmp_path / "backend.log")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "env_state_root")

    result = run_script(
        [
            "bash",
            str(root / "frontend" / "backendStart.sh"),
            "--setta-files-location",
            "local",
        ],
        cwd=root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    args = capture_args.read_text(encoding="utf-8")
    assert "--setta-files-location local" in args
    assert f"--setta-files-root {tmp_path / 'env_state_root'}" not in args


def test_backend_start_cli_root_overrides_env_location(tmp_path: Path) -> None:
    ensure_dev_dependencies_or_skip()
    root = repo_root()
    capture_args = tmp_path / "setta_args.txt"
    setta_stub = tmp_path / "setta-stub.sh"

    write_stub_executable(
        setta_stub,
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_args}"
""",
    )

    env = os.environ.copy()
    env["SETTA_BIN"] = str(setta_stub)
    env["SETTA_BACKEND_LOG_FILE"] = str(tmp_path / "backend.log")
    env["SETTA_FILES_LOCATION"] = "global"
    cli_root = tmp_path / "cli_state_root"

    result = run_script(
        [
            "bash",
            str(root / "frontend" / "backendStart.sh"),
            "--setta-files-root",
            str(cli_root),
        ],
        cwd=root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    args = capture_args.read_text(encoding="utf-8")
    assert f"--setta-files-root {cli_root}" in args
    assert "--setta-files-location global" not in args


def test_backend_start_rejects_conflicting_cli_root_and_location(tmp_path: Path) -> None:
    ensure_dev_dependencies_or_skip()
    root = repo_root()
    env = os.environ.copy()
    env["SETTA_BIN"] = str(tmp_path / "unused-setta-bin")
    env["SETTA_BACKEND_LOG_FILE"] = str(tmp_path / "backend.log")

    result = run_script(
        [
            "bash",
            str(root / "frontend" / "backendStart.sh"),
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--setta-files-location",
            "local",
        ],
        cwd=root,
        env=env,
    )

    assert result.returncode != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location."
        in f"{result.stdout}{result.stderr}"
    )
