import json
from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    parse_env_snapshot,
    run_script,
    script_env,
    write_stub_executable,
)


from tests.start.record_chrome_repro_helpers import (
    build_record_chrome_sandbox,
    start_ok_server,
)


def test_record_chrome_repro_wrapper_launches_browser_and_writes_artifacts(
    tmp_path: Path,
) -> None:
    sandbox_root, _, _, _ = build_record_chrome_sandbox(tmp_path)
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
    assert (artifact_dir / "transport_details.ndjson").exists()
    assert (artifact_dir / "app_state.ndjson").exists()
    assert (artifact_dir / "llm_engine_artifacts" / "manifest.json").exists()
    assert (artifact_dir / "extension" / "pageRuntime.js").exists()


def test_record_chrome_repro_wrapper_reset_flag_runs_reset_first(
    tmp_path: Path,
) -> None:
    sandbox_root, reset_capture_args, reset_capture_env, _ = (
        build_record_chrome_sandbox(tmp_path)
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
    sandbox_root, _, _, _ = build_record_chrome_sandbox(tmp_path)
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
    assert latest_payload["llmArtifactsDir"].endswith("/llm_engine_artifacts")
    assert latest_payload["llmArtifactsManifest"].endswith(
        "/llm_engine_artifacts/manifest.json"
    )
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
    assert helper_payload["transportDetailsFile"].endswith("/transport_details.ndjson")
    assert helper_payload["llmArtifactsDir"].endswith("/llm_engine_artifacts")
    assert helper_payload["llmArtifactsManifest"].endswith(
        "/llm_engine_artifacts/manifest.json"
    )


def test_record_chrome_repro_wrapper_forces_backend_debug_log_level(
    tmp_path: Path,
) -> None:
    sandbox_root, _, _, dev_instance_env = build_record_chrome_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir = tmp_path / "home"
    home_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir = tmp_path / "recording-output"
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
    dev_env = parse_env_snapshot(dev_instance_env.read_text(encoding="utf-8"))
    assert dev_env.get("SETTA_LOG_LEVEL") == "debug"


def test_latest_chrome_recording_helper_falls_back_to_latest_recording_scan(
    tmp_path: Path,
) -> None:
    sandbox_root, _, _, _ = build_record_chrome_sandbox(tmp_path)
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
    assert payload["transportDetailsFile"].endswith("/transport_details.ndjson")
    assert payload["llmArtifactsDir"].endswith("/llm_engine_artifacts")
    assert payload["llmArtifactsManifest"].endswith(
        "/llm_engine_artifacts/manifest.json"
    )


def test_latest_chrome_recording_helper_ignores_stale_latest_pointer(
    tmp_path: Path,
) -> None:
    sandbox_root, _, _, _ = build_record_chrome_sandbox(tmp_path)
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
        "createdAt": "2026-03-30T15:14:18+00:00",
        "finalizedAt": "2026-03-30T15:14:30+00:00",
    }
    newer_session = {
        "artifactDir": str(newer_dir),
        "eventCount": 7,
        "createdAt": "2026-03-30T15:14:19+00:00",
        "finalizedAt": "2026-03-30T15:14:31+00:00",
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
    (recording_root / "latest.json").write_text(
        json.dumps(
            {
                "format": "setta.chrome-repro-latest/v1",
                "artifactDir": str(older_dir),
                "sessionFile": str(older_dir / "session.json"),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (recording_root / "latest").symlink_to(older_dir)

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
