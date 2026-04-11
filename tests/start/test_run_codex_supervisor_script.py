import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def test_run_codex_supervisor_relays_inner_loop_output_to_stdout(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-supervisor.sh"

    worktree_root = tmp_path / "worktree"
    output_dir = tmp_path / "output"
    stub_dir = tmp_path / "bin"
    worktree_root.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)

    config_path = tmp_path / "RALPH.md"
    config_path.write_text(
        "---\nworkdir: worktree\n---\n",
        encoding="utf-8",
    )

    loop_stub_path = tmp_path / "loop-stub.sh"
    _write_executable(
        loop_stub_path,
        """#!/usr/bin/env bash
set -euo pipefail
output_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
echo "inner loop says hello"
mkdir -p "${output_dir}/run-001"
cat <<'EOF' > "${output_dir}/run-001/status.txt"
status=success
loop_status=SUBTASK_DONE
EOF
exit 0
""",
    )

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite
EOF
  exit 0
fi
exit 0
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--config-file",
            str(config_path),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_stub_path),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "10",
            "--repeat-failure-threshold",
            "1",
            "--no-codex-repair",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=15,
    )

    assert result.returncode == 0, result.stderr
    assert "inner loop says hello" in result.stdout
    assert "inner loop says hello" in (
        output_dir / "loop-001" / "supervisor-loop.log"
    ).read_text(encoding="utf-8")


def test_run_codex_supervisor_restarts_after_deterministic_repair(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-supervisor.sh"

    worktree_root = tmp_path / "worktree"
    output_dir = tmp_path / "output"
    stub_dir = tmp_path / "bin"
    worktree_root.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)

    config_path = tmp_path / "RALPH.md"
    config_path.write_text(
        "---\nworkdir: worktree\n---\n",
        encoding="utf-8",
    )

    loop_state_path = tmp_path / "loop-count.txt"
    repair_state_path = tmp_path / "repair-count.txt"
    loop_stub_path = tmp_path / "loop-stub.sh"
    _write_executable(
        loop_stub_path,
        f"""#!/usr/bin/env bash
set -euo pipefail
output_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
count=0
if [[ -f "{loop_state_path}" ]]; then
  count="$(cat "{loop_state_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{loop_state_path}"
if [[ "${{count}}" -eq 1 ]]; then
  mkdir -p "${{output_dir}}/run-001"
  cat <<'EOF' > "${{output_dir}}/run-001/status.txt"
status=bootstrap-failure
mode=bootstrap
exit_code=1
lifecycle_mode=restart-aireset
EOF
  sleep 30
fi
mkdir -p "${{output_dir}}/run-001"
cat <<'EOF' > "${{output_dir}}/run-001/status.txt"
status=success
loop_status=SUBTASK_DONE
EOF
exit 0
""",
    )

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite
EOF
  exit 0
fi
exit 0
""",
    )

    repair_script_path = tmp_path / "repair.sh"
    _write_executable(
        repair_script_path,
        f"""#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "{repair_state_path}" ]]; then
  count="$(cat "{repair_state_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{repair_state_path}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--config-file",
            str(config_path),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_stub_path),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "10",
            "--repeat-failure-threshold",
            "1",
            "--repair-command",
            str(repair_script_path),
            "--no-codex-repair",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert loop_state_path.read_text(encoding="utf-8").strip() == "2"
    assert repair_state_path.read_text(encoding="utf-8").strip() == "1"
    assert (output_dir / "loop-001" / "run-001" / "status.txt").exists()
    assert (output_dir / "loop-002" / "run-001" / "status.txt").exists()
    supervisor_status = (output_dir / "supervisor" / "status.txt").read_text(
        encoding="utf-8"
    )
    assert "status=completed" in supervisor_status


def test_run_codex_supervisor_escalates_to_codex_repair_after_repeat_failure(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-supervisor.sh"

    worktree_root = tmp_path / "worktree"
    output_dir = tmp_path / "output"
    stub_dir = tmp_path / "bin"
    worktree_root.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)

    config_path = tmp_path / "RALPH.md"
    config_path.write_text(
        "---\nworkdir: worktree\n---\n",
        encoding="utf-8",
    )

    loop_state_path = tmp_path / "loop-count.txt"
    repair_state_path = tmp_path / "repair-count.txt"
    codex_state_path = tmp_path / "codex-count.txt"
    loop_stub_path = tmp_path / "loop-stub.sh"
    _write_executable(
        loop_stub_path,
        f"""#!/usr/bin/env bash
set -euo pipefail
output_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
count=0
if [[ -f "{loop_state_path}" ]]; then
  count="$(cat "{loop_state_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{loop_state_path}"
if [[ "${{count}}" -le 2 ]]; then
  mkdir -p "${{output_dir}}/run-001"
  cat <<'EOF' > "${{output_dir}}/run-001/status.txt"
status=bootstrap-failure
mode=bootstrap
exit_code=1
lifecycle_mode=restart-aireset
EOF
  sleep 30
fi
mkdir -p "${{output_dir}}/run-001"
cat <<'EOF' > "${{output_dir}}/run-001/status.txt"
status=success
loop_status=SUBTASK_DONE
EOF
exit 0
""",
    )

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite
EOF
  exit 0
fi
exit 0
""",
    )

    repair_script_path = tmp_path / "repair.sh"
    _write_executable(
        repair_script_path,
        f"""#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "{repair_state_path}" ]]; then
  count="$(cat "{repair_state_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{repair_state_path}"
""",
    )

    _write_executable(
        stub_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "{codex_state_path}" ]]; then
  count="$(cat "{codex_state_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{codex_state_path}"
last_message=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      last_message="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
cat > /dev/null
cat <<'EOF' > "${{last_message}}"
REPAIR_STATUS: fixed
REPAIR_SUMMARY: repaired the repeated bootstrap failure
REPAIR_VERIFY: targeted verification passed
EOF
cat "${{last_message}}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--config-file",
            str(config_path),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_stub_path),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "10",
            "--repeat-failure-threshold",
            "1",
            "--repair-command",
            str(repair_script_path),
            "--max-codex-repair-attempts",
            "1",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    assert loop_state_path.read_text(encoding="utf-8").strip() == "3"
    assert repair_state_path.read_text(encoding="utf-8").strip() == "1"
    assert codex_state_path.read_text(encoding="utf-8").strip() == "1"
    incident_metadata = (
        output_dir / "supervisor" / "incident-002" / "metadata.txt"
    ).read_text(encoding="utf-8")
    assert "repair_status=fixed" in incident_metadata


def test_run_codex_supervisor_stops_when_codex_repair_reports_blocked(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-supervisor.sh"

    worktree_root = tmp_path / "worktree"
    output_dir = tmp_path / "output"
    stub_dir = tmp_path / "bin"
    worktree_root.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)

    config_path = tmp_path / "RALPH.md"
    config_path.write_text(
        "---\nworkdir: worktree\n---\n",
        encoding="utf-8",
    )

    codex_state_path = tmp_path / "codex-count.txt"
    loop_stub_path = tmp_path / "loop-stub.sh"
    _write_executable(
        loop_stub_path,
        """#!/usr/bin/env bash
set -euo pipefail
output_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
mkdir -p "${output_dir}/run-001"
cat <<'EOF' > "${output_dir}/run-001/status.txt"
status=bootstrap-failure
mode=bootstrap
exit_code=1
lifecycle_mode=restart-aireset
EOF
sleep 30
""",
    )

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite
EOF
  exit 0
fi
exit 0
""",
    )

    _write_executable(
        stub_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "{codex_state_path}" ]]; then
  count="$(cat "{codex_state_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{codex_state_path}"
last_message=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      last_message="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
cat > /dev/null
cat <<'EOF' > "${{last_message}}"
REPAIR_STATUS: blocked
REPAIR_SUMMARY: repeated bootstrap failure is still blocked
REPAIR_VERIFY: not_run
EOF
cat "${{last_message}}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--config-file",
            str(config_path),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_stub_path),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "10",
            "--repeat-failure-threshold",
            "1",
            "--max-codex-repair-attempts",
            "1",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=20,
    )

    assert result.returncode == 1
    assert codex_state_path.read_text(encoding="utf-8").strip() == "1"
    supervisor_status = (output_dir / "supervisor" / "status.txt").read_text(
        encoding="utf-8"
    )
    assert "status=blocked" in supervisor_status


def test_ralph_stop_requests_graceful_supervised_shutdown(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    supervisor_script_path = repo_root / "scripts" / "run-codex-supervisor.sh"
    stop_script_path = repo_root / "ralph-stop.sh"

    worktree_root = tmp_path / "worktree"
    output_dir = tmp_path / "output"
    runtime_state_dir = tmp_path / "runtime-state"
    stub_dir = tmp_path / "bin"
    worktree_root.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    runtime_state_dir.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Graceful stop prompt.\n", encoding="utf-8")
    plan_path = tmp_path / "plan.md"
    plan_path.write_text("# Plan\n", encoding="utf-8")
    handoff_path = tmp_path / "handoff.md"
    handoff_path.write_text("# Handoff\n", encoding="utf-8")
    history_path = tmp_path / "history.md"
    history_path.write_text("# History\n", encoding="utf-8")
    config_path = tmp_path / "RALPH.md"
    config_path.write_text(
        "\n".join(
            [
                "---",
                "plan_path: plan.md",
                "handoff_path: handoff.md",
                "history_path: history.md",
                "prompt_file: prompt.md",
                "workdir: worktree",
                "iterations: until_done",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 5",
                "yolo: false",
                "worktree_lifecycle: none",
                "main_lifecycle: none",
                "terminal_mode: background",
                "---",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    loop_count_path = tmp_path / "loop-count.txt"

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite
EOF
  exit 0
fi
if [[ "$*" == *"rev-parse HEAD"* ]]; then
  printf '%s\\n' 1111111111111111111111111111111111111111
  exit 0
fi
echo "unsupported git args: $*" >&2
exit 1
""",
    )

    _write_executable(
        stub_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
last_message=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      last_message="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
cat > /dev/null
count=0
if [[ -f "{loop_count_path}" ]]; then
  count="$(cat "{loop_count_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{loop_count_path}"
sleep 2
printf '\\n## Latest iteration\\n- Status: graceful stop iteration %s complete\\n' "${{count}}" >> "{handoff_path}"
printf '\\n- graceful stop iteration %s complete\\n' "${{count}}" >> "{history_path}"
cat <<'EOF' > "${{last_message}}"
LOOP_STATUS: SUBTASK_DONE
LOOP_SUMMARY: completed one bounded step
LOOP_NEXT_ACTION: continue to the next bounded step
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: none
EOF
cat "${{last_message}}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["RALPH_RUNTIME_STATE_DIR"] = str(runtime_state_dir)

    supervisor_proc = subprocess.Popen(
        [
            "bash",
            str(supervisor_script_path),
            "--config-file",
            str(config_path),
            "--output-dir",
            str(output_dir),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "20",
            "--repeat-failure-threshold",
            "1",
            "--no-codex-repair",
            "--",
            "--config-file",
            str(config_path),
            "--prompt-file",
            str(prompt_path),
            "--followup-prompt-file",
            str(prompt_path),
            "--plan-file",
            str(plan_path),
            "--handoff-file",
            str(handoff_path),
            "--history-file",
            str(history_path),
            "--workdir",
            str(worktree_root),
            "--iterations",
            "until_done",
            "--progress-review-every",
            "0",
            "--worktree-lifecycle",
            "none",
            "--main-lifecycle",
            "none",
            "--terminal-mode",
            "background",
            "--no-yolo",
        ],
        cwd=repo_root,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    active_run_path = runtime_state_dir / "supervisor-active-run.env"
    for _ in range(40):
      if active_run_path.exists():
        break
      if supervisor_proc.poll() is not None:
        break
      subprocess.run(["sleep", "0.25"], check=False)

    assert active_run_path.exists()

    stop_result = subprocess.run(
        ["bash", str(stop_script_path)],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert stop_result.returncode == 0, stop_result.stderr
    assert "Requested graceful Ralph stop" in stop_result.stdout

    stdout, stderr = supervisor_proc.communicate(timeout=20)

    assert supervisor_proc.returncode == 0, stderr
    assert loop_count_path.read_text(encoding="utf-8").strip() == "1"
    assert "inner loop exited cleanly" in stdout
    assert (output_dir / "loop-001" / "run-001" / "status.txt").exists()
    assert not (output_dir / "loop-002").exists()
    assert not active_run_path.exists()


def test_run_codex_supervisor_counts_progress_review_activity_as_live_loop_activity(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-supervisor.sh"

    worktree_root = tmp_path / "worktree"
    output_dir = tmp_path / "output"
    stub_dir = tmp_path / "bin"
    worktree_root.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)

    config_path = tmp_path / "RALPH.md"
    config_path.write_text(
        "---\nworkdir: worktree\n---\n",
        encoding="utf-8",
    )

    loop_count_path = tmp_path / "loop-count.txt"
    repair_count_path = tmp_path / "repair-count.txt"
    loop_stub_path = tmp_path / "loop-stub.sh"
    _write_executable(
        loop_stub_path,
        f"""#!/usr/bin/env bash
set -euo pipefail
output_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
count=0
if [[ -f "{loop_count_path}" ]]; then
  count="$(cat "{loop_count_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{loop_count_path}"
mkdir -p "${{output_dir}}/run-001" "${{output_dir}}/progress-review-001"
cat <<'EOF' > "${{output_dir}}/run-001/status.txt"
status=success
loop_status=SUBTASK_DONE
EOF
cat <<'EOF' > "${{output_dir}}/progress-review-001/progress-review-prompt.txt"
Progress review checkpoint.
EOF
for beat in 1 2 3 4 5; do
  printf 'heartbeat %s\\n' "${{beat}}" >> "${{output_dir}}/progress-review-001/progress-review-transcript.log"
  sleep 1
done
cat <<'EOF' > "${{output_dir}}/progress-review-001/status.txt"
status=success
decision=continue
EOF
exit 0
""",
    )

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite
EOF
  exit 0
fi
exit 0
""",
    )

    repair_script_path = tmp_path / "repair.sh"
    _write_executable(
        repair_script_path,
        f"""#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "{repair_count_path}" ]]; then
  count="$(cat "{repair_count_path}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "{repair_count_path}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--config-file",
            str(config_path),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_stub_path),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "3",
            "--repeat-failure-threshold",
            "1",
            "--repair-command",
            str(repair_script_path),
            "--no-codex-repair",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert loop_count_path.read_text(encoding="utf-8").strip() == "1"
    assert not repair_count_path.exists()
    supervisor_status = (output_dir / "supervisor" / "status.txt").read_text(
        encoding="utf-8"
    )
    assert "status=completed" in supervisor_status
    supervisor_log = (output_dir / "supervisor" / "supervisor.log").read_text(
        encoding="utf-8"
    )
    assert "stalled_loop" not in supervisor_log


def test_run_codex_supervisor_falls_back_to_codex_from_installed_nvm_bin(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-supervisor.sh"

    worktree_root = tmp_path / "worktree"
    output_dir = tmp_path / "output"
    stub_dir = tmp_path / "bin"
    home_dir = tmp_path / "home"
    nvm_alias_dir = home_dir / ".nvm" / "alias"
    codex_bin_dir = home_dir / ".nvm" / "versions" / "node" / "v20.11.1" / "bin"
    worktree_root.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    nvm_alias_dir.mkdir(parents=True, exist_ok=True)
    codex_bin_dir.mkdir(parents=True, exist_ok=True)
    (nvm_alias_dir / "default").write_text("20.11.1\n", encoding="utf-8")

    config_path = tmp_path / "RALPH.md"
    config_path.write_text(
        "---\nworkdir: worktree\n---\n",
        encoding="utf-8",
    )

    loop_stub_path = tmp_path / "loop-stub.sh"
    _write_executable(
        loop_stub_path,
        """#!/usr/bin/env bash
set -euo pipefail
output_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
mkdir -p "${output_dir}/run-001"
cat <<'EOF' > "${output_dir}/run-001/status.txt"
status=success
loop_status=SUBTASK_DONE
EOF
exit 0
""",
    )

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite
EOF
  exit 0
fi
if [[ "$*" == *"rev-parse --absolute-git-dir"* ]]; then
  printf '%s\\n' /tmp/fake-git-dir
  exit 0
fi
exit 0
""",
    )

    _write_executable(
        codex_bin_dir / "codex",
        """#!/usr/bin/env bash
set -euo pipefail
echo "unexpected repair codex invocation" >&2
exit 1
""",
    )

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["NVM_DIR"] = str(home_dir / ".nvm")
    env["PATH"] = f"{stub_dir}:/usr/bin:/bin:/usr/sbin:/sbin"

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--config-file",
            str(config_path),
            "--output-dir",
            str(output_dir),
            "--loop-script",
            str(loop_stub_path),
            "--poll-seconds",
            "1",
            "--stale-seconds",
            "10",
            "--repeat-failure-threshold",
            "1",
            "--",
            "--no-yolo",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=15,
    )

    assert result.returncode == 0, result.stderr
    assert "codex CLI not found on PATH" not in result.stderr
