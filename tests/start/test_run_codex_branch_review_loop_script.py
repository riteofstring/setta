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
    "Lens\n"
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
    "- Leave the repository clean except for top-level `review1.md`, "
    "`review2.md`, and `review3.md`. Remove any verification artifacts you "
    "create.\n\n"
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
    "Output format\n"
    "1. `Lens: correctness/invariants`\n"
    "2. Either `No actionable findings.` or findings by root-cause cluster "
    "(highest severity first)\n"
)
CLEANUP_REVIEW_PROMPT = (
    "Review this branch for merge into `go-rewrite`.\n\n"
    "Scope\n"
    "- Analyze only branch-introduced changes vs merge base:\n"
    "  - `git diff --name-status go-rewrite...HEAD`\n"
    "  - `git diff $(git merge-base go-rewrite HEAD)..HEAD`\n\n"
    "Lens\n"
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
    "- Leave the repository clean except for top-level `review1.md`, "
    "`review2.md`, and `review3.md`. Remove any verification artifacts you "
    "create.\n\n"
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
    "Output format\n"
    "1. `Lens: dead-code/shims/simplification`\n"
    "2. Either `No actionable findings.` or findings by root-cause cluster "
    "(highest severity first)\n"
)
CONSOLIDATE_PROMPT = (
    "Read all the top-level review*.md docs. Each review document is a review of the "
    "current code base, written by a different person.\n\n"
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
    "Implement the fixes. Prefer owner-level, issue-class elimination over "
    "patching symptoms at multiple call sites. Keep the result smaller and "
    "simpler where possible: remove dead or superseded code, avoid speculative "
    "abstractions, wrapper growth, compatibility shims, and dual-path behavior. "
    "If a finding touches a subsystem called out in the recurring matrix at the "
    "top of `cumulative_review.md`, fix that invariant rather than only the local "
    "symptom, and extend the proof tests for that subsystem. Add unit, "
    "integration, and Playwright tests when appropriate. When browser/CDP visual "
    "verification is needed, use `./aireset.sh` and stop that session "
    "afterwards. If UI behavior changed, browser verification counts only if one "
    "affected flow actually ran end-to-end in Playwright or CDP. Before "
    "finishing, run `pnpm -C frontend gcf` and `./check_quality.sh`, then fix any "
    "issues they surface against the current worktree. Do not update "
    "`cumulative_review.md`, remove the top-level `review*.md` files, or commit. "
    "Do not run "
    "`pnpm start` or `pnpm reset`.\n"
)
SIMPLIFY_PROMPT = (
    "Simplify the current iteration's uncommitted fixes before commit.\n\n"
    "Context:\n"
    "- Read the current iteration's consolidated findings and fix-stage response "
    "first. Preserve the behavior, invariants, and test expectations they "
    "establish.\n\n"
    "Scope:\n"
    "- Review only the current uncommitted diff vs `HEAD`:\n"
    "  - `git diff --stat HEAD`\n"
    "  - `git diff --name-only HEAD`\n"
    "- Touch only files already changed in this iteration unless a narrowly related "
    "cleanup is required to complete a simplification safely.\n\n"
    "Goals:\n"
    "- Reduce code and issue-class surface without weakening the fixes.\n"
    "- Prefer deleting dead or superseded code, collapsing duplicated branches, "
    "flattening control flow, tightening ownership, and smaller owner-level "
    "rewrites.\n"
    '- Do not add compatibility shims, fallback paths, or "just in case" helpers.\n'
    "- The loop rejects this pass if it adds new repo paths or increases pending "
    "inserted lines.\n\n"
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
    "this stage. Only finish the iteration metadata: update `cumulative_review.md` "
    "for any touched or new recurring subsystems, refresh `Last finding commit` "
    "and `Still unverified` notes using the current pre-finalization `HEAD`, "
    "append the dated entry, remove the top-level `review*.md` files, make sure "
    "any earlier `./aireset.sh` session is stopped, and commit all remaining "
    "changes except `review*.md`. Keep it factual. Be explicit about blocked "
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
    assert calls.count("`Lens: correctness/invariants`") == 2
    assert calls.count("`Lens: dead-code/shims/simplification`") == 1
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
    assert calls.count(f"--cd {repo_dir}") == 7


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
    printf 'review output for %s\\n' "$(basename "${{response_file}}")" > "${{response_file}}"
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


def test_branch_review_loop_retries_after_invalid_consolidated_status(
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
  printf 'review output for %s\\n' "$(basename "${{response_file}}")" > "${{response_file}}"
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
    assert "valid status sentinel" in result.stderr
    assert (
        output_dir / "run-001" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "failure:invalid-consolidated-status"
    assert (
        output_dir / "run-002" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (
        output_dir / "state" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "stopped:no-findings"
    assert (repo_dir / "review1.md").exists()
    assert (repo_dir / "review2.md").exists()
    assert (repo_dir / "review3.md").exists()
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == "initial\n"
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 8
    assert "call:exec resume" not in calls


def test_branch_review_loop_retries_after_simplify_increases_diff(
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
    printf 'review output for %s\\n' "$(basename "${{response_file}}")" > "${{response_file}}"
    exit 0
  fi

  cat > "{repo_dir}/README.md" <<'EOR'
initial
fixed branch issues
temporary layered logic
even more temporary layered logic
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

echo "unexpected finalize resume" >&2
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
    ).read_text(encoding="utf-8").strip() == "failure:simplify-increased-insertions"
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
    assert calls.count("call:exec ") == 10
    assert calls.count("call:exec resume") == 1


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
    printf 'review output for %s\\n' "$(basename "${{response_file}}")" > "${{response_file}}"
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
