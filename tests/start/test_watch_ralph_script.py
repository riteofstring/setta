import os
import subprocess
import time
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _write_supervisor_active_run(
    active_run_file: Path,
    *,
    pid: int,
    output_dir: Path,
    current_loop_dir: Path,
) -> None:
    supervisor_dir = output_dir / "supervisor"
    supervisor_dir.mkdir(parents=True, exist_ok=True)
    active_run_file.write_text(
        "\n".join(
            [
                "mode=supervisor",
                f"pid={pid}",
                f"root_dir={repo_root()}",
                f"workdir={repo_root()}",
                f"output_dir={output_dir}",
                f"supervisor_dir={supervisor_dir}",
                f"current_loop_dir={current_loop_dir}",
                "current_loop_pid=",
                f"stop_request_file={output_dir / 'stop.request'}",
                "status=running",
                "note=loop_started",
                "",
            ],
        ),
        encoding="utf-8",
    )


def test_watch_ralph_once_prints_current_supervisor_log(tmp_path: Path) -> None:
    runtime_state_dir = tmp_path / "runtime-state"
    output_dir = tmp_path / "output"
    loop_dir = output_dir / "loop-001"
    log_path = loop_dir / "supervisor-loop.log"
    active_run_file = runtime_state_dir / "supervisor-active-run.env"

    runtime_state_dir.mkdir()
    loop_dir.mkdir(parents=True)
    log_path.write_text("hello from detached Ralph\n", encoding="utf-8")

    holder = subprocess.Popen(["sleep", "60"])
    try:
        _write_supervisor_active_run(
            active_run_file,
            pid=holder.pid,
            output_dir=output_dir,
            current_loop_dir=loop_dir,
        )

        env = os.environ.copy()
        env["RALPH_RUNTIME_STATE_DIR"] = str(runtime_state_dir)
        result = subprocess.run(
            [
                "bash",
                str(repo_root() / "scripts" / "watch-ralph.sh"),
                "--once",
                "--lines",
                "5",
            ],
            cwd=repo_root(),
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )
    finally:
        holder.terminate()
        holder.wait(timeout=5)

    assert result.returncode == 0, result.stderr
    assert f"Watching Ralph log: {log_path}" in result.stdout
    assert "hello from detached Ralph" in result.stdout


def test_watch_ralph_once_errors_when_no_active_loop_exists(tmp_path: Path) -> None:
    runtime_state_dir = tmp_path / "runtime-state"
    runtime_state_dir.mkdir()

    env = os.environ.copy()
    env["RALPH_RUNTIME_STATE_DIR"] = str(runtime_state_dir)
    result = subprocess.run(
        [
            "bash",
            str(repo_root() / "scripts" / "watch-ralph.sh"),
            "--once",
        ],
        cwd=repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert f"No active Ralph loop found in {runtime_state_dir}." in result.stderr


def test_watch_ralph_switches_to_new_loop_log_when_supervisor_rolls(tmp_path: Path) -> None:
    runtime_state_dir = tmp_path / "runtime-state"
    output_dir = tmp_path / "output"
    loop_one_dir = output_dir / "loop-001"
    loop_two_dir = output_dir / "loop-002"
    log_one = loop_one_dir / "supervisor-loop.log"
    log_two = loop_two_dir / "supervisor-loop.log"
    active_run_file = runtime_state_dir / "supervisor-active-run.env"

    runtime_state_dir.mkdir()
    loop_one_dir.mkdir(parents=True)
    log_one.write_text("loop one line\n", encoding="utf-8")

    holder = subprocess.Popen(["sleep", "60"])
    try:
        _write_supervisor_active_run(
            active_run_file,
            pid=holder.pid,
            output_dir=output_dir,
            current_loop_dir=loop_one_dir,
        )

        env = os.environ.copy()
        env["RALPH_RUNTIME_STATE_DIR"] = str(runtime_state_dir)
        watcher = subprocess.Popen(
            [
                "bash",
                str(repo_root() / "scripts" / "watch-ralph.sh"),
                "--lines",
                "1",
                "--poll-seconds",
                "0.1",
            ],
            cwd=repo_root(),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        try:
            time.sleep(0.4)
            loop_two_dir.mkdir(parents=True)
            log_two.write_text("loop two line\n", encoding="utf-8")
            _write_supervisor_active_run(
                active_run_file,
                pid=holder.pid,
                output_dir=output_dir,
                current_loop_dir=loop_two_dir,
            )
            time.sleep(0.5)
        finally:
            watcher.terminate()
            stdout, stderr = watcher.communicate(timeout=5)
    finally:
        holder.terminate()
        holder.wait(timeout=5)

    assert watcher.returncode in (-15, 143)
    assert stderr == ""
    assert f"Watching Ralph log: {log_one}" in stdout
    assert "loop one line" in stdout
    assert f"Watching Ralph log: {log_two}" in stdout
    assert "loop two line" in stdout
