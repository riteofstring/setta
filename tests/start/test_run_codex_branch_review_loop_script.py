import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


CONSOLIDATE_PROMPT = (
    "Read all the top-level review*.md docs. Each review document is a review of the "
    "current code base, written by a different person. Present me the consolidated "
    "findings, including the proposed fixes, and the UX/DX before/after the proposed fixes.\n"
)
FIX_PROMPT = (
    "Implement the fixes. Add unit, integration, and Playwright tests when appropriate. "
    "Bias strongly toward clean, easy-to-read code: prefer the simplest correct design, "
    "explicit names, shallow control flow, and small focused functions/components. Remove "
    "dead or superseded code instead of layering on more logic. Avoid clever abstractions, "
    'speculative generalization, unnecessary indirection, and "just-in-case" helpers. '
    "If the current area is convoluted, refactor it as part of the fix so the final code "
    "is simpler and easier to understand. The CDP MCP server is already running and "
    "available for you to use, so do not try to start it up yourself, and you should not "
    "run `pnpm start` or `pnpm reset`.\n"
)
FINALIZE_PROMPT = (
    "Add a new detailed entry to cumulative_review.md (use date time as the heading). "
    "Then run pnpm -C frontend gcf. Run check_quality.sh, then commit all of that "
    "(including cumulative_review.md but excluding the review*.md docs). Remove all "
    "top-level review*.md files\n"
)


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


def _create_git_repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True, text=True)
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    (root / "README.md").write_text("initial\n", encoding="utf-8")
    subprocess.run(["git", "add", "README.md"], cwd=root, check=True, capture_output=True, text=True)
    subprocess.run(
        ["git", "commit", "-m", "init"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    return root


def _runner_script() -> Path:
    return repo_root() / "scripts" / "run-codex-branch-review-loop.sh"


def test_branch_review_loop_help_mentions_parallel_reviews_and_stop_behavior() -> None:
    result = subprocess.run(
        ["bash", str(_runner_script()), "--help"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "start three separate Codex review sessions in parallel" in result.stdout
    assert "A clean stop may leave only top-level `review1.md`, `review2.md`, and" in result.stdout
    assert "--root-dir PATH" in result.stdout


def test_branch_review_loop_stops_after_clean_consolidation(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    _write_executable(
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
  printf 'review output for %s\\n' "$(basename "${{response_file}}")" > "${{response_file}}"
  exit 0
fi

printf '{{"type":"thread.started","thread_id":"thread-stop"}}\\n'
printf 'All three reviews found no issues.\\n' > "${{response_file}}"
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
            "bash",
            str(_runner_script()),
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
    assert (repo_dir / "review1.md").read_text(encoding="utf-8").strip() == "review output for review1.md"
    assert (repo_dir / "review2.md").read_text(encoding="utf-8").strip() == "review output for review2.md"
    assert (repo_dir / "review3.md").read_text(encoding="utf-8").strip() == "review output for review3.md"
    assert (output_dir / "run-001" / "status.txt").read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (
        output_dir / "state" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    status_lines = subprocess.run(
        ["git", "status", "--short"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip().splitlines()
    assert sorted(status_lines) == ["?? review1.md", "?? review2.md", "?? review3.md"]
    assert (output_dir / "state" / "consolidate-prompt.md").read_text(encoding="utf-8") == CONSOLIDATE_PROMPT
    assert (output_dir / "state" / "fix-prompt.md").read_text(encoding="utf-8") == FIX_PROMPT
    assert (output_dir / "state" / "finalize-prompt.md").read_text(encoding="utf-8") == FINALIZE_PROMPT
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 4
    assert "call:exec resume" not in calls


def test_branch_review_loop_fixes_and_commits_after_findings(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    resume_count_file = tmp_path / "resume-count.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    _write_executable(
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
  cat > "${{response_file}}" <<'EOR'
1. Merge recommendation + top risks

2. Findings by root-cause cluster
- Severity: high
- Merge risk: major
- Concrete evidence: README.md:1
- Violated invariant: branch docs should describe current behavior clearly
- Principled fix that removes the whole issue class (no BC shim): update README.md
- UX/DX before vs after fix
- Regression tests to add/update (unit/integration/e2e) with exact assertions

3. Dead code inventory
4. Backward-compatibility shim inventory (must remove)
5. Regression test plan
6. `branch_intent.md` alignment check
EOR
  exit 0
fi

if [[ "${{resume_mode}}" == "0" && "${{json_mode}}" == "1" ]]; then
  printf '{{"type":"thread.started","thread_id":"thread-fix"}}\\n'
  printf 'Consolidated finding: README should be updated.\\n' > "${{response_file}}"
  exit 0
fi

if [[ -f "{resume_count_file}" ]]; then
  resume_count="$(cat "{resume_count_file}")"
fi
resume_count="$((resume_count + 1))"
printf '%s\\n' "${{resume_count}}" > "{resume_count_file}"

if [[ "${{resume_count}}" == "1" ]]; then
  printf 'fixed branch issues\\n' >> "{repo_dir}/README.md"
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

    result = _run(
        [
            "bash",
            str(_runner_script()),
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
    assert "fixed branch issues" in (repo_dir / "README.md").read_text(encoding="utf-8")
    assert (output_dir / "run-001" / "status.txt").read_text(encoding="utf-8").strip() == "success"
    assert (
        output_dir / "state" / "status.txt"
    ).read_text(encoding="utf-8").strip().startswith("advanced:")
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
    assert head_subject.stdout.strip() == "codex-branch-review: apply consolidated fixes"
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 6
    assert calls.count("call:exec resume") == 2
