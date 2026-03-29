import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path
import socket


def _wait_for_port(port: int, timeout_seconds: float = 5.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.2)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.05)
    raise AssertionError(f"Timed out waiting for test server on port {port}")


def test_cdp_port_prefers_newest_matching_browser_process_when_tmpdir_differs(
    tmp_path: Path,
) -> None:
    sandbox_root = tmp_path / "cdp_port_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    script_path = scripts_dir / "cdp-port.sh"
    repo_script = Path(__file__).resolve().parents[2] / "scripts" / "cdp-port.sh"
    script_path.write_text(repo_script.read_text(encoding="utf-8"), encoding="utf-8")
    script_path.chmod(0o755)

    profile_suffix = hashlib.sha256(
        str(sandbox_root).encode("utf-8")
    ).hexdigest()[:12]
    profile_dir = (
        Path("/tmp")
        / "setta-mcp"
        / f"{sandbox_root.name}-{profile_suffix}"
        / "devtools-profile"
    )
    profile_dir.mkdir(parents=True, exist_ok=True)

    older_process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            """
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
        payload = {
            "Browser": "Chrome/test",
            "webSocketDebuggerUrl": f"ws://127.0.0.1:{port}/devtools/browser/test",
        }
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
""",
            "9555",
            f"--user-data-dir={profile_dir}",
            "--remote-debugging-port=9555",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _wait_for_port(9555)
    newer_process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            """
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
        payload = {
            "Browser": "Chrome/test",
            "webSocketDebuggerUrl": f"ws://127.0.0.1:{port}/devtools/browser/test",
        }
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
""",
            "9556",
            f"--user-data-dir={profile_dir}",
            "--remote-debugging-port=9556",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _wait_for_port(9556)

    try:
        env = os.environ.copy()
        env["TMPDIR"] = str(tmp_path / "other-tmp-root")
        env.pop("MCP_BASE_DIR", None)

        result = subprocess.run(
            ["bash", str(script_path)],
            cwd=sandbox_root,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == "9556"
    finally:
        for process in (older_process, newer_process):
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_cdp_port_fails_when_only_stale_pid_state_remains(tmp_path: Path) -> None:
    sandbox_root = tmp_path / "cdp_port_stale_pid_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    script_path = scripts_dir / "cdp-port.sh"
    repo_script = Path(__file__).resolve().parents[2] / "scripts" / "cdp-port.sh"
    script_path.write_text(repo_script.read_text(encoding="utf-8"), encoding="utf-8")
    script_path.chmod(0o755)

    profile_suffix = hashlib.sha256(
        str(sandbox_root).encode("utf-8")
    ).hexdigest()[:12]
    mcp_run_dir = (
        tmp_path
        / "setta-mcp"
        / f"{sandbox_root.name}-{profile_suffix}"
    )
    mcp_run_dir.mkdir(parents=True, exist_ok=True)
    pid_file = mcp_run_dir / "devtools.pid"
    pid_file.write_text("999999\n", encoding="utf-8")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        debug_port = sock.getsockname()[1]

    env = os.environ.copy()
    env["MCP_BASE_DIR"] = str(tmp_path / "setta-mcp")
    env["DEBUG_PORT"] = str(debug_port)

    result = subprocess.run(
        ["bash", str(script_path)],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "No live devtools Chrome process found" in result.stderr
    assert not pid_file.exists()
