from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    parse_env_snapshot,
    repo_root,
    run_script,
    script_env,
    write_stub_executable,
)


def build_record_playwright_sandbox(
    tmp_path: Path,
) -> tuple[Path, Path, Path, Path, Path, Path]:
    root = repo_root()
    sandbox_root = tmp_path / "record_playwright_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    wrapper_src = root / "scripts" / "record-playwright-e2e.sh"
    wrapper_dst = scripts_dir / "record-playwright-e2e.sh"
    wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
    wrapper_dst.chmod(0o755)

    capture_args = sandbox_root / "runner_args.txt"
    capture_env = sandbox_root / "runner_env.txt"
    reset_capture_args = sandbox_root / "reset_args.txt"
    reset_capture_env = sandbox_root / "reset_env.txt"
    call_log = sandbox_root / "call_log.txt"
    write_stub_executable(
        scripts_dir / "run-playwright-e2e.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'runner\\n' >> "{call_log}"
env | sort > "{capture_env}"
printf '%s' "$*" > "{capture_args}"
""",
    )
    write_stub_executable(
        scripts_dir / "reset-setta-state.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'reset\\n' >> "{call_log}"
env | sort > "{reset_capture_env}"
printf '%s' "$*" > "{reset_capture_args}"
""",
    )

    return (
        sandbox_root,
        capture_args,
        capture_env,
        reset_capture_args,
        reset_capture_env,
        call_log,
    )


def test_record_playwright_wrapper_passes_codegen_env_and_paths(
    tmp_path: Path,
) -> None:
    (
        sandbox_root,
        capture_args,
        capture_env,
        _,
        _,
        _,
    ) = build_record_playwright_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir = tmp_path / "recording-output"
    env = script_env(stub_dir, home_dir)
    env.pop("SETTA_WORKSPACE_ROOT", None)
    env.pop("SETTA_PROJECT_URL", None)
    env.pop("SETTA_PROJECT_PATH", None)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "record-playwright-e2e.sh"),
            "--artifact-dir",
            str(artifact_dir),
            "--browser",
            "chromium",
            "--timeout",
            "0",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert capture_args.read_text(encoding="utf-8") == "--browser chromium --timeout 0"
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_E2E_PLAYWRIGHT_SUBCOMMAND") == "codegen"
    assert captured_env.get("SETTA_E2E_RECORD_ARTIFACT_DIR") == str(artifact_dir)
    assert captured_env.get("SETTA_E2E_RECORD_OUTPUT_FILE") == str(
        artifact_dir / "recording.spec.ts"
    )
    assert captured_env.get("SETTA_E2E_RECORD_AUTH_STORAGE_STATE") == str(
        artifact_dir / "bootstrap-storage-state.json"
    )
    assert captured_env.get("SETTA_E2E_RECORD_FINAL_STORAGE_STATE") == str(
        artifact_dir / "final-storage-state.json"
    )
    assert captured_env.get("SETTA_E2E_RECORD_HAR_FILE") == str(
        artifact_dir / "network.har"
    )
    assert captured_env.get("SETTA_E2E_RECORD_METADATA_FILE") == str(
        artifact_dir / "session.json"
    )
    assert captured_env.get("SETTA_E2E_LOG_DIR") == str(artifact_dir / "logs")
    assert captured_env.get("SETTA_E2E_SEED_WORKSPACE") == "0"
    assert captured_env.get("SETTA_E2E_BUILD_PLUGIN_FIXTURES") == "0"
    assert captured_env.get("SETTA_E2E_SEED_PLUGIN_FIXTURES") == "0"
    assert captured_env.get("SETTA_E2E_SEED_PLUGIN_ARTIFACTS") == "0"
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_WORKSPACE_ROOT") == str(sandbox_root)
    assert captured_env.get("SETTA_PROJECT_PATH") == "/home"
    assert artifact_dir.is_dir()
    assert (artifact_dir / "logs").is_dir()


def test_record_playwright_wrapper_defaults_to_tmp_recording_root(
    tmp_path: Path,
) -> None:
    sandbox_root, _, capture_env, _, _, _ = build_record_playwright_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    tmp_root = tmp_path / "tmp-root"
    tmp_root.mkdir(parents=True, exist_ok=True)

    env = script_env(stub_dir, home_dir)
    env["TMPDIR"] = str(tmp_root)
    env.pop("SETTA_WORKSPACE_ROOT", None)
    env.pop("SETTA_PROJECT_URL", None)
    env.pop("SETTA_PROJECT_PATH", None)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "record-playwright-e2e.sh"),
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    artifact_dir = captured_env.get("SETTA_E2E_RECORD_ARTIFACT_DIR")
    assert artifact_dir is not None
    assert artifact_dir.startswith(str(tmp_root / "setta-playwright-recordings"))
    assert "/recording-" in artifact_dir
    assert "setta_files" not in artifact_dir


def test_record_playwright_wrapper_preserves_explicit_plugin_fixture_overrides(
    tmp_path: Path,
) -> None:
    sandbox_root, _, capture_env, _, _, _ = build_record_playwright_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    env = script_env(stub_dir, home_dir)
    env["SETTA_E2E_BUILD_PLUGIN_FIXTURES"] = "1"
    env["SETTA_E2E_SEED_PLUGIN_FIXTURES"] = "1"
    env["SETTA_E2E_SEED_PLUGIN_ARTIFACTS"] = "1"
    env["SETTA_HOME"] = str(tmp_path / "custom-home")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "custom-files")
    env["SETTA_WORKSPACE_ROOT"] = str(tmp_path / "custom-workspace")
    env["SETTA_PROJECT_PATH"] = "/custom-home"

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "record-playwright-e2e.sh"),
            "--artifact-dir",
            str(tmp_path / "recording-output"),
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_E2E_BUILD_PLUGIN_FIXTURES") == "1"
    assert captured_env.get("SETTA_E2E_SEED_PLUGIN_FIXTURES") == "1"
    assert captured_env.get("SETTA_E2E_SEED_PLUGIN_ARTIFACTS") == "1"
    assert captured_env.get("SETTA_HOME") == str(tmp_path / "custom-home")
    assert captured_env.get("SETTA_FILES_ROOT") == str(tmp_path / "custom-files")
    assert captured_env.get("SETTA_WORKSPACE_ROOT") == str(
        tmp_path / "custom-workspace"
    )
    assert captured_env.get("SETTA_PROJECT_PATH") == "/custom-home"


def test_record_playwright_wrapper_reset_flag_runs_reset_before_runner(
    tmp_path: Path,
) -> None:
    (
        sandbox_root,
        capture_args,
        capture_env,
        reset_capture_args,
        reset_capture_env,
        call_log,
    ) = build_record_playwright_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir = tmp_path / "recording-output"
    env = script_env(stub_dir, home_dir)
    env.pop("SETTA_WORKSPACE_ROOT", None)
    env.pop("SETTA_PROJECT_URL", None)
    env.pop("SETTA_PROJECT_PATH", None)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "record-playwright-e2e.sh"),
            "--reset",
            "--artifact-dir",
            str(artifact_dir),
            "--browser",
            "chromium",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert call_log.read_text(encoding="utf-8").splitlines() == ["reset", "runner"]
    assert reset_capture_args.read_text(encoding="utf-8") == (
        f"--workspace {sandbox_root}"
    )
    reset_env = parse_env_snapshot(reset_capture_env.read_text(encoding="utf-8"))
    assert reset_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert reset_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert reset_env.get("SETTA_WORKSPACE_ROOT") == str(sandbox_root)
    assert capture_args.read_text(encoding="utf-8") == "--browser chromium"
    runner_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert runner_env.get("SETTA_WORKSPACE_ROOT") == str(sandbox_root)
