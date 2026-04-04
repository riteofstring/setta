import os
from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    build_backend_start_sandbox,
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


def test_backend_start_default_non_reload_uses_go_entrypoint(tmp_path: Path) -> None:
    sandbox_root = build_backend_start_sandbox(tmp_path)
    capture_args = tmp_path / "go_args.txt"

    write_stub_executable(
        sandbox_root / "scripts" / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_args}"
""",
    )

    result = run_script(
        ["bash", str(sandbox_root / "frontend" / "backendStart.sh"), "--no-open"],
        cwd=sandbox_root,
        env={
            **os.environ.copy(),
            "SETTA_BACKEND_LOG_FILE": str(tmp_path / "backend.log"),
        },
    )

    assert result.returncode == 0, result.stderr
    args = capture_args.read_text(encoding="utf-8")
    assert args.startswith("run ./cmd/setta ")
    assert "--no-open" in args
    assert "--log-level debug" in args


def test_backend_start_reload_uses_go_entrypoint(tmp_path: Path) -> None:
    sandbox_root = build_backend_start_sandbox(tmp_path)
    capture_args = tmp_path / "go_args.txt"

    write_stub_executable(
        sandbox_root / "scripts" / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_args}"
""",
    )

    result = run_script(
        [
            "bash",
            str(sandbox_root / "frontend" / "backendStart.sh"),
            "--reload",
            "--no-open",
        ],
        cwd=sandbox_root,
        env={
            **os.environ.copy(),
            "SETTA_BACKEND_LOG_FILE": str(tmp_path / "backend.log"),
        },
    )

    assert result.returncode == 0, result.stderr
    args = capture_args.read_text(encoding="utf-8")
    assert args.startswith("run ./cmd/setta ")
    assert "--reload" in args
    assert "--no-open" in args
    assert "--log-level debug" in args


def test_backend_start_exports_repo_venv_as_setta_python_when_unset(
    tmp_path: Path,
) -> None:
    sandbox_root = build_backend_start_sandbox(tmp_path)
    capture_env = tmp_path / "setta_env.txt"
    setta_stub = tmp_path / "setta-stub.sh"
    python_bin = sandbox_root / ".venv" / "bin" / "python"
    python_bin.parent.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        python_bin,
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )
    write_stub_executable(
        setta_stub,
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{capture_env}"
""",
    )

    result = run_script(
        ["bash", str(sandbox_root / "frontend" / "backendStart.sh"), "--no-open"],
        cwd=sandbox_root,
        env={
            **os.environ.copy(),
            "SETTA_BIN": str(setta_stub),
            "SETTA_BACKEND_LOG_FILE": str(tmp_path / "backend.log"),
        },
    )

    assert result.returncode == 0, result.stderr
    captured_env = capture_env.read_text(encoding="utf-8")
    assert f"SETTA_PYTHON={python_bin}" in captured_env


def test_backend_start_preserves_explicit_setta_python_override(tmp_path: Path) -> None:
    sandbox_root = build_backend_start_sandbox(tmp_path)
    capture_env = tmp_path / "setta_env.txt"
    setta_stub = tmp_path / "setta-stub.sh"
    explicit_python = tmp_path / "custom-python"

    write_stub_executable(
        setta_stub,
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{capture_env}"
""",
    )

    result = run_script(
        ["bash", str(sandbox_root / "frontend" / "backendStart.sh"), "--no-open"],
        cwd=sandbox_root,
        env={
            **os.environ.copy(),
            "SETTA_BIN": str(setta_stub),
            "SETTA_BACKEND_LOG_FILE": str(tmp_path / "backend.log"),
            "SETTA_PYTHON": str(explicit_python),
        },
    )

    assert result.returncode == 0, result.stderr
    captured_env = capture_env.read_text(encoding="utf-8")
    assert f"SETTA_PYTHON={explicit_python}" in captured_env


def test_backend_start_rejects_conflicting_env_root_and_location(
    tmp_path: Path,
) -> None:
    ensure_dev_dependencies_or_skip()
    root = repo_root()
    env = os.environ.copy()
    env["SETTA_BACKEND_LOG_FILE"] = str(tmp_path / "backend.log")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "state_root")
    env["SETTA_FILES_LOCATION"] = "global"

    result = run_script(
        ["bash", str(root / "frontend" / "backendStart.sh"), "--no-open"],
        cwd=root,
        env=env,
    )

    assert result.returncode != 0
    assert (
        "Environment variables SETTA_FILES_ROOT and SETTA_FILES_LOCATION cannot both be set."
        in f"{result.stdout}{result.stderr}"
    )


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
