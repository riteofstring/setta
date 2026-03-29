import os
import socket
import subprocess
from pathlib import Path


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def test_chrome_devtools_mcp_fails_fast_when_browser_url_is_dead(
    tmp_path: Path,
) -> None:
    sandbox_root = tmp_path / "chrome_devtools_mcp_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    repo_root = Path(__file__).resolve().parents[2]
    for script_name in ("chrome-devtools-mcp.sh", "cdp-port.sh"):
        repo_script = repo_root / "scripts" / script_name
        sandbox_script = scripts_dir / script_name
        sandbox_script.write_text(
            repo_script.read_text(encoding="utf-8"), encoding="utf-8"
        )
        sandbox_script.chmod(0o755)

    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    npx_args_path = tmp_path / "npx_args.txt"
    _write_executable(
        stub_dir / "npx",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "{npx_args_path}"
""",
    )
    _write_executable(
        scripts_dir / "cdp-port.sh",
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' 9555
""",
    )

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        dead_port = sock.getsockname()[1]

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["BROWSER_URL"] = f"http://127.0.0.1:{dead_port}"
    env["CHROME_DEVTOOLS_MCP_CONNECT_TIMEOUT_SECONDS"] = "0"

    result = subprocess.run(
        ["bash", str(scripts_dir / "chrome-devtools-mcp.sh")],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert (
        f"chrome-devtools-mcp could not reach a live browser at http://127.0.0.1:{dead_port}."
        in result.stderr
    )
    assert not npx_args_path.exists()


def test_chrome_devtools_mcp_reports_cdp_port_failure_cleanly(
    tmp_path: Path,
) -> None:
    sandbox_root = tmp_path / "chrome_devtools_mcp_cdp_port_failure_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    repo_root = Path(__file__).resolve().parents[2]
    repo_script = repo_root / "scripts" / "chrome-devtools-mcp.sh"
    sandbox_script = scripts_dir / "chrome-devtools-mcp.sh"
    sandbox_script.write_text(repo_script.read_text(encoding="utf-8"), encoding="utf-8")
    sandbox_script.chmod(0o755)

    _write_executable(
        scripts_dir / "cdp-port.sh",
        """#!/usr/bin/env bash
set -euo pipefail
echo "No live devtools Chrome process found for /tmp/test-worktree." >&2
exit 1
""",
    )

    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    npx_args_path = tmp_path / "npx_args.txt"
    _write_executable(
        stub_dir / "npx",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" > "{npx_args_path}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        ["bash", str(sandbox_script)],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "No live devtools Chrome process found for /tmp/test-worktree." in result.stderr
    assert (
        "chrome-devtools-mcp could not determine a live browser URL for this worktree."
        in result.stderr
    )
    assert "Start or restart the worktree devtools Chrome and retry." in result.stderr
    assert not npx_args_path.exists()
