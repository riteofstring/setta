import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def test_run_codex_loop_prompt_includes_live_main_reference_runtime_values(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    main_root = tmp_path / "main"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    main_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    main_env_path = tmp_path / "main_env.txt"

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
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
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 1",
                "yolo: false",
                "worktree_lifecycle: none",
                "main_lifecycle: ai",
                "terminal_mode: background",
                "---",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    # This fake main launcher emits the same runtime lines the real Ralph parser
    # reads so the rendered iteration prompt can surface the current reference
    # frontend/backend/bootstrap/debug values instead of guessing defaults.
    _write_executable(
        main_root / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{main_env_path}"
cat <<'EOF'
Starting Chrome with remote debugging on port 9309
Ready: http://127.0.0.1:8087
Local: http://127.0.0.1:3087/
Bootstrap URL (recommended):
http://127.0.0.1:8087/__setta__/bootstrap#token=test-main-token
EOF
sleep 4
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

worktree {main_root}
HEAD 2222222222222222222222222222222222222222
branch refs/heads/main
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

    # Return a blocked status so the loop exits cleanly while still exercising
    # the required handoff refresh and history append checks.
    _write_executable(
        stub_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '\\n## Latest iteration\\n- Status: blocked\\n' >> "{handoff_path}"
printf '\\n- blocked prompt test\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: BLOCKED
LOOP_SUMMARY: prompt test
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: blocked
LOOP_RECOVERY: none
LOOP_COMMIT: none
EOF
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
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
            "--worktree-lifecycle",
            "none",
            "--main-lifecycle",
            "ai",
            "--terminal-mode",
            "background",
            "--no-yolo",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    rendered_prompt = (
        output_dir / "run-001" / "rendered-start-prompt.txt"
    ).read_text(encoding="utf-8")

    assert f"- {handoff_path}" in rendered_prompt
    assert f"- {history_path}" in rendered_prompt
    assert f"- current main reference worktree: {main_root}" in rendered_prompt
    assert (
        "- current main reference frontend url: http://127.0.0.1:3087/"
        in rendered_prompt
    )
    assert (
        "- current main reference backend url: http://127.0.0.1:8087"
        in rendered_prompt
    )
    assert (
        "- current main reference bootstrap url: "
        "http://127.0.0.1:8087/__setta__/bootstrap#token=test-main-token"
        in rendered_prompt
    )
    assert "- current main reference debug port: 9309" in rendered_prompt
    assert (
        "- current main reference runtime log: "
        f"{output_dir / 'run-001' / 'main-ai.log'}"
        in rendered_prompt
    )
    assert (
        f"`setta status --connect-info --latest --json --workspace {main_root}`"
        in rendered_prompt
    )
    assert (
        f"`cd {main_root} && pnpm -C frontend cdp-port`" in rendered_prompt
    )
    assert (
        "instead of guessing `http://127.0.0.1:3000`" in rendered_prompt
    )
    assert "- browser automation mode for this loop: headless" in rendered_prompt
    assert (
        "- browser env prefix for loop-driven restarts/tests: "
        "`BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 "
        "PLAYWRIGHT_HEADLESS=1`" in rendered_prompt
    )
    assert (
        "LOOP_STATUS: SUBTASK_DONE|TASK_DONE|BLOCKED|REPLAN_REQUIRED"
        in rendered_prompt
    )
    assert (
        "LOOP_TERMINAL_MARKER: <none|task_done|replan_required>"
        in rendered_prompt
    )

    captured_env = {
        line.split("=", 1)[0]: line.split("=", 1)[1]
        for line in main_env_path.read_text(encoding="utf-8").splitlines()
        if "=" in line
    }
    assert captured_env.get("BOOTSTRAP_ENABLED") == "0"
    assert captured_env.get("DEVTOOLS_OPEN_WITH_CHROME") == "0"
    assert captured_env.get("DEVTOOLS_HEADLESS") == "1"
    assert captured_env.get("PLAYWRIGHT_HEADLESS") == "1"


def test_run_codex_loop_headed_browser_flag_disables_headless_defaults(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    main_root = tmp_path / "main"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    main_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    main_env_path = tmp_path / "main_env.txt"

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
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
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 1",
                "yolo: false",
                "worktree_lifecycle: none",
                "main_lifecycle: ai",
                "terminal_mode: background",
                "---",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    _write_executable(
        main_root / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{main_env_path}"
cat <<'EOF'
Starting Chrome with remote debugging on port 9309
Ready: http://127.0.0.1:8087
Local: http://127.0.0.1:3087/
Bootstrap URL (recommended):
http://127.0.0.1:8087/__setta__/bootstrap#token=test-main-token
EOF
sleep 4
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

worktree {main_root}
HEAD 2222222222222222222222222222222222222222
branch refs/heads/main
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
printf '\\n## Latest iteration\\n- Status: blocked\\n' >> "{handoff_path}"
printf '\\n- blocked prompt test\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: BLOCKED
LOOP_SUMMARY: prompt test
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: blocked
LOOP_RECOVERY: none
LOOP_COMMIT: none
EOF
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
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
            "--worktree-lifecycle",
            "none",
            "--main-lifecycle",
            "ai",
            "--terminal-mode",
            "background",
            "--headed-browser",
            "--no-yolo",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    rendered_prompt = (
        output_dir / "run-001" / "rendered-start-prompt.txt"
    ).read_text(encoding="utf-8")
    assert "- browser automation mode for this loop: headed" in rendered_prompt
    assert (
        "- browser env prefix for loop-driven restarts/tests: "
        "`BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=0 "
        "PLAYWRIGHT_HEADLESS=0`" in rendered_prompt
    )

    captured_env = {
        line.split("=", 1)[0]: line.split("=", 1)[1]
        for line in main_env_path.read_text(encoding="utf-8").splitlines()
        if "=" in line
    }
    assert captured_env.get("BOOTSTRAP_ENABLED") == "0"
    assert captured_env.get("DEVTOOLS_OPEN_WITH_CHROME") == "0"
    assert captured_env.get("DEVTOOLS_HEADLESS") == "0"
    assert captured_env.get("PLAYWRIGHT_HEADLESS") == "0"


def test_run_codex_loop_completed_iteration_runs_cleanup_kill_scripts(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    main_root = tmp_path / "main"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    main_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    worktree_kill_env = tmp_path / "worktree_kill_env.txt"
    main_kill_env = tmp_path / "main_kill_env.txt"

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
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
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 2",
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

    _write_executable(
        worktree_root / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{worktree_kill_env}"
""",
    )
    _write_executable(
        main_root / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort > "{main_kill_env}"
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

worktree {main_root}
HEAD 2222222222222222222222222222222222222222
branch refs/heads/main
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
printf '\\n## Latest iteration\\n- Status: blocked\\n' >> "{handoff_path}"
printf '\\n- cleanup test\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: BLOCKED
LOOP_SUMMARY: cleanup test
LOOP_NEXT_ACTION: next
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: blocked
LOOP_RECOVERY: none
LOOP_COMMIT: none
EOF
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
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
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
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert worktree_kill_env.exists()
    assert main_kill_env.exists()

    worktree_env = {
        line.split("=", 1)[0]: line.split("=", 1)[1]
        for line in worktree_kill_env.read_text(encoding="utf-8").splitlines()
        if "=" in line
    }
    main_env = {
        line.split("=", 1)[0]: line.split("=", 1)[1]
        for line in main_kill_env.read_text(encoding="utf-8").splitlines()
        if "=" in line
    }

    assert worktree_env.get("SETTA_KILL_ALL_CHROME") == "1"
    assert "SETTA_KILL_ALL_CHROME" not in main_env


def test_run_codex_loop_rejects_iteration_without_handoff_refresh(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    main_root = tmp_path / "main"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    main_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
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
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 2",
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

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite

worktree {main_root}
HEAD 2222222222222222222222222222222222222222
branch refs/heads/main
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
printf '\\n- appended history without refreshing handoff\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: SUBTASK_DONE
LOOP_SUMMARY: forgot the handoff refresh
LOOP_NEXT_ACTION: refresh the handoff next time
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: not_run
LOOP_RECOVERY: none
LOOP_COMMIT: none
EOF
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
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
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
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Handoff file did not change; refusing to continue blindly" in result.stderr
    status_path = output_dir / "run-001" / "status.txt"
    assert status_path.exists()
    assert "status=missing-handoff-update" in status_path.read_text(
        encoding="utf-8"
    )


def test_run_codex_loop_rejects_iteration_without_history_append(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    main_root = tmp_path / "main"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    main_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
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
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 2",
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

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite

worktree {main_root}
HEAD 2222222222222222222222222222222222222222
branch refs/heads/main
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
printf '\\n## Latest iteration\\n- Status: missing history append\\n' >> "{handoff_path}"
cat <<'EOF'
LOOP_STATUS: SUBTASK_DONE
LOOP_SUMMARY: forgot the history append
LOOP_NEXT_ACTION: append the history next time
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: not_run
LOOP_RECOVERY: none
LOOP_COMMIT: none
EOF
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
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
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
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "History file did not grow; refusing to continue blindly" in result.stderr
    status_path = output_dir / "run-001" / "status.txt"
    assert status_path.exists()
    assert "status=missing-history-append" in status_path.read_text(
        encoding="utf-8"
    )


def test_run_codex_loop_rejects_task_done_without_passing_verify_result(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    main_root = tmp_path / "main"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    main_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
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
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 2",
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

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite

worktree {main_root}
HEAD 2222222222222222222222222222222222222222
branch refs/heads/main
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
cat <<'EOF'
iteration note
EOF
printf '\\n## Latest iteration\\n- Status: attempted invalid task_done\\n' >> "{handoff_path}"
printf '\\n- attempted terminal stop\\nLOOP_TERMINAL_MARKER: task_done\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: claimed completion
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: fail
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
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
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
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
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Refusing TASK_DONE without LOOP_VERIFY_RESULT: pass" in result.stderr
    status_path = output_dir / "run-001" / "status.txt"
    assert status_path.exists()
    assert "status=invalid-terminal-status" in status_path.read_text(
        encoding="utf-8"
    )


def test_run_codex_loop_rejects_task_done_without_terminal_marker_in_history(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    main_root = tmp_path / "main"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    main_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
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
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 2",
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

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite

worktree {main_root}
HEAD 2222222222222222222222222222222222222222
branch refs/heads/main
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
cat <<'EOF'
iteration note
EOF
printf '\\n## Latest iteration\\n- Status: attempted invalid task_done\\n' >> "{handoff_path}"
printf '\\n- attempted terminal stop without marker\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: TASK_DONE
LOOP_SUMMARY: claimed completion
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: task_done
EOF
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
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
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
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert (
        "Updated history is missing terminal marker LOOP_TERMINAL_MARKER: task_done"
        in result.stderr
    )
    status_path = output_dir / "run-001" / "status.txt"
    assert status_path.exists()
    assert "status=missing-terminal-marker" in status_path.read_text(
        encoding="utf-8"
    )


def test_run_codex_loop_accepts_replan_required_terminal_status(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    main_root = tmp_path / "main"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    main_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
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
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 2",
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

    _write_executable(
        stub_dir / "git",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  cat <<'EOF'
worktree {worktree_root}
HEAD 1111111111111111111111111111111111111111
branch refs/heads/pixijs-rewrite

worktree {main_root}
HEAD 2222222222222222222222222222222222222222
branch refs/heads/main
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
cat <<'EOF'
iteration note
EOF
printf '\\n## Latest iteration\\n- Status: stopping for replan\\n' >> "{handoff_path}"
printf '\\n- stopping for replan\\nLOOP_TERMINAL_MARKER: replan_required\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: REPLAN_REQUIRED
LOOP_SUMMARY: replan the next renderer frontier
LOOP_NEXT_ACTION: inspect the updated docs
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: pass
LOOP_RECOVERY: none
LOOP_COMMIT: none
LOOP_TERMINAL_MARKER: replan_required
EOF
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
            "--output-dir",
            str(output_dir),
            "--iterations",
            "1",
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
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (
        "Replan required. Stop here and inspect the updated docs"
        in result.stdout
    )
    status_path = output_dir / "run-001" / "status.txt"
    assert status_path.exists()
    status_text = status_path.read_text(encoding="utf-8")
    assert "status=success" in status_text
    assert "loop_status=REPLAN_REQUIRED" in status_text
    assert "loop_terminal_marker=replan_required" in status_text
