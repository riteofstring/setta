from pathlib import Path

import pytest

from tests.start.dev_script_wiring_helpers import (
    build_ai_sandbox,
    parse_env_snapshot,
    run_script,
    script_env,
    write_stub_executable,
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

    write_stub_executable(
        stub_dir / "pnpm",
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

    write_stub_executable(
        stub_dir / "pnpm",
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
    assert captured_env.get("COREPACK_ENABLE_AUTO_PIN") == "0"
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_HOME") != str(home_dir / ".setta")
    assert captured_env.get("SETTA_FILES_ROOT") != str(sandbox_root / "setta_files")
    assert "SETTA_FILES_LOCATION" not in captured_env


def test_ai_sh_falls_back_to_corepack_when_pnpm_is_missing(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "corepack_cmd.txt"
    nvm_bin_dir = home_dir / ".nvm" / "versions" / "node" / "v20.19.0" / "bin"
    nvm_bin_dir.mkdir(parents=True, exist_ok=True)

    write_stub_executable(
        nvm_bin_dir / "corepack",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
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
    env["PATH"] = f"{nvm_bin_dir}:{stub_dir}:/usr/bin:/bin"

    result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "pnpm start"


def test_ai_sh_prefers_repo_pinned_node_version_when_pnpm_is_missing(
    tmp_path: Path,
) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    (sandbox_root / "scripts" / "node_version.txt").write_text(
        "20.11.1\n", encoding="utf-8"
    )
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    pinned_capture = tmp_path / "corepack_pinned_cmd.txt"
    newer_capture = tmp_path / "corepack_newer_cmd.txt"
    pinned_bin_dir = home_dir / ".nvm" / "versions" / "node" / "v20.11.1" / "bin"
    pinned_bin_dir.mkdir(parents=True, exist_ok=True)
    newer_bin_dir = home_dir / ".nvm" / "versions" / "node" / "v20.19.0" / "bin"
    newer_bin_dir.mkdir(parents=True, exist_ok=True)

    write_stub_executable(
        pinned_bin_dir / "corepack",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{pinned_capture}"
""",
    )
    write_stub_executable(
        pinned_bin_dir / "node",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-p" ]]; then
  printf '20.11.1\\n'
  exit 0
fi
printf 'pinned-node\\n'
""",
    )
    write_stub_executable(
        newer_bin_dir / "corepack",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{newer_capture}"
""",
    )
    write_stub_executable(
        newer_bin_dir / "node",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-p" ]]; then
  printf '20.19.0\\n'
  exit 0
fi
printf 'newer-node\\n'
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
    env["PATH"] = f"{newer_bin_dir}:{stub_dir}:/usr/bin:/bin"

    result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert pinned_capture.read_text(encoding="utf-8").strip() == "pnpm start"
    assert not newer_capture.exists()


def test_ai_sh_prefers_repo_pinned_corepack_and_disables_auto_pin(
    tmp_path: Path,
) -> None:
    # When a mismatched Node/corepack is already on PATH, ai.sh should switch
    # to the repo-pinned Node toolchain before running pnpm.
    sandbox_root = build_ai_sandbox(tmp_path)
    (sandbox_root / "scripts" / "node_version.txt").write_text(
        "23.1.0\n", encoding="utf-8"
    )
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    wrong_capture = tmp_path / "corepack_wrong_cmd.txt"
    pinned_capture = tmp_path / "corepack_pinned_cmd.txt"
    pinned_env_capture = tmp_path / "corepack_pinned_env.txt"
    pinned_bin_dir = home_dir / ".nvm" / "versions" / "node" / "v23.1.0" / "bin"
    pinned_bin_dir.mkdir(parents=True, exist_ok=True)

    write_stub_executable(
        stub_dir / "node",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-p" ]]; then
  printf '20.19.0\\n'
  exit 0
fi
printf 'mismatched-node\\n'
""",
    )
    write_stub_executable(
        stub_dir / "corepack",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{wrong_capture}"
""",
    )
    write_stub_executable(
        pinned_bin_dir / "node",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-p" ]]; then
  printf '23.1.0\\n'
  exit 0
fi
printf 'pinned-node\\n'
""",
    )
    write_stub_executable(
        pinned_bin_dir / "corepack",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{pinned_capture}"
env | sort > "{pinned_env_capture}"
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
    env["PATH"] = f"{stub_dir}:{pinned_bin_dir}:/usr/bin:/bin"

    result = run_script(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert pinned_capture.read_text(encoding="utf-8").strip() == "pnpm start"
    pinned_env = parse_env_snapshot(pinned_env_capture.read_text(encoding="utf-8"))
    assert pinned_env.get("COREPACK_ENABLE_AUTO_PIN") == "0"
    assert not wrong_capture.exists()
@pytest.mark.parametrize(
    ("browser_mode", "expected_headless"),
    [("headless", "1"), ("headed", "0")],
)
def test_ai_sh_passes_browser_mode_to_browser_mcp(
    tmp_path: Path, browser_mode: str, expected_headless: str
) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    capture_cmd = tmp_path / "pnpm_cmd.txt"
    capture_browser_args = tmp_path / "browser_args.txt"
    capture_browser_env = tmp_path / "browser_env.txt"

    write_stub_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_cmd}"
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
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{capture_browser_args}"
env | sort > "{capture_browser_env}"
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
        ["bash", str(sandbox_root / "ai.sh"), "--browser-mode", browser_mode],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    assert (
        capture_browser_args.read_text(encoding="utf-8").strip()
        == f"--devtools --browser-mode {browser_mode}"
    )
    captured_browser_env = parse_env_snapshot(
        capture_browser_env.read_text(encoding="utf-8")
    )
    assert captured_browser_env.get("DEVTOOLS_HEADLESS") == expected_headless


def test_ai_sh_rejects_invalid_browser_mode(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = run_script(
        ["bash", str(sandbox_root / "ai.sh"), "--browser-mode", "sideways"],
        cwd=sandbox_root,
        env=script_env(stub_dir, home_dir),
    )

    assert result.returncode != 0
    assert (
        "Invalid value for --browser-mode: sideways. Expected headed or headless."
        in f"{result.stdout}{result.stderr}"
    )


def test_ai_sh_uses_existing_path_env_before_defaults(tmp_path: Path) -> None:
    sandbox_root = build_ai_sandbox(tmp_path)
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

    write_stub_executable(
        stub_dir / "pnpm",
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
