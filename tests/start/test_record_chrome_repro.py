import json
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    parse_env_snapshot,
    repo_root,
    run_script,
    script_env,
    write_stub_executable,
)


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


def build_record_chrome_sandbox(tmp_path: Path) -> tuple[Path, Path, Path]:
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
        """#!/usr/bin/env bash
set -euo pipefail
sleep 60
""",
    )

    return sandbox_root, reset_capture_args, reset_capture_env


def test_chrome_repro_collector_writes_recording_json_on_shutdown(tmp_path: Path) -> None:
    root = repo_root()
    artifact_dir = tmp_path / "collector-artifacts"
    port = pick_free_port()
    process = subprocess.Popen(
        [
            sys.executable,
            str(root / "scripts" / "chrome_repro_collector.py"),
            "--artifact-dir",
            str(artifact_dir),
            "--port",
            str(port),
        ],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_http_ok(f"http://127.0.0.1:{port}/health")
        payloads = [
            {"sequenceNumber": 1, "event": {"type": "navigation"}},
            {"sequenceNumber": 2, "event": {"type": "click"}},
        ]
        for payload in payloads:
            request = urllib.request.Request(
                f"http://127.0.0.1:{port}/event",
                method="POST",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=2) as response:
                assert response.status == 200
    finally:
        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 0, stdout + stderr

    recording_payload = json.loads(
        (artifact_dir / "recording.json").read_text(encoding="utf-8")
    )
    session_payload = json.loads(
        (artifact_dir / "session.json").read_text(encoding="utf-8")
    )
    events_lines = (artifact_dir / "events.ndjson").read_text(encoding="utf-8").splitlines()

    assert recording_payload["format"] == "setta.chrome-repro-recorder/v1"
    assert recording_payload["eventCount"] == 2
    assert [event["event"]["type"] for event in recording_payload["events"]] == [
        "navigation",
        "click",
    ]
    assert session_payload["eventCount"] == 2
    assert len(events_lines) == 2


def test_chrome_repro_collector_writes_split_runtime_artifacts(tmp_path: Path) -> None:
    root = repo_root()
    artifact_dir = tmp_path / "collector-artifacts"
    port = pick_free_port()
    process = subprocess.Popen(
        [
            sys.executable,
            str(root / "scripts" / "chrome_repro_collector.py"),
            "--artifact-dir",
            str(artifact_dir),
            "--port",
            str(port),
        ],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_http_ok(f"http://127.0.0.1:{port}/health")
        payloads = [
            {"sequenceNumber": 1, "event": {"type": "console", "level": "error"}},
            {
                "sequenceNumber": 2,
                "event": {"type": "network-response", "status": 500},
            },
            {
                "sequenceNumber": 3,
                "event": {"type": "websocket-message", "direction": "recv"},
            },
            {
                "sequenceNumber": 4,
                "event": {"type": "app-state", "kind": "lsp-diagnostics"},
            },
            {"sequenceNumber": 5, "event": {"type": "click"}},
        ]
        for payload in payloads:
            request = urllib.request.Request(
                f"http://127.0.0.1:{port}/event",
                method="POST",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=2) as response:
                assert response.status == 200
    finally:
        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 0, stdout + stderr

    session_payload = json.loads(
        (artifact_dir / "session.json").read_text(encoding="utf-8")
    )
    console_lines = (artifact_dir / "console.ndjson").read_text(
        encoding="utf-8"
    ).splitlines()
    transport_lines = (artifact_dir / "transport.ndjson").read_text(
        encoding="utf-8"
    ).splitlines()
    app_state_lines = (artifact_dir / "app_state.ndjson").read_text(
        encoding="utf-8"
    ).splitlines()

    assert session_payload["eventCountsByType"] == {
        "app-state": 1,
        "click": 1,
        "console": 1,
        "network-response": 1,
        "websocket-message": 1,
    }
    assert session_payload["consoleEventsFile"].endswith("console.ndjson")
    assert session_payload["transportEventsFile"].endswith("transport.ndjson")
    assert session_payload["appStateEventsFile"].endswith("app_state.ndjson")
    assert [json.loads(line)["event"]["type"] for line in console_lines] == ["console"]
    assert [json.loads(line)["event"]["type"] for line in transport_lines] == [
        "network-response",
        "websocket-message",
    ]
    assert [json.loads(line)["event"]["type"] for line in app_state_lines] == [
        "app-state"
    ]


def test_record_chrome_repro_wrapper_launches_browser_and_writes_artifacts(
    tmp_path: Path,
) -> None:
    sandbox_root, _, _ = build_record_chrome_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir = tmp_path / "recording-output"
    browser_args_file = tmp_path / "browser_args.txt"
    browser_env_file = tmp_path / "browser_env.txt"
    write_stub_executable(
        stub_dir / "chrome",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{browser_env_file}"
printf '%s' "$*" > "{browser_args_file}"
user_data_dir=""
extension_dir=""
for arg in "$@"; do
  case "$arg" in
    --user-data-dir=*)
      user_data_dir="${{arg#--user-data-dir=}}"
      ;;
    --load-extension=*)
      extension_dir="${{arg#--load-extension=}}"
      ;;
  esac
done
mkdir -p "${{user_data_dir}}/Default"
python - "${{user_data_dir}}/Default/Secure Preferences" "${{extension_dir}}" <<'PY'
import json
import sys
from pathlib import Path

prefs_path = Path(sys.argv[1])
payload = {{
    "extensions": {{
        "settings": {{
            "test-extension": {{
                "path": sys.argv[2],
            }}
        }}
    }}
}}
prefs_path.write_text(json.dumps(payload), encoding="utf-8")
PY
""",
    )

    server, thread, bootstrap_base_url = start_ok_server()
    try:
        env = script_env(stub_dir, home_dir)
        env["CHROME_BIN"] = str(stub_dir / "chrome")
        env["SETTA_CHROME_REPRO_SKIP_DEV_START"] = "1"
        env["SETTA_CHROME_REPRO_BOOTSTRAP_URL"] = (
            f"{bootstrap_base_url}/__setta__/bootstrap#token=test-token"
        )
        env.pop("SETTA_WORKSPACE_ROOT", None)
        env.pop("SETTA_PROJECT_URL", None)
        env.pop("SETTA_PROJECT_PATH", None)

        result = run_script(
            [
                "bash",
                str(sandbox_root / "scripts" / "record-chrome-repro.sh"),
                "--artifact-dir",
                str(artifact_dir),
            ],
            cwd=sandbox_root,
            env=env,
        )
    finally:
        server.shutdown()
        thread.join(timeout=5)

    assert result.returncode == 0, result.stderr
    browser_args = browser_args_file.read_text(encoding="utf-8")
    browser_env = parse_env_snapshot(browser_env_file.read_text(encoding="utf-8"))

    assert '--user-data-dir="' not in browser_args
    assert "--user-data-dir=" in browser_args
    assert "--disable-extensions-except=" in browser_args
    assert "--load-extension=" in browser_args
    assert f"{bootstrap_base_url}/__setta__/bootstrap#token=test-token" in browser_args
    assert browser_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert browser_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert browser_env.get("SETTA_WORKSPACE_ROOT") == str(sandbox_root)
    assert browser_env.get("SETTA_PROJECT_PATH") == "/home"

    launcher_payload = json.loads(
        (artifact_dir / "launcher.json").read_text(encoding="utf-8")
    )
    recording_payload = json.loads(
        (artifact_dir / "recording.json").read_text(encoding="utf-8")
    )
    session_payload = json.loads(
        (artifact_dir / "session.json").read_text(encoding="utf-8")
    )
    extension_config = (artifact_dir / "extension" / "config.js").read_text(
        encoding="utf-8"
    )

    assert launcher_payload["artifactDir"] == str(artifact_dir)
    assert launcher_payload["bootstrapUrl"].startswith(bootstrap_base_url)
    assert recording_payload["format"] == "setta.chrome-repro-recorder/v1"
    assert recording_payload["eventCount"] == 0
    assert session_payload["eventCountsByType"] == {}
    assert "collectorBaseUrl" in extension_config
    assert (artifact_dir / "logs" / "chrome.log").exists()
    assert (artifact_dir / "console.ndjson").exists()
    assert (artifact_dir / "transport.ndjson").exists()
    assert (artifact_dir / "app_state.ndjson").exists()
    assert (artifact_dir / "extension" / "pageRuntime.js").exists()


def test_record_chrome_repro_wrapper_reset_flag_runs_reset_first(
    tmp_path: Path,
) -> None:
    sandbox_root, reset_capture_args, reset_capture_env = build_record_chrome_sandbox(
        tmp_path
    )
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    write_stub_executable(
        stub_dir / "chrome",
        """#!/usr/bin/env bash
set -euo pipefail
user_data_dir=""
extension_dir=""
for arg in "$@"; do
  case "$arg" in
    --user-data-dir=*)
      user_data_dir="${arg#--user-data-dir=}"
      ;;
    --load-extension=*)
      extension_dir="${arg#--load-extension=}"
      ;;
  esac
done
mkdir -p "${user_data_dir}/Default"
python - "${user_data_dir}/Default/Secure Preferences" "${extension_dir}" <<'PY'
import json
import sys
from pathlib import Path

prefs_path = Path(sys.argv[1])
payload = {
    "extensions": {
        "settings": {
            "test-extension": {
                "path": sys.argv[2],
            }
        }
    }
}
prefs_path.write_text(json.dumps(payload), encoding="utf-8")
PY
""",
    )

    server, thread, bootstrap_base_url = start_ok_server()
    try:
        env = script_env(stub_dir, home_dir)
        env["CHROME_BIN"] = str(stub_dir / "chrome")
        env["SETTA_CHROME_REPRO_SKIP_DEV_START"] = "1"
        env["SETTA_CHROME_REPRO_BOOTSTRAP_URL"] = (
            f"{bootstrap_base_url}/__setta__/bootstrap#token=test-token"
        )
        env.pop("SETTA_WORKSPACE_ROOT", None)
        env.pop("SETTA_PROJECT_URL", None)
        env.pop("SETTA_PROJECT_PATH", None)

        result = run_script(
            [
                "bash",
                str(sandbox_root / "scripts" / "record-chrome-repro.sh"),
                "--reset",
            ],
            cwd=sandbox_root,
            env=env,
        )
    finally:
        server.shutdown()
        thread.join(timeout=5)

    assert result.returncode == 0, result.stderr
    assert reset_capture_args.read_text(encoding="utf-8") == (
        f"--workspace {sandbox_root}"
    )
    reset_env = parse_env_snapshot(reset_capture_env.read_text(encoding="utf-8"))
    assert reset_env.get("SETTA_HOME") == str(home_dir / ".setta-development")
    assert reset_env.get("SETTA_FILES_ROOT") == str(sandbox_root / "setta_files_dev")
    assert reset_env.get("SETTA_WORKSPACE_ROOT") == str(sandbox_root)


def test_record_chrome_repro_wrapper_updates_latest_pointer_and_helper(
    tmp_path: Path,
) -> None:
    sandbox_root, _, _ = build_record_chrome_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    recording_root = tmp_path / "chrome-recordings"
    write_stub_executable(
        stub_dir / "chrome",
        """#!/usr/bin/env bash
set -euo pipefail
user_data_dir=""
extension_dir=""
for arg in "$@"; do
  case "$arg" in
    --user-data-dir=*)
      user_data_dir="${arg#--user-data-dir=}"
      ;;
    --load-extension=*)
      extension_dir="${arg#--load-extension=}"
      ;;
  esac
done
mkdir -p "${user_data_dir}/Default"
python - "${user_data_dir}/Default/Secure Preferences" "${extension_dir}" <<'PY'
import json
import sys
from pathlib import Path

prefs_path = Path(sys.argv[1])
payload = {
    "extensions": {
        "settings": {
            "test-extension": {
                "path": sys.argv[2],
            }
        }
    }
}
prefs_path.write_text(json.dumps(payload), encoding="utf-8")
PY
""",
    )

    server, thread, bootstrap_base_url = start_ok_server()
    try:
        env = script_env(stub_dir, home_dir)
        env["CHROME_BIN"] = str(stub_dir / "chrome")
        env["SETTA_CHROME_REPRO_SKIP_DEV_START"] = "1"
        env["SETTA_CHROME_REPRO_BOOTSTRAP_URL"] = (
            f"{bootstrap_base_url}/__setta__/bootstrap#token=test-token"
        )
        env["SETTA_CHROME_REPRO_ROOT_DIR"] = str(recording_root)
        env.pop("SETTA_WORKSPACE_ROOT", None)
        env.pop("SETTA_PROJECT_URL", None)
        env.pop("SETTA_PROJECT_PATH", None)

        result = run_script(
            [
                "bash",
                str(sandbox_root / "scripts" / "record-chrome-repro.sh"),
            ],
            cwd=sandbox_root,
            env=env,
        )
    finally:
        server.shutdown()
        thread.join(timeout=5)

    assert result.returncode == 0, result.stderr

    latest_payload = json.loads((recording_root / "latest.json").read_text("utf-8"))
    latest_link = recording_root / "latest"
    assert latest_payload["recordingRoot"] == str(recording_root)
    assert latest_payload["artifactDir"].startswith(str(recording_root / "recording-"))
    assert latest_link.is_symlink()
    assert latest_link.resolve() == Path(latest_payload["artifactDir"]).resolve()

    helper_result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "latest-chrome-recording.sh"),
            "--json",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert helper_result.returncode == 0, helper_result.stderr
    helper_payload = json.loads(helper_result.stdout)
    assert helper_payload["pointerSource"] == "latest-json"
    assert helper_payload["artifactDir"] == latest_payload["artifactDir"]
    assert helper_payload["sessionFile"] == latest_payload["sessionFile"]
    assert helper_payload["recordingFile"] == latest_payload["recordingFile"]
    assert helper_payload["launcherFile"] == latest_payload["launcherFile"]
    assert helper_payload["chromeLog"].endswith("/logs/chrome.log")


def test_latest_chrome_recording_helper_falls_back_to_latest_recording_scan(
    tmp_path: Path,
) -> None:
    sandbox_root, _, _ = build_record_chrome_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    recording_root = tmp_path / "chrome-recordings"
    older_dir = recording_root / "recording-20260330-151418"
    newer_dir = recording_root / "recording-20260330-151419"
    older_dir.mkdir(parents=True, exist_ok=True)
    newer_dir.mkdir(parents=True, exist_ok=True)

    older_session = {
        "artifactDir": str(older_dir),
        "eventCount": 3,
        "eventsFile": str(older_dir / "events.ndjson"),
        "consoleEventsFile": str(older_dir / "console.ndjson"),
        "transportEventsFile": str(older_dir / "transport.ndjson"),
        "appStateEventsFile": str(older_dir / "app_state.ndjson"),
        "createdAt": "2026-03-30T15:14:18Z",
        "finalizedAt": "2026-03-30T15:14:30Z",
        "stopReason": "signal",
    }
    newer_session = {
        "artifactDir": str(newer_dir),
        "eventCount": 7,
        "eventsFile": str(newer_dir / "events.ndjson"),
        "consoleEventsFile": str(newer_dir / "console.ndjson"),
        "transportEventsFile": str(newer_dir / "transport.ndjson"),
        "appStateEventsFile": str(newer_dir / "app_state.ndjson"),
        "createdAt": "2026-03-30T15:14:19Z",
        "finalizedAt": "2026-03-30T15:14:31Z",
        "stopReason": "signal",
    }
    (older_dir / "session.json").write_text(
        json.dumps(older_session, indent=2) + "\n", encoding="utf-8"
    )
    (newer_dir / "session.json").write_text(
        json.dumps(newer_session, indent=2) + "\n", encoding="utf-8"
    )
    (newer_dir / "launcher.json").write_text(
        json.dumps({"bootstrapUrl": "http://127.0.0.1:1234/__setta__/bootstrap"}),
        encoding="utf-8",
    )

    env = script_env(stub_dir, home_dir)
    env["SETTA_CHROME_REPRO_ROOT_DIR"] = str(recording_root)

    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "latest-chrome-recording.sh"),
            "--json",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["pointerSource"] == "scan"
    assert payload["artifactDir"] == str(newer_dir)
    assert payload["eventCount"] == 7
    assert payload["bootstrapUrl"] == "http://127.0.0.1:1234/__setta__/bootstrap"
