import json
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_runtime_log_tee_rotates_logs_and_keeps_current_runtime_state(
    tmp_path: Path,
) -> None:
    # The tee helper should cap log growth while preserving the active runtime
    # metadata in a small sidecar file for later discovery.
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "runtime-log-tee.py"
    log_path = tmp_path / "ai.log"
    state_path = tmp_path / "ai.log.runtime.json"
    runtime_output = "\n".join(
        [
            "Starting Chrome with remote debugging on port 9297",
            "Local: http://127.0.0.1:3076/",
            "Ready: http://127.0.0.1:8076",
            "Setta running (session old-session)",
            "Starting Chrome with remote debugging on port 9297",
            "Local: http://127.0.0.1:3075/",
            "Ready: http://127.0.0.1:8075",
            "Setta running (session current-session)",
        ]
    ) + "\n"

    result = subprocess.run(
        [
            sys.executable,
            str(script_path),
            "--log-path",
            str(log_path),
            "--state-path",
            str(state_path),
            "--max-bytes",
            "120",
            "--backups",
            "1",
        ],
        input=runtime_output,
        capture_output=True,
        check=True,
        text=True,
    )

    assert result.stdout == runtime_output
    assert log_path.exists()
    assert log_path.with_name("ai.log.1").exists()
    assert log_path.stat().st_size <= 120
    assert log_path.with_name("ai.log.1").stat().st_size <= 120

    state_payload = json.loads(state_path.read_text(encoding="utf-8"))
    assert state_payload["frontendUrl"] == "http://127.0.0.1:3075/"
    assert state_payload["backendUrl"] == "http://127.0.0.1:8075"
    assert state_payload["debugPort"] == 9297
    assert state_payload["sessionIds"] == ["current-session"]
