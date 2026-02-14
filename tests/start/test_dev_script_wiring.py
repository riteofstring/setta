import json
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
    helper_src = repo_root / "scripts" / "lib" / "setta_path_flags.sh"
    helper_dst = scripts_dir / "lib" / "setta_path_flags.sh"
    helper_dst.parent.mkdir(parents=True, exist_ok=True)
    helper_dst.write_text(helper_src.read_text(encoding="utf-8"), encoding="utf-8")
    helper_dst.chmod(0o755)

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


def _build_run_dev_instance_sandbox(tmp_path: Path) -> Path:
    repo_root = _repo_root()
    sandbox_root = tmp_path / "run_dev_instance_sandbox"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in ("scripts/run-dev-instance.sh", "start.sh", "reset.sh"):
        src = repo_root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)
    helper_src = repo_root / "scripts" / "lib" / "setta_path_flags.sh"
    helper_dst = scripts_dir / "lib" / "setta_path_flags.sh"
    helper_dst.parent.mkdir(parents=True, exist_ok=True)
    helper_dst.write_text(helper_src.read_text(encoding="utf-8"), encoding="utf-8")
    helper_dst.chmod(0o755)

    activate = sandbox_root / ".venv" / "bin" / "activate"
    activate.parent.mkdir(parents=True, exist_ok=True)
    activate.write_text("export VIRTUAL_ENV='sandbox-venv'\n", encoding="utf-8")
    (sandbox_root / "frontend" / "node_modules").mkdir(parents=True, exist_ok=True)

    return sandbox_root


def _build_ai_sandbox(tmp_path: Path) -> Path:
    repo_root = _repo_root()
    sandbox_root = tmp_path / "ai_sandbox"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in ("ai.sh", "scripts/ai.sh"):
        src = repo_root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)
    helper_src = repo_root / "scripts" / "lib" / "setta_path_flags.sh"
    helper_dst = scripts_dir / "lib" / "setta_path_flags.sh"
    helper_dst.parent.mkdir(parents=True, exist_ok=True)
    helper_dst.write_text(helper_src.read_text(encoding="utf-8"), encoding="utf-8")
    helper_dst.chmod(0o755)

    activate = sandbox_root / ".venv" / "bin" / "activate"
    activate.parent.mkdir(parents=True, exist_ok=True)
    activate.write_text("export VIRTUAL_ENV='sandbox-venv'\n", encoding="utf-8")
    (sandbox_root / "frontend" / "node_modules").mkdir(parents=True, exist_ok=True)

    return sandbox_root


def _script_env(stub_dir: Path, home_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    for key in (
        "SETTA_HOME",
        "SETTA_PROFILE_LOOKUP_HOME",
        "SETTA_PROFILE",
        "SETTA_FILES_ROOT",
        "SETTA_FILES_LOCATION",
        "SETTA_RUNTIME_ROOT",
    ):
        env.pop(key, None)
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["HOME"] = str(home_dir)
    return env


def _parse_env_snapshot(snapshot: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for line in snapshot.strip().splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        parsed[key] = value
    return parsed


def test_frontend_reset_script_uses_workspace_without_hardcoded_root() -> None:
    repo_root = _repo_root()
    package_json = json.loads((repo_root / "frontend" / "package.json").read_text())
    reset_script = package_json["scripts"]["reset"]
    assert "--workspace" in reset_script
    assert "--setta-files-root" not in reset_script


def test_backend_start_uses_shared_setta_path_flag_parser() -> None:
    repo_root = _repo_root()
    backend_start = (repo_root / "frontend" / "backendStart.sh").read_text(encoding="utf-8")
    assert "scripts/lib/setta_path_flags.sh" in backend_start
    assert "setta_path_flags_try_parse" in backend_start


def test_ai_sh_reports_missing_value_for_profile(tmp_path: Path) -> None:
    sandbox_root = _build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        ["bash", str(sandbox_root / "ai.sh"), "--profile"],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Missing value for --profile" in f"{result.stdout}{result.stderr}"


def test_ai_sh_rejects_flag_like_profile_value(tmp_path: Path) -> None:
    sandbox_root = _build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    # A flag token after --profile should be rejected as a missing value.
    result = subprocess.run(
        ["bash", str(sandbox_root / "ai.sh"), "--profile", "--reload"],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Missing value for --profile" in f"{result.stdout}{result.stderr}"


def test_ai_sh_rejects_conflicting_setta_files_root_and_location(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_ai_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "ai.sh"),
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--setta-files-location",
            "local",
        ],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location."
        in f"{result.stdout}{result.stderr}"
    )


def test_run_dev_instance_reports_missing_value_for_backend_port(tmp_path: Path) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--backend-port",
        ],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Missing value for --backend-port" in f"{result.stdout}{result.stderr}"


def test_run_dev_instance_rejects_flag_like_backend_port_value(tmp_path: Path) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--backend-port",
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Missing value for --backend-port" in f"{result.stdout}{result.stderr}"


def test_run_dev_instance_rejects_conflicting_setta_files_root_and_location(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--setta-files-location",
            "local",
        ],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location."
        in f"{result.stdout}{result.stderr}"
    )


def test_run_dev_instance_rejects_flag_like_profile_value(tmp_path: Path) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--profile",
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Missing value for --profile" in f"{result.stdout}{result.stderr}"


def test_run_dev_instance_defaults_to_dev_home_and_dev_state_root(tmp_path: Path) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
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
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = _parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_HOME") != str(home_dir / ".setta")
    assert captured_env.get("SETTA_FILES_ROOT") != str(sandbox_root / "setta_files")
    assert "SETTA_FILES_LOCATION" not in captured_env


def test_run_dev_instance_uses_existing_path_env_before_defaults(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
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
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = _parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(tmp_path / "previous_home")
    assert captured_env.get("SETTA_FILES_ROOT") == str(tmp_path / "previous_state")
    assert "SETTA_FILES_LOCATION" not in captured_env
    assert captured_env.get("SETTA_PROFILE") == "built"
    assert captured_env.get("SETTA_RUNTIME_ROOT") == str(tmp_path / "previous_runtime")


def test_run_dev_instance_exports_profile_and_setta_files_root(tmp_path: Path) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
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
            str(sandbox_root / "scripts" / "run-dev-instance.sh"),
            "--profile",
            "dev",
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--mode",
            "reset",
        ],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"

    captured_env = _parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_PROFILE") == "dev"
    assert captured_env.get("SETTA_FILES_ROOT") == str(tmp_path / "state_root")


def test_run_dev_instance_accepts_equals_style_path_flags(tmp_path: Path) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
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

    setta_home = tmp_path / ".setta-development"
    setta_files_root = tmp_path / "state" / "setta_files_dev"
    runtime_root = setta_files_root / "runtime_custom"
    result = subprocess.run(
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
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"
    captured_env = _parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_PROFILE") == "dev"
    assert captured_env.get("SETTA_HOME") == str(setta_home)
    assert captured_env.get("SETTA_FILES_ROOT") == str(setta_files_root)
    assert captured_env.get("SETTA_RUNTIME_ROOT") == str(runtime_root)


def test_start_sh_defaults_to_dev_home_and_dev_state_root(tmp_path: Path) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
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
        ["bash", str(sandbox_root / "start.sh")],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    captured_env = _parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_HOME") != str(home_dir / ".setta")
    assert captured_env.get("SETTA_FILES_ROOT") != str(sandbox_root / "setta_files")
    assert "SETTA_FILES_LOCATION" not in captured_env


def test_reset_sh_defaults_to_dev_home_and_dev_state_root(tmp_path: Path) -> None:
    sandbox_root = _build_run_dev_instance_sandbox(tmp_path)
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
        ["bash", str(sandbox_root / "reset.sh")],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "reset"
    captured_env = _parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_HOME") != str(home_dir / ".setta")
    assert captured_env.get("SETTA_FILES_ROOT") != str(sandbox_root / "setta_files")
    assert "SETTA_FILES_LOCATION" not in captured_env


def test_ai_sh_defaults_to_dev_home_and_dev_state_root(tmp_path: Path) -> None:
    sandbox_root = _build_ai_sandbox(tmp_path)
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
    _write_stub_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )
    _write_stub_executable(
        sandbox_root / "scripts" / "start-browser-mcp.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )
    _write_stub_executable(
        sandbox_root / "scripts" / "stop-browser-mcp.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=_script_env(stub_dir, home_dir),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    captured_env = _parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert captured_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert captured_env.get("SETTA_HOME") != str(home_dir / ".setta")
    assert captured_env.get("SETTA_FILES_ROOT") != str(sandbox_root / "setta_files")
    assert "SETTA_FILES_LOCATION" not in captured_env


def test_ai_sh_uses_existing_path_env_before_defaults(tmp_path: Path) -> None:
    sandbox_root = _build_ai_sandbox(tmp_path)
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
    _write_stub_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )
    _write_stub_executable(
        sandbox_root / "scripts" / "start-browser-mcp.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )
    _write_stub_executable(
        sandbox_root / "scripts" / "stop-browser-mcp.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    env = _script_env(stub_dir, home_dir)
    env["SETTA_HOME"] = str(tmp_path / "previous_home")
    env["SETTA_FILES_ROOT"] = str(tmp_path / "previous_state")
    env["SETTA_FILES_LOCATION"] = "global"
    env["SETTA_PROFILE"] = "built"
    env["SETTA_RUNTIME_ROOT"] = str(tmp_path / "previous_runtime")

    result = subprocess.run(
        ["bash", str(sandbox_root / "ai.sh")],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cmd.read_text(encoding="utf-8").strip() == "start"
    captured_env = _parse_env_snapshot(capture_env.read_text(encoding="utf-8"))
    assert captured_env.get("SETTA_HOME") == str(tmp_path / "previous_home")
    assert captured_env.get("SETTA_FILES_ROOT") == str(tmp_path / "previous_state")
    assert "SETTA_FILES_LOCATION" not in captured_env
    assert captured_env.get("SETTA_PROFILE") == "built"
    assert captured_env.get("SETTA_RUNTIME_ROOT") == str(tmp_path / "previous_runtime")


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


def test_backend_start_cli_location_overrides_env_root(tmp_path: Path) -> None:
    _ensure_dev_dependencies_or_skip()
    repo_root = _repo_root()
    capture_args = tmp_path / "setta_args.txt"
    setta_stub = tmp_path / "setta-stub.sh"

    _write_stub_executable(
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

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "frontend" / "backendStart.sh"),
            "--setta-files-location",
            "local",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    args = capture_args.read_text(encoding="utf-8")
    assert "--setta-files-location local" in args
    assert f"--setta-files-root {tmp_path / 'env_state_root'}" not in args


def test_backend_start_cli_root_overrides_env_location(tmp_path: Path) -> None:
    _ensure_dev_dependencies_or_skip()
    repo_root = _repo_root()
    capture_args = tmp_path / "setta_args.txt"
    setta_stub = tmp_path / "setta-stub.sh"

    _write_stub_executable(
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

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "frontend" / "backendStart.sh"),
            "--setta-files-root",
            str(cli_root),
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    args = capture_args.read_text(encoding="utf-8")
    assert f"--setta-files-root {cli_root}" in args
    assert "--setta-files-location global" not in args


def test_backend_start_rejects_conflicting_cli_root_and_location(tmp_path: Path) -> None:
    _ensure_dev_dependencies_or_skip()
    repo_root = _repo_root()
    env = os.environ.copy()
    env["SETTA_BIN"] = str(tmp_path / "unused-setta-bin")
    env["SETTA_BACKEND_LOG_FILE"] = str(tmp_path / "backend.log")

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "frontend" / "backendStart.sh"),
            "--setta-files-root",
            str(tmp_path / "state_root"),
            "--setta-files-location",
            "local",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location."
        in f"{result.stdout}{result.stderr}"
    )


def test_aireset_uses_existing_path_env_before_defaults(tmp_path: Path) -> None:
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


def test_aireset_accepts_equals_style_path_flags(tmp_path: Path) -> None:
    sandbox_root = _build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = _script_env(tmp_path / "unused-bin", home_dir)
    setta_home = tmp_path / ".setta-development"
    setta_files_root = tmp_path / "state" / "setta_files_dev"
    runtime_root = setta_files_root / "runtime_dev"

    result = subprocess.run(
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
        check=False,
        capture_output=True,
        text=True,
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

    assert f"SETTA_PROFILE=dev" in reset_env
    assert f"SETTA_HOME={setta_home}" in reset_env
    assert f"SETTA_FILES_ROOT={setta_files_root}" in reset_env
    assert f"SETTA_RUNTIME_ROOT={runtime_root}" in reset_env
    assert f"SETTA_PROFILE=dev" in ai_env
    assert f"SETTA_HOME={setta_home}" in ai_env
    assert f"SETTA_FILES_ROOT={setta_files_root}" in ai_env
    assert f"SETTA_RUNTIME_ROOT={runtime_root}" in ai_env


def test_aireset_rejects_conflicting_setta_files_root_and_location(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = _script_env(tmp_path / "unused-bin", home_dir)

    result = subprocess.run(
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
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location."
        in f"{result.stdout}{result.stderr}"
    )
    assert not (sandbox_root / "reset_env.txt").exists()
    assert not (sandbox_root / "ai_env.txt").exists()


def test_aireset_rejects_force_and_yes(tmp_path: Path) -> None:
    sandbox_root = _build_aireset_sandbox(tmp_path)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    env = _script_env(tmp_path / "unused-bin", home_dir)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "aireset.sh"),
            "--force",
            "--yes",
            "--reload",
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    combined = f"{result.stdout}{result.stderr}"
    assert "Unsupported argument for aireset.sh: --force" in combined
