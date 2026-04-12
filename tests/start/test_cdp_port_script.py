import json
import os
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def test_cdp_port_json_uses_virtualenv_python_when_path_python_is_broken(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "cdp-port.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    _write_executable(
        stub_dir / "python",
        """#!/usr/bin/env bash
set -euo pipefail
exit 127
""",
    )

    fake_venv = tmp_path / "venv"
    fake_venv_bin = fake_venv / "bin"
    fake_venv_bin.mkdir(parents=True, exist_ok=True)
    (fake_venv_bin / "python").symlink_to(Path(sys.executable))

    mcp_run_dir = tmp_path / "mcp-run"
    mcp_run_dir.mkdir(parents=True, exist_ok=True)
    runtime_metadata_path = mcp_run_dir / "devtools-runtime.json"
    runtime_metadata_path.write_text(
        json.dumps(
            {
                "debugPort": 9777,
                "mcpRunDir": str(mcp_run_dir),
                "pid": os.getpid(),
                "profileDir": str(mcp_run_dir / "devtools-profile"),
                "workspaceRoot": str(repo_root),
            }
        ),
        encoding="utf-8",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["VIRTUAL_ENV"] = str(fake_venv)
    env["MCP_RUN_DIR"] = str(mcp_run_dir)

    result = subprocess.run(
        ["bash", str(script_path), "--json"],
        cwd=repo_root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["debugPort"] == 9777
    assert payload["source"] == "runtime_metadata"
    assert payload["pid"] == os.getpid()
    assert payload["mcpRunDir"] == str(mcp_run_dir)
