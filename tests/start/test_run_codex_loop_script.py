import os
import subprocess
import sys
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
        stub_dir / "curl",
        """#!/usr/bin/env bash
set -euo pipefail
url="${@: -1}"
if [[ "$url" == "http://127.0.0.1:3087/" ]]; then
  exit 0
fi
exit 7
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
    env.pop("CHROME_BIN", None)

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
        f"SETTA_FILES_ROOT={main_root / 'setta_files_dev'} "
        f"setta status --connect-info --latest --json --workspace {main_root}"
        in rendered_prompt
    )
    assert (
        f"`./scripts/dev-runtime-info.sh --workspace {main_root} "
        f"--runtime-log {output_dir / 'run-001' / 'main-ai.log'}`"
        in rendered_prompt
    )
    assert (
        "use these current runtime values instead of guessing old ports"
        in rendered_prompt
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
    assert captured_env.get("CHROME_BIN") == str(
        output_dir / "run-001" / "ralph-headless-chrome.sh"
    )


def test_run_codex_loop_uses_python3_when_python_is_missing(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    python3_args_path = tmp_path / "python3-args.txt"
    python_args_path = tmp_path / "python-args.txt"

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
branch refs/heads/feature
EOF
  exit 0
fi
if [[ "$*" == *"rev-parse HEAD"* ]]; then
  printf '%s\\n' 1111111111111111111111111111111111111111
  exit 0
fi
exit 0
""",
    )
    _write_executable(
        stub_dir / "setta",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"--list-sessions --json"* ]]; then
  /usr/bin/env python3 - <<'PY'
import base64
import json

payload = {"sessions": [{"sessionId": "demo"}]}
encoded = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")
print(f"__SETTA_JSON_B64__{encoded}")
PY
  exit 0
fi
exit 1
""",
    )
    _write_executable(
        stub_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{python_args_path}"
exit 127
""",
    )
    _write_executable(
        stub_dir / "python3",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{python3_args_path}"
exec "{sys.executable}" "$@"
""",
    )
    _write_executable(
        stub_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '\\n## Latest iteration\\n- Status: blocked\\n' >> "{handoff_path}"
printf '\\n- python3 fallback\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: BLOCKED
LOOP_SUMMARY: python3 fallback worked
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
    env["PATH"] = f"{stub_dir}:/usr/bin:/bin:/usr/sbin:/sbin"

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
    assert python3_args_path.read_text(encoding="utf-8").startswith("- ")
    assert not python_args_path.exists()


def test_run_codex_loop_discovers_main_reference_from_sibling_repo_checkout(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "dev" / "setta.pixijs-graph"
    main_root = tmp_path / "dev" / "setta"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    (main_root / "backend" / "setta").mkdir(parents=True, exist_ok=True)
    (main_root / "scripts").mkdir(parents=True, exist_ok=True)
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
        main_root / "scripts" / "dev-runtime-info.sh",
        """#!/usr/bin/env bash
set -euo pipefail
cat <<'EOF'
{"frontendUrl":"http://127.0.0.1:3087/","backendUrl":"http://127.0.0.1:8087","bootstrapUrl":"http://127.0.0.1:8087/__setta__/bootstrap#token=test-main-token","debugPort":9309}
EOF
""",
    )
    _write_executable(
        stub_dir / "curl",
        """#!/usr/bin/env bash
set -euo pipefail
url="${@: -1}"
if [[ "$url" == "http://127.0.0.1:3087/" ]]; then
  exit 0
fi
exit 7
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
if [[ "$*" == *"config --get remote.origin.url"* ]]; then
  printf '%s\\n' git@github.com:riteofstring/setta.git
  exit 0
fi
if [[ "$*" == *"rev-parse --is-inside-work-tree"* ]]; then
  printf '%s\\n' true
  exit 0
fi
if [[ "$*" == *"symbolic-ref --quiet --short HEAD"* ]]; then
  if [[ "$*" == *"{main_root}"* ]]; then
    printf '%s\\n' main
  else
    printf '%s\\n' pixijs-rewrite
  fi
  exit 0
fi
if [[ "$*" == *"rev-parse HEAD"* ]]; then
  if [[ "$*" == *"{main_root}"* ]]; then
    printf '%s\\n' 2222222222222222222222222222222222222222
  else
    printf '%s\\n' 1111111111111111111111111111111111111111
  fi
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
printf '\\n- sibling main repo fallback\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: BLOCKED
LOOP_SUMMARY: sibling main repo fallback worked
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
    env.pop("CHROME_BIN", None)

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
    assert f"- current main reference worktree: {main_root}" in rendered_prompt
    assert f"Main worktree root: {main_root}" in result.stdout


def test_run_codex_loop_generic_repo_adapter_omits_setta_runtime_guidance(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Generic repo prompt body.\n", encoding="utf-8")
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
                "repo_adapter: generic",
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
branch refs/heads/feature
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
printf '\\n## Latest iteration\\n- Status: generic blocked\\n' >> "{handoff_path}"
printf '\\n- generic blocked prompt test\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: BLOCKED
LOOP_SUMMARY: generic prompt test
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

    rendered_prompt = (
        output_dir / "run-001" / "rendered-start-prompt.txt"
    ).read_text(encoding="utf-8")

    assert "setta status" not in rendered_prompt
    assert "./scripts/dev-runtime-info.sh" not in rendered_prompt
    assert "- current worktree frontend url:" not in rendered_prompt
    assert "- current main reference worktree:" not in rendered_prompt
    assert "- current worktree lifecycle mode: none" in rendered_prompt
    assert (
        "LOOP_STATUS: SUBTASK_DONE|TASK_DONE|BLOCKED|REPLAN_REQUIRED"
        in rendered_prompt
    )


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
        stub_dir / "curl",
        """#!/usr/bin/env bash
set -euo pipefail
url="${@: -1}"
if [[ "$url" == "http://127.0.0.1:3087/" ]]; then
  exit 0
fi
exit 7
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
    env.pop("CHROME_BIN", None)

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
    assert "CHROME_BIN" not in captured_env
    assert (
        f"SETTA_FILES_ROOT={main_root / 'setta_files_dev'} "
        f"setta status --connect-info --latest --json --workspace {main_root}"
        in rendered_prompt
    )


def test_run_codex_loop_uses_dev_session_root_for_existing_session_detection(
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

    worktree_launch_trace = tmp_path / "worktree_launch_trace.txt"
    setta_env_path = tmp_path / "setta_env.txt"
    setta_args_path = tmp_path / "setta_args.txt"

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
                "worktree_lifecycle: ai",
                "main_lifecycle: none",
                "terminal_mode: background",
                "---",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    # A live session should make Ralph trust the dev-state registry and skip
    # relaunching the worktree lifecycle.
    _write_executable(
        worktree_root / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'launched\\n' >> "{worktree_launch_trace}"
cat <<'EOF'
Starting Chrome with remote debugging on port 9297
Ready: http://127.0.0.1:8075
Local: http://127.0.0.1:3075/
Bootstrap URL (recommended):
http://127.0.0.1:8075/__setta__/bootstrap#token=test-worktree-token
EOF
sleep 4
""",
    )
    _write_executable(
        worktree_root / "kill.sh",
        """#!/usr/bin/env bash
set -euo pipefail
exit 0
""",
    )

    _write_executable(
        stub_dir / "setta",
        f"""#!/usr/bin/env bash
set -euo pipefail
env | sort >> "{setta_env_path}"
printf '%s\\n' "$*" >> "{setta_args_path}"
if [[ "${{SETTA_FILES_ROOT:-}}" == "{worktree_root / 'setta_files_dev'}" ]] \\
  && [[ "$*" == *"status --list-sessions --json --workspace {worktree_root} --server-mode ide"* ]]; then
  printf '%s\\n' '__SETTA_JSON_B64__eyJzZXNzaW9ucyI6W3siaWQiOiJ0ZXN0LXNlc3Npb24ifV19'
  exit 0
fi
printf '%s\\n' '__SETTA_JSON_B64__eyJzZXNzaW9ucyI6W119'
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
printf '\\n- existing session detection test\\n' >> "{history_path}"
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
            "ai",
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
    assert not worktree_launch_trace.exists()

    assert (
        f"SETTA_FILES_ROOT={worktree_root / 'setta_files_dev'}"
        in setta_env_path.read_text(encoding="utf-8")
    )
    assert (
        "status --list-sessions --json --workspace "
        f"{worktree_root} --server-mode ide"
    ) in setta_args_path.read_text(encoding="utf-8")


def test_run_codex_loop_passes_browser_mode_flag_to_modern_lifecycle_scripts(
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
    main_args_path = tmp_path / "main_args.txt"
    main_env_path = tmp_path / "main_env.txt"
    main_scripts_dir = main_root / "scripts"
    main_scripts_dir.mkdir(parents=True, exist_ok=True)

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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "${{SCRIPT_DIR}}/scripts/ai.sh" "$@"
""",
    )
    _write_executable(
        main_scripts_dir / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
cat <<'EOF' >/dev/null
Usage: ai.sh [--browser-mode headed|headless]
EOF
printf '%s\\n' "$@" > "{main_args_path}"
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
        stub_dir / "curl",
        """#!/usr/bin/env bash
set -euo pipefail
url="${@: -1}"
if [[ "$url" == "http://127.0.0.1:3087/" ]]; then
  exit 0
fi
exit 7
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
printf '\\n- modern browser mode flag test\\n' >> "{history_path}"
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
    env.pop("CHROME_BIN", None)

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
    assert main_args_path.read_text(encoding="utf-8").splitlines() == [
        "--browser-mode",
        "headless",
    ]

    captured_env = {
        line.split("=", 1)[0]: line.split("=", 1)[1]
        for line in main_env_path.read_text(encoding="utf-8").splitlines()
        if "=" in line
    }
    assert "CHROME_BIN" not in captured_env


def test_run_codex_loop_retries_main_with_restart_aireset_when_ai_oracle_never_serves(
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

    main_launch_trace = tmp_path / "main_launch_trace.txt"
    main_kill_trace = tmp_path / "main_kill_trace.txt"
    curl_trace = tmp_path / "curl_trace.txt"

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

    # The first main bootstrap advertises a frontend URL that never serves.
    # Ralph should retry the reference session once with restart-aireset and
    # then continue with the healthy replacement oracle.
    _write_executable(
        main_root / "ai.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'ai\\n' >> "{main_launch_trace}"
cat <<'EOF'
Starting Chrome with remote debugging on port 9309
Ready: http://127.0.0.1:8087
Local: http://127.0.0.1:3087/
Bootstrap URL (recommended):
http://127.0.0.1:8087/__setta__/bootstrap#token=test-main-token
EOF
sleep 6
""",
    )
    _write_executable(
        main_root / "aireset.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'aireset\\n' >> "{main_launch_trace}"
cat <<'EOF'
Starting Chrome with remote debugging on port 9310
Ready: http://127.0.0.1:8088
Local: http://127.0.0.1:3088/
Bootstrap URL (recommended):
http://127.0.0.1:8088/__setta__/bootstrap#token=test-main-reset-token
EOF
sleep 6
""",
    )
    _write_executable(
        main_root / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf 'kill\\n' >> "{main_kill_trace}"
""",
    )

    _write_executable(
        stub_dir / "curl",
        f"""#!/usr/bin/env bash
set -euo pipefail
url="${{@: -1}}"
printf '%s\\n' "$url" >> "{curl_trace}"
case "$url" in
  http://127.0.0.1:3087/)
    exit 7
    ;;
  http://127.0.0.1:3088/)
    exit 0
    ;;
esac
exit 7
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
printf '\\n- blocked after main retry test\\n' >> "{history_path}"
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
    env["RALPH_MAIN_FRONTEND_HEALTH_TIMEOUT_SECONDS"] = "2"

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
    assert (
        "Main bootstrap via ai did not yield a healthy frontend; retrying once with restart-aireset."
        in result.stderr
    )

    rendered_prompt = (
        output_dir / "run-001" / "rendered-start-prompt.txt"
    ).read_text(encoding="utf-8")
    assert (
        "- current main reference frontend url: http://127.0.0.1:3088/"
        in rendered_prompt
    )
    assert "- current main reference backend url: http://127.0.0.1:8088" in rendered_prompt
    assert "- current main reference debug port: 9310" in rendered_prompt
    assert (
        "- current main reference runtime log: "
        f"{output_dir / 'run-001' / 'main-aireset.log'}"
        in rendered_prompt
    )

    assert main_launch_trace.read_text(encoding="utf-8").splitlines() == [
        "ai",
        "aireset",
    ]
    assert main_kill_trace.read_text(encoding="utf-8").splitlines().count("kill") >= 1
    assert curl_trace.read_text(encoding="utf-8").splitlines() == [
        "http://127.0.0.1:3087/",
        "http://127.0.0.1:3087/",
        "http://127.0.0.1:3088/",
    ]


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


def test_run_codex_loop_runs_periodic_progress_review_and_accepts_replan(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Periodic review prompt body.\n", encoding="utf-8")
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
                "iterations: 2",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 1",
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

    iteration_count_path = tmp_path / "iteration-count.txt"
    review_count_path = tmp_path / "review-count.txt"

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
prompt_body="$(cat)"
if [[ "${{prompt_body}}" == *"Progress review checkpoint."* ]]; then
  review_count=0
  if [[ -f "{review_count_path}" ]]; then
    review_count="$(cat "{review_count_path}")"
  fi
  review_count="$((review_count + 1))"
  printf '%s\\n' "${{review_count}}" > "{review_count_path}"
  printf '\\n## Review\\n- tightened the next frontier\\n' >> "{handoff_path}"
  printf '\\n## Review adjustment\\n- pivot to the narrower frontier\\n' >> "{plan_path}"
  printf '\\n- progress review tightened the next frontier\\n' >> "{history_path}"
  cat <<'EOF' > "${{last_message}}"
PROGRESS_REVIEW_DECISION: replan_and_continue
PROGRESS_REVIEW_SUMMARY: the last stretch needed a narrower next frontier
PROGRESS_REVIEW_NEXT_ACTION: continue from the updated plan and handoff
EOF
  cat "${{last_message}}"
  exit 0
fi

iteration_count=0
if [[ -f "{iteration_count_path}" ]]; then
  iteration_count="$(cat "{iteration_count_path}")"
fi
iteration_count="$((iteration_count + 1))"
printf '%s\\n' "${{iteration_count}}" > "{iteration_count_path}"
printf '\\n## Latest iteration\\n- Status: subtask %s complete\\n' "${{iteration_count}}" >> "{handoff_path}"
printf '\\n- iteration %s complete\\n' "${{iteration_count}}" >> "{history_path}"
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
            "2",
            "--progress-review-every",
            "2",
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
    assert iteration_count_path.read_text(encoding="utf-8").strip() == "2"
    assert review_count_path.read_text(encoding="utf-8").strip() == "1"
    assert "Progress review replan_and_continue" in result.stdout
    assert "Review adjustment" in plan_path.read_text(encoding="utf-8")

    review_status_path = output_dir / "progress-review-001" / "status.txt"
    assert review_status_path.exists()
    review_status_text = review_status_path.read_text(encoding="utf-8")
    assert "status=success" in review_status_text
    assert "decision=replan_and_continue" in review_status_text
    assert "trigger_successful_iterations=2" in review_status_text


def test_run_codex_loop_stops_when_periodic_progress_review_requests_stop(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Periodic review prompt body.\n", encoding="utf-8")
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
                "iterations: until_done",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 1",
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

    iteration_count_path = tmp_path / "iteration-count.txt"
    review_count_path = tmp_path / "review-count.txt"

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
prompt_body="$(cat)"
if [[ "${{prompt_body}}" == *"Progress review checkpoint."* ]]; then
  review_count=0
  if [[ -f "{review_count_path}" ]]; then
    review_count="$(cat "{review_count_path}")"
  fi
  review_count="$((review_count + 1))"
  printf '%s\\n' "${{review_count}}" > "{review_count_path}"
  printf '\\n## Review\\n- stop the current automatic lane\\n' >> "{handoff_path}"
  printf '\\n- progress review stopped the current automatic lane\\n' >> "{history_path}"
  cat <<'EOF' > "${{last_message}}"
PROGRESS_REVIEW_DECISION: stop
PROGRESS_REVIEW_SUMMARY: the current lane reached diminishing returns
PROGRESS_REVIEW_NEXT_ACTION: inspect the updated handoff before more autonomous work
EOF
  cat "${{last_message}}"
  exit 0
fi

iteration_count=0
if [[ -f "{iteration_count_path}" ]]; then
  iteration_count="$(cat "{iteration_count_path}")"
fi
iteration_count="$((iteration_count + 1))"
printf '%s\\n' "${{iteration_count}}" > "{iteration_count_path}"
printf '\\n## Latest iteration\\n- Status: one more subtask complete\\n' >> "{handoff_path}"
printf '\\n- iteration %s complete\\n' "${{iteration_count}}" >> "{history_path}"
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
            "until_done",
            "--progress-review-every",
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
    assert iteration_count_path.read_text(encoding="utf-8").strip() == "1"
    assert review_count_path.read_text(encoding="utf-8").strip() == "1"
    assert "Progress review stopped the loop" in result.stdout
    assert not (output_dir / "run-002").exists()

    review_status_path = output_dir / "progress-review-001" / "status.txt"
    assert review_status_path.exists()
    review_status_text = review_status_path.read_text(encoding="utf-8")
    assert "status=success" in review_status_text
    assert "decision=stop" in review_status_text


def test_run_codex_loop_honors_stop_request_after_completed_iteration(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

    worktree_root = tmp_path / "worktree"
    stub_dir = tmp_path / "bin"
    output_dir = tmp_path / "output"
    worktree_root.mkdir(parents=True, exist_ok=True)
    stub_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Stop request prompt body.\n", encoding="utf-8")
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

    iteration_count_path = tmp_path / "iteration-count.txt"
    stop_request_path = tmp_path / "stop-after-iteration.request"

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
iteration_count=0
if [[ -f "{iteration_count_path}" ]]; then
  iteration_count="$(cat "{iteration_count_path}")"
fi
iteration_count="$((iteration_count + 1))"
printf '%s\\n' "${{iteration_count}}" > "{iteration_count_path}"
sleep 1
if [[ "${{iteration_count}}" -eq 1 ]]; then
  touch "{stop_request_path}"
fi
printf '\\n## Latest iteration\\n- Status: stop request %s complete\\n' "${{iteration_count}}" >> "{handoff_path}"
printf '\\n- stop request iteration %s complete\\n' "${{iteration_count}}" >> "{history_path}"
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
            "until_done",
            "--progress-review-every",
            "0",
            "--stop-after-iteration-file",
            str(stop_request_path),
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
    assert iteration_count_path.read_text(encoding="utf-8").strip() == "1"
    assert "[1/until_done] LOOP_STATUS: SUBTASK_DONE" in result.stdout
    assert "[1/until_done] LOOP_VERIFY_RESULT: pass" in result.stdout
    assert "[1/until_done] LOOP_TERMINAL_MARKER: none" in result.stdout
    assert "Stop requested. Current iteration completed" in result.stdout
    assert (output_dir / "run-001").exists()
    assert not (output_dir / "run-002").exists()


def test_run_codex_loop_falls_back_to_codex_from_installed_nvm_bin(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    script_path = repo_root / "scripts" / "run-codex-loop.sh"

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
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"worktree list --porcelain"* ]]; then
  exit 0
fi
if [[ "$*" == *"rev-parse --absolute-git-dir"* ]]; then
  printf '%s\\n' /tmp/fake-git-dir
  exit 0
fi
if [[ "$*" == *"rev-parse HEAD"* ]]; then
  printf '%s\\n' 1111111111111111111111111111111111111111
  exit 0
fi
exit 0
""",
    )

    _write_executable(
        codex_bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '\\n## Latest iteration\\n- Status: blocked\\n' >> "{handoff_path}"
printf '\\n- nvm codex fallback\\n' >> "{history_path}"
cat <<'EOF'
LOOP_STATUS: BLOCKED
LOOP_SUMMARY: fallback codex path worked
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
    env["HOME"] = str(home_dir)
    env["NVM_DIR"] = str(home_dir / ".nvm")
    env["PATH"] = f"{stub_dir}:/usr/bin:/bin:/usr/sbin:/sbin"

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
    assert "[1/1] LOOP_STATUS: BLOCKED" in result.stdout
    assert "codex CLI not found on PATH" not in result.stderr
