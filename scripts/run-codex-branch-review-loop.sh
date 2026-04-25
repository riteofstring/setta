#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-branch-review-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a branch-review loop with this flow:
1. start three separate Codex review sessions in parallel and write their
   outputs to top-level `review1.md`, `review2.md`, and `review3.md`
2. start a fresh Codex session to consolidate those three reviews
3. if the consolidator reports no issues, stop and leave
   the three review docs in place
4. otherwise continue that same Codex session to implement the fixes and run
   generation + quality checks before handing off
5. start a fresh Codex session to simplify only the current iteration's
   uncommitted changes, then rerun generation + quality checks
6. continue the original consolidation session to update `cumulative_review.md`,
   remove the top-level review docs, and commit without changing code/tests again

Defaults:
- Maximum iterations: 1000
- Model: `gpt-5.5`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Inactivity timeout: 1800 seconds without transcript updates
- Retry failed attempts by resetting the repository back to `HEAD`
- Stop only when the consolidator emits `CONSOLIDATED_STATUS: NO_FINDINGS`
- Every non-stop iteration must advance HEAD and leave the repo clean
- A clean stop may leave only top-level `review1.md`, `review2.md`, and
  `review3.md` as untracked files for inspection

Options:
  --iterations N         Maximum loop iterations. Default: 1000
  --root-dir PATH        Repository root to operate on.
                         Default: parent of this script's directory
  --output-dir PATH      Directory for prompts, logs, and loop runs.
                         Default: mktemp dir under TMPDIR
  --state-dir PATH       Directory for prompt files and loop state.
                         Default: <output-dir>/state
  --model NAME           Model override passed to codex exec.
                         Default: gpt-5.5
  --inactivity-timeout-seconds N
                         Abort a Codex command if it produces no transcript
                         output for N seconds. Default: 1800
  --post-commit-settle-seconds N
                         Wait N seconds after each successful commit iteration
                         and verify the repo is still clean. Default: 20
  --extra-prompt TEXT    Additional instructions appended to every generated
                         Codex prompt.
  --extra-prompt-file PATH
                         File containing additional instructions appended to
                         every generated Codex prompt.
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-branch-review-loop.sh
  ./scripts/run-codex-branch-review-loop.sh --model gpt-5.5
  ./scripts/run-codex-branch-review-loop.sh -- --config reasoning_effort=\"xhigh\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
root_dir="${DEFAULT_ROOT_DIR}"
output_dir=""
state_dir=""
model="gpt-5.5"
yolo_mode="1"
inactivity_timeout_seconds="1800"
post_commit_settle_seconds="20"
extra_prompt=""
extra_prompt_file=""
codex_extra_args=()
default_codex_extra_args=(
  --config
  'reasoning_effort="xhigh"'
)

correctness_review_prompt_file=""
cleanup_review_prompt_file=""
consolidate_prompt_file=""
fix_prompt_file=""
simplify_prompt_file=""
finalize_prompt_file=""
state_status_file=""
codex_exit_code="0"
codex_timed_out="0"
loop_log_file=""
current_status_file=""
current_run_file=""
keep_review_docs_on_exit="0"

is_review_doc_path() {
  case "$1" in
    "review1.md"|"review2.md"|"review3.md")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

shell_join() {
  local result=""
  local quoted=""
  local argument=""

  for argument in "$@"; do
    printf -v quoted '%q' "${argument}"
    if [[ -n "${result}" ]]; then
      result+=" "
    fi
    result+="${quoted}"
  done

  printf '%s\n' "${result}"
}

resolve_path_without_creating() {
  local candidate="$1"
  local existing_path=""
  local suffix=""

  if [[ "${candidate}" != /* ]]; then
    candidate="${PWD}/${candidate}"
  fi

  while [[ ! -e "${candidate}" ]]; do
    suffix="/$(basename "${candidate}")${suffix}"
    candidate="$(dirname "${candidate}")"
  done

  if [[ -d "${candidate}" ]]; then
    existing_path="$(cd "${candidate}" && pwd)"
  else
    existing_path="$(cd "$(dirname "${candidate}")" && pwd)/$(basename "${candidate}")"
  fi
  printf '%s%s\n' "${existing_path}" "${suffix}"
}

timestamp_now() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
  local line=""
  line="[$(timestamp_now)] $*"
  printf '%s\n' "${line}"
  if [[ -n "${loop_log_file}" ]]; then
    printf '%s\n' "${line}" >> "${loop_log_file}"
  fi
}

log_error() {
  local line=""
  line="[$(timestamp_now)] ERROR: $*"
  printf '%s\n' "${line}" >&2
  if [[ -n "${loop_log_file}" ]]; then
    printf '%s\n' "${line}" >> "${loop_log_file}"
  fi
}

set_current_status() {
  local status="$1"
  local run_path="${2:-}"

  if [[ -n "${current_status_file}" ]]; then
    printf '%s\n' "${status}" > "${current_status_file}"
  fi

  if [[ -n "${current_run_file}" ]]; then
    printf '%s\n' "${run_path}" > "${current_run_file}"
  fi
}

run_with_relaxed_errexit() {
  local had_errexit="0"
  local command_exit_code="0"

  if [[ $- == *e* ]]; then
    had_errexit="1"
  fi

  set +e
  "$@"
  command_exit_code="$?"
  if [[ "${had_errexit}" == "1" ]]; then
    set -e
  else
    set +e
  fi

  return "${command_exit_code}"
}

cleanup_review_stage_artifacts() {
  local artifact_path=""

  while IFS= read -r artifact_path; do
    [[ -n "${artifact_path}" ]] || continue
    rm -f "${root_dir}/${artifact_path}"
    log_info "Removed review-stage build artifact: ${root_dir}/${artifact_path}"
  done < <(
    git -C "${root_dir}" ls-files --others --exclude-standard -- \
      'plugins/*/backend/plugin-backend' \
      'plugins/*/backend/plugin-backend.exe'
  )
}

repo_is_clean() {
  if ! git -C "${root_dir}" diff --quiet --no-ext-diff --exit-code --; then
    return 1
  fi

  if ! git -C "${root_dir}" diff --cached --quiet --no-ext-diff --exit-code --; then
    return 1
  fi

  if git -C "${root_dir}" ls-files --others --exclude-standard | grep -q .; then
    return 1
  fi

  return 0
}

repo_has_only_review_docs() {
  local line=""
  local line_count="0"
  local saw_review1="0"
  local saw_review2="0"
  local saw_review3="0"

  while IFS= read -r line; do
    [[ -n "${line}" ]] || continue
    line_count="$((line_count + 1))"
    case "${line}" in
      "?? review1.md")
        saw_review1="1"
        ;;
      "?? review2.md")
        saw_review2="1"
        ;;
      "?? review3.md")
        saw_review3="1"
        ;;
      *)
        return 1
        ;;
    esac
  done < <(git -C "${root_dir}" status --short --untracked-files=all)

  if [[ "${line_count}" -ne 3 ]]; then
    return 1
  fi

  if [[ "${saw_review1}" != "1" ]] || [[ "${saw_review2}" != "1" ]] || [[ "${saw_review3}" != "1" ]]; then
    return 1
  fi

  return 0
}

review_worktree_path_for_index() {
  local base_dir="$1"
  local review_index="$2"

  printf '%s/review-worktree-%s\n' "${base_dir}" "${review_index}"
}

create_review_worktree() {
  local worktree_path="$1"
  local target_ref="$2"

  rm -rf "${worktree_path}"
  git -C "${root_dir}" worktree add --detach "${worktree_path}" "${target_ref}" >/dev/null
}

cleanup_review_worktrees_under() {
  local base_dir="$1"
  local worktree_path=""

  if [[ -z "${base_dir}" ]] || [[ ! -d "${base_dir}" ]]; then
    return
  fi

  while IFS= read -r worktree_path; do
    [[ -n "${worktree_path}" ]] || continue
    git -C "${root_dir}" worktree remove --force "${worktree_path}" >/dev/null 2>&1 || rm -rf "${worktree_path}"
  done < <(find "${base_dir}" -type d -name 'review-worktree-*' | sort)
}

review_worktree_is_clean() {
  local worktree_path="$1"
  local status_file="$2"

  git -C "${worktree_path}" status --short --untracked-files=all > "${status_file}"
  [[ ! -s "${status_file}" ]]
}

normalize_review_response_paths() {
  local response_file="$1"
  local worktree_path="$2"

  if [[ ! -f "${response_file}" ]]; then
    return
  fi

  FROM_PATH="${worktree_path}" TO_PATH="${root_dir}" \
    perl -0pi -e 's/\Q$ENV{FROM_PATH}\E/$ENV{TO_PATH}/g' "${response_file}"
}

collect_pending_paths() {
  local output_path="$1"
  local path=""

  : > "${output_path}"

  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue
    if is_review_doc_path "${path}"; then
      continue
    fi
    printf '%s\n' "${path}" >> "${output_path}"
  done < <(git -C "${root_dir}" diff --name-only --no-ext-diff HEAD --)

  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue
    if is_review_doc_path "${path}"; then
      continue
    fi
    printf '%s\n' "${path}" >> "${output_path}"
  done < <(git -C "${root_dir}" ls-files --others --exclude-standard)

  sort -u -o "${output_path}" "${output_path}"
}

path_list_contains() {
  local path="$1"
  local paths_file="$2"

  grep -Fxq -- "${path}" "${paths_file}"
}

append_extra_prompt_section() {
  local prompt_path="$1"

  if [[ -z "${extra_prompt}" && -z "${extra_prompt_file}" ]]; then
    return
  fi

  {
    printf '\nAdditional Instructions\n'
    printf 'These instructions are user-supplied extensions for this loop run. Apply them together with the prompt above; if they conflict with the base prompt, prefer the stricter instruction.\n\n'
    if [[ -n "${extra_prompt}" ]]; then
      printf '%s\n' "${extra_prompt}"
    fi
    if [[ -n "${extra_prompt_file}" ]]; then
      if [[ -n "${extra_prompt}" ]]; then
        printf '\n'
      fi
      cat "${extra_prompt_file}"
      printf '\n'
    fi
  } >> "${prompt_path}"
}

snapshot_paths_state() {
  local paths_file="$1"
  local snapshot_file="$2"
  local path=""
  local hash=""

  : > "${snapshot_file}"

  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue

    if [[ -e "${root_dir}/${path}" || -L "${root_dir}/${path}" ]]; then
      hash="$(git -C "${root_dir}" hash-object --no-filters -- "${root_dir}/${path}")"
    else
      hash="__MISSING__"
    fi

    printf '%s\t%s\n' "${path}" "${hash}" >> "${snapshot_file}"
  done < "${paths_file}"
}

paths_match_snapshot() {
  local snapshot_file="$1"
  local mismatch_file="$2"
  local path=""
  local expected_hash=""
  local current_hash=""

  : > "${mismatch_file}"

  while IFS=$'\t' read -r path expected_hash; do
    [[ -n "${path}" ]] || continue

    if [[ -e "${root_dir}/${path}" || -L "${root_dir}/${path}" ]]; then
      current_hash="$(git -C "${root_dir}" hash-object --no-filters -- "${root_dir}/${path}")"
    else
      current_hash="__MISSING__"
    fi

    if [[ "${current_hash}" != "${expected_hash}" ]]; then
      printf '%s\n' "${path}" >> "${mismatch_file}"
    fi
  done < "${snapshot_file}"

  if [[ -s "${mismatch_file}" ]]; then
    return 1
  fi

  return 0
}

collect_commit_paths() {
  local commit="$1"
  local output_path="$2"

  git -C "${root_dir}" diff-tree --no-commit-id --name-only -r "${commit}" | sort -u > "${output_path}"
}

sum_pending_insertions() {
  local total="0"
  local add=""
  local del=""
  local path=""
  local numstat_line=""

  while IFS=$'\t' read -r add del path; do
    [[ -n "${path}" ]] || continue
    if is_review_doc_path "${path}"; then
      continue
    fi
    if [[ "${add}" == "-" ]]; then
      add="1"
    fi
    total="$((total + add))"
  done < <(git -C "${root_dir}" diff --numstat --no-ext-diff HEAD --)

  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue
    if is_review_doc_path "${path}"; then
      continue
    fi

    numstat_line="$(
      git -C "${root_dir}" diff --no-index --numstat -- /dev/null "${root_dir}/${path}" 2>/dev/null \
        | tail -n 1 || true
    )"
    if [[ -z "${numstat_line}" ]]; then
      continue
    fi
    add="$(printf '%s\n' "${numstat_line}" | cut -f1)"
    if [[ "${add}" == "-" ]]; then
      add="1"
    fi
    total="$((total + add))"
  done < <(git -C "${root_dir}" ls-files --others --exclude-standard)

  printf '%s\n' "${total}"
}

stop_repo_dev_sessions() {
  if [[ -x "${root_dir}/kill.sh" ]]; then
    "${root_dir}/kill.sh" >/dev/null 2>&1 || true
  fi
}

reset_repo_to_ref_state() {
  local target_ref="${1:-HEAD}"

  keep_review_docs_on_exit="0"
  stop_repo_dev_sessions
  remove_review_docs
  cleanup_review_worktrees_under "${output_dir}"
  cleanup_review_stage_artifacts
  git -C "${root_dir}" reset --hard "${target_ref}" >/dev/null
  git -C "${root_dir}" clean -fd >/dev/null
}

recover_iteration_failure() {
  local failure_status="$1"
  local retry_message="$2"
  local reset_ref="${3:-HEAD}"

  printf '%s\n' "${failure_status}" > "${run_status_file}"
  printf 'retrying:%s\n' "${failure_status}" > "${state_status_file}"
  set_current_status "retrying after ${failure_status} at iteration ${iteration}/${iterations}" "${run_dir}"
  log_error "${retry_message}"

  if ! reset_repo_to_ref_state "${reset_ref}"; then
    printf 'failure:recovery\n' > "${state_status_file}"
    set_current_status "failed: recovery after ${failure_status} at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Automatic recovery failed; repository could not be reset to ${reset_ref}."
    exit 1
  fi

  log_info "[$iteration/$iterations] Repository reset to ${reset_ref}; retrying with a fresh attempt."
}

extract_consolidated_status() {
  local response_file="$1"
  local line=""

  if [[ ! -f "${response_file}" ]]; then
    echo "Consolidated response file not found: ${response_file}" >&2
    return 1
  fi

  while IFS= read -r line; do
    [[ -n "${line}" ]] || continue
    case "${line}" in
      "CONSOLIDATED_STATUS: NO_FINDINGS")
        printf 'NO_FINDINGS\n'
        return 0
        ;;
      "CONSOLIDATED_STATUS: FINDINGS_PRESENT")
        printf 'FINDINGS_PRESENT\n'
        return 0
        ;;
      *)
        echo "First non-empty line in ${response_file} must be a recognized consolidated status sentinel." >&2
        return 1
        ;;
    esac
  done < "${response_file}"

  echo "Consolidated response file did not include a status sentinel: ${response_file}" >&2
  return 1
}

extract_thread_id() {
  local transcript_file="$1"
  local thread_line=""
  local thread_id=""

  thread_line="$(
    grep -m1 '"type"[[:space:]]*:[[:space:]]*"thread.started"' "${transcript_file}" || true
  )"
  if [[ -z "${thread_line}" ]]; then
    return 1
  fi

  thread_id="$(
    printf '%s\n' "${thread_line}" \
      | sed -nE 's/.*"thread_id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p'
  )"
  if [[ -z "${thread_id}" ]]; then
    return 1
  fi

  printf '%s\n' "${thread_id}"
}

file_mtime_epoch() {
  local path="$1"

  if stat -f '%m' "${path}" >/dev/null 2>&1; then
    stat -f '%m' "${path}"
    return
  fi

  stat -c '%Y' "${path}"
}

collect_descendant_pids() {
  local parent_pid="$1"
  local child_pid=""

  while IFS= read -r child_pid; do
    if [[ -z "${child_pid}" ]]; then
      continue
    fi
    collect_descendant_pids "${child_pid}"
    printf '%s\n' "${child_pid}"
  done < <(ps -axo pid=,ppid= | awk -v target="${parent_pid}" '$2 == target { print $1 }')
}

terminate_process_tree() {
  local root_pid="$1"
  local pid=""
  local pids=()
  local still_running=()

  while IFS= read -r pid; do
    if [[ -n "${pid}" ]]; then
      pids+=("${pid}")
    fi
  done < <(collect_descendant_pids "${root_pid}")

  if kill -0 "${root_pid}" 2>/dev/null; then
    pids+=("${root_pid}")
  fi

  if [[ "${#pids[@]}" -eq 0 ]]; then
    return
  fi

  kill -TERM "${pids[@]}" 2>/dev/null || true
  sleep 2

  still_running=()
  for pid in "${pids[@]}"; do
    if kill -0 "${pid}" 2>/dev/null; then
      still_running+=("${pid}")
    fi
  done

  if [[ "${#still_running[@]}" -gt 0 ]]; then
    kill -KILL "${still_running[@]}" 2>/dev/null || true
  fi
}

run_codex_command() {
  local prompt_path="$1"
  local transcript_path="$2"
  local codex_command="$3"
  local fifo_path=""
  local codex_pid=""
  local transcript_writer_pid=""
  local last_activity_epoch=""
  local current_epoch=""
  local transcript_epoch=""

  codex_exit_code="0"
  codex_timed_out="0"

  if [[ "${inactivity_timeout_seconds}" -eq 0 ]]; then
    run_with_relaxed_errexit \
      bash -lc "${codex_command}" < "${prompt_path}" > "${transcript_path}" 2>&1
    codex_exit_code="$?"
    return
  fi

  fifo_path="${transcript_path}.fifo"
  rm -f "${fifo_path}"
  mkfifo "${fifo_path}"

  cat < "${fifo_path}" > "${transcript_path}" &
  transcript_writer_pid="$!"

  bash -lc "${codex_command}" < "${prompt_path}" > "${fifo_path}" 2>&1 &
  codex_pid="$!"

  last_activity_epoch="$(date +%s)"

  while kill -0 "${codex_pid}" 2>/dev/null; do
    if [[ -f "${transcript_path}" ]]; then
      transcript_epoch="$(file_mtime_epoch "${transcript_path}")"
      if [[ "${transcript_epoch}" -gt "${last_activity_epoch}" ]]; then
        last_activity_epoch="${transcript_epoch}"
      fi
    fi

    current_epoch="$(date +%s)"
    if [[ "$((current_epoch - last_activity_epoch))" -ge "${inactivity_timeout_seconds}" ]]; then
      codex_timed_out="1"
      codex_exit_code="124"
      log_error "Codex command timed out after ${inactivity_timeout_seconds}s without transcript updates. Transcript: ${transcript_path}"
      terminate_process_tree "${codex_pid}"
      break
    fi

    sleep 1
  done

  if [[ "${codex_timed_out}" != "1" ]]; then
    run_with_relaxed_errexit wait "${codex_pid}"
    codex_exit_code="$?"
  else
    run_with_relaxed_errexit wait "${codex_pid}" >/dev/null 2>&1 || true
  fi

  run_with_relaxed_errexit wait "${transcript_writer_pid}" >/dev/null 2>&1 || true
  rm -f "${fifo_path}"
}

build_codex_command() {
  local mode="$1"
  local response_file="$2"
  local session_id="${3:-}"
  local start_mode="${4:-ephemeral}"
  local start_workdir="${5:-${root_dir}}"
  local args=()
  local combined_codex_extra_args=()

  if [[ "${mode}" == "resume" ]]; then
    args=(
      codex
      exec
      resume
      --output-last-message
      "${response_file}"
    )
  else
    args=(
      codex
      exec
      --color
      never
      --cd
      "${start_workdir}"
      --output-last-message
      "${response_file}"
    )
    if [[ "${start_mode}" == "json" ]]; then
      args+=(--json)
    else
      args+=(--ephemeral)
    fi
  fi

  if [[ -n "${model}" ]]; then
    args+=(--model "${model}")
  fi

  if [[ "${yolo_mode}" == "1" ]]; then
    args+=(--dangerously-bypass-approvals-and-sandbox)
  fi

  combined_codex_extra_args=("${default_codex_extra_args[@]}")
  if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
    combined_codex_extra_args+=("${codex_extra_args[@]}")
  fi
  if [[ ${#combined_codex_extra_args[@]} -gt 0 ]]; then
    args+=("${combined_codex_extra_args[@]}")
  fi

  if [[ "${mode}" == "resume" ]]; then
    args+=("${session_id}" -)
  else
    args+=(-)
  fi

  shell_join "${args[@]}"
}

run_codex_session() {
  local prompt_path="$1"
  local transcript_path="$2"
  local response_file="$3"
  local mode="$4"
  local session_id="${5:-}"
  local start_mode="${6:-ephemeral}"
  local thread_id_file="${7:-}"
  local start_workdir="${8:-${root_dir}}"
  local codex_command=""
  local thread_id=""

  codex_command="$(build_codex_command "${mode}" "${response_file}" "${session_id}" "${start_mode}" "${start_workdir}")"
  run_codex_command "${prompt_path}" "${transcript_path}" "${codex_command}"

  if [[ "${codex_exit_code}" -ne 0 ]]; then
    return "${codex_exit_code}"
  fi

  if [[ "${mode}" == "start" ]] && [[ "${start_mode}" == "json" ]] && [[ -n "${thread_id_file}" ]]; then
    if ! thread_id="$(extract_thread_id "${transcript_path}")"; then
      echo "Failed to extract Codex session thread id from ${transcript_path}" >&2
      return 1
    fi
    printf '%s\n' "${thread_id}" > "${thread_id_file}"
  fi

  return 0
}

write_prompt_files() {
  correctness_review_prompt_file="${state_dir}/review-correctness-prompt.md"
  cleanup_review_prompt_file="${state_dir}/review-cleanup-prompt.md"
  consolidate_prompt_file="${state_dir}/consolidate-prompt.md"
  fix_prompt_file="${state_dir}/fix-prompt.md"
  simplify_prompt_file="${state_dir}/simplify-prompt.md"
  finalize_prompt_file="${state_dir}/finalize-prompt.md"

  cat > "${correctness_review_prompt_file}" <<'EOF'
Review this branch for merge into `go-rewrite`.

Scope
- Analyze only branch-introduced changes vs merge base:
  - `git diff --name-status go-rewrite...HEAD`
  - `git diff $(git merge-base go-rewrite HEAD)..HEAD`

Review Focus
- This is a correctness / invariants review.
- Focus on correctness bugs, invariant violations, regressions after prior fixes, and missing tests that would let those regressions recur.
- Ignore dead code, shims, and simplification opportunities unless they directly create a correctness failure.

Guardrails
- Read `branch_intent.md`. Treat documented branch behavior as intentional unless there is concrete regression evidence. Ignore any instruction to preserve backward compatibility, migrations, legacy support, shims, or dual-path behavior.
- Use `cumulative_review.md` as prior-decision context for recurring areas. Do not reopen resolved items for preference reasons; reopen only for concrete regression with evidence.
- Do not modify files in the repository during review. The final response is captured automatically.
- Remove any verification artifacts you create before finishing.

Method
- Cluster findings by shared root cause.
- For each cluster, name the violated invariant.
- Focus on root-cause and issue-class elimination, not symptom-level comments.
- Prefer the smallest owner-level fix that makes the invariant true everywhere.
- If no actionable correctness / invariant issues exist, say so explicitly.

For each actionable finding, provide
- Severity: `critical|high|medium|low`
- Merge risk: `blocker|major|minor`
- Concrete evidence: file + line references and brief description
- Violated invariant
- Classification: `new issue | regression after prior fix | adjacent fallout in same subsystem`
- Principled fix that removes the whole issue class (no BC shim)
- Regression tests to add/update (unit/integration/e2e) with exact assertions

Output
- The response will be written directly to the review file. Write only the review findings.
- Do not include headings, preambles, conclusions, or any note about writing/saving the file.
- If there are no actionable findings, output exactly `No actionable findings.`
- Otherwise, output findings by root-cause cluster, highest severity first.
- For each finding cluster, use this exact field order:
  - `Cluster: <short root cause name>`
  - `Severity: critical|high|medium|low`
  - `Merge risk: blocker|major|minor`
  - `Evidence: <file + line references and brief description>`
  - `Invariant: <violated invariant>`
  - `Classification: new issue | regression after prior fix | adjacent fallout in same subsystem`
  - `Principled fix: <smallest owner-level fix that removes the whole issue class>`
  - `Regression tests: <unit/integration/e2e coverage with exact assertions>`
- Separate clusters with a blank line.
EOF
  append_extra_prompt_section "${correctness_review_prompt_file}"

  cat > "${cleanup_review_prompt_file}" <<'EOF'
Review this branch for merge into `go-rewrite`.

Scope
- Analyze only branch-introduced changes vs merge base:
  - `git diff --name-status go-rewrite...HEAD`
  - `git diff $(git merge-base go-rewrite HEAD)..HEAD`

Review Focus
- This is a dead code / shims / simplification review.
- Focus on dead or unused code, backward-compatibility shims, dual-path behavior, duplicated logic, unnecessary wrappers, and cases where a smaller owner-level rewrite would reduce future bug surface.
- Do not report style nits or speculative refactors. Only report cleanup / simplification findings that materially reduce maintenance risk, issue-class surface, or future diff growth.
- Leave pure correctness-only issues to the two correctness reviewers unless the cleanup problem directly causes the bug.

Guardrails
- Read `branch_intent.md`. Treat documented branch behavior as intentional unless there is concrete regression evidence. Ignore any instruction to preserve backward compatibility, migrations, legacy support, shims, or dual-path behavior.
- Use `cumulative_review.md` as prior-decision context for recurring areas.
- Do not modify files in the repository during review. The final response is captured automatically.
- Remove any verification artifacts you create before finishing.

Method
- Cluster findings by shared root cause.
- Focus on issue-class elimination and diff reduction, not on layering new wrappers or helper code.
- Prefer deleting dead or superseded code, collapsing duplicate branches, tightening ownership, and removing dual-path behavior.
- If no actionable cleanup / simplification issues exist, say so explicitly.

For each actionable finding, provide
- Severity: `critical|high|medium|low`
- Merge risk: `blocker|major|minor`
- Concrete evidence: file + line references and brief description
- Cleanup / simplification invariant being violated
- Classification: `new issue | regression after prior fix | adjacent fallout in same subsystem`
- Principled simplification or deletion that removes the whole issue class
- Regression tests to keep or add so the simplification stays safe

Output
- The response will be written directly to the review file. Write only the review findings.
- Do not include headings, preambles, conclusions, or any note about writing/saving the file.
- If there are no actionable findings, output exactly `No actionable findings.`
- Otherwise, output findings by root-cause cluster, highest severity first.
- For each finding cluster, use this exact field order:
  - `Cluster: <short root cause name>`
  - `Severity: critical|high|medium|low`
  - `Merge risk: blocker|major|minor`
  - `Evidence: <file + line references and brief description>`
  - `Invariant: <cleanup / simplification invariant being violated>`
  - `Classification: new issue | regression after prior fix | adjacent fallout in same subsystem`
  - `Principled fix: <principled simplification or deletion that removes the whole issue class>`
  - `Regression tests: <tests to keep or add so the simplification stays safe>`
- Separate clusters with a blank line.
EOF
  append_extra_prompt_section "${cleanup_review_prompt_file}"

  cat > "${consolidate_prompt_file}" <<'EOF'
Read all the top-level review*.md docs. Each review document is a review of the current code base, written by a different person.

Guardrails
- Read `branch_intent.md`. Treat documented branch behavior as intentional unless there is concrete regression evidence.
- Use `cumulative_review.md` as prior-decision context for recurring areas. Do not treat prior review-driven changes as findings again unless there is concrete regression evidence.

Output requirements:
- The first non-empty line must be exactly one of:
  - `CONSOLIDATED_STATUS: NO_FINDINGS`
  - `CONSOLIDATED_STATUS: FINDINGS_PRESENT`
- Use `CONSOLIDATED_STATUS: NO_FINDINGS` only when the consolidated outcome is that there are no findings to fix.
- Use `CONSOLIDATED_STATUS: FINDINGS_PRESENT` if there are findings to fix, or if the review docs conflict, are ambiguous, or are malformed such that you cannot confidently conclude there are no findings.
- The three reviews intentionally use different lenses: two correctness / invariants reviews and one dead-code / shims / simplification review. Treat missing commentary outside a reviewer's specialty area as neutral rather than a conflict by itself.

After the sentinel line:
- If the status is `NO_FINDINGS`, briefly explain why the three reviews add up to no actionable findings, and call out any caveats or blocked verification worth knowing before merge.
- If the status is `FINDINGS_PRESENT`, cluster findings by root cause.
- For each finding cluster, cite the affected recurring subsystem invariant from `cumulative_review.md`, or label it `new subsystem: <name>` if none fits.
- For each finding cluster, include classification (`new issue | regression after prior fix | adjacent fallout`), concrete evidence, principled fix, and exact regression tests.
- End with any blocked verification or residual risk that prevents confident merge.
EOF
  append_extra_prompt_section "${consolidate_prompt_file}"

  cat > "${fix_prompt_file}" <<'EOF'
Implement the consolidated fixes.

Guardrails
- Read `branch_intent.md`. Do not undo documented branch behavior unless the consolidated findings show a concrete regression.
- Use `cumulative_review.md` as prior-decision context. Do not undo prior review-driven changes for preference reasons; only change them when the consolidated findings classify the area as `regression after prior fix` or `adjacent fallout` with concrete evidence.

Method
- Prefer owner-level fixes that remove the issue class instead of patching symptoms at multiple call sites.
- Keep the result as small and simple as possible: delete dead or superseded code, avoid wrapper growth, compatibility shims, dual-path behavior, and speculative abstractions.
- If a finding touches a subsystem in the recurring matrix at the top of `cumulative_review.md`, fix that invariant and extend the proof tests for that subsystem.

Verification
- Add unit, integration, and Playwright tests when appropriate.
- When browser/CDP visual verification is needed, use `./aireset.sh` and stop that session afterwards.
- If UI behavior changed, browser verification counts only if one affected flow actually ran end-to-end in Playwright or CDP.
- Before finishing, run `pnpm -C frontend gcf` and `./check_quality.sh`, then fix any issues they surface against the current worktree.

Do not update `cumulative_review.md`, remove the top-level `review*.md` files, or commit. Do not run `pnpm start` or `pnpm reset`.
EOF
  append_extra_prompt_section "${fix_prompt_file}"

  cat > "${simplify_prompt_file}" <<'EOF'
Simplify the current iteration's uncommitted fixes before commit.

Context:
- Read `branch_intent.md`, the current iteration's consolidated findings, and the fix-stage response first.
- Preserve documented branch intent plus the behavior, invariants, and test expectations established by the consolidated findings and fix-stage response.
- Use `cumulative_review.md` as prior-decision context. Do not undo prior review-driven changes unless the consolidated findings classify the area as `regression after prior fix` or `adjacent fallout` with concrete evidence.

Scope:
- Review only the current uncommitted diff vs `HEAD`:
  - `git diff --stat HEAD`
  - `git diff --name-only HEAD`
- Touch only files already changed in this iteration unless a narrowly related cleanup is required to complete a simplification safely.

Goals:
- Focus on simpler ownership, control flow, and issue-class surface without weakening the fixes.
- Prefer deleting dead or superseded code, collapsing duplicated branches, flattening control flow, tightening ownership, and clearer owner-level rewrites. A small increase in lines or a narrowly related new file is acceptable when it makes the fix meaningfully simpler.
- Do not add compatibility shims, fallback paths, or "just in case" helpers.

Verification:
- Re-run the focused tests needed after the simplification.
- When browser/CDP visual verification is needed, use `./aireset.sh` and stop that session afterwards.
- Before finishing, run `pnpm -C frontend gcf` and `./check_quality.sh`, then fix any issues they surface against the current simplified worktree.
- Do not update `cumulative_review.md`, do not commit, and do not remove the top-level `review*.md` files.

Output:
- Briefly summarize what you simplified, which targeted tests you ran, and any hotspot you intentionally left as-is because further simplification would be risky.
EOF
  append_extra_prompt_section "${simplify_prompt_file}"

  cat > "${finalize_prompt_file}" <<'EOF'
The current simplified worktree is authoritative. Do not change code, tests, generated files, or rerun `pnpm -C frontend gcf` / `./check_quality.sh` in this stage.

Read `branch_intent.md` before writing metadata so the notes reflect intended branch behavior.

Only finish iteration metadata:
- Update `cumulative_review.md`.
- Remove the top-level `review*.md` files.
- Make sure any earlier `./aireset.sh` session is stopped.
- Commit all remaining changes except `review*.md`.
- Use a commit message that describes the actual changes being committed in this iteration. Do not use a workflow-only message about review/finalization/metadata.

`cumulative_review.md` format:
- If the file is empty, start with:
  - `# Cumulative Review`
  - `## Recurring Subsystem Invariant Matrix`
- For each touched or new recurring subsystem, add or update:
  - `### <Subsystem Name>`
  - `- Invariant: ...`
  - `- Last finding commit: <pre-finalization HEAD>`
  - `- Proof tests: ...`
  - `- Still unverified: ...`
- Then append one dated entry:
  - `## YYYY-MM-DD HH:MM[:SS] TZ`
  - `Fixes applied:`
  - `Tests added or upgraded:`
  - `Verification run:`
  - `Residual risks / verification gaps:`

Keep it factual and concise. No boilerplate. Be explicit about blocked verification and browser-verification status.
EOF
  append_extra_prompt_section "${finalize_prompt_file}"

}

write_iteration_simplify_prompt() {
  local prompt_path="$1"
  local consolidated_path="$2"
  local fix_path="$3"

  cat > "${prompt_path}" <<EOF
Read these iteration artifacts first:
- Consolidated findings: ${consolidated_path}
- Fix-stage response: ${fix_path}

EOF
  cat "${simplify_prompt_file}" >> "${prompt_path}"
}

write_consolidated_status_repair_prompt() {
  local prompt_path="$1"

  cat > "${prompt_path}" <<'EOF'
Your last consolidation response did not begin with a valid status sentinel.

Rewrite the consolidation response now.

Requirements:
- Keep the underlying conclusion consistent with the review docs unless they require a different outcome.
- The first non-empty line must be exactly one of:
  - `CONSOLIDATED_STATUS: NO_FINDINGS`
  - `CONSOLIDATED_STATUS: FINDINGS_PRESENT`
- Use `NO_FINDINGS` only if you can confidently conclude there are no actionable findings.
- Use `FINDINGS_PRESENT` if there are findings to fix, or if the review docs conflict, are ambiguous, or are malformed such that you cannot confidently conclude there are no findings.
- After the sentinel, follow the existing consolidation format.
- Do not edit repository files.
EOF
}

write_finalize_commit_repair_prompt() {
  local prompt_path="$1"

  cat > "${prompt_path}" <<'EOF'
Your last finalize pass did not create a commit.

Complete only the missing metadata-only finalize work now.

Requirements:
- Do not change code, tests, generated files, or rerun formatting/verification.
- Preserve the current simplified worktree exactly.
- Update `cumulative_review.md` only if it still needs the finalize metadata.
- Remove the top-level `review1.md`, `review2.md`, and `review3.md`.
- Commit the remaining changes with a commit message that describes the actual changes being committed, not just the finalize/review-loop step.
- Return a brief note describing the metadata and commit action you completed.
EOF
}

ensure_review_docs_absent() {
  local review_path=""

  for review_path in \
    "${root_dir}/review1.md" \
    "${root_dir}/review2.md" \
    "${root_dir}/review3.md"; do
    if [[ -e "${review_path}" ]]; then
      echo "Refusing to overwrite existing review document: ${review_path}" >&2
      exit 1
    fi
  done
}

remove_review_docs() {
  if [[ -z "${root_dir}" ]] || [[ ! -d "${root_dir}" ]]; then
    return
  fi
  rm -f \
    "${root_dir}/review1.md" \
    "${root_dir}/review2.md" \
    "${root_dir}/review3.md"
}

cleanup_review_docs_on_exit() {
  cleanup_review_worktrees_under "${output_dir}"

  if [[ "${keep_review_docs_on_exit}" == "1" ]]; then
    return
  fi
  remove_review_docs
}

review_prompt_for_index() {
  local review_index="$1"

  case "${review_index}" in
    1|2)
      printf '%s\n' "${correctness_review_prompt_file}"
      ;;
    3)
      printf '%s\n' "${cleanup_review_prompt_file}"
      ;;
    *)
      echo "Unsupported review index: ${review_index}" >&2
      return 1
      ;;
  esac
}

print_configuration() {
  log_info "Root directory: ${root_dir}"
  log_info "Loop output directory: ${output_dir}"
  log_info "Top-level loop log: ${loop_log_file}"
  log_info "Top-level status files: ${current_status_file} and ${current_run_file}"
  if [[ -n "${extra_prompt}" || -n "${extra_prompt_file}" ]]; then
    if [[ -n "${extra_prompt_file}" ]]; then
      log_info "Extra prompt file: ${extra_prompt_file}"
    else
      log_info "Extra prompt: inline"
    fi
  fi
  if [[ "${yolo_mode}" == "1" ]]; then
    log_info "Settings: iterations=${iterations}, model=${model}, reasoning=xhigh, inactivity_timeout=${inactivity_timeout_seconds}s, post_commit_settle=${post_commit_settle_seconds}s, yolo=enabled"
  else
    log_info "Settings: iterations=${iterations}, model=${model}, reasoning=xhigh, inactivity_timeout=${inactivity_timeout_seconds}s, post_commit_settle=${post_commit_settle_seconds}s, yolo=disabled"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iterations)
      require_value "$1" "${2:-}"
      iterations="$2"
      shift 2
      ;;
    --root-dir)
      require_value "$1" "${2:-}"
      root_dir="$2"
      shift 2
      ;;
    --output-dir)
      require_value "$1" "${2:-}"
      output_dir="$2"
      shift 2
      ;;
    --state-dir)
      require_value "$1" "${2:-}"
      state_dir="$2"
      shift 2
      ;;
    --model)
      require_value "$1" "${2:-}"
      model="$2"
      shift 2
      ;;
    --inactivity-timeout-seconds)
      require_value "$1" "${2:-}"
      inactivity_timeout_seconds="$2"
      shift 2
      ;;
    --post-commit-settle-seconds)
      require_value "$1" "${2:-}"
      post_commit_settle_seconds="$2"
      shift 2
      ;;
    --extra-prompt)
      require_value "$1" "${2:-}"
      extra_prompt="$2"
      shift 2
      ;;
    --extra-prompt-file)
      require_value "$1" "${2:-}"
      extra_prompt_file="$2"
      shift 2
      ;;
    --no-yolo)
      yolo_mode="0"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      codex_extra_args=("$@")
      break
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! "${iterations}" =~ ^[0-9]+$ ]] || [[ "${iterations}" -lt 1 ]]; then
  echo "--iterations must be a positive integer" >&2
  exit 1
fi

if [[ ! "${inactivity_timeout_seconds}" =~ ^[0-9]+$ ]] || [[ "${inactivity_timeout_seconds}" -lt 0 ]]; then
  echo "--inactivity-timeout-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${post_commit_settle_seconds}" =~ ^[0-9]+$ ]] || [[ "${post_commit_settle_seconds}" -lt 0 ]]; then
  echo "--post-commit-settle-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ -n "${extra_prompt_file}" ]]; then
  extra_prompt_file="$(resolve_path_without_creating "${extra_prompt_file}")"
  if [[ ! -f "${extra_prompt_file}" ]]; then
    echo "--extra-prompt-file must point to a readable file: ${extra_prompt_file}" >&2
    exit 1
  fi
fi

root_dir="$(resolve_path_without_creating "${root_dir}")"

if [[ ! -d "${root_dir}" ]]; then
  echo "Root directory not found: ${root_dir}" >&2
  exit 1
fi

if ! git -C "${root_dir}" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Root directory is not a git repository: ${root_dir}" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if ! repo_is_clean; then
  echo "Refusing to start: repository is not clean." >&2
  exit 1
fi

ensure_review_docs_absent

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-branch-review-loop.${timestamp}.XXXXXX")"
else
  output_dir="$(resolve_path_without_creating "${output_dir}")"
  if [[ "${output_dir}" == "${root_dir}" ]] || [[ "${output_dir}" == "${root_dir}/"* ]]; then
    echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
  mkdir -p "${output_dir}"
fi

if [[ "${output_dir}" == "${root_dir}" ]] || [[ "${output_dir}" == "${root_dir}/"* ]]; then
  echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
  exit 1
fi

if [[ -z "${state_dir}" ]]; then
  state_dir="${output_dir}/state"
else
  state_dir="$(resolve_path_without_creating "${state_dir}")"
  if [[ "${state_dir}" == "${root_dir}" ]] || [[ "${state_dir}" == "${root_dir}/"* ]]; then
    echo "--state-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
  mkdir -p "${state_dir}"
fi

if [[ "${state_dir}" == "${root_dir}" ]] || [[ "${state_dir}" == "${root_dir}/"* ]]; then
  echo "--state-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
  exit 1
fi

mkdir -p "${output_dir}" "${state_dir}"
trap cleanup_review_docs_on_exit EXIT

loop_log_file="${output_dir}/loop.log"
current_status_file="${output_dir}/current-status.txt"
current_run_file="${output_dir}/current-run.txt"
: > "${loop_log_file}"
printf 'initializing\n' > "${current_status_file}"
: > "${current_run_file}"

state_status_file="${state_dir}/status.txt"
printf 'pending\n' > "${state_status_file}"

write_prompt_files
print_configuration

for ((iteration = 1; iteration <= iterations; iteration += 1)); do
  run_dir="$(printf '%s/run-%03d' "${output_dir}" "${iteration}")"
  run_status_file="${run_dir}/status.txt"
  run_last_message_file="${run_dir}/last-message.txt"
  iteration_start_head="$(git -C "${root_dir}" rev-parse HEAD)"
  review_pids=()
  review_pid=""
  review_index=""
  review_exit_code=""
  review_failed="0"
  review_prompt_path=""
  review_file=""
  review_transcript=""
  review_timeout_file=""
  review_worktree_path=""
  review_error_file=""
  review_worktree_status_file=""
  consolidate_response_file="${run_dir}/consolidated-findings.md"
  consolidate_transcript_file="${run_dir}/consolidated-transcript.log"
  consolidate_thread_id_file="${run_dir}/consolidated-thread-id.txt"
  consolidated_status_repair_prompt_file="${run_dir}/consolidated-status-repair-prompt.md"
  consolidated_status_repair_transcript_file="${run_dir}/consolidated-status-repair-transcript.log"
  consolidated_status_repair_attempted="0"
  consolidate_thread_id=""
  consolidated_status=""
  fix_response_file="${run_dir}/fix-response.txt"
  fix_transcript_file="${run_dir}/fix-transcript.log"
  iteration_simplify_prompt_file="${run_dir}/simplify-prompt.md"
  simplify_response_file="${run_dir}/simplify-response.txt"
  simplify_transcript_file="${run_dir}/simplify-transcript.log"
  pre_finalize_paths_file="${run_dir}/pre-finalize-paths.txt"
  pre_finalize_snapshot_file="${run_dir}/pre-finalize-snapshot.tsv"
  finalize_mismatch_file="${run_dir}/finalize-mismatches.txt"
  finalize_commit_paths_file="${run_dir}/finalize-commit-paths.txt"
  finalize_unexpected_paths_file="${run_dir}/finalize-unexpected-paths.txt"
  finalize_response_file="${run_dir}/final-response.txt"
  finalize_transcript_file="${run_dir}/final-transcript.log"
  finalize_commit_repair_prompt_file="${run_dir}/finalize-commit-repair-prompt.md"
  finalize_commit_repair_transcript_file="${run_dir}/finalize-commit-repair-transcript.log"
  finalize_commit_repair_attempted="0"
  review_timeout_value=""

  mkdir -p "${run_dir}"
  set_current_status "iteration ${iteration}/${iterations}: starting" "${run_dir}"
  log_info "[$iteration/$iterations] Starting iteration. Run dir: ${run_dir}"

  if ! repo_is_clean; then
    recover_iteration_failure \
      "failure:iteration-start-dirty" \
      "Repository was dirty at the start of the iteration; resetting to HEAD and retrying."
    continue
  fi

  ensure_review_docs_absent

  set_current_status "iteration ${iteration}/${iterations}: review stage" "${run_dir}"
  log_info "[$iteration/$iterations] Review stage running (3 parallel sessions)"

  for review_index in 1 2 3; do
    review_worktree_path="$(review_worktree_path_for_index "${run_dir}" "${review_index}")"
    if ! create_review_worktree "${review_worktree_path}" "${iteration_start_head}"; then
      recover_iteration_failure \
        "failure:review-setup" \
        "Failed to create isolated review worktrees; resetting to HEAD and retrying."
      continue 2
    fi
  done

  for review_index in 1 2 3; do
    review_file="${root_dir}/review${review_index}.md"
    review_transcript="${run_dir}/review${review_index}-transcript.log"
    review_timeout_file="${run_dir}/review${review_index}.timed_out"
    review_error_file="${run_dir}/review${review_index}.error.txt"
    review_worktree_status_file="${run_dir}/review${review_index}-worktree-status.txt"
    review_worktree_path="$(review_worktree_path_for_index "${run_dir}" "${review_index}")"
    review_prompt_path="$(review_prompt_for_index "${review_index}")"

    (
      set +e
      : > "${review_error_file}"
      run_codex_session \
        "${review_prompt_path}" \
        "${review_transcript}" \
        "${review_file}" \
        "start" \
        "" \
        "ephemeral" \
        "" \
        "${review_worktree_path}"
      review_exit_code="$?"
      printf '%s\n' "${codex_timed_out}" > "${review_timeout_file}"
      if [[ "${review_exit_code}" -eq 0 ]]; then
        normalize_review_response_paths "${review_file}" "${review_worktree_path}"
        if ! review_worktree_is_clean "${review_worktree_path}" "${review_worktree_status_file}"; then
          {
            printf 'Review dirtied isolated worktree %s:\n' "${review_worktree_path}"
            cat "${review_worktree_status_file}"
          } > "${review_error_file}"
          review_exit_code="1"
        fi
      fi
      exit "${review_exit_code}"
    ) &
    review_pids+=("$!")
  done

  for review_pid in "${review_pids[@]}"; do
    set +e
    wait "${review_pid}"
    review_exit_code="$?"
    set -e
    if [[ "${review_exit_code}" -ne 0 ]]; then
      review_failed="1"
    fi
  done

  if [[ "${review_failed}" == "1" ]]; then
    for review_index in 1 2 3; do
      review_timeout_file="${run_dir}/review${review_index}.timed_out"
      review_error_file="${run_dir}/review${review_index}.error.txt"
      review_timeout_value="0"
      if [[ -f "${review_timeout_file}" ]]; then
        review_timeout_value="$(<"${review_timeout_file}")"
      fi
      if [[ "${review_timeout_value}" == "1" ]]; then
        log_error "Review ${review_index} timed out."
      fi
      if [[ -s "${review_error_file}" ]]; then
        while IFS= read -r line; do
          [[ -n "${line}" ]] || continue
          log_error "Review ${review_index}: ${line}"
        done < "${review_error_file}"
      fi
    done
    recover_iteration_failure \
      "failure:review" \
      "A parallel review session failed; resetting to HEAD and retrying."
    continue
  fi

  cleanup_review_worktrees_under "${run_dir}"
  log_info "[$iteration/$iterations] Review stage complete"

  for review_index in 1 2 3; do
    review_file="${root_dir}/review${review_index}.md"
    if [[ ! -s "${review_file}" ]]; then
      recover_iteration_failure \
        "failure:missing-review-doc" \
        "Missing review output ${review_file}; resetting to HEAD and retrying."
      continue 2
    fi
  done

  cleanup_review_stage_artifacts

  if ! repo_has_only_review_docs; then
    recover_iteration_failure \
      "failure:unexpected-review-side-effects" \
      "Review stage dirtied the repository outside the expected top-level review docs; resetting to HEAD and retrying."
    continue
  fi

  set_current_status "iteration ${iteration}/${iterations}: consolidate stage" "${run_dir}"
  log_info "[$iteration/$iterations] Consolidating findings"

  set +e
  run_codex_session \
    "${consolidate_prompt_file}" \
    "${consolidate_transcript_file}" \
    "${consolidate_response_file}" \
    "start" \
    "" \
    "json" \
    "${consolidate_thread_id_file}"
  consolidate_exit_code="$?"
  set -e
  if [[ "${consolidate_exit_code}" -ne 0 ]]; then
    recover_iteration_failure \
      "failure:consolidate" \
      "Consolidation session failed; resetting to HEAD and retrying."
    continue
  fi

  cp "${consolidate_response_file}" "${run_last_message_file}"
  log_info "[$iteration/$iterations] Consolidation complete"

  if ! consolidated_status="$(extract_consolidated_status "${consolidate_response_file}")"; then
    if [[ "${consolidated_status_repair_attempted}" == "0" ]] && [[ -s "${consolidate_thread_id_file}" ]]; then
      consolidated_status_repair_attempted="1"
      consolidate_thread_id="$(<"${consolidate_thread_id_file}")"
      write_consolidated_status_repair_prompt "${consolidated_status_repair_prompt_file}"
      log_info "[$iteration/$iterations] Consolidation response missing sentinel; requesting in-session rewrite"

      set +e
      run_codex_session \
        "${consolidated_status_repair_prompt_file}" \
        "${consolidated_status_repair_transcript_file}" \
        "${consolidate_response_file}" \
        "resume" \
        "${consolidate_thread_id}"
      consolidate_repair_exit_code="$?"
      set -e
      if [[ "${consolidate_repair_exit_code}" -eq 0 ]]; then
        cp "${consolidate_response_file}" "${run_last_message_file}"
        if consolidated_status="$(extract_consolidated_status "${consolidate_response_file}")"; then
          log_info "[$iteration/$iterations] Consolidation rewrite produced a valid sentinel"
        fi
      fi
    fi
  fi

  if [[ -z "${consolidated_status}" ]]; then
    recover_iteration_failure \
      "failure:invalid-consolidated-status" \
      "Consolidation response did not provide a valid status sentinel; resetting to HEAD and retrying."
    continue
  fi

  if [[ "${consolidated_status}" == "NO_FINDINGS" ]]; then
    if ! repo_has_only_review_docs; then
      recover_iteration_failure \
        "failure:stop-state-invalid" \
        "No-findings stop left unexpected repository changes; resetting to HEAD and retrying."
      continue
    fi

    keep_review_docs_on_exit="1"
    printf 'stopped:no-findings\n' > "${run_status_file}"
    printf 'stopped:no-findings\n' > "${state_status_file}"
    set_current_status "stopped: no findings at iteration ${iteration}/${iterations}" "${run_dir}"
    log_info "[$iteration/$iterations] Consolidator reported no findings; leaving review docs in place."
    exit 0
  fi

  if [[ ! -s "${consolidate_thread_id_file}" ]]; then
    recover_iteration_failure \
      "failure:missing-thread-id" \
      "Consolidation session did not provide a resumable thread id; resetting to HEAD and retrying."
    continue
  fi
  consolidate_thread_id="$(<"${consolidate_thread_id_file}")"

  set_current_status "iteration ${iteration}/${iterations}: fix stage" "${run_dir}"
  log_info "[$iteration/$iterations] Implementing consolidated fixes"

  set +e
  run_codex_session \
    "${fix_prompt_file}" \
    "${fix_transcript_file}" \
    "${fix_response_file}" \
    "resume" \
    "${consolidate_thread_id}"
  fix_exit_code="$?"
  set -e
  if [[ "${fix_exit_code}" -ne 0 ]]; then
    recover_iteration_failure \
      "failure:fix" \
      "Fix phase failed; resetting to HEAD and retrying."
    continue
  fi
  log_info "[$iteration/$iterations] Fix stage complete"

  set_current_status "iteration ${iteration}/${iterations}: simplify stage" "${run_dir}"
  log_info "[$iteration/$iterations] Simplifying current iteration changes"

  write_iteration_simplify_prompt \
    "${iteration_simplify_prompt_file}" \
    "${consolidate_response_file}" \
    "${fix_response_file}"

  set +e
  run_codex_session \
    "${iteration_simplify_prompt_file}" \
    "${simplify_transcript_file}" \
    "${simplify_response_file}" \
    "start" \
    "" \
    "ephemeral"
  simplify_exit_code="$?"
  set -e
  if [[ "${simplify_exit_code}" -ne 0 ]]; then
    recover_iteration_failure \
      "failure:simplify" \
      "Simplify phase failed; resetting to HEAD and retrying."
    continue
  fi

  cp "${simplify_response_file}" "${run_last_message_file}"
  log_info "[$iteration/$iterations] Simplify stage complete"

  collect_pending_paths "${pre_finalize_paths_file}"
  if path_list_contains "cumulative_review.md" "${pre_finalize_paths_file}"; then
    recover_iteration_failure \
      "failure:pre-finalize-cumulative-review-dirty" \
      "Fix or simplify touched cumulative_review.md before the metadata-only finalize stage; resetting to the iteration start and retrying." \
      "${iteration_start_head}"
    continue
  fi
  if [[ ! -f "${root_dir}/review1.md" || ! -f "${root_dir}/review2.md" || ! -f "${root_dir}/review3.md" ]]; then
    recover_iteration_failure \
      "failure:pre-finalize-missing-review-doc" \
      "Fix or simplify removed top-level review docs before finalize; resetting to the iteration start and retrying." \
      "${iteration_start_head}"
    continue
  fi
  snapshot_paths_state "${pre_finalize_paths_file}" "${pre_finalize_snapshot_file}"

  set_current_status "iteration ${iteration}/${iterations}: finalize stage" "${run_dir}"
  log_info "[$iteration/$iterations] Finalizing metadata and commit"

  set +e
  run_codex_session \
    "${finalize_prompt_file}" \
    "${finalize_transcript_file}" \
    "${finalize_response_file}" \
    "resume" \
    "${consolidate_thread_id}"
  finalize_exit_code="$?"
  set -e
  if [[ "${finalize_exit_code}" -ne 0 ]]; then
    recover_iteration_failure \
      "failure:finalize" \
      "Finalize phase failed; resetting to HEAD and retrying."
    continue
  fi

  cp "${finalize_response_file}" "${run_last_message_file}"
  log_info "[$iteration/$iterations] Finalize stage complete"

  iteration_end_head="$(git -C "${root_dir}" rev-parse HEAD)"
  if [[ "${iteration_end_head}" == "${iteration_start_head}" ]] && [[ "${finalize_commit_repair_attempted}" == "0" ]]; then
    finalize_commit_repair_attempted="1"
    write_finalize_commit_repair_prompt "${finalize_commit_repair_prompt_file}"
    log_info "[$iteration/$iterations] Finalize stage produced no commit; requesting in-session completion"

    set +e
    run_codex_session \
      "${finalize_commit_repair_prompt_file}" \
      "${finalize_commit_repair_transcript_file}" \
      "${finalize_response_file}" \
      "resume" \
      "${consolidate_thread_id}"
    finalize_commit_repair_exit_code="$?"
    set -e
    if [[ "${finalize_commit_repair_exit_code}" -eq 0 ]]; then
      cp "${finalize_response_file}" "${run_last_message_file}"
      iteration_end_head="$(git -C "${root_dir}" rev-parse HEAD)"
      if [[ "${iteration_end_head}" != "${iteration_start_head}" ]]; then
        log_info "[$iteration/$iterations] Finalize repair created the missing commit"
      fi
    fi
  fi
  if [[ "${iteration_end_head}" == "${iteration_start_head}" ]]; then
    recover_iteration_failure \
      "failure:no-commit" \
      "Non-stop iteration did not create a commit; resetting to HEAD and retrying."
    continue
  fi

  if [[ -e "${root_dir}/review1.md" || -e "${root_dir}/review2.md" || -e "${root_dir}/review3.md" ]]; then
    recover_iteration_failure \
      "failure:finalize-left-review-docs" \
      "Finalize commit left top-level review docs in place; resetting to the iteration start and retrying." \
      "${iteration_start_head}"
    continue
  fi

  collect_commit_paths "${iteration_end_head}" "${finalize_commit_paths_file}"
  comm -23 \
    "${finalize_commit_paths_file}" \
    <({ printf '%s\n' "cumulative_review.md"; cat "${pre_finalize_paths_file}"; } | sort -u) \
    > "${finalize_unexpected_paths_file}" || true
  if [[ -s "${finalize_unexpected_paths_file}" ]]; then
    recover_iteration_failure \
      "failure:finalize-expanded-path-set" \
      "Finalize commit introduced new repo paths outside the pre-finalize diff; resetting to the iteration start and retrying." \
      "${iteration_start_head}"
    continue
  fi

  if ! paths_match_snapshot "${pre_finalize_snapshot_file}" "${finalize_mismatch_file}"; then
    recover_iteration_failure \
      "failure:finalize-modified-code" \
      "Finalize stage changed code or test paths that should have remained frozen after simplify; resetting to the iteration start and retrying." \
      "${iteration_start_head}"
    continue
  fi

  stop_repo_dev_sessions
  log_info "[$iteration/$iterations] Stopped repo-scoped dev/CDP sessions before the next iteration boundary."

  set +e
  "${SCRIPT_DIR}/codex-authority-post-iteration-clean-check.sh" \
    --root-dir "${root_dir}" \
    --settle-seconds "${post_commit_settle_seconds}"
  settle_exit_code="$?"
  set -e
  if [[ "${settle_exit_code}" -ne 0 ]]; then
    recover_iteration_failure \
      "failure:post-commit-settle" \
      "Post-commit settle check failed; resetting the worktree to the new HEAD and retrying."
    continue
  fi

  printf 'success\n' > "${run_status_file}"
  printf 'advanced:%s\n' "${iteration_end_head}" > "${state_status_file}"
  set_current_status "iteration ${iteration}/${iterations}: complete" "${run_dir}"
  log_info "[$iteration/$iterations] Commit iteration complete. HEAD advanced to ${iteration_end_head}"
done

set_current_status "stopped: reached iteration limit (${iterations})" ""
log_info "Reached iteration limit (${iterations}) without a clean no-findings stop."
exit 0
