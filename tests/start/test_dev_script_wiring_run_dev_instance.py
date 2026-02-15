from pathlib import Path

import pytest

from tests.start.dev_script_wiring_helpers import (
    build_run_dev_instance_sandbox,
    parse_env_snapshot,
    run_script,
    script_env,
    write_stub_executable,
)


@pytest.mark.parametrize(
    "extra_args",
    [
        ["--backend-port"],
        ["--backend-port", "--mode", "reset"],
    ],
)
def test_run_dev_instance_rejects_missing_backend_port_value(
    tmp_path: Path, extra_args: list[str]
) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            *extra_args,
        ],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode != 0
    assert "Missing value for --backend-port" in f"{result.stdout}{result.stderr}"


def test_run_dev_instance_rejects_conflicting_setta_files_root_and_location(
    tmp_path: Path,
) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--setta-files-location",
            "local",
        ],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location."
        in f"{result.stdout}{result.stderr}"
    )


def test_run_dev_instance_rejects_flag_like_profile_value(tmp_path: Path) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--profile",
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode != 0
    assert "Missing value for --profile" in f"{result.stdout}{result.stderr}"


def test_run_dev_instance_defaults_to_dev_home_and_dev_state_root(tmp_path: Path) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_HOME") != str(home_dir / ".setta")
    assert captured_env.get("SETTA_FILES_ROOT") != str(sandbox_root / "setta_files")
    assert "SETTA_FILES_LOCATION" not in captured_env


def test_run_dev_instance_uses_existing_path_env_before_defaults(
    tmp_path: Path,
) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )

    env = script_env(stub_dir, home_dir)
    env["SETTA_HOME"] = str(tmp_path / "previous_home")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_PROFILE"] = "built"
    env["SETTA_RUNTIME_ROOT"] = str(tmp_path / "previous_runtime")

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(tmp_path / "previous_home")
    assert captured_env.get("SETTA_FILES_ROOT") == str(tmp_path / "previous_state")
    assert "SETTA_FILES_LOCATION" not in captured_env
    assert captured_env.get("SETTA_PROFILE") == "built"
    assert captured_env.get("SETTA_RUNTIME_ROOT") == str(tmp_path / "previous_runtime")


def test_run_dev_instance_rejects_conflicting_env_root_and_location(
    tmp_path: Path,
) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    env = script_env(stub_dir, home_dir)
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_FILES_LOCATION"] = "global"

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode != 0
    assert (
        "Environment variables SETTA_FILES_ROOT and SETTA_FILES_LOCATION cannot both be set."
        in f"{result.stdout}{result.stderr}"
    )


def test_run_dev_instance_exports_profile_and_setta_files_root(tmp_path: Path) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--profile",
            "dev",
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_PROFILE") == "dev"
    assert captured_env.get("SETTA_FILES_ROOT") == str(tmp_path / "state_root")


def test_run_dev_instance_accepts_equals_style_path_flags(tmp_path: Path) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )

    setta_home = tmp_path / ".setta-development"
    setta_files_root = tmp_path / "state" / "setta_files_dev"
    runtime_root = setta_files_root / "runtime_custom"
    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--profile=dev",
            f"--setta-home={setta_home}",
            f"--setta-files-root={setta_files_root}",
            f"--runtime-root={runtime_root}",
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_PROFILE") == "dev"
    assert captured_env.get("SETTA_HOME") == str(setta_home)
    assert captured_env.get("SETTA_FILES_ROOT") == str(setta_files_root)
    assert captured_env.get("SETTA_RUNTIME_ROOT") == str(runtime_root)


@pytest.mark.parametrize(
    ("entry_script", "expected_cmd"),
    [
        ("start.sh", "start"),
        ("reset.sh", "reset"),
    ],
)
def test_start_and_reset_scripts_default_to_dev_home_and_state_root(
    tmp_path: Path, entry_script: str, expected_cmd: str
) -> None:
    sandbox_root = build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )

    result = run_script(
        ["bash", str(sandbox_root / entry_script)],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == expected_cmd
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_HOME") != str(home_dir / ".setta")
    assert captured_env.get("SETTA_FILES_ROOT") != str(sandbox_root / "setta_files")
    assert "SETTA_FILES_LOCATION" not in captured_env
