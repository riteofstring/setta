import os
import socket
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _run(
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _runner_script() -> Path:
    return repo_root() / "scripts" / "run-codex-loop.sh"


def _free_tcp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


def _read_status_map(path: Path) -> dict[str, str]:
    payload: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        payload[key] = value
    return payload


def _write_minimal_loop_config(
    tmp_path: Path,
    *,
    workdir: Path,
    plan_file: Path | None = None,
    handoff_file: Path | None = None,
    history_file: Path | None = None,
) -> Path:
    config_file = tmp_path / "RALPH.md"
    if plan_file is None:
        plan_file = tmp_path / "plan.md"
    if handoff_file is None:
        handoff_file = tmp_path / "handoff.md"
    if history_file is None:
        history_file = tmp_path / "history.md"
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    lines = [
        "---",
        "repo_adapter: generic",
        f"workdir: {workdir}",
        "worktree_lifecycle: none",
        "main_lifecycle: none",
        "terminal_mode: background",
    ]
    lines.append(f"plan_path: {plan_file}")
    lines.append(f"handoff_path: {handoff_file}")
    lines.append(f"history_path: {history_file}")
    lines.extend(["---", "test loop config", ""])
    config_file.write_text("\n".join(lines), encoding="utf-8")
    return config_file


def test_run_codex_loop_marks_inactivity_timeout_failure(tmp_path: Path) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    bin_dir = tmp_path / "bin"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    config_file = _write_minimal_loop_config(tmp_path, workdir=workdir)

    _write_executable(
        bin_dir / "codex",
        """#!/usr/bin/env bash
set -euo pipefail
sleep 3
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
                "bash",
                str(_runner_script()),
                "--config-file",
                str(config_file),
                "--prompt-file",
                str(prompt_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--inactivity-timeout-seconds",
            "1",
            "--watchdog-interval-seconds",
            "1",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    status_payload = _read_status_map(output_dir / "run-001" / "status.txt")
    assert status_payload["status"] == "stalled-timeout"
    assert status_payload["exit_code"] == "124"
    assert status_payload["inactivity_timeout_seconds"] == "1"
    combined_output = result.stdout + result.stderr
    assert "Codex stalled with no transcript activity for 1s" in combined_output


def test_run_codex_loop_can_continue_after_inactivity_timeout(tmp_path: Path) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    config_file = _write_minimal_loop_config(
        tmp_path,
        workdir=workdir,
        plan_file=plan_file,
        handoff_file=handoff_file,
        history_file=history_file,
    )

    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
calls_file="{calls_file}"
count="0"
if [[ -f "${{calls_file}}" ]]; then
  count="$(cat "${{calls_file}}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "${{calls_file}}"

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

if [[ "${{count}}" == "1" ]]; then
  sleep 3
  exit 0
fi

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: SUBTASK_DONE
LOOP_SUMMARY: second pass
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: none
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: SUBTASK_DONE
LOOP_SUMMARY: second pass
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: none
EOF
fi
cat <<'EOF'
LOOP_STATUS: SUBTASK_DONE
LOOP_SUMMARY: second pass
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: none
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
                "bash",
                str(_runner_script()),
                "--config-file",
                str(config_file),
                "--prompt-file",
                str(prompt_file),
            "--iterations",
            "2",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--inactivity-timeout-seconds",
            "1",
            "--watchdog-interval-seconds",
            "1",
            "--continue-on-inactivity-timeout",
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    first_status = _read_status_map(output_dir / "run-001" / "status.txt")
    second_status = _read_status_map(output_dir / "run-002" / "status.txt")
    assert first_status["status"] == "stalled-timeout"
    assert first_status["exit_code"] == "124"
    assert second_status["status"] == "success"
    assert calls_file.read_text(encoding="utf-8").strip() == "2"


def test_run_codex_loop_runs_post_iteration_command_after_success(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    post_file = tmp_path / "post.txt"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file = _write_minimal_loop_config(
        tmp_path,
        workdir=workdir,
        plan_file=plan_file,
        handoff_file=handoff_file,
        history_file=history_file,
    )

    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
                "bash",
                str(_runner_script()),
                "--config-file",
                str(config_file),
                "--prompt-file",
                str(prompt_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--post-iteration-command",
            f"printf 'post-iteration\\n' > {post_file}",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    status_text = (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=success" in status_text
    assert "loop_status=TASK_DONE" in status_text
    assert post_file.read_text(encoding="utf-8") == "post-iteration\n"


def test_run_codex_loop_stops_on_post_iteration_failure(tmp_path: Path) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file = _write_minimal_loop_config(
        tmp_path,
        workdir=workdir,
        plan_file=plan_file,
        handoff_file=handoff_file,
        history_file=history_file,
    )

    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
                "bash",
                str(_runner_script()),
                "--config-file",
                str(config_file),
                "--prompt-file",
                str(prompt_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--post-iteration-command",
            "exit 7",
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 7, result.stderr
    status_payload = _read_status_map(output_dir / "run-001" / "status.txt")
    assert status_payload["status"] == "post-iteration-failure"
    assert status_payload["exit_code"] == "7"


def test_run_codex_loop_accepts_setta_bind_log_for_worktree_readiness(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    frontend_port = _free_tcp_port()
    backend_port = _free_tcp_port()

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file.write_text(
        """---
repo_adapter: generic
worktree_lifecycle: ai
main_lifecycle: none
---
test loop config
""",
        encoding="utf-8",
    )

    _write_executable(
        workdir / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$$" > ".ralph-ai.pid"
python3 -m http.server {frontend_port} --bind 127.0.0.1 >/dev/null 2>&1 &
frontend_pid="$!"
python3 -m http.server {backend_port} --bind 127.0.0.1 >/dev/null 2>&1 &
backend_pid="$!"
printf '%s\\n%s\\n' "${{frontend_pid}}" "${{backend_pid}}" > ".ralph-child-pids"
cleanup() {{
  kill "${{frontend_pid}}" "${{backend_pid}}" 2>/dev/null || true
  wait "${{frontend_pid}}" "${{backend_pid}}" 2>/dev/null || true
  rm -f ".ralph-ai.pid" ".ralph-child-pids"
}}
trap cleanup EXIT INT TERM
echo "Starting Chrome with remote debugging on port 9999..."
echo "chrome-devtools-mcp expects: http://127.0.0.1:9999"
echo ""
echo "[0]   VITE v6.4.2  ready in 10 ms"
echo ""
echo "[0]   ➜  Local:   http://127.0.0.1:{frontend_port}/"
echo "[1] Setta running (session test123)"
echo "[1] Bind: 127.0.0.1:{backend_port} (remote only)"
while true; do
  sleep 1
done
""",
    )
    _write_executable(
        workdir / "kill.sh",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -f ".ralph-ai.pid" ]]; then
  kill "$(cat ".ralph-ai.pid")" 2>/dev/null || true
fi
if [[ -f ".ralph-child-pids" ]]; then
  while IFS= read -r pid; do
    if [[ -n "${pid}" ]]; then
      kill "${pid}" 2>/dev/null || true
    fi
  done < ".ralph-child-pids"
fi
rm -f ".ralph-ai.pid" ".ralph-child-pids"
""",
    )
    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--config-file",
            str(config_file),
            "--prompt-file",
            str(prompt_file),
            "--plan-file",
            str(plan_file),
            "--handoff-file",
            str(handoff_file),
            "--history-file",
            str(history_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--terminal-mode",
            "background",
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert "[bootstrap] worktree: dev stack ready" in result.stdout
    assert "Timed out waiting for worktree dev stack readiness." not in result.stderr
    status_text = (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=success" in status_text
    assert "loop_status=TASK_DONE" in status_text


def test_run_codex_loop_accepts_setta_bootstrap_health_when_backend_root_404(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    frontend_port = _free_tcp_port()
    backend_port = _free_tcp_port()
    backend_server = tmp_path / "setta_backend.py"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file.write_text(
        """---
repo_adapter: setta
worktree_lifecycle: ai
main_lifecycle: none
---
test loop config
""",
        encoding="utf-8",
    )
    backend_server.write_text(
        """from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/":
            self.send_response(404)
            self.end_headers()
            return
        if self.path.startswith("/__setta__/bootstrap"):
            body = b"bootstrap ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        return


HTTPServer(("127.0.0.1", int(__import__("sys").argv[1])), Handler).serve_forever()
""",
        encoding="utf-8",
    )

    _write_executable(
        workdir / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$$" > ".ralph-ai.pid"
python3 -m http.server {frontend_port} --bind 127.0.0.1 >/dev/null 2>&1 &
frontend_pid="$!"
python3 "{backend_server}" {backend_port} >/dev/null 2>&1 &
backend_pid="$!"
printf '%s\\n%s\\n' "${{frontend_pid}}" "${{backend_pid}}" > ".ralph-child-pids"
cleanup() {{
  kill "${{frontend_pid}}" "${{backend_pid}}" 2>/dev/null || true
  wait "${{frontend_pid}}" "${{backend_pid}}" 2>/dev/null || true
  rm -f ".ralph-ai.pid" ".ralph-child-pids"
}}
trap cleanup EXIT INT TERM
echo "Starting Chrome with remote debugging on port 9999..."
echo "chrome-devtools-mcp expects: http://127.0.0.1:9999"
echo ""
echo "[0]   VITE v6.4.2  ready in 10 ms"
echo ""
echo "[0]   ➜  Local:   http://127.0.0.1:{frontend_port}/"
echo "[1] Setta running (session test123)"
echo "[1] Bind: 127.0.0.1:{backend_port} (remote only)"
while true; do
  sleep 1
done
""",
    )
    _write_executable(
        workdir / "kill.sh",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -f ".ralph-ai.pid" ]]; then
  kill "$(cat ".ralph-ai.pid")" 2>/dev/null || true
fi
if [[ -f ".ralph-child-pids" ]]; then
  while IFS= read -r pid; do
    if [[ -n "${pid}" ]]; then
      kill "${pid}" 2>/dev/null || true
    fi
  done < ".ralph-child-pids"
fi
rm -f ".ralph-ai.pid" ".ralph-child-pids"
""",
    )
    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--config-file",
            str(config_file),
            "--prompt-file",
            str(prompt_file),
            "--plan-file",
            str(plan_file),
            "--handoff-file",
            str(handoff_file),
            "--history-file",
            str(history_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--terminal-mode",
            "background",
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert "[bootstrap] worktree: dev stack ready" in result.stdout
    assert "Timed out waiting for worktree dev stack readiness." not in result.stderr
    status_text = (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=success" in status_text
    assert "loop_status=TASK_DONE" in status_text


def test_run_codex_loop_applies_config_reasoning_effort(tmp_path: Path) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    args_file = tmp_path / "codex-args.txt"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file.write_text(
        f"""---
plan_path: {plan_file}
handoff_path: {handoff_file}
history_path: {history_file}
prompt_file: {prompt_file}
workdir: {workdir}
terminal_mode: background
reasoning_effort: xhigh
---
test loop config
""",
        encoding="utf-8",
    )

    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

args_file="{args_file}"
printf '%s\\n' "$@" > "${{args_file}}"

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--config-file",
            str(config_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert "Codex service tier: default" in result.stdout
    assert "Fast mode: inactive" in result.stdout
    args = args_file.read_text(encoding="utf-8").splitlines()
    assert "--config" in args
    config_index = args.index("--config")
    assert args[config_index + 1] == 'reasoning_effort="xhigh"'


def test_run_codex_loop_applies_config_fast_mode_service_tier(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    args_file = tmp_path / "codex-args.txt"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file.write_text(
        f"""---
plan_path: {plan_file}
handoff_path: {handoff_file}
history_path: {history_file}
prompt_file: {prompt_file}
workdir: {workdir}
terminal_mode: background
service_tier: fast
---
test loop config
""",
        encoding="utf-8",
    )

    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

args_file="{args_file}"
printf '%s\\n' "$@" > "${{args_file}}"

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--config-file",
            str(config_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert "Codex service tier: fast" in result.stdout
    assert "Fast mode: active" in result.stdout
    args = args_file.read_text(encoding="utf-8").splitlines()
    config_values = [
        args[index + 1]
        for index, value in enumerate(args[:-1])
        if value == "--config"
    ]
    assert 'service_tier="fast"' in config_values
    assert "features.fast_mode=true" in config_values


def test_run_codex_loop_bootstraps_main_lifecycle_pnpm_from_user_install(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    main_worktree = tmp_path / "main-worktree"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    home_dir = tmp_path / "home"
    pnpm_dir = home_dir / ".local" / "share" / "pnpm"
    frontend_port = _free_tcp_port()

    workdir.mkdir()
    main_worktree.mkdir()
    (main_worktree / "frontend").mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    pnpm_dir.mkdir(parents=True)
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file.write_text(
        f"""---
plan_path: {plan_file}
handoff_path: {handoff_file}
history_path: {history_file}
prompt_file: {prompt_file}
workdir: {workdir}
main_worktree_root: {main_worktree}
main_lifecycle: ai
terminal_mode: background
repo_adapter: generic
---
test loop config
""",
        encoding="utf-8",
    )

    _write_executable(
        pnpm_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail

if [[ "${{1:-}}" != "start" ]]; then
  echo "unexpected pnpm args: $*" >&2
  exit 1
fi

exec python3 -m http.server {frontend_port} --bind 127.0.0.1 >/dev/null 2>&1
""",
    )
    _write_executable(
        main_worktree / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="{main_worktree}"

(cd "${{ROOT_DIR}}/frontend" && pnpm start) &
DEV_PID="$!"
printf '%s\\n' "${{DEV_PID}}" > "${{ROOT_DIR}}/.fake-dev.pid"

cleanup() {{
  kill "${{DEV_PID}}" 2>/dev/null || true
  wait "${{DEV_PID}}" 2>/dev/null || true
  rm -f "${{ROOT_DIR}}/.fake-dev.pid"
}}
trap cleanup EXIT INT TERM

echo "[0]   VITE v6.4.2  ready in 10 ms"
echo "[0]   ➜  Local:   http://127.0.0.1:{frontend_port}/"

wait "${{DEV_PID}}"
""",
    )
    _write_executable(
        main_worktree / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="{main_worktree}"

if [[ -f "${{ROOT_DIR}}/.fake-dev.pid" ]]; then
  kill "$(cat "${{ROOT_DIR}}/.fake-dev.pid")" 2>/dev/null || true
fi
rm -f "${{ROOT_DIR}}/.fake-dev.pid"
""",
    )
    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["PATH"] = f"{bin_dir}:/usr/bin:/bin"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--config-file",
            str(config_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert "[bootstrap] reference/oracle: frontend serving at http://127.0.0.1:" in result.stdout
    main_log = (output_dir / "run-001" / "main-ai.log").read_text(encoding="utf-8")
    assert "pnpm: command not found" not in main_log
    status_text = (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=success" in status_text
    assert "loop_status=TASK_DONE" in status_text


def test_run_codex_loop_retries_main_with_aireset_when_frontend_serves_without_backend(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    main_worktree = tmp_path / "main-worktree"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "reference-bootstrap-calls.txt"
    unhealthy_frontend_port = _free_tcp_port()
    healthy_frontend_port = _free_tcp_port()
    healthy_backend_port = _free_tcp_port()
    backend_server = tmp_path / "setta_backend.py"

    workdir.mkdir()
    main_worktree.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file.write_text(
        f"""---
plan_path: {plan_file}
handoff_path: {handoff_file}
history_path: {history_file}
prompt_file: {prompt_file}
workdir: {workdir}
main_worktree_root: {main_worktree}
main_lifecycle: ai
terminal_mode: background
repo_adapter: setta
---
test loop config
""",
        encoding="utf-8",
    )
    backend_server.write_text(
        """from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/":
            self.send_response(404)
            self.end_headers()
            return
        if self.path.startswith("/__setta__/bootstrap"):
            body = b"bootstrap ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        return


HTTPServer(("127.0.0.1", int(__import__("sys").argv[1])), Handler).serve_forever()
""",
        encoding="utf-8",
    )

    _write_executable(
        main_worktree / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="{main_worktree}"
CALLS_FILE="{calls_file}"

printf 'ai\\n' >> "${{CALLS_FILE}}"
printf '%s\\n' "$$" > "${{ROOT_DIR}}/.fake-dev.pid"
python3 -m http.server {unhealthy_frontend_port} --bind 127.0.0.1 >/dev/null 2>&1 &
frontend_pid="$!"

cleanup() {{
  kill "${{frontend_pid}}" 2>/dev/null || true
  wait "${{frontend_pid}}" 2>/dev/null || true
  rm -f "${{ROOT_DIR}}/.fake-dev.pid"
}}
trap cleanup EXIT INT TERM

echo "[0]   VITE v6.4.2  ready in 10 ms"
echo "[0]   ➜  Local:   http://127.0.0.1:{unhealthy_frontend_port}/"

while true; do
  sleep 1
done
""",
    )
    _write_executable(
        main_worktree / "aireset.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="{main_worktree}"
CALLS_FILE="{calls_file}"

printf 'aireset\\n' >> "${{CALLS_FILE}}"
printf '%s\\n' "$$" > "${{ROOT_DIR}}/.fake-dev.pid"
python3 -m http.server {healthy_frontend_port} --bind 127.0.0.1 >/dev/null 2>&1 &
frontend_pid="$!"
python3 "{backend_server}" {healthy_backend_port} >/dev/null 2>&1 &
backend_pid="$!"

cleanup() {{
  kill "${{frontend_pid}}" "${{backend_pid}}" 2>/dev/null || true
  wait "${{frontend_pid}}" "${{backend_pid}}" 2>/dev/null || true
  rm -f "${{ROOT_DIR}}/.fake-dev.pid"
}}
trap cleanup EXIT INT TERM

echo "[0]   VITE v6.4.2  ready in 10 ms"
echo "[0]   ➜  Local:   http://127.0.0.1:{healthy_frontend_port}/"
echo "[1] Setta running (session test123)"
echo "[1] Bind: 127.0.0.1:{healthy_backend_port} (remote only)"

while true; do
  sleep 1
done
""",
    )
    _write_executable(
        main_worktree / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="{main_worktree}"

if [[ -f "${{ROOT_DIR}}/.fake-dev.pid" ]]; then
  kill "$(cat "${{ROOT_DIR}}/.fake-dev.pid")" 2>/dev/null || true
fi
rm -f "${{ROOT_DIR}}/.fake-dev.pid"
""",
    )
    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["RALPH_MAIN_FRONTEND_HEALTH_TIMEOUT_SECONDS"] = "3"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--config-file",
            str(config_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert (
        "Reference/oracle bootstrap via ai did not yield a healthy runtime;"
        in result.stderr
    )
    assert "[bootstrap] reference/oracle: dev stack ready" in result.stdout
    status_text = (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=success" in status_text
    assert "loop_status=TASK_DONE" in status_text
    assert calls_file.read_text(encoding="utf-8").splitlines() == ["ai", "aireset"]


def test_run_codex_loop_retries_after_main_runtime_exits_mid_iteration(
    tmp_path: Path,
) -> None:
    workdir = tmp_path / "workdir"
    main_worktree = tmp_path / "main-worktree"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    config_file = tmp_path / "RALPH.md"
    plan_file = tmp_path / "plan.md"
    handoff_file = tmp_path / "handoff.md"
    history_file = tmp_path / "history.md"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "codex-calls.txt"
    frontend_port = _free_tcp_port()

    workdir.mkdir()
    main_worktree.mkdir()
    (main_worktree / "frontend").mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")
    plan_file.write_text("plan\n", encoding="utf-8")
    handoff_file.write_text("handoff\n", encoding="utf-8")
    history_file.write_text("history\n", encoding="utf-8")
    config_file.write_text(
        f"""---
plan_path: {plan_file}
handoff_path: {handoff_file}
history_path: {history_file}
prompt_file: {prompt_file}
workdir: {workdir}
main_worktree_root: {main_worktree}
main_lifecycle: ai
terminal_mode: background
repo_adapter: generic
---
test loop config
""",
        encoding="utf-8",
    )

    _write_executable(
        main_worktree / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="{main_worktree}"

python3 -m http.server {frontend_port} --bind 127.0.0.1 >/dev/null 2>&1 &
DEV_PID="$!"
printf '%s\\n' "${{DEV_PID}}" > "${{ROOT_DIR}}/.fake-dev.pid"

cleanup() {{
  kill "${{DEV_PID}}" 2>/dev/null || true
  wait "${{DEV_PID}}" 2>/dev/null || true
  rm -f "${{ROOT_DIR}}/.fake-dev.pid"
}}
trap cleanup EXIT INT TERM

echo "[0]   VITE v6.4.2  ready in 10 ms"
echo "[0]   ➜  Local:   http://127.0.0.1:{frontend_port}/"
sleep 8
exit 0
""",
    )
    _write_executable(
        main_worktree / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="{main_worktree}"

if [[ -f "${{ROOT_DIR}}/.fake-dev.pid" ]]; then
  kill "$(cat "${{ROOT_DIR}}/.fake-dev.pid")" 2>/dev/null || true
fi
rm -f "${{ROOT_DIR}}/.fake-dev.pid"
""",
    )
    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

calls_file="{calls_file}"
count="0"
if [[ -f "${{calls_file}}" ]]; then
  count="$(cat "${{calls_file}}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "${{calls_file}}"

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

if [[ "${{count}}" == "1" ]]; then
  trap 'exit 143' TERM
  for _ in $(seq 1 40); do
    printf 'heartbeat\\n'
    sleep 0.25
  done
  exit 0
fi

printf 'updated handoff\\n' > "{handoff_file}"
cat >> "{history_file}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF

if [[ -n "${{response_file}}" ]]; then
  cat > "${{response_file}}" <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
fi
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: success
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--config-file",
            str(config_file),
            "--iterations",
            "2",
            "--output-dir",
            str(output_dir),
            "--codex-inactivity-timeout-seconds",
            "6",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    first_status = (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=runtime-lifecycle-failure" in first_status
    assert "target=main" in first_status
    assert "reason=main_reference_runtime_exited" in first_status
    second_status = (output_dir / "run-002" / "status.txt").read_text(
        encoding="utf-8",
    )
    assert "status=success" in second_status
    assert "loop_status=TASK_DONE" in second_status
    assert calls_file.read_text(encoding="utf-8").strip() == "2"
