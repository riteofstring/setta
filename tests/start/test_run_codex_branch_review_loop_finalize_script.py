import os
from pathlib import Path

from tests.start.branch_review_loop_test_helpers import (
    create_git_repo,
    run_branch_review_command,
    runner_script,
    write_executable,
)


def test_branch_review_loop_allows_simplify_to_expand_diff_when_simpler(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    consolidate_count_file = tmp_path / "consolidate-count.txt"
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
    assert (output_dir / "state" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == (
        "initial\nfixed branch issues\ntemporary layered logic\neven more temporary layered logic\n"
    )
    assert (repo_dir / "internal-note.txt").read_text(
        encoding="utf-8"
    ) == "split helper state\n"
    assert (repo_dir / "review1.md").exists()
    assert (repo_dir / "review2.md").exists()
    assert (repo_dir / "review3.md").exists()
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 11
    assert calls.count("call:exec resume") == 2


def test_branch_review_loop_retries_after_finalize_modifies_code(
    tmp_path: Path,
) -> None:
    repo_dir = create_git_repo(tmp_path)
    output_dir = tmp_path / "output"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"
    consolidate_count_file = tmp_path / "consolidate-count.txt"
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
    ).strip() == "failure:finalize-modified-code"
    assert (output_dir / "run-002" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert (output_dir / "state" / "status.txt").read_text(
        encoding="utf-8"
    ).strip() == "stopped:no-findings"
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == "initial\n"
    assert (repo_dir / "review1.md").exists()
    assert (repo_dir / "review2.md").exists()
    assert (repo_dir / "review3.md").exists()
    calls = calls_file.read_text(encoding="utf-8")
    assert calls.count("call:exec ") == 11
    assert calls.count("call:exec resume") == 2
