import os
import subprocess
import time
from pathlib import Path
import signal
import sys


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _read_nul_separated_args(path: Path) -> list[str]:
    payload = path.read_bytes()
    return [part.decode("utf-8") for part in payload.split(b"\0") if part]


def _wait_for_path(path: Path, timeout_seconds: float = 2.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if path.exists():
            return
        time.sleep(0.05)
    raise AssertionError(f"Timed out waiting for {path}")


def _terminate_pid_file(pid_file: Path) -> None:
    if not pid_file.exists():
        return
    pid = int(pid_file.read_text(encoding="utf-8").strip())
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.05)
    os.kill(pid, signal.SIGKILL)


def test_start_browser_mcp_uses_new_macos_instance_for_devtools_launch(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "start-browser-mcp.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    open_args_path = tmp_path / "open_args.bin"
    open_server_pid_path = tmp_path / "open_server.pid"
    _write_executable(
        stub_dir / "open",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{open_args_path}"
port=""
for arg in "$@"; do
  case "$arg" in
    --remote-debugging-port=*)
      port="${{arg#*=}}"
      ;;
  esac
done
if [[ -n "$port" ]]; then
  "{sys.executable}" - "$port" "$@" <<'PY' >/dev/null 2>&1 &
import http.server
import json
import socketserver
import sys

port = int(sys.argv[1])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/json/version":
            self.send_response(404)
            self.end_headers()
            return
        payload = {{
            "Browser": "Chrome/test",
            "webSocketDebuggerUrl": f"ws://127.0.0.1:{{port}}/devtools/browser/test",
        }}
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return

with socketserver.TCPServer(("127.0.0.1", port), Handler) as server:
    server.serve_forever()
PY
  printf '%s\\n' "$!" > "{open_server_pid_path}"
fi
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
    env["DEVTOOLS_OPEN_WITH_CHROME"] = "1"
    env["MCP_BASE_DIR"] = str(tmp_path / "mcp")

    # Multi-worktree launches rely on a fresh app process so args are honored.
    try:
        result = subprocess.run(
            ["bash", str(script_path), "--devtools"],
            cwd=repo_root,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, result.stderr
        _wait_for_path(open_args_path)
        open_args = _read_nul_separated_args(open_args_path)
        assert "-g" in open_args
        assert "-n" in open_args
        assert "-a" in open_args
        assert "--remote-debugging-port=9555" in open_args
    finally:
        _terminate_pid_file(open_server_pid_path)


def test_start_browser_mcp_uses_headless_chrome_binary_when_requested(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "start-browser-mcp.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    chrome_args_path = tmp_path / "chrome_args.bin"
    open_args_path = tmp_path / "open_args.bin"
    _write_executable(
        stub_dir / "chrome",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{chrome_args_path}"
port=""
for arg in "$@"; do
  case "$arg" in
    --remote-debugging-port=*)
      port="${{arg#*=}}"
      ;;
  esac
done
if [[ -z "$port" ]]; then
  exit 1
fi
exec "{sys.executable}" - "$port" "$@" <<'PY'
import http.server
import json
import socketserver
import sys

port = int(sys.argv[1])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/json/version":
            self.send_response(404)
            self.end_headers()
            return
        payload = {{
            "Browser": "Chrome/test",
            "webSocketDebuggerUrl": f"ws://127.0.0.1:{{port}}/devtools/browser/test",
        }}
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return

with socketserver.TCPServer(("127.0.0.1", port), Handler) as server:
    server.serve_forever()
PY
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
    env["CHROME_BIN"] = str(stub_dir / "chrome")
    env["DEBUG_PORT"] = "9666"
    env["BOOTSTRAP_ENABLED"] = "0"
    env["DEVTOOLS_HEADLESS"] = "1"
    env["MCP_BASE_DIR"] = str(tmp_path / "mcp")

    try:
        result = subprocess.run(
            ["bash", str(script_path), "--devtools"],
            cwd=repo_root,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, result.stderr
        _wait_for_path(chrome_args_path)
        chrome_args = _read_nul_separated_args(chrome_args_path)
        assert "--headless=new" in chrome_args
        assert "--remote-debugging-port=9666" in chrome_args
        assert not open_args_path.exists()
    finally:
        pid_files = list((tmp_path / "mcp").rglob("devtools.pid"))
        for pid_file in pid_files:
            _terminate_pid_file(pid_file)


def test_start_browser_mcp_fails_when_devtools_endpoint_never_appears(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "start-browser-mcp.sh"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    chrome_args_path = tmp_path / "chrome_args.bin"
    _write_executable(
        stub_dir / "chrome",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{chrome_args_path}"
exit 0
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
    env["CHROME_BIN"] = str(stub_dir / "chrome")
    env["DEBUG_PORT"] = "9777"
    env["BOOTSTRAP_ENABLED"] = "0"
    env["DEVTOOLS_HEADLESS"] = "1"
    env["START_BROWSER_MCP_CONNECT_TIMEOUT_SECONDS"] = "0"
    env["MCP_BASE_DIR"] = str(tmp_path / "mcp")

    result = subprocess.run(
        ["bash", str(script_path), "--devtools"],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Timed out waiting for Chrome DevTools endpoint on port 9777." in result.stderr
    pid_files = list((tmp_path / "mcp").rglob("devtools.pid"))
    assert not pid_files
