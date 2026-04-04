import os
import signal
import subprocess
import time
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


def _read_nul_separated_args(path: Path) -> list[str]:
    payload = path.read_bytes()
    return [part.decode("utf-8") for part in payload.split(b"\0") if part]


def _wait_for_file(path: Path, timeout_seconds: float = 2.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if path.exists():
            return
        time.sleep(0.05)
    raise FileNotFoundError(path)


def test_start_browser_mcp_uses_new_macos_instance_for_devtools_launch(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "start-browser-mcp.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    open_args_path = tmp_path / "open_args.bin"
    _write_executable(
        stub_dir / "open",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{open_args_path}"
""",
    )
    _write_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["OSTYPE"] = "darwin23"
    env["CHROME_BIN"] = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    env["DEBUG_PORT"] = "9555"
    env["BOOTSTRAP_ENABLED"] = "0"
    env["DEVTOOLS_HEADLESS"] = "0"
    env["MCP_BASE_DIR"] = str(tmp_path / "mcp")

    # Multi-worktree launches rely on a fresh app process so args are honored.
    result = subprocess.run(
        [_system_bash(), str(script_path), "--devtools"],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    open_args = _read_nul_separated_args(open_args_path)
    assert "-g" in open_args
    assert "-n" in open_args
    assert "-a" in open_args
    assert "--remote-debugging-port=9555" in open_args


def test_start_browser_mcp_uses_headless_binary_launch_when_requested(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "start-browser-mcp.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    chrome_args_path = tmp_path / "chrome_args.bin"
    open_args_path = tmp_path / "open_args.bin"
    chrome_bin = tmp_path / "Google Chrome"
    _write_executable(
        chrome_bin,
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{chrome_args_path}"
""",
    )
    _write_executable(
        stub_dir / "open",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{open_args_path}"
""",
    )
    _write_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["OSTYPE"] = "darwin23"
    env["CHROME_BIN"] = str(chrome_bin)
    env["DEBUG_PORT"] = "9666"
    env["BOOTSTRAP_ENABLED"] = "0"
    env["MCP_BASE_DIR"] = str(tmp_path / "mcp")

    result = subprocess.run(
        [
            _system_bash(),
            str(script_path),
            "--devtools",
            "--browser-mode",
            "headless",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    _wait_for_file(chrome_args_path)
    chrome_args = _read_nul_separated_args(chrome_args_path)
    assert "--headless" in chrome_args
    assert "--remote-debugging-port=9666" in chrome_args
    assert "about:blank" in chrome_args
    assert not open_args_path.exists()


def test_start_browser_mcp_keeps_headless_browser_alive_after_launcher_exit(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "start-browser-mcp.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    chrome_pid_path = tmp_path / "chrome_pid.txt"
    chrome_bin = tmp_path / "Google Chrome"
    _write_executable(
        chrome_bin,
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s' "$$" > "{chrome_pid_path}"
sleep 5
""",
    )
    _write_executable(
        stub_dir / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
exit 1
""",
    )

    mcp_run_dir = tmp_path / "mcp-run"
    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["OSTYPE"] = "darwin23"
    env["CHROME_BIN"] = str(chrome_bin)
    env["DEBUG_PORT"] = "9667"
    env["BOOTSTRAP_ENABLED"] = "0"
    env["MCP_RUN_DIR"] = str(mcp_run_dir)

    result = subprocess.run(
        [
            _system_bash(),
            str(script_path),
            "--devtools",
            "--browser-mode",
            "headless",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    _wait_for_file(chrome_pid_path)
    pid_file = mcp_run_dir / "devtools.pid"
    _wait_for_file(pid_file)
    launched_pid = int(pid_file.read_text(encoding="utf-8").strip())
    chrome_pid = int(chrome_pid_path.read_text(encoding="utf-8").strip())
    assert launched_pid == chrome_pid
    os.kill(launched_pid, 0)
    os.kill(launched_pid, signal.SIGTERM)
