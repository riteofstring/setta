import os
import subprocess
from pathlib import Path

from tests.start.branch_review_loop_prompts import (
    CLEANUP_REVIEW_PROMPT,
    CONSOLIDATE_PROMPT,
    CORRECTNESS_REVIEW_PROMPT,
    FINALIZE_PROMPT,
    FIX_PROMPT,
    SIMPLIFY_PROMPT,
)
from tests.start.branch_review_loop_test_helpers import (
    create_git_repo,
    run_branch_review_command,
    runner_script,
    standalone_wrapper_script,
    write_executable,
)


def test_branch_review_loop_help_mentions_parallel_reviews_and_stop_behavior() -> None:
    result = subprocess.run(
        ["bash", str(runner_script()), "--help"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "start three separate Codex review sessions in parallel" in result.stdout
    assert (
        "A clean stop may leave only top-level `review1.md`, `review2.md`, and"
        in result.stdout
    )
    assert "--root-dir PATH" in result.stdout
    assert "--extra-prompt TEXT" in result.stdout
    assert "--extra-prompt-file PATH" in result.stdout


def test_app_subsystem_standalone_branch_review_wrapper_passes_custom_prompt_file() -> (
    None
):
    wrapper = standalone_wrapper_script().read_text(encoding="utf-8")

    assert (
        'PROMPT_FILE="${SCRIPT_DIR}/prompts/app-subsystem-standalone-plugin-review.md"'
        in wrapper
    )
    assert 'exec "${SCRIPT_DIR}/run-codex-branch-review-loop.sh" \\' in wrapper
    assert '--extra-prompt-file "${PROMPT_FILE}"' in wrapper
    assert '"$@"' in wrapper


def test_branch_review_loop_appends_extra_prompt_file(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    extra_prompt_file = tmp_path / "extra-prompt.md"
    output_dir.mkdir()
    bin_dir.mkdir()
    extra_prompt_file.write_text("Extra branch invariant.\n", encoding="utf-8")

    write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
json_mode="0"
prompt="$(cat)"

printf 'prompt:%s\\n===\\n' "${{prompt}}" >> "{calls_file}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      response_file="$2"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    --color|--cd|--model|--config)
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox|--ephemeral|never|-)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${{json_mode}}" == "0" ]]; then
  printf 'No actionable findings.\\n' > "${{response_file}}"
  exit 0
fi

printf '{{"type":"thread.started","thread_id":"thread-extra"}}\\n'
cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: NO_FINDINGS

The reviews found no actionable findings.
EOR
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = run_branch_review_command(
        [
            "bash",
            str(runner_script()),
            "--root-dir",
            str(repo_dir),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--post-commit-settle-seconds",
            "0",
            "--extra-prompt-file",
            str(extra_prompt_file),
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("Additional Instructions") == 4
    assert calls.count("Extra branch invariant.") == 4
    assert (
        (output_dir / "state" / "review-correctness-prompt.md")
        .read_text(encoding="utf-8")
        .endswith("Extra branch invariant.\n\n")
    )


def test_branch_review_loop_stops_after_clean_consolidation(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
resume_mode="0"
json_mode="0"
prompt="$(cat)"

printf 'call:%s\\n' "$*" >> "{calls_file}"
printf 'prompt:%s\\n===\\n' "${{prompt}}" >> "{calls_file}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      response_file="$2"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    resume)
      resume_mode="1"
      shift
      ;;
    --color|--cd|--model|--config)
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox|--ephemeral|never|-)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "0" ]]; then
  printf 'No actionable findings.\\n' > "${{response_file}}"
  exit 0
fi

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "1" ]]; then
  printf '{{"type":"thread.started","thread_id":"thread-stop"}}\\n'
  cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: NO_FINDINGS

All three reviews found no actionable merge-blocking issues.
EOR
  exit 0
fi

echo "unexpected resume for no-findings flow" >&2
exit 2
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = run_branch_review_command(
        [
            "bash",
            str(runner_script()),
            "--root-dir",
            str(repo_dir),
            "--iterations",
            "3",
            "--output-dir",
            str(output_dir),
            "--post-commit-settle-seconds",
            "0",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert (repo_dir / "review1.md").read_text(
        encoding="utf-8"
    ).strip() == "No actionable findings."
    assert (repo_dir / "review2.md").read_text(
        encoding="utf-8"
    ).strip() == "No actionable findings."
    assert (repo_dir / "review3.md").read_text(
        encoding="utf-8"
    ).strip() == "No actionable findings."
    assert (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert (output_dir / "state" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    status_lines = (
        subprocess.run(
            ["git", "status", "--short"],
            cwd=repo_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        .stdout.strip()
        .splitlines()
    )
    assert sorted(status_lines) == ["?? review1.md", "?? review2.md", "?? review3.md"]
    assert (output_dir / "state" / "review-correctness-prompt.md").read_text(
        encoding="utf-8"
    ) == CORRECTNESS_REVIEW_PROMPT
    assert (output_dir / "state" / "review-cleanup-prompt.md").read_text(
        encoding="utf-8"
    ) == CLEANUP_REVIEW_PROMPT
    assert (output_dir / "state" / "consolidate-prompt.md").read_text(
        encoding="utf-8"
    ) == CONSOLIDATE_PROMPT
    assert (output_dir / "state" / "fix-prompt.md").read_text(
        encoding="utf-8"
    ) == FIX_PROMPT
    assert (output_dir / "state" / "simplify-prompt.md").read_text(
        encoding="utf-8"
    ) == SIMPLIFY_PROMPT
    assert (output_dir / "state" / "finalize-prompt.md").read_text(
        encoding="utf-8"
    ) == FINALIZE_PROMPT
    assert not (output_dir / "run-001" / "simplify-prompt.md").exists()
    assert not (output_dir / "state" / "last-observed-head.txt").exists()
    assert not (output_dir / "run-001" / "review1.exit").exists()
    calls = calls_file.read_text(encoding="utf-8")
    assert "`Lens: correctness/invariants`" not in calls
    assert "`Lens: dead-code/shims/simplification`" not in calls
    assert calls.count("Write only the review findings.") == 3
    assert (
        calls.count(
            "Do not include headings, preambles, conclusions, or any note about writing/saving the file."
        )
        == 3
    )
    assert calls.count("call:exec ") == 4
    assert "call:exec resume" not in calls
    assert "review-worktree-1" in calls
    assert "review-worktree-2" in calls
    assert "review-worktree-3" in calls


def test_branch_review_loop_allows_nonstandard_review_output(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    bad_review_file = tmp_path / "bad-review.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
resume_mode="0"
json_mode="0"
workdir=""
prompt="$(cat)"

printf 'call:%s\\n' "$*" >> "{calls_file}"
printf 'prompt:%s\\n===\\n' "${{prompt}}" >> "{calls_file}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      response_file="$2"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    resume)
      resume_mode="1"
      shift
      ;;
    --cd)
      workdir="$2"
      shift 2
      ;;
    --color|--model|--config)
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox|--ephemeral|never|-)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "0" ]]; then
  if [[ "$(basename "${{response_file}}")" == review*.md ]]; then
    if [[ "$(basename "${{response_file}}")" == "review2.md" && ! -f "{bad_review_file}" ]]; then
      printf 'done\\n' > "{bad_review_file}"
      printf 'Wrote the findings to review1.md.\\n' > "${{response_file}}"
      exit 0
    fi

    printf 'No actionable findings.\\n' > "${{response_file}}"
    exit 0
  fi

  echo "unexpected non-review exec" >&2
  exit 2
fi

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "1" ]]; then
  printf '{{"type":"thread.started","thread_id":"thread-stop"}}\\n'
  cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: NO_FINDINGS

All three reviews found no actionable merge-blocking issues.
EOR
  exit 0
fi

echo "unexpected resume for nonstandard-review flow" >&2
exit 2
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = run_branch_review_command(
        [
            "bash",
            str(runner_script()),
            "--root-dir",
            str(repo_dir),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--post-commit-settle-seconds",
            "0",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert (output_dir / "state" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert (repo_dir / "review1.md").read_text(
        encoding="utf-8"
    ).strip() == "No actionable findings."
    assert (repo_dir / "review2.md").read_text(
        encoding="utf-8"
    ).strip() == "Wrote the findings to review1.md."
    assert (repo_dir / "review3.md").read_text(
        encoding="utf-8"
    ).strip() == "No actionable findings."
    loop_log = (output_dir / "loop.log").read_text(encoding="utf-8")
    assert (
        "Review output must start with `Cluster:` or exactly `No actionable findings.`"
        not in loop_log
    )
    calls = calls_file.read_text(encoding="utf-8")
    assert "review-worktree-2" in calls
    assert calls.count("call:exec ") == 4
    assert "call:exec resume" not in calls


def test_branch_review_loop_fixes_and_commits_after_findings(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    resume_count_file = tmp_path / "resume-count.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
resume_mode="0"
json_mode="0"
prompt="$(cat)"
resume_count="0"

printf 'call:%s\\n' "$*" >> "{calls_file}"
printf 'prompt:%s\\n===\\n' "${{prompt}}" >> "{calls_file}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      response_file="$2"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    resume)
      resume_mode="1"
      shift
      ;;
    --color|--cd|--model|--config)
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox|--ephemeral|never|-)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "0" ]]; then
  if [[ "$(basename "${{response_file}}")" == review*.md ]]; then
    printf 'No actionable findings.\\n' > "${{response_file}}"
    exit 0
  fi

  printf 'initial\\nsimplified branch issues\\n' > "{repo_dir}/README.md"
  printf 'simplified fixes\\n' > "${{response_file}}"
  exit 0
fi

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "1" ]]; then
  printf '{{"type":"thread.started","thread_id":"thread-fix"}}\\n'
  cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: FINDINGS_PRESENT

Consolidated finding: README should be updated.
EOR
  exit 0
fi

if [[ -f "{resume_count_file}" ]]; then
  resume_count="$(cat "{resume_count_file}")"
fi
resume_count="$((resume_count + 1))"
printf '%s\\n' "${{resume_count}}" > "{resume_count_file}"

if [[ "${{resume_count}}" == "1" ]]; then
  printf 'fixed branch issues\\n' >> "{repo_dir}/README.md"
  printf 'temporary layered logic\\n' >> "{repo_dir}/README.md"
  printf 'implemented fixes\\n' > "${{response_file}}"
  exit 0
fi

cat > "{repo_dir}/cumulative_review.md" <<'EOC'
# 2026-04-17 10:00:00

- Fixed README based on consolidated review findings.
EOC
rm -f "{repo_dir}/review1.md" "{repo_dir}/review2.md" "{repo_dir}/review3.md"
git -C "{repo_dir}" add README.md cumulative_review.md
git -C "{repo_dir}" commit -m "codex-branch-review: apply consolidated fixes" >/dev/null
printf 'finalized and committed\\n' > "${{response_file}}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = run_branch_review_command(
        [
            "bash",
            str(runner_script()),
            "--root-dir",
            str(repo_dir),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--post-commit-settle-seconds",
            "0",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert not (repo_dir / "review1.md").exists()
    assert not (repo_dir / "review2.md").exists()
    assert not (repo_dir / "review3.md").exists()
    assert (repo_dir / "cumulative_review.md").exists()
    readme_text = (repo_dir / "README.md").read_text(encoding="utf-8")
    assert "simplified branch issues" in readme_text
    assert "temporary layered logic" not in readme_text
    assert (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "success"
    assert (
        (output_dir / "state" / "status.txt")
        .read_text(encoding="utf-8")
        .strip()
        .startswith("advanced:")
    )
    status = subprocess.run(
        ["git", "status", "--short"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    assert status.stdout.strip() == ""
    head_subject = subprocess.run(
        ["git", "log", "-1", "--pretty=%s"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    assert (
        head_subject.stdout.strip() == "codex-branch-review: apply consolidated fixes"
    )
    assert (output_dir / "state" / "simplify-prompt.md").read_text(
        encoding="utf-8"
    ) == SIMPLIFY_PROMPT
    run_simplify_prompt = (output_dir / "run-001" / "simplify-prompt.md").read_text(
        encoding="utf-8"
    )
    assert "Consolidated findings:" in run_simplify_prompt
    assert (
        str(output_dir / "run-001" / "consolidated-findings.md") in run_simplify_prompt
    )
    assert str(output_dir / "run-001" / "fix-response.txt") in run_simplify_prompt
    assert not (output_dir / "state" / "last-observed-head.txt").exists()
    assert not (output_dir / "run-001" / "review1.exit").exists()
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 7
    assert calls.count("call:exec resume") == 2
    assert calls.count(f"--cd {repo_dir}") == 2


def test_branch_review_loop_recovers_after_fix_session_failure(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
resume_mode="0"
json_mode="0"
prompt="$(cat)"

printf 'call:%s\\n' "$*" >> "{calls_file}"
printf 'prompt:%s\\n===\\n' "${{prompt}}" >> "{calls_file}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      response_file="$2"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    resume)
      resume_mode="1"
      shift
      ;;
    --color|--cd|--model|--config)
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox|--ephemeral|never|-)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${{resume_mode}}" == "1" ]]; then
  echo "simulated fix-stage failure" >&2
  exit 2
fi

if [[ "${{json_mode}}" == "1" ]]; then
  printf '{{"type":"thread.started","thread_id":"thread-fix-failure"}}\\n'
  cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: FINDINGS_PRESENT

Consolidated finding: README should be updated.
EOR
  exit 0
fi

printf 'No actionable findings.\\n' > "${{response_file}}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = run_branch_review_command(
        [
            "bash",
            str(runner_script()),
            "--root-dir",
            str(repo_dir),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--post-commit-settle-seconds",
            "0",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "failure:fix"
    assert (output_dir / "state" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "retrying:failure:fix"
    assert (repo_dir / "review1.md").exists() is False
    assert (repo_dir / "review2.md").exists() is False
    assert (repo_dir / "review3.md").exists() is False
    status = subprocess.run(
        ["git", "status", "--short"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    assert status.stdout.strip() == ""
    loop_log = (output_dir / "loop.log").read_text(encoding="utf-8")
    assert "Fix phase failed; resetting to HEAD and retrying." in loop_log
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 5
    assert calls.count("call:exec resume") == 1
    assert calls.count(f"--cd {repo_dir}") == 1


def test_branch_review_loop_stops_repo_dev_sessions_between_iterations(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    kill_log_file = tmp_path / "kill-log.txt"
    consolidate_count_file = tmp_path / "consolidate-count.txt"
    resume_count_file = tmp_path / "resume-count.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    write_executable(
        repo_dir / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail

printf 'stop\\n' >> "{kill_log_file}"
""",
    )
    subprocess.run(
        ["git", "add", "kill.sh"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "add kill helper"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    )

    write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
resume_mode="0"
json_mode="0"
prompt="$(cat)"
consolidate_count="0"
resume_count="0"

printf 'call:%s\\n' "$*" >> "{calls_file}"
printf 'prompt:%s\\n===\\n' "${{prompt}}" >> "{calls_file}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      response_file="$2"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    resume)
      resume_mode="1"
      shift
      ;;
    --color|--cd|--model|--config)
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox|--ephemeral|never|-)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "0" ]]; then
  if [[ "$(basename "${{response_file}}")" == review*.md ]]; then
    printf 'No actionable findings.\\n' > "${{response_file}}"
    exit 0
  fi

  cat > "{repo_dir}/README.md" <<'EOR'
initial
simplified branch issues
EOR
  printf 'simplified fixes\\n' > "${{response_file}}"
  exit 0
fi

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "1" ]]; then
  if [[ -f "{consolidate_count_file}" ]]; then
    consolidate_count="$(cat "{consolidate_count_file}")"
  fi
  consolidate_count="$((consolidate_count + 1))"
  printf '%s\\n' "${{consolidate_count}}" > "{consolidate_count_file}"

  if [[ "${{consolidate_count}}" == "1" ]]; then
    printf '{{"type":"thread.started","thread_id":"thread-fix"}}\\n'
    cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: FINDINGS_PRESENT

Consolidated finding: README should be updated.
EOR
    exit 0
  fi

  printf '{{"type":"thread.started","thread_id":"thread-stop"}}\\n'
  cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: NO_FINDINGS

Recovered cleanly after a fresh review iteration.
EOR
  exit 0
fi

if [[ -f "{resume_count_file}" ]]; then
  resume_count="$(cat "{resume_count_file}")"
fi
resume_count="$((resume_count + 1))"
printf '%s\\n' "${{resume_count}}" > "{resume_count_file}"

if [[ "${{resume_count}}" == "1" ]]; then
  cat > "{repo_dir}/README.md" <<'EOR'
initial
fixed branch issues
temporary layered logic
EOR
  printf 'implemented fixes\\n' > "${{response_file}}"
  exit 0
fi

cat > "{repo_dir}/cumulative_review.md" <<'EOC'
# 2026-04-17 10:00:00

- Fixed README based on consolidated review findings.
EOC
rm -f "{repo_dir}/review1.md" "{repo_dir}/review2.md" "{repo_dir}/review3.md"
git -C "{repo_dir}" add README.md cumulative_review.md
git -C "{repo_dir}" commit -m "codex-branch-review: apply consolidated fixes" >/dev/null
printf 'finalized and committed\\n' > "${{response_file}}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = run_branch_review_command(
        [
            "bash",
            str(runner_script()),
            "--root-dir",
            str(repo_dir),
            "--iterations",
            "2",
            "--output-dir",
            str(output_dir),
            "--post-commit-settle-seconds",
            "0",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "success"
    assert (output_dir / "run-002" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert kill_log_file.read_text(encoding="utf-8").splitlines() == ["stop"]
    assert (repo_dir / "review1.md").exists()
    assert (repo_dir / "review2.md").exists()
    assert (repo_dir / "review3.md").exists()


def test_branch_review_loop_repairs_invalid_consolidated_status_in_session(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    consolidate_count_file = tmp_path / "consolidate-count.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
resume_mode="0"
json_mode="0"
prompt="$(cat)"
consolidate_count="0"

printf 'call:%s\\n' "$*" >> "{calls_file}"
printf 'prompt:%s\\n===\\n' "${{prompt}}" >> "{calls_file}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      response_file="$2"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    resume)
      resume_mode="1"
      shift
      ;;
    --color|--cd|--model|--config)
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox|--ephemeral|never|-)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "0" ]]; then
  printf 'No actionable findings.\\n' > "${{response_file}}"
  exit 0
fi

if [[ -f "{consolidate_count_file}" ]]; then
  consolidate_count="$(cat "{consolidate_count_file}")"
fi
consolidate_count="$((consolidate_count + 1))"
printf '%s\\n' "${{consolidate_count}}" > "{consolidate_count_file}"

printf '{{"type":"thread.started","thread_id":"thread-invalid"}}\\n'
if [[ "${{consolidate_count}}" == "1" ]]; then
  printf 'Consolidated finding without required sentinel.\\n' > "${{response_file}}"
  exit 0
fi

cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: NO_FINDINGS

Recovered cleanly after retry.
EOR
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = run_branch_review_command(
        [
            "bash",
            str(runner_script()),
            "--root-dir",
            str(repo_dir),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--post-commit-settle-seconds",
            "0",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert "recognized consolidated status sentinel" in result.stderr
    assert (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert (output_dir / "state" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert (repo_dir / "review1.md").exists()
    assert (repo_dir / "review2.md").exists()
    assert (repo_dir / "review3.md").exists()
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == "initial\n"
    calls = calls_file.read_text(encoding="utf-8")
    assert "did not begin with a valid status sentinel" in calls
    assert calls.count("call:exec ") == 5
    assert calls.count("call:exec resume") == 1


def test_branch_review_loop_repairs_missing_finalize_commit_in_session(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    resume_count_file = tmp_path / "resume-count.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail

response_file=""
resume_mode="0"
json_mode="0"
prompt="$(cat)"
resume_count="0"

printf 'call:%s\\n' "$*" >> "{calls_file}"
printf 'prompt:%s\\n===\\n' "${{prompt}}" >> "{calls_file}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      response_file="$2"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    resume)
      resume_mode="1"
      shift
      ;;
    --color|--cd|--model|--config)
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox|--ephemeral|never|-)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "0" ]]; then
  if [[ "$(basename "${{response_file}}")" == review*.md ]]; then
    printf 'No actionable findings.\\n' > "${{response_file}}"
    exit 0
  fi

  printf 'initial\\nsimplified branch issues\\n' > "{repo_dir}/README.md"
  printf 'simplified fixes\\n' > "${{response_file}}"
  exit 0
fi

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "1" ]]; then
  printf '{{"type":"thread.started","thread_id":"thread-fix"}}\\n'
  cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: FINDINGS_PRESENT

Consolidated finding: README should be updated.
EOR
  exit 0
fi

if [[ -f "{resume_count_file}" ]]; then
  resume_count="$(cat "{resume_count_file}")"
fi
resume_count="$((resume_count + 1))"
printf '%s\\n' "${{resume_count}}" > "{resume_count_file}"

if [[ "${{resume_count}}" == "1" ]]; then
  printf 'fixed branch issues\\n' >> "{repo_dir}/README.md"
  printf 'temporary layered logic\\n' >> "{repo_dir}/README.md"
  printf 'implemented fixes\\n' > "${{response_file}}"
  exit 0
fi

if [[ "${{resume_count}}" == "2" ]]; then
  cat > "{repo_dir}/cumulative_review.md" <<'EOC'
# 2026-04-17 10:00:00

- Fixed README based on consolidated review findings.
EOC
  printf 'finalize forgot to commit\\n' > "${{response_file}}"
  exit 0
fi

rm -f "{repo_dir}/review1.md" "{repo_dir}/review2.md" "{repo_dir}/review3.md"
git -C "{repo_dir}" add README.md cumulative_review.md
git -C "{repo_dir}" commit -m "codex-branch-review: apply consolidated fixes" >/dev/null
printf 'finalized and committed after repair\\n' > "${{response_file}}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = run_branch_review_command(
        [
            "bash",
            str(runner_script()),
            "--root-dir",
            str(repo_dir),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--post-commit-settle-seconds",
            "0",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert not (repo_dir / "review1.md").exists()
    assert not (repo_dir / "review2.md").exists()
    assert not (repo_dir / "review3.md").exists()
    assert (repo_dir / "cumulative_review.md").exists()
    assert (repo_dir / "README.md").read_text(
        encoding="utf-8"
    ) == "initial\nsimplified branch issues\n"
    assert (output_dir / "run-001" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "success"
    assert (
        (output_dir / "state" / "status.txt")
        .read_text(encoding="utf-8")
        .strip()
        .startswith("advanced:")
    )
    status = subprocess.run(
        ["git", "status", "--short"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    assert status.stdout.strip() == ""
    head_subject = subprocess.run(
        ["git", "log", "-1", "--pretty=%s"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    assert (
        head_subject.stdout.strip() == "codex-branch-review: apply consolidated fixes"
    )
    calls = calls_file.read_text(encoding="utf-8")
    assert "did not create a commit" in calls
    assert calls.count("call:exec ") == 8
    assert calls.count("call:exec resume") == 3
    assert calls.count(f"--cd {repo_dir}") == 2
