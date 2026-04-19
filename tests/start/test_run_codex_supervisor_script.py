import os
import signal
import subprocess
import time
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _read_status_map(path: Path) -> dict[str, str]:
    payload: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        payload[key] = value
    return payload


def _wait_for(predicate, *, timeout_seconds: float = 10.0, interval_seconds: float = 0.1) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(interval_seconds)
    raise AssertionError("timed out waiting for condition")


def test_run_codex_supervisor_treats_stop_request_after_success_as_clean_exit(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    runtime_state_dir = tmp_path / "runtime-state"
    config_file = tmp_path / "RALPH.md"
    loop_script = tmp_path / "mock-loop.sh"

    workdir.mkdir()
    output_dir.mkdir()
    runtime_state_dir.mkdir()
    config_file.write_text(
        f"""---
workdir: {workdir}
---
test supervisor config
""",
        encoding="utf-8",
    )
    _write_executable(
        loop_script,
        """#!/usr/bin/env bash
set -euo pipefail

output_dir=""
stop_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    --stop-after-iteration-file)
      stop_file="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

mkdir -p "${output_dir}/run-001"
cat > "${output_dir}/run-001/status.txt" <<'EOF'
status=success
mode=start
loop_status=SUBTASK_DONE
loop_summary=completed one iteration
EOF
touch "${stop_file}"
exit 2
""",
    )

    env = os.environ.copy()
    env["RALPH_RUNTIME_STATE_DIR"] = str(runtime_state_dir)

    result = subprocess.run(
        [
            "bash",
            str(repo_root() / "scripts" / "run-codex-supervisor.sh"),
            "--config-file",
            str(config_file),
            "--workdir",
            str(workdir),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_script),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "60",
            "--no-codex-repair",
        ],
        cwd=repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    status_text = (output_dir / "supervisor" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=completed" in status_text
    assert "note=stop_requested_after_success" in status_text
    supervisor_log = (output_dir / "supervisor" / "supervisor.log").read_text(
        encoding="utf-8",
    )
    assert (
        "stop requested and latest iteration completed successfully; exiting cleanly"
        in supervisor_log
    )


def test_run_codex_supervisor_auto_detach_survives_sighup_and_stops_cleanly(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    runtime_state_dir = tmp_path / "runtime-state"
    config_file = tmp_path / "RALPH.md"
    loop_script = tmp_path / "mock-loop.sh"
    active_run_file = runtime_state_dir / "supervisor-active-run.env"

    workdir.mkdir()
    output_dir.mkdir()
    runtime_state_dir.mkdir()
    config_file.write_text(
        f"""---
workdir: {workdir}
---
test supervisor config
""",
        encoding="utf-8",
    )
    _write_executable(
        loop_script,
        """#!/usr/bin/env bash
set -euo pipefail

output_dir=""
stop_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    --stop-after-iteration-file)
      stop_file="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

mkdir -p "${output_dir}/run-001"
cat > "${output_dir}/run-001/status.txt" <<'EOF'
status=success
mode=start
loop_status=SUBTASK_DONE
loop_summary=waiting for stop request
EOF

while [[ ! -f "${stop_file}" ]]; do
  sleep 0.1
done

exit 2
""",
    )

    env = os.environ.copy()
    env["RALPH_RUNTIME_STATE_DIR"] = str(runtime_state_dir)
    env["RALPH_FORCE_SUPERVISOR_DETACH"] = "1"
    env["RALPH_SUPERVISOR_NO_TAIL"] = "1"

    result = subprocess.run(
        [
            "bash",
            str(repo_root() / "scripts" / "run-codex-supervisor.sh"),
            "--config-file",
            str(config_file),
            "--workdir",
            str(workdir),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_script),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "60",
            "--no-codex-repair",
        ],
        cwd=repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Detached Ralph supervisor pid " in result.stdout
    assert "Launch log: " in result.stdout

    _wait_for(lambda: active_run_file.exists())
    active_payload = _read_status_map(active_run_file)
    supervisor_pid = int(active_payload["pid"])
    stop_request_file = Path(active_payload["stop_request_file"])

    os.kill(supervisor_pid, signal.SIGHUP)
    time.sleep(0.5)
    os.kill(supervisor_pid, 0)

    stop_request_file.touch()

    def supervisor_exited() -> bool:
      try:
        os.kill(supervisor_pid, 0)
      except ProcessLookupError:
        return True
      return False

    _wait_for(supervisor_exited, timeout_seconds=15.0)
    status_text = (output_dir / "supervisor" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=completed" in status_text
    assert "note=stop_requested_after_success" in status_text


def test_run_codex_supervisor_uses_bounded_default_repair_command(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    runtime_state_dir = tmp_path / "runtime-state"
    config_file = tmp_path / "RALPH.md"
    loop_script = tmp_path / "mock-loop.sh"
    repair_calls = tmp_path / "repair-calls.txt"
    loop_calls = tmp_path / "loop-calls.txt"

    workdir.mkdir()
    (workdir / "scripts").mkdir()
    output_dir.mkdir()
    runtime_state_dir.mkdir()
    config_file.write_text(
        f"""---
workdir: {workdir}
---
test supervisor config
""",
        encoding="utf-8",
    )
    _write_executable(
        workdir / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'kill\\n' >> "{repair_calls}"
""",
    )
    _write_executable(
        workdir / "scripts" / "reset-setta-state.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'reset %s\\n' "$*" >> "{repair_calls}"
""",
    )
    _write_executable(
        workdir / "aireset.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'aireset\\n' >> "{repair_calls}"
exit 99
""",
    )
    _write_executable(
        loop_script,
        f"""#!/usr/bin/env bash
set -euo pipefail

output_dir=""
stop_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    --stop-after-iteration-file)
      stop_file="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

count="0"
if [[ -f "{loop_calls}" ]]; then
  count="$(cat "{loop_calls}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{loop_calls}"

if [[ "${{count}}" == "1" ]]; then
  exit 1
fi

mkdir -p "${{output_dir}}/run-001"
cat > "${{output_dir}}/run-001/status.txt" <<'EOF'
status=success
mode=start
loop_status=SUBTASK_DONE
loop_summary=recovered
EOF
touch "${{stop_file}}"
exit 2
""",
    )

    env = os.environ.copy()
    env["RALPH_RUNTIME_STATE_DIR"] = str(runtime_state_dir)

    result = subprocess.run(
        [
            "bash",
            str(repo_root() / "scripts" / "run-codex-supervisor.sh"),
            "--config-file",
            str(config_file),
            "--workdir",
            str(workdir),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_script),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "60",
            "--no-codex-repair",
        ],
        cwd=repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert loop_calls.read_text(encoding="utf-8").strip() == "2"
    assert repair_calls.read_text(encoding="utf-8").splitlines() == [
        "kill",
        "reset --workspace .",
    ]
    status_text = (output_dir / "supervisor" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=completed" in status_text
    assert "note=stop_requested_after_success" in status_text
