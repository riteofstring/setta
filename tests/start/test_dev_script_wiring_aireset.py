from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    build_aireset_sandbox,
    parse_env_snapshot,
    repo_root,
    run_script,
    script_env,
    write_stub_executable,
)


def test_aireset_uses_existing_path_env_before_defaults(tmp_path: Path) -> None:
    sandbox_root = build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(tmp_path / "unused-bin", home_dir)
    env["SETTA_HOME"] = str(tmp_path / "previous_home")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_PROFILE"] = "built"
    env["SETTA_RUNTIME_ROOT"] = str(tmp_path / "previous_runtime")

    result = run_script(
        ["bash", str(sandbox_root / "aireset.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr

    reset_env = (sandbox_root / "reset_env.txt").read_text(encoding="utf-8")
    ai_env = (sandbox_root / "ai_env.txt").read_text(encoding="utf-8")

    expected_home = tmp_path / "previous_home"
    expected_root = tmp_path / "previous_state"
    assert f"SETTA_HOME={expected_home}" in reset_env
    assert f"SETTA_FILES_ROOT={expected_root}" in reset_env
    assert "SETTA_FILES_LOCATION=" not in reset_env
    assert "SETTA_PROFILE=built" in reset_env
    assert f"SETTA_RUNTIME_ROOT={tmp_path / 'previous_runtime'}" in reset_env
    assert f"SETTA_HOME={expected_home}" in ai_env
    assert f"SETTA_FILES_ROOT={expected_root}" in ai_env
    assert "SETTA_FILES_LOCATION=" not in ai_env
    assert "SETTA_PROFILE=built" in ai_env
    assert f"SETTA_RUNTIME_ROOT={tmp_path / 'previous_runtime'}" in ai_env


def test_aireset_rejects_conflicting_env_root_and_location(tmp_path: Path) -> None:
    sandbox_root = build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(tmp_path / "unused-bin", home_dir)
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_FILES_LOCATION"] = "global"

    result = run_script(
        ["bash", str(sandbox_root / "aireset.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode != 0
    assert (
        "Environment variables SETTA_FILES_ROOT and SETTA_FILES_LOCATION cannot both be set."
        in f"{result.stdout}{result.stderr}"
    )
    assert not (sandbox_root / "reset_env.txt").exists()
    assert not (sandbox_root / "ai_env.txt").exists()


def test_aireset_always_passes_worktree_workspace_to_reset(tmp_path: Path) -> None:
    sandbox_root = build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(tmp_path / "unused-bin", home_dir)

    result = run_script(
        ["bash", str(sandbox_root / "aireset.sh"), "--reload"],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    reset_args = (sandbox_root / "reset_args.txt").read_text(encoding="utf-8")
    assert f"--workspace {sandbox_root}" in reset_args


def test_aireset_setta_files_location_arg_unsets_setta_files_root(
    tmp_path: Path,
) -> None:
    sandbox_root = build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(tmp_path / "unused-bin", home_dir)
    env["SETTA_FILES_ROOT"] = str(tmp_path / "preexisting_root")

    result = run_script(
        [
            "bash",
            str(sandbox_root / "aireset.sh"),
            "--setta-files-location",
            "local",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr

    reset_env = (sandbox_root / "reset_env.txt").read_text(encoding="utf-8")
    reset_args = (sandbox_root / "reset_args.txt").read_text(encoding="utf-8")
    assert "SETTA_FILES_ROOT=" not in reset_env
    assert "--setta-files-location local" in reset_args


def test_aireset_accepts_equals_style_path_flags(tmp_path: Path) -> None:
    sandbox_root = build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(tmp_path / "unused-bin", home_dir)
    setta_home = tmp_path / ".setta-development"
    setta_files_root = tmp_path / "state" / "setta_files_dev"
    runtime_root = setta_files_root / "runtime_dev"

    result = run_script(
        [
            "bash",
            str(sandbox_root / "aireset.sh"),
            "--profile=dev",
            f"--setta-home={setta_home}",
            f"--setta-files-root={setta_files_root}",
            f"--runtime-root={runtime_root}",
            "--reload",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr

    reset_env = (sandbox_root / "reset_env.txt").read_text(encoding="utf-8")
    ai_env = (sandbox_root / "ai_env.txt").read_text(encoding="utf-8")
    reset_args = (sandbox_root / "reset_args.txt").read_text(encoding="utf-8")
    ai_args = (sandbox_root / "ai_args.txt").read_text(encoding="utf-8")

    assert "--profile=dev" in reset_args
    assert f"--setta-home={setta_home}" in reset_args
    assert f"--setta-files-root={setta_files_root}" in reset_args
    assert f"--runtime-root={runtime_root}" in reset_args
    assert "--reload" not in reset_args
    assert "--reload" in ai_args

    assert "SETTA_PROFILE=dev" in reset_env
    assert f"SETTA_HOME={setta_home}" in reset_env
    assert f"SETTA_FILES_ROOT={setta_files_root}" in reset_env
    assert f"SETTA_RUNTIME_ROOT={runtime_root}" in reset_env
    assert "SETTA_PROFILE=dev" in ai_env
    assert f"SETTA_HOME={setta_home}" in ai_env
    assert f"SETTA_FILES_ROOT={setta_files_root}" in ai_env
    assert f"SETTA_RUNTIME_ROOT={runtime_root}" in ai_env


def test_aireset_rejects_conflicting_setta_files_root_and_location(
    tmp_path: Path,
) -> None:
    sandbox_root = build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(tmp_path / "unused-bin", home_dir)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "aireset.sh"),
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--setta-files-location",
            "local",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location."
        in f"{result.stdout}{result.stderr}"
    )
    assert not (sandbox_root / "reset_env.txt").exists()
    assert not (sandbox_root / "ai_env.txt").exists()


def test_aireset_rejects_force_and_yes(tmp_path: Path) -> None:
    sandbox_root = build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = script_env(tmp_path / "unused-bin", home_dir)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "aireset.sh"),
            "--force",
            "--yes",
            "--reload",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode != 0
    combined = f"{result.stdout}{result.stderr}"
    assert "Unsupported argument for aireset.sh: --force" in combined


def test_aireset_auto_frontend_port_excludes_fixed_backend_port(tmp_path: Path) -> None:
    sandbox_root = build_aireset_sandbox(tmp_path)
    root = repo_root()

    # Replace the wiring stub with the real ai entrypoints for end-to-end port checks.
    ai_wrapper = sandbox_root / "ai.sh"
    ai_wrapper.write_text((root / "ai.sh").read_text(encoding="utf-8"), encoding="utf-8")
    ai_wrapper.chmod(0o755)
    ai_runner = sandbox_root / "scripts" / "ai.sh"
    ai_runner.write_text(
        (root / "scripts" / "ai.sh").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    ai_runner.chmod(0o755)

    # Ensure ai.sh can proceed without invoking real browser tooling.
    write_stub_executable(
        sandbox_root / "scripts" / "start-browser-mcp.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )
    write_stub_executable(
        sandbox_root / "scripts" / "stop-browser-mcp.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
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
    # Keep all ports free so we can assert only exclude logic drives the next pick.
    write_stub_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )

    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    baseline_result = run_script(
        ["bash", str(sandbox_root / "aireset.sh")],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )
    assert baseline_result.returncode == 0, baseline_result.stderr
    baseline_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    default_frontend_port = baseline_env["SETTA_DEV_FRONTEND_PORT"]

    env = script_env(stub_dir, home_dir)
    env["SETTA_PORT"] = default_frontend_port
    result = run_script(
        ["bash", str(sandbox_root / "aireset.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_PORT") == default_frontend_port
    assert captured_env.get("SETTA_DEV_FRONTEND_PORT") != default_frontend_port
    assert int(captured_env["SETTA_DEV_FRONTEND_PORT"]) == int(default_frontend_port) + 1
