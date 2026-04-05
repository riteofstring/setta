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
