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

    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("Test prompt body.\n", encoding="utf-8")
    plan_path = tmp_path / "plan.md"
    plan_path.write_text("# Plan\n", encoding="utf-8")
    log_path = tmp_path / "log.md"
    log_path.write_text("# Log\n", encoding="utf-8")
    config_path = tmp_path / "RALPH.md"
    config_path.write_text(
        "\n".join(
            [
                "---",
                "plan_path: plan.md",
                "log_path: log.md",
                "prompt_file: prompt.md",
                "workdir: .",
                "iterations: 1",
                "new_session_every: 1",
                "codex_inactivity_timeout_seconds: 0",
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
        """#!/usr/bin/env bash
set -euo pipefail
cat <<'EOF'
Starting Chrome with remote debugging on port 9309
Ready: http://127.0.0.1:8087
Local: http://127.0.0.1:3087/
Bootstrap URL (recommended):
http://127.0.0.1:8087/__setta__/bootstrap#token=test-main-token
EOF
sleep 5
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

    # Return a blocked status so the loop exits cleanly without requiring a log
    # mutation from the fake Codex run.
    _write_executable(
        stub_dir / "codex",
        """#!/usr/bin/env bash
set -euo pipefail
cat >/dev/null
cat <<'EOF'
LOOP_STATUS: BLOCKED
LOOP_SUMMARY: prompt test
LOOP_NEXT_ACTION: none
LOOP_VERIFY_COMMAND: none
LOOP_VERIFY_RESULT: blocked
LOOP_RECOVERY: none
LOOP_COMMIT: none
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
            "--log-file",
            str(log_path),
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
        f"{output_dir / 'main-ai.log'}"
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
