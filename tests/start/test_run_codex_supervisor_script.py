import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


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
