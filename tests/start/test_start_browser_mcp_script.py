import base64
import http.server
import json
import os
import socketserver
import subprocess
import threading
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _read_nul_separated_args(path: Path) -> list[str]:
    payload = path.read_bytes()
    return [part.decode("utf-8") for part in payload.split(b"\0") if part]


def _build_browser_mcp_sandbox(tmp_path: Path) -> Path:
    repo_root = _repo_root()
    sandbox_root = tmp_path / "browser_mcp_sandbox"
    scripts_dir = sandbox_root / "scripts"
    lib_dir = scripts_dir / "lib"
    cmd_dir = sandbox_root / "cmd" / "setta"
    lib_dir.mkdir(parents=True, exist_ok=True)
    cmd_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in (
        "scripts/start-browser-mcp.sh",
        "scripts/bootstrap-url.sh",
        "scripts/lib/setta_cli_command.sh",
    ):
        src = repo_root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)

    (sandbox_root / "go.mod").write_text("module sandbox\n", encoding="utf-8")
    (cmd_dir / "main.go").write_text("package main\n", encoding="utf-8")

    return sandbox_root


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
    env["MCP_BASE_DIR"] = str(tmp_path / "mcp")

    # Multi-worktree launches rely on a fresh app process so args are honored.
    result = subprocess.run(
        ["bash", str(script_path), "--devtools"],
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


def test_bootstrap_url_uses_source_checkout_cli_when_setta_not_on_path(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_browser_mcp_sandbox(tmp_path)
    capture_args_path = tmp_path / "go_args.bin"
    bootstrap_url = "http://127.0.0.1:8123/__setta__/bootstrap#token=test-token"
    status_payload = base64.b64encode(
        json.dumps({"bootstrapUrlFragment": bootstrap_url}).encode("utf-8")
    ).decode("ascii")

    _write_executable(
        sandbox_root / "scripts" / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{capture_args_path}"
printf '__SETTA_JSON_B64__{status_payload}'
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "scripts" / "bootstrap-url.sh")],
        cwd=sandbox_root,
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == bootstrap_url
    go_args = _read_nul_separated_args(capture_args_path)
    assert go_args[:5] == ["run", "./cmd/setta", "status", "--connect-info", "--latest"]
    assert "--json" in go_args


def test_start_browser_mcp_uses_source_checkout_cli_when_setta_not_on_path(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_browser_mcp_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    capture_args_path = tmp_path / "go_args.bin"

    class _Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, _format: str, *_args: object) -> None:
            return None

        def do_GET(self) -> None:  # noqa: N802
            if self.path.startswith("/__setta__/bootstrap"):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")
                return
            if self.path == "/json/list":
                payload = json.dumps([]).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            self.send_response(404)
            self.end_headers()

        def do_PUT(self) -> None:  # noqa: N802
            if self.path.startswith("/json/new?"):
                payload = json.dumps({"id": "page-1"}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            self.send_response(404)
            self.end_headers()

    with socketserver.TCPServer(("127.0.0.1", 0), _Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        server_port = server.server_address[1]
        bootstrap_url = (
            f"http://127.0.0.1:{server_port}/__setta__/bootstrap#token=test-token"
        )
        status_payload = base64.b64encode(
            json.dumps({"bootstrapUrlFragment": bootstrap_url}).encode("utf-8")
        ).decode("ascii")

        _write_executable(
            sandbox_root / "scripts" / "go.sh",
            f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "{capture_args_path}"
printf '__SETTA_JSON_B64__{status_payload}'
""",
        )
        _write_executable(
            stub_dir / "chrome",
            """#!/usr/bin/env bash
set -euo pipefail
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
        env["CHROME_BIN"] = str(stub_dir / "chrome")
        env["DEBUG_PORT"] = str(server_port)
        env["BOOTSTRAP_WAIT_SECONDS"] = "2"
        env["MCP_BASE_DIR"] = str(tmp_path / "mcp")
        env["OSTYPE"] = "linux-gnu"

        result = subprocess.run(
            ["bash", str(sandbox_root / "scripts" / "start-browser-mcp.sh"), "--devtools"],
            cwd=sandbox_root,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        server.shutdown()
        thread.join(timeout=5)

    assert result.returncode == 0, result.stderr
    assert "Opening Setta bootstrap URL in devtools Chrome." in result.stdout
    go_args = _read_nul_separated_args(capture_args_path)
    assert go_args[:5] == ["run", "./cmd/setta", "status", "--connect-info", "--latest"]
    assert "--workspace" in go_args
    assert str(sandbox_root) in go_args
