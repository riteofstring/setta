import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _system_bash() -> str:
    system_bash = Path("/bin/bash")
    if system_bash.exists():
        return str(system_bash)
    return "bash"


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def test_stop_browser_mcp_falls_back_to_profile_scan_when_pid_file_is_stale(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "stop-browser-mcp.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    mcp_run_dir = tmp_path / "mcp-run"
    profile_dir = mcp_run_dir / "devtools-profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    pid_file = mcp_run_dir / "devtools.pid"
    pid_file.write_text("1111\n", encoding="utf-8")
    _write_executable(
        stub_dir / "ps",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$#" -ge 1 && "$1" == "-ax" ]]; then
  printf '2222 /Applications/Google Chrome --user-data-dir={profile_dir} --remote-debugging-port=9298\\n'
  exit 0
fi
exit 1
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["MCP_RUN_DIR"] = str(mcp_run_dir)
    env["PROFILE_DIR"] = str(profile_dir)

    result = subprocess.run(
        [_system_bash(), str(script_path), "--devtools"],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "devtools Chrome not running (pid 1111)." in result.stdout
    assert f"Stopped devtools Chrome (profile {profile_dir})." in result.stdout
    assert not pid_file.exists()
