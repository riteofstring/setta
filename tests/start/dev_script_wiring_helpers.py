import os
import subprocess
from pathlib import Path

import pytest


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def ensure_dev_dependencies_or_skip() -> None:
    root = repo_root()
    if not (root / ".venv" / "bin" / "activate").exists():
        pytest.skip("Dev script wiring tests require repo .venv activation script.")
    if not (root / "frontend" / "node_modules").exists():
        pytest.skip("Dev script wiring tests require frontend/node_modules.")


def write_stub_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def copy_script_libs(scripts_dir: Path, *lib_names: str) -> None:
    root = repo_root()
    lib_dir = scripts_dir / "lib"
    lib_dir.mkdir(parents=True, exist_ok=True)
    for lib_name in lib_names:
        src = root / "scripts" / "lib" / lib_name
        dst = lib_dir / lib_name
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)


def build_aireset_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "aireset_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    copy_script_libs(
        scripts_dir,
        "setta_path_flags.sh",
        "setta_port_selection.sh",
    )

    sandbox_aireset = sandbox_root / "aireset.sh"
    sandbox_aireset.write_text(
        (root / "aireset.sh").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    sandbox_aireset.chmod(0o755)

    reset_capture_env = sandbox_root / "reset_env.txt"
    reset_capture_args = sandbox_root / "reset_args.txt"
    ai_capture_env = sandbox_root / "ai_env.txt"
    ai_capture_args = sandbox_root / "ai_args.txt"
    kill_capture_env = sandbox_root / "kill_env.txt"
    kill_capture_args = sandbox_root / "kill_args.txt"

    write_stub_executable(
        scripts_dir / "reset-setta-state.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{reset_capture_env}"
echo "$*" > "{reset_capture_args}"
""",
    )
    write_stub_executable(
        sandbox_root / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{ai_capture_env}"
echo "$*" > "{ai_capture_args}"
""",
    )
    write_stub_executable(
        scripts_dir / "kill-setta.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{kill_capture_env}"
echo "$*" > "{kill_capture_args}"
""",
    )

    return sandbox_root


def build_run_dev_instance_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "run_dev_instance_sandbox"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in ("scripts/run-dev-instance.sh", "start.sh", "reset.sh"):
        src = root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)
    copy_script_libs(
        scripts_dir,
        "setta_path_flags.sh",
        "setta_port_selection.sh",
    )

    activate = sandbox_root / ".venv" / "bin" / "activate"
    activate.parent.mkdir(parents=True, exist_ok=True)
    activate.write_text("export VIRTUAL_ENV='sandbox-venv'\n", encoding="utf-8")
    (sandbox_root / "frontend" / "node_modules").mkdir(parents=True, exist_ok=True)

    return sandbox_root


def build_ai_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "ai_sandbox"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in ("ai.sh", "scripts/ai.sh"):
        src = root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)
    copy_script_libs(
        scripts_dir,
        "setta_path_flags.sh",
        "setta_port_selection.sh",
    )

    activate = sandbox_root / ".venv" / "bin" / "activate"
    activate.parent.mkdir(parents=True, exist_ok=True)
    activate.write_text("export VIRTUAL_ENV='sandbox-venv'\n", encoding="utf-8")
    (sandbox_root / "frontend" / "node_modules").mkdir(parents=True, exist_ok=True)

    return sandbox_root


def script_env(stub_dir: Path, home_dir: Path) -> dict[str, str]:
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


def parse_env_snapshot(snapshot: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for line in snapshot.strip().splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        parsed[key] = value
    return parsed


def run_script(
    cmd: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
