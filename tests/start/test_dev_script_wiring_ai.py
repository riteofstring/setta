import os
import signal
import subprocess
import time
from pathlib import Path

import pytest

from tests.start.dev_script_wiring_helpers import (
    build_ai_sandbox,
    parse_env_snapshot,
    run_script,
    script_env,
    write_stub_executable,
)


def _wait_for_path(path: Path, *, timeout_seconds: float = 5.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if path.exists():
            return
        time.sleep(0.05)
    raise AssertionError(f"Timed out waiting for {path}")


def _pid_is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _write_pnpm_stub(stub_dir: Path, body: str) -> None:
    write_stub_executable(stub_dir / "pnpm", body)
    write_stub_executable(
        stub_dir / "corepack",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != "pnpm" ]]; then
  echo "unexpected corepack invocation: $*" >&2
  exit 1
fi
shift
exec pnpm "$@"
""",
    )


@pytest.mark.parametrize(
    "extra_args",
    [
        ["--profile"],
        ["--profile", "--reload"],
    ],
)
def test_ai_sh_rejects_missing_profile_value(
    tmp_path: Path, extra_args: list[str]
) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = run_script(
        ["bash", str(sandbox_root / "ai.sh"), *extra_args],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode != 0
    assert "Missing value for --profile" in f"{result.stdout}{result.stderr}"


def test_ai_sh_rejects_conflicting_setta_files_root_and_location(
    tmp_path: Path,
) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "ai.sh"),
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


def test_ai_sh_rejects_invalid_setta_files_location_value(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "ai.sh"),
            "--setta-files-location",
            "invalid-mode",
        ],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode != 0
    assert (
        "Invalid value for --setta-files-location: invalid-mode. Expected auto, local, or global."
        in f"{result.stdout}{result.stderr}"
    )


def test_ai_sh_normalizes_setta_files_location_case(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    _write_pnpm_stub(
        stub_dir,
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )
    write_stub_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )
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

    result = run_script(
        [
            "bash",
            str(sandbox_root / "ai.sh"),
            "--setta-files-location",
            "GLOBAL",
        ],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_FILES_LOCATION") == "global"
    assert "SETTA_FILES_ROOT" not in captured_env


def test_ai_sh_defaults_to_dev_home_and_dev_state_root(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    _write_pnpm_stub(
        stub_dir,
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )
    write_stub_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )
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

    result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_HOME") != str(home_dir / ".setta")
    assert captured_env.get("SETTA_FILES_ROOT") != str(sandbox_root / "setta_files")
    assert "SETTA_FILES_LOCATION" not in captured_env


def test_ai_sh_uses_existing_path_env_before_defaults(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    _write_pnpm_stub(
        stub_dir,
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
env | sort > "{capture_env}"
""",
    )
    write_stub_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )
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

    env = script_env(stub_dir, home_dir)
    env["SETTA_HOME"] = str(tmp_path / "previous_home")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_PROFILE"] = "built"
    env["SETTA_RUNTIME_ROOT"] = str(tmp_path / "previous_runtime")

    result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(tmp_path / "previous_home")
    assert captured_env.get("SETTA_FILES_ROOT") == str(tmp_path / "previous_state")
    assert "SETTA_FILES_LOCATION" not in captured_env
    assert captured_env.get("SETTA_PROFILE") == "built"
    assert captured_env.get("SETTA_RUNTIME_ROOT") == str(tmp_path / "previous_runtime")


def test_ai_sh_rejects_conflicting_env_root_and_location(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    env = script_env(stub_dir, home_dir)
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_FILES_LOCATION"] = "global"

    result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode != 0
    assert (
        "Environment variables SETTA_FILES_ROOT and SETTA_FILES_LOCATION cannot both be set."
        in f"{result.stdout}{result.stderr}"
    )


def test_ai_sh_auto_frontend_port_excludes_fixed_backend_port(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_env = tmp_path / "pnpm_env.txt"

    _write_pnpm_stub(
        stub_dir,
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

    baseline_result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )
    assert baseline_result.returncode == 0, baseline_result.stderr
    baseline_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    default_frontend_port = baseline_env["SETTA_DEV_FRONTEND_PORT"]

    env = script_env(stub_dir, home_dir)
    env["SETTA_PORT"] = default_frontend_port
    result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_PORT") == default_frontend_port
    assert captured_env.get("SETTA_DEV_FRONTEND_PORT") != default_frontend_port
    assert int(captured_env["SETTA_DEV_FRONTEND_PORT"]) == int(default_frontend_port) + 1


def test_ai_sh_auto_debug_port_excludes_fixed_backend_and_frontend(
    tmp_path: Path,
) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_env = tmp_path / "pnpm_env.txt"

    _write_pnpm_stub(
        stub_dir,
        f"""#!/usr/bin/env bash
set -euo pipefail
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

    baseline_result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )
    assert baseline_result.returncode == 0, baseline_result.stderr
    baseline_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    default_debug_port = baseline_env["DEBUG_PORT"]

    env = script_env(stub_dir, home_dir)
    env["SETTA_PORT"] = default_debug_port
    env["SETTA_DEV_FRONTEND_PORT"] = str(int(default_debug_port) + 5)
    result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    captured_env = parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_PORT") == default_debug_port
    assert captured_env.get("SETTA_DEV_FRONTEND_PORT") == str(int(default_debug_port) + 5)
    assert captured_env.get("DEBUG_PORT") != default_debug_port
    assert int(captured_env["DEBUG_PORT"]) == int(default_debug_port) + 1


def test_ai_sh_ignores_sighup_and_cleans_up_detached_dev_runtime(
    tmp_path: Path,
) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    child_pid_path = tmp_path / "pnpm_pid.txt"
    signal_log = tmp_path / "pnpm_signals.txt"
    stop_browser_log = tmp_path / "stop_browser.txt"

    _write_pnpm_stub(
        stub_dir,
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$$" > "{child_pid_path}"
trap 'echo TERM >> "{signal_log}"; exit 0' TERM
trap 'echo HUP >> "{signal_log}"; exit 0' HUP
while true; do
  sleep 1
done
""",
    )
    write_stub_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )
    write_stub_executable(
        sandbox_root / "scripts" / "start-browser-mcp.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )
    write_stub_executable(
        sandbox_root / "scripts" / "stop-browser-mcp.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo stopped >> "{stop_browser_log}"
""",
    )

    env = script_env(stub_dir, home_dir)
    process = subprocess.Popen(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        _wait_for_path(child_pid_path)
        child_pid = int(child_pid_path.read_text(encoding="utf-8").strip())

        process.send_signal(signal.SIGHUP)
        time.sleep(0.5)

        assert process.poll() is None
        assert _pid_is_running(child_pid)
        if signal_log.exists():
            assert "HUP" not in signal_log.read_text(encoding="utf-8")

        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode is not None, stdout + stderr
    finally:
        if process.poll() is None:
            process.kill()
            process.communicate(timeout=10)

    _wait_for_path(stop_browser_log)
    _wait_for_path(signal_log)
    signals = signal_log.read_text(encoding="utf-8")
    assert "TERM" in signals
    assert "HUP" not in signals
