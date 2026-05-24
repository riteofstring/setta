import socket
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType

from tests.start.dev_script_wiring_helpers import (
    repo_root,
    write_stub_executable,
)


def load_collect_llm_artifacts_module() -> ModuleType:
    script_path = repo_root() / "scripts" / "chrome_repro_collect_llm_artifacts.py"
    spec = spec_from_file_location(
        "chrome_repro_collect_llm_artifacts_script", script_path
    )
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_chrome_repro_collector_module() -> ModuleType:
    script_path = repo_root() / "scripts" / "chrome_repro_collector.py"
    spec = spec_from_file_location("chrome_repro_collector_script", script_path)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pick_free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_http_ok(url: str, timeout_seconds: float = 10.0) -> None:
    deadline = time.time() + timeout_seconds
    last_error: str | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if 200 <= getattr(response, "status", 200) < 300:
                    return
        except Exception as exc:  # pragma: no cover - exercised in script tests
            last_error = str(exc)
        time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for {url}: {last_error}")


def start_ok_server() -> tuple[ThreadingHTTPServer, threading.Thread, str]:
    class OkHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            body = b"ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format: str, *_args: object) -> None:
            return

    port = pick_free_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), OkHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread, f"http://127.0.0.1:{port}"


def build_record_chrome_sandbox(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    root = repo_root()
    sandbox_root = tmp_path / "record_chrome_sandbox"
    scripts_dir = sandbox_root / "scripts"
    extension_src = root / "scripts" / "chrome-repro-recorder-extension"
    extension_dst = scripts_dir / "chrome-repro-recorder-extension"
    lib_dir = scripts_dir / "lib"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    lib_dir.mkdir(parents=True, exist_ok=True)
    extension_dst.mkdir(parents=True, exist_ok=True)

    for relative_path in [
        Path("scripts/latest-chrome-recording.sh"),
        Path("scripts/record-chrome-repro.sh"),
        Path("scripts/chrome_repro_collector.py"),
        Path("scripts/chrome_repro_collect_llm_artifacts.py"),
        Path("scripts/lib/setta_cli_command.sh"),
    ]:
        src = root / relative_path
        dst = sandbox_root / relative_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        if src.suffix == ".sh" or src.name.endswith(".py"):
            dst.chmod(0o755)

    for file_path in extension_src.iterdir():
        target_path = extension_dst / file_path.name
        target_path.write_text(file_path.read_text(encoding="utf-8"), encoding="utf-8")

    reset_capture_args = sandbox_root / "reset_args.txt"
    reset_capture_env = sandbox_root / "reset_env.txt"
    dev_instance_env = sandbox_root / "dev_instance_env.txt"
    write_stub_executable(
        scripts_dir / "reset-setta-state.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{reset_capture_env}"
printf '%s' "$*" > "{reset_capture_args}"
""",
    )
    write_stub_executable(
        scripts_dir / "run-dev-instance.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{dev_instance_env}"
sleep 60
""",
    )

    return sandbox_root, reset_capture_args, reset_capture_env, dev_instance_env
