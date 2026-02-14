import os
import subprocess
from pathlib import Path

import pytest


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _ensure_dev_dependencies_or_skip() -> None:
    repo_root = _repo_root()
    if not (repo_root / ".venv" / "bin" / "activate").exists():
        pytest.skip("Dev script wiring tests require repo .venv activation script.")
    if not (repo_root / "frontend" / "node_modules").exists():
        pytest.skip("Dev script wiring tests require frontend/node_modules.")


def _write_stub_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _build_aireset_sandbox(tmp_path: Path) -> Path:
    repo_root = _repo_root()
    sandbox_root = tmp_path / "aireset_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    sandbox_aireset = sandbox_root / "aireset.sh"
    sandbox_aireset.write_text(
        (repo_root / "aireset.sh").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    sandbox_aireset.chmod(0o755)

    reset_capture_env = sandbox_root / "reset_env.txt"
    reset_capture_args = sandbox_root / "reset_args.txt"
    ai_capture_env = sandbox_root / "ai_env.txt"
    ai_capture_args = sandbox_root / "ai_args.txt"

    _write_stub_executable(
        scripts_dir / "reset-setta-state.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{reset_capture_env}"
echo "$*" > "{reset_capture_args}"
""",
    )
    _write_stub_executable(
        sandbox_root / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{ai_capture_env}"
echo "$*" > "{ai_capture_args}"
""",
    )

    return sandbox_root


def _script_env(stub_dir: Path, home_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    for key in (
        "SETTA_HOME",
        "SETTA_PROFILE",
        "SETTA_FILES_ROOT",
        "SETTA_FILES_LOCATION",
        "SETTA_RUNTIME_ROOT",
    ):
        env.pop(key, None)
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["HOME"] = str(home_dir)
    return env


def test_run_dev_instance_defaults_to_dev_home_and_dev_state_root(tmp_path: Path) -> None:
    _ensure_dev_dependencies_or_skip()
    repo_root = _repo_root()
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    _write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "scripts" / "run-dev-instance.sh"),
            "--mode",
            "reset",
        ],
        cwd=repo_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = capture_env.read_text(encoding="utf-8")
    assert f"SETTA_HOME={home_dir / '.setta-development'}" in captured_env
    assert f"SETTA_FILES_ROOT={repo_root / 'setta_files_dev'}" in captured_env


def test_run_dev_instance_defaults_override_existing_path_env(
    tmp_path: Path,
) -> None:
    _ensure_dev_dependencies_or_skip()
    repo_root = _repo_root()
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    _write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )

    env = _script_env(stub_dir, home_dir)
    env["SETTA_HOME"] = str(tmp_path / "previous_home")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_FILES_LOCATION"] = "global"
    env["SETTA_PROFILE"] = "built"
    env["SETTA_RUNTIME_ROOT"] = str(tmp_path / "previous_runtime")

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "scripts" / "run-dev-instance.sh"),
            "--mode",
            "reset",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = capture_env.read_text(encoding="utf-8")
    assert f"SETTA_HOME={home_dir / '.setta-development'}" in captured_env
    assert f"SETTA_FILES_ROOT={repo_root / 'setta_files_dev'}" in captured_env
    assert "SETTA_FILES_LOCATION=" not in captured_env
    assert "SETTA_PROFILE=" not in captured_env
    assert "SETTA_RUNTIME_ROOT=" not in captured_env


def test_run_dev_instance_exports_profile_and_setta_files_root(tmp_path: Path) -> None:
    _ensure_dev_dependencies_or_skip()
    repo_root = _repo_root()
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    _write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "scripts" / "run-dev-instance.sh"),
            "--profile",
            "dev",
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--mode",
            "reset",
        ],
        cwd=repo_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = capture_env.read_text(encoding="utf-8")
    assert "SETTA_PROFILE=dev" in captured_env
    assert f"SETTA_FILES_ROOT={tmp_path / 'state_root'}" in captured_env


def test_backend_start_forwards_profile_and_explicit_root(tmp_path: Path) -> None:
    _ensure_dev_dependencies_or_skip()
    repo_root = _repo_root()
    capture_args = tmp_path / "setta_args.txt"
    capture_env = tmp_path / "setta_env.txt"
    setta_stub = tmp_path / "setta-stub.sh"

    _write_stub_executable(
        setta_stub,
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_args}"
env | sort > "{capture_env}"
""",
    )

    env = os.environ.copy()
    env["SETTA_BIN"] = str(setta_stub)
    env["SETTA_BACKEND_LOG_FILE"] = str(tmp_path / "backend.log")
    env["SETTA_PROFILE"] = "dev"
    env["SETTA_FILES_ROOT"] = str(tmp_path / "state_root")
    # When both are provided through env, backendStart should pass only explicit root.
    env["SETTA_FILES_LOCATION"] = "global"

    result = subprocess.run(
        ["bash", str(repo_root / "frontend" / "backendStart.sh"), "--no-open"],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    args = capture_args.read_text(encoding="utf-8")
    assert "--profile dev" in args
    assert f"--setta-files-root {tmp_path / 'state_root'}" in args
    assert "--setta-files-location global" not in args
    assert "--log-level debug" in args


def test_aireset_defaults_to_dev_home_and_dev_state_root(tmp_path: Path) -> None:
    sandbox_root = _build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = _script_env(tmp_path / "unused-bin", home_dir)
    env["SETTA_HOME"] = str(tmp_path / "previous_home")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_FILES_LOCATION"] = "global"
    env["SETTA_PROFILE"] = "built"
    env["SETTA_RUNTIME_ROOT"] = str(tmp_path / "previous_runtime")

    result = subprocess.run(
        ["bash", str(sandbox_root / "aireset.sh")],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    reset_env = (sandbox_root / "reset_env.txt").read_text(encoding="utf-8")
    ai_env = (sandbox_root / "ai_env.txt").read_text(encoding="utf-8")

    expected_home = home_dir / ".setta-development"
    expected_root = sandbox_root / "setta_files_dev"
    assert f"SETTA_HOME={expected_home}" in reset_env
    assert f"SETTA_FILES_ROOT={expected_root}" in reset_env
    assert "SETTA_FILES_LOCATION=" not in reset_env
    assert "SETTA_PROFILE=" not in reset_env
    assert "SETTA_RUNTIME_ROOT=" not in reset_env
    assert f"SETTA_HOME={expected_home}" in ai_env
    assert f"SETTA_FILES_ROOT={expected_root}" in ai_env
    assert "SETTA_FILES_LOCATION=" not in ai_env
    assert "SETTA_PROFILE=" not in ai_env
    assert "SETTA_RUNTIME_ROOT=" not in ai_env


def test_aireset_setta_files_location_arg_unsets_setta_files_root(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = _script_env(tmp_path / "unused-bin", home_dir)
    env["SETTA_FILES_ROOT"] = str(tmp_path / "preexisting_root")

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "aireset.sh"),
            "--setta-files-location",
            "local",
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    reset_env = (sandbox_root / "reset_env.txt").read_text(encoding="utf-8")
    reset_args = (sandbox_root / "reset_args.txt").read_text(encoding="utf-8")
    assert "SETTA_FILES_ROOT=" not in reset_env
    assert "--setta-files-location local" in reset_args
