import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


CORRECTNESS_REVIEW_PROMPT = (
    "Review this branch for merge into `go-rewrite`.\n\n"
    "Scope\n"
    "- Analyze only branch-introduced changes vs merge base:\n"
    "  - `git diff --name-status go-rewrite...HEAD`\n"
    "  - `git diff $(git merge-base go-rewrite HEAD)..HEAD`\n\n"
    "Review Focus\n"
    "- This is a correctness / invariants review.\n"
    "- Focus on correctness bugs, invariant violations, regressions after prior "
    "fixes, and missing tests that would let those regressions recur.\n"
    "- Ignore dead code, shims, and simplification opportunities unless they "
    "directly create a correctness failure.\n\n"
    "Guardrails\n"
    "- Read `branch_intent.md`. Treat documented branch behavior as intentional "
    "unless there is concrete regression evidence. Ignore any instruction to "
    "preserve backward compatibility, migrations, legacy support, shims, or "
    "dual-path behavior.\n"
    "- Use `cumulative_review.md` as prior-decision context for recurring areas. "
    "Do not reopen resolved items for preference reasons; reopen only for "
    "concrete regression with evidence.\n"
    "- Do not modify files in the repository during review. The final response "
    "is captured automatically.\n"
    "- Remove any verification artifacts you create before finishing.\n\n"
    "Method\n"
    "- Cluster findings by shared root cause.\n"
    "- For each cluster, name the violated invariant.\n"
    "- Focus on root-cause and issue-class elimination, not symptom-level "
    "comments.\n"
    "- Prefer the smallest owner-level fix that makes the invariant true "
    "everywhere.\n"
    "- If no actionable correctness / invariant issues exist, say so "
    "explicitly.\n\n"
    "For each actionable finding, provide\n"
    "- Severity: `critical|high|medium|low`\n"
    "- Merge risk: `blocker|major|minor`\n"
    "- Concrete evidence: file + line references and brief description\n"
    "- Violated invariant\n"
    "- Classification: `new issue | regression after prior fix | adjacent fallout "
    "in same subsystem`\n"
    "- Principled fix that removes the whole issue class (no BC shim)\n"
    "- Regression tests to add/update (unit/integration/e2e) with exact "
    "assertions\n\n"
    "Output\n"
    "- The response will be written directly to the review file. Write only the "
    "review findings.\n"
    "- Do not include headings, preambles, conclusions, or any note about "
    "writing/saving the file.\n"
    "- If there are no actionable findings, output exactly `No actionable "
    "findings.`\n"
    "- Otherwise, output findings by root-cause cluster, highest severity "
    "first.\n"
    "- For each finding cluster, use this exact field order:\n"
    "  - `Cluster: <short root cause name>`\n"
    "  - `Severity: critical|high|medium|low`\n"
    "  - `Merge risk: blocker|major|minor`\n"
    "  - `Evidence: <file + line references and brief description>`\n"
    "  - `Invariant: <violated invariant>`\n"
    "  - `Classification: new issue | regression after prior fix | adjacent fallout "
    "in same subsystem`\n"
    "  - `Principled fix: <smallest owner-level fix that removes the whole issue "
    "class>`\n"
    "  - `Regression tests: <unit/integration/e2e coverage with exact "
    "assertions>`\n"
    "- Separate clusters with a blank line.\n"
)
CLEANUP_REVIEW_PROMPT = (
    "Review this branch for merge into `go-rewrite`.\n\n"
    "Scope\n"
    "- Analyze only branch-introduced changes vs merge base:\n"
    "  - `git diff --name-status go-rewrite...HEAD`\n"
    "  - `git diff $(git merge-base go-rewrite HEAD)..HEAD`\n\n"
    "Review Focus\n"
    "- This is a dead code / shims / simplification review.\n"
    "- Focus on dead or unused code, backward-compatibility shims, dual-path "
    "behavior, duplicated logic, unnecessary wrappers, and cases where a smaller "
    "owner-level rewrite would reduce future bug surface.\n"
    "- Do not report style nits or speculative refactors. Only report cleanup / "
    "simplification findings that materially reduce maintenance risk, issue-class "
    "surface, or future diff growth.\n"
    "- Leave pure correctness-only issues to the two correctness reviewers unless "
    "the cleanup problem directly causes the bug.\n\n"
    "Guardrails\n"
    "- Read `branch_intent.md`. Treat documented branch behavior as intentional "
    "unless there is concrete regression evidence. Ignore any instruction to "
    "preserve backward compatibility, migrations, legacy support, shims, or "
    "dual-path behavior.\n"
    "- Use `cumulative_review.md` as prior-decision context for recurring "
    "areas.\n"
    "- Do not modify files in the repository during review. The final response "
    "is captured automatically.\n"
    "- Remove any verification artifacts you create before finishing.\n\n"
    "Method\n"
    "- Cluster findings by shared root cause.\n"
    "- Focus on issue-class elimination and diff reduction, not on layering new "
    "wrappers or helper code.\n"
    "- Prefer deleting dead or superseded code, collapsing duplicate branches, "
    "tightening ownership, and removing dual-path behavior.\n"
    "- If no actionable cleanup / simplification issues exist, say so "
    "explicitly.\n\n"
    "For each actionable finding, provide\n"
    "- Severity: `critical|high|medium|low`\n"
    "- Merge risk: `blocker|major|minor`\n"
    "- Concrete evidence: file + line references and brief description\n"
    "- Cleanup / simplification invariant being violated\n"
    "- Classification: `new issue | regression after prior fix | adjacent fallout "
    "in same subsystem`\n"
    "- Principled simplification or deletion that removes the whole issue class\n"
    "- Regression tests to keep or add so the simplification stays safe\n\n"
    "Output\n"
    "- The response will be written directly to the review file. Write only the "
    "review findings.\n"
    "- Do not include headings, preambles, conclusions, or any note about "
    "writing/saving the file.\n"
    "- If there are no actionable findings, output exactly `No actionable "
    "findings.`\n"
    "- Otherwise, output findings by root-cause cluster, highest severity "
    "first.\n"
    "- For each finding cluster, use this exact field order:\n"
    "  - `Cluster: <short root cause name>`\n"
    "  - `Severity: critical|high|medium|low`\n"
    "  - `Merge risk: blocker|major|minor`\n"
    "  - `Evidence: <file + line references and brief description>`\n"
    "  - `Invariant: <cleanup / simplification invariant being violated>`\n"
    "  - `Classification: new issue | regression after prior fix | adjacent fallout "
    "in same subsystem`\n"
    "  - `Principled fix: <principled simplification or deletion that removes the "
    "whole issue class>`\n"
    "  - `Regression tests: <tests to keep or add so the simplification stays "
    "safe>`\n"
    "- Separate clusters with a blank line.\n"
)
CONSOLIDATE_PROMPT = (
    "Read all the top-level review*.md docs. Each review document is a review of the "
    "current code base, written by a different person.\n\n"
    "Guardrails\n"
    "- Read `branch_intent.md`. Treat documented branch behavior as intentional "
    "unless there is concrete regression evidence.\n"
    "- Use `cumulative_review.md` as prior-decision context for recurring areas. "
    "Do not treat prior review-driven changes as findings again unless there is "
    "concrete regression evidence.\n\n"
    "Output requirements:\n"
    "- The first non-empty line must be exactly one of:\n"
    "  - `CONSOLIDATED_STATUS: NO_FINDINGS`\n"
    "  - `CONSOLIDATED_STATUS: FINDINGS_PRESENT`\n"
    "- Use `CONSOLIDATED_STATUS: NO_FINDINGS` only when the consolidated outcome is "
    "that there are no findings to fix.\n"
    "- Use `CONSOLIDATED_STATUS: FINDINGS_PRESENT` if there are findings to fix, or if "
    "the review docs conflict, are ambiguous, or are malformed such that you cannot "
    "confidently conclude there are no findings.\n"
    "- The three reviews intentionally use different lenses: two correctness / "
    "invariants reviews and one dead-code / shims / simplification review. Treat "
    "missing commentary outside a reviewer's specialty area as neutral rather "
    "than a conflict by itself.\n\n"
    "After the sentinel line:\n"
    "- If the status is `NO_FINDINGS`, briefly explain why the three reviews add up "
    "to no actionable findings, and call out any caveats or blocked verification "
    "worth knowing before merge.\n"
    "- If the status is `FINDINGS_PRESENT`, cluster findings by root cause.\n"
    "- For each finding cluster, cite the affected recurring subsystem invariant from "
    "`cumulative_review.md`, or label it `new subsystem: <name>` if none fits.\n"
    "- For each finding cluster, include classification (`new issue | regression "
    "after prior fix | adjacent fallout`), concrete evidence, principled fix, and "
    "exact regression tests.\n"
    "- End with any blocked verification or residual risk that prevents confident "
    "merge.\n"
)
FIX_PROMPT = (
    "Implement the consolidated fixes.\n\n"
    "Guardrails\n"
    "- Read `branch_intent.md`. Do not undo documented branch behavior unless the "
    "consolidated findings show a concrete regression.\n"
    "- Use `cumulative_review.md` as prior-decision context. Do not undo prior "
    "review-driven changes for preference reasons; only change them when the "
    "consolidated findings classify the area as `regression after prior fix` or "
    "`adjacent fallout` with concrete evidence.\n\n"
    "Method\n"
    "- Prefer owner-level fixes that remove the issue class instead of patching "
    "symptoms at multiple call sites.\n"
    "- Keep the result as small and simple as possible: delete dead or "
    "superseded code, avoid wrapper growth, compatibility shims, dual-path "
    "behavior, and speculative abstractions.\n"
    "- If a finding touches a subsystem in the recurring matrix at the top of "
    "`cumulative_review.md`, fix that invariant and extend the proof tests for "
    "that subsystem.\n\n"
    "Verification\n"
    "- Add unit, integration, and Playwright tests when appropriate.\n"
    "- When browser/CDP visual verification is needed, use `./aireset.sh` and "
    "stop that session afterwards.\n"
    "- If UI behavior changed, browser verification counts only if one affected "
    "flow actually ran end-to-end in Playwright or CDP.\n"
    "- Before finishing, run `pnpm -C frontend gcf` and `./check_quality.sh`, "
    "then fix any issues they surface against the current worktree.\n\n"
    "Do not update `cumulative_review.md`, remove the top-level `review*.md` "
    "files, or commit. Do not run `pnpm start` or `pnpm reset`.\n"
)
SIMPLIFY_PROMPT = (
    "Simplify the current iteration's uncommitted fixes before commit.\n\n"
    "Context:\n"
    "- Read `branch_intent.md`, the current iteration's consolidated findings, "
    "and the fix-stage response first.\n"
    "- Preserve documented branch intent plus the behavior, invariants, and test "
    "expectations established by the consolidated findings and fix-stage "
    "response.\n"
    "- Use `cumulative_review.md` as prior-decision context. Do not undo prior "
    "review-driven changes unless the consolidated findings classify the area as "
    "`regression after prior fix` or `adjacent fallout` with concrete evidence.\n\n"
    "Scope:\n"
    "- Review only the current uncommitted diff vs `HEAD`:\n"
    "  - `git diff --stat HEAD`\n"
    "  - `git diff --name-only HEAD`\n"
    "- Touch only files already changed in this iteration unless a narrowly related "
    "cleanup is required to complete a simplification safely.\n\n"
    "Goals:\n"
    "- Focus on simpler ownership, control flow, and issue-class surface without "
    "weakening the fixes.\n"
    "- Prefer deleting dead or superseded code, collapsing duplicated branches, "
    "flattening control flow, tightening ownership, and clearer owner-level "
    "rewrites. A small increase in lines or a narrowly related new file is "
    "acceptable when it makes the fix meaningfully simpler.\n"
    '- Do not add compatibility shims, fallback paths, or "just in case" helpers.\n'
    "\n"
    "Verification:\n"
    "- Re-run the focused tests needed after the simplification.\n"
    "- When browser/CDP visual verification is needed, use `./aireset.sh` and stop "
    "that session afterwards.\n"
    "- Before finishing, run `pnpm -C frontend gcf` and "
    "`./check_quality.sh`, then fix any issues they surface against the current "
    "simplified worktree.\n"
    "- Do not update `cumulative_review.md`, do not commit, and do not remove the "
    "top-level `review*.md` files.\n\n"
    "Output:\n"
    "- Briefly summarize what you simplified, which targeted tests you ran, and "
    "any hotspot you intentionally left as-is because further simplification would "
    "be risky.\n"
)
FINALIZE_PROMPT = (
    "The current simplified worktree is authoritative. Do not change code, tests, "
    "generated files, or rerun `pnpm -C frontend gcf` / `./check_quality.sh` in "
    "this stage.\n\n"
    "Read `branch_intent.md` before writing metadata so the notes reflect "
    "intended branch behavior.\n\n"
    "Only finish iteration metadata:\n"
    "- Update `cumulative_review.md`.\n"
    "- Remove the top-level `review*.md` files.\n"
    "- Make sure any earlier `./aireset.sh` session is stopped.\n"
    "- Commit all remaining changes except `review*.md`.\n"
    "- Use a commit message that describes the actual changes being committed in "
    "this iteration. Do not use a workflow-only message about "
    "review/finalization/metadata.\n\n"
    "`cumulative_review.md` format:\n"
    "- If the file is empty, start with:\n"
    "  - `# Cumulative Review`\n"
    "  - `## Recurring Subsystem Invariant Matrix`\n"
    "- For each touched or new recurring subsystem, add or update:\n"
    "  - `### <Subsystem Name>`\n"
    "  - `- Invariant: ...`\n"
    "  - `- Last finding commit: <pre-finalization HEAD>`\n"
    "  - `- Proof tests: ...`\n"
    "  - `- Still unverified: ...`\n"
    "- Then append one dated entry:\n"
    "  - `## YYYY-MM-DD HH:MM[:SS] TZ`\n"
    "  - `Fixes applied:`\n"
    "  - `Tests added or upgraded:`\n"
    "  - `Verification run:`\n"
    "  - `Residual risks / verification gaps:`\n\n"
    "Keep it factual and concise. No boilerplate. Be explicit about blocked "
    "verification and browser-verification status.\n"
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


def _standalone_wrapper_script() -> Path:
    return repo_root() / "scripts" / "run-codex-app-subsystem-standalone-branch-review-loop.sh"


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
    assert "--extra-prompt TEXT" in result.stdout
    assert "--extra-prompt-file PATH" in result.stdout


def test_app_subsystem_standalone_branch_review_wrapper_passes_custom_prompt_file() -> None:
    wrapper = _standalone_wrapper_script().read_text(encoding="utf-8")

    assert 'PROMPT_FILE="${SCRIPT_DIR}/prompts/app-subsystem-standalone-plugin-review.md"' in wrapper
    assert 'exec "${SCRIPT_DIR}/run-codex-branch-review-loop.sh" \\' in wrapper
    assert '--extra-prompt-file "${PROMPT_FILE}"' in wrapper
    assert '"$@"' in wrapper


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
    assert (repo_dir / "review1.md").read_text(encoding="utf-8").strip() == "No actionable findings."
    assert (repo_dir / "review2.md").read_text(encoding="utf-8").strip() == "No actionable findings."
    assert (repo_dir / "review3.md").read_text(encoding="utf-8").strip() == "No actionable findings."
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
    assert (
        output_dir / "state" / "review-correctness-prompt.md"
    ).read_text(encoding="utf-8") == CORRECTNESS_REVIEW_PROMPT
    assert (
        output_dir / "state" / "review-cleanup-prompt.md"
    ).read_text(encoding="utf-8") == CLEANUP_REVIEW_PROMPT
    assert (output_dir / "state" / "consolidate-prompt.md").read_text(encoding="utf-8") == CONSOLIDATE_PROMPT
    assert (output_dir / "state" / "fix-prompt.md").read_text(encoding="utf-8") == FIX_PROMPT
    assert (output_dir / "state" / "simplify-prompt.md").read_text(encoding="utf-8") == SIMPLIFY_PROMPT
    assert (output_dir / "state" / "finalize-prompt.md").read_text(encoding="utf-8") == FINALIZE_PROMPT
    assert not (output_dir / "run-001" / "simplify-prompt.md").exists()
    assert not (output_dir / "state" / "last-observed-head.txt").exists()
    assert not (output_dir / "run-001" / "review1.exit").exists()
    calls = calls_file.read_text(encoding="utf-8")
    assert "`Lens: correctness/invariants`" not in calls
    assert "`Lens: dead-code/shims/simplification`" not in calls
    assert calls.count("Write only the review findings.") == 3
    assert calls.count(
        "Do not include headings, preambles, conclusions, or any note about writing/saving the file."
    ) == 3
    assert calls.count("call:exec ") == 4
    assert "call:exec resume" not in calls
    assert "review-worktree-1" in calls
    assert "review-worktree-2" in calls
    assert "review-worktree-3" in calls


def test_branch_review_loop_allows_nonstandard_review_output(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    bad_review_file = tmp_path / "bad-review.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    _write_executable(
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
    assert (
        output_dir / "run-001" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (
        output_dir / "state" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (repo_dir / "review1.md").read_text(encoding="utf-8").strip() == "No actionable findings."
    assert (repo_dir / "review2.md").read_text(encoding="utf-8").strip() == "Wrote the findings to review1.md."
    assert (repo_dir / "review3.md").read_text(encoding="utf-8").strip() == "No actionable findings."
    loop_log = (output_dir / "loop.log").read_text(encoding="utf-8")
    assert "Review output must start with `Cluster:` or exactly `No actionable findings.`" not in loop_log
    calls = calls_file.read_text(encoding="utf-8")
    assert "review-worktree-2" in calls
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
    readme_text = (repo_dir / "README.md").read_text(encoding="utf-8")
    assert "simplified branch issues" in readme_text
    assert "temporary layered logic" not in readme_text
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
    assert (output_dir / "state" / "simplify-prompt.md").read_text(encoding="utf-8") == SIMPLIFY_PROMPT
    run_simplify_prompt = (output_dir / "run-001" / "simplify-prompt.md").read_text(encoding="utf-8")
    assert "Consolidated findings:" in run_simplify_prompt
    assert str(output_dir / "run-001" / "consolidated-findings.md") in run_simplify_prompt
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
    assert (output_dir / "run-001" / "status.txt").read_text(encoding="utf-8").strip() == "failure:fix"
    assert (output_dir / "state" / "status.txt").read_text(encoding="utf-8").strip() == "retrying:failure:fix"
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
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    kill_log_file = tmp_path / "kill-log.txt"
    consolidate_count_file = tmp_path / "consolidate-count.txt"
    resume_count_file = tmp_path / "resume-count.txt"
    output_dir.mkdir()
    bin_dir.mkdir()

    _write_executable(
        repo_dir / "kill.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail

printf 'stop\\n' >> "{kill_log_file}"
""",
    )
    subprocess.run(["git", "add", "kill.sh"], cwd=repo_dir, check=True, capture_output=True, text=True)
    subprocess.run(
        ["git", "commit", "-m", "add kill helper"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
        text=True,
    )

    _write_executable(
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

    result = _run(
        [
            "bash",
            str(_runner_script()),
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
    assert (
        output_dir / "run-001" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "success"
    assert (
        output_dir / "run-002" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert kill_log_file.read_text(encoding="utf-8").splitlines() == ["stop"]
    assert (repo_dir / "review1.md").exists()
    assert (repo_dir / "review2.md").exists()
    assert (repo_dir / "review3.md").exists()


def test_branch_review_loop_repairs_invalid_consolidated_status_in_session(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    consolidate_count_file = tmp_path / "consolidate-count.txt"
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
    assert "recognized consolidated status sentinel" in result.stderr
    assert (
        output_dir / "run-001" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (
        output_dir / "state" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
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
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == "initial\nsimplified branch issues\n"
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
    assert "did not create a commit" in calls
    assert calls.count("call:exec ") == 8
    assert calls.count("call:exec resume") == 3
    assert calls.count(f"--cd {repo_dir}") == 2


def test_branch_review_loop_allows_simplify_to_expand_diff_when_simpler(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    consolidate_count_file = tmp_path / "consolidate-count.txt"
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
fixed branch issues
temporary layered logic
even more temporary layered logic
EOR
  cat > "{repo_dir}/internal-note.txt" <<'EOR'
split helper state
EOR
  printf 'simplified poorly\\n' > "${{response_file}}"
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

README should be tightened.
EOR
    exit 0
  fi

  printf '{{"type":"thread.started","thread_id":"thread-stop"}}\\n'
  cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: NO_FINDINGS

Recovered cleanly after retry.
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
EOR
  printf 'implemented fixes\\n' > "${{response_file}}"
  exit 0
fi

rm -f "{repo_dir}/review1.md" "{repo_dir}/review2.md" "{repo_dir}/review3.md"
git -C "{repo_dir}" add README.md internal-note.txt
git -C "{repo_dir}" commit -m "Finalize simplified fixes" >/dev/null
printf 'finalized\\n' > "${{response_file}}"
exit 0
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
    assert (
        output_dir / "run-001" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "success"
    assert (
        output_dir / "run-002" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (
        output_dir / "state" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == (
        "initial\nfixed branch issues\ntemporary layered logic\neven more temporary layered logic\n"
    )
    assert (repo_dir / "internal-note.txt").read_text(encoding="utf-8") == "split helper state\n"
    assert (repo_dir / "review1.md").exists()
    assert (repo_dir / "review2.md").exists()
    assert (repo_dir / "review3.md").exists()
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 11
    assert calls.count("call:exec resume") == 2


def test_branch_review_loop_retries_after_finalize_modifies_code(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    consolidate_count_file = tmp_path / "consolidate-count.txt"
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

README should be tightened.
EOR
    exit 0
  fi

  printf '{{"type":"thread.started","thread_id":"thread-stop"}}\\n'
  cat > "${{response_file}}" <<'EOR'
CONSOLIDATED_STATUS: NO_FINDINGS

Recovered cleanly after retry.
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

- Finalize wrote metadata.
EOC
printf 're-expanded logic\\n' >> "{repo_dir}/README.md"
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
    assert (
        output_dir / "run-001" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "failure:finalize-modified-code"
    assert (
        output_dir / "run-002" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (
        output_dir / "state" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == "initial\n"
    assert (repo_dir / "review1.md").exists()
    assert (repo_dir / "review2.md").exists()
    assert (repo_dir / "review3.md").exists()
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 11
    assert calls.count("call:exec resume") == 2
