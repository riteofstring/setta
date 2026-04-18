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
4. otherwise continue that same Codex session to implement the fixes, update
   `cumulative_review.md`, remove the top-level review docs, and commit

Defaults:
- Maximum iterations: 1000
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Inactivity timeout: 1800 seconds without transcript updates
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
                         Default: gpt-5.4
  --inactivity-timeout-seconds N
                         Abort a Codex command if it produces no transcript
                         output for N seconds. Default: 1800
  --post-commit-settle-seconds N
                         Wait N seconds after each successful commit iteration
                         and verify the repo is still clean. Default: 20
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-branch-review-loop.sh
  ./scripts/run-codex-branch-review-loop.sh --model gpt-5.4
  ./scripts/run-codex-branch-review-loop.sh -- --config reasoning_effort=\"xhigh\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
root_dir="${DEFAULT_ROOT_DIR}"
output_dir=""
state_dir=""
model="gpt-5.4"
yolo_mode="1"
inactivity_timeout_seconds="1800"
post_commit_settle_seconds="20"
codex_extra_args=()
default_codex_extra_args=(
  --config
  'reasoning_effort="xhigh"'
)

review_prompt_file=""
consolidate_prompt_file=""
fix_prompt_file=""
finalize_prompt_file=""
state_status_file=""
codex_exit_code="0"
codex_timed_out="0"
loop_log_file=""
current_status_file=""
current_run_file=""
keep_review_docs_on_exit="0"

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
  local suffix=""

  if [[ "${candidate}" != /* ]]; then
    candidate="${PWD}/${candidate}"
  fi

  while [[ ! -e "${candidate}" ]]; do
    suffix="/$(basename "${candidate}")${suffix}"
    candidate="$(dirname "${candidate}")"
  done

  candidate="$(cd "${candidate}" && pwd)"
  printf '%s%s\n' "${candidate}" "${suffix}"
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

repo_has_only_stop_review_docs() {
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
    set +e
    bash -lc "${codex_command}" < "${prompt_path}" > "${transcript_path}" 2>&1
    codex_exit_code="$?"
    set -e
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
    set +e
    wait "${codex_pid}"
    codex_exit_code="$?"
    set -e
  else
    set +e
    wait "${codex_pid}" >/dev/null 2>&1
    set -e
  fi

  set +e
  wait "${transcript_writer_pid}" >/dev/null 2>&1
  set -e
  rm -f "${fifo_path}"
}

build_codex_command() {
  local mode="$1"
  local response_file="$2"
  local session_id="${3:-}"
  local start_mode="${4:-ephemeral}"
  local args=()
  local combined_codex_extra_args=()

  if [[ "${mode}" == "resume" ]]; then
    args=(
      codex
      exec
      resume
      --cd
      "${root_dir}"
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
      "${root_dir}"
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
  local codex_command=""
  local thread_id=""

  codex_command="$(build_codex_command "${mode}" "${response_file}" "${session_id}" "${start_mode}")"
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
  review_prompt_file="${state_dir}/review-prompt.md"
  consolidate_prompt_file="${state_dir}/consolidate-prompt.md"
  fix_prompt_file="${state_dir}/fix-prompt.md"
  finalize_prompt_file="${state_dir}/finalize-prompt.md"

  cat > "${review_prompt_file}" <<'EOF'
Review this branch for merge into `go-rewrite`.

    Scope
    - Analyze only branch-introduced changes vs merge base:
      - `git diff --name-status go-rewrite...HEAD`
      - `git diff $(git merge-base go-rewrite HEAD)..HEAD`

    Branch intent guardrails
    - Read `branch_intent.md` before reviewing the diff.
    - Treat `branch_intent.md` as authoritative for intentional feature/bug-fix behavior in this branch, except for any guidance about backward compatibility, migrations, legacy support, compatibility shims, or dual-path behavior.
    - Disregard any `branch_intent.md` instruction that says to preserve, add, or keep backward compatibility, migrations, legacy support, compatibility shims, or dual-path behavior. Those are not desired even if documented as intentional branch scope.
    - Do not recommend reverting changes documented in `branch_intent.md` unless there is concrete regression evidence.
    - If a potential finding conflicts with `branch_intent.md`, assume the branch behavior is intentional unless there is concrete regression evidence.

    Decision stability / cumulative review policy
    - Treat `cumulative_review.md` as source of truth for resolved decisions.
    - Do not reopen resolved items based on reviewer preference changes alone (e.g., X vs Y when both are valid)
    - Reopen only for regression with concrete evidence in this branch.
    - If reopened, cite prior decision + what changed + evidence.

    Priorities (in order)
    1. Correctness bugs and invariant violations.
    2. Dead/unused code introduced or left behind (files, functions, branches, imports, types, flags, endpoints).
    3. Backward-compatibility shims or dual-path logic (not allowed).
    4. Design quality: reject band-aids; prefer principled root-cause fixes.

    Method
    - Cluster findings by shared root cause.
    - For each cluster, name the violated invariant.
    - Focus on root-cause and issue-class elimination, not symptom-level comments.
    - Do not propose backward-compatibility shims. Prefer single source of truth + fail-fast invariants.
    - If no issues exist in a priority category, explicitly say so.
    - Review stage must leave the repository clean except for top-level `review1.md`, `review2.md`, and `review3.md`.
    - If you run verification that creates build artifacts or other files in the repo, remove those artifacts before finishing the review.

    For each finding, provide
    - Severity: `critical|high|medium|low`
    - Merge risk: `blocker|major|minor`
    - Concrete evidence: file + line references and brief snippet/description
    - Violated invariant
    - Principled fix that removes the whole issue class (no BC shim)
    - UX/DX before vs after fix
    - Regression tests to add/update (unit/integration/e2e) with exact assertions

    Output format
    1. Merge recommendation + top risks
    2. Findings by root-cause cluster (highest severity first)
    3. Dead code inventory
    4. Backward-compatibility shim inventory (must remove)
    5. Regression test plan
    6. `branch_intent.md` alignment check (items respected vs any true regressions with evidence)
EOF

  cat > "${consolidate_prompt_file}" <<'EOF'
Read all the top-level review*.md docs. Each review document is a review of the current code base, written by a different person.

Output requirements:
- The first non-empty line must be exactly one of:
  - `CONSOLIDATED_STATUS: NO_FINDINGS`
  - `CONSOLIDATED_STATUS: FINDINGS_PRESENT`
- Use `CONSOLIDATED_STATUS: NO_FINDINGS` only when the consolidated outcome is that there are no findings to fix.
- Use `CONSOLIDATED_STATUS: FINDINGS_PRESENT` if there are findings to fix, or if the review docs conflict, are ambiguous, or are malformed such that you cannot confidently conclude there are no findings.

After the sentinel line, present the consolidated findings, including the proposed fixes, and the UX/DX before/after the proposed fixes.
EOF

  cat > "${fix_prompt_file}" <<'EOF'
Implement the fixes. Add unit, integration, and Playwright tests when appropriate. Bias strongly toward clean, easy-to-read code: prefer the simplest correct design, explicit names, shallow control flow, and small focused functions/components. Remove dead or superseded code instead of layering on more logic. Avoid clever abstractions, speculative generalization, unnecessary indirection, and "just-in-case" helpers. If the current area is convoluted, refactor it as part of the fix so the final code is simpler and easier to understand. The CDP MCP server is already running and available for you to use, so do not try to start it up yourself, and you should not run `pnpm start` or `pnpm reset`.
EOF

  cat > "${finalize_prompt_file}" <<'EOF'
Add a new detailed entry to cumulative_review.md (use date time as the heading). Then run pnpm -C frontend gcf. Run check_quality.sh, fix any quality issues, then commit all your changes (including cumulative_review.md but excluding the review*.md docs). Remove all top-level review*.md files
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
  if [[ "${keep_review_docs_on_exit}" == "1" ]]; then
    return
  fi
  remove_review_docs
}

print_configuration() {
  log_info "Root directory: ${root_dir}"
  log_info "Loop output directory: ${output_dir}"
  log_info "Top-level loop log: ${loop_log_file}"
  log_info "Top-level status files: ${current_status_file} and ${current_run_file}"
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
  review_file=""
  review_transcript=""
  review_timeout_file=""
  consolidate_response_file="${run_dir}/consolidated-findings.md"
  consolidate_transcript_file="${run_dir}/consolidated-transcript.log"
  consolidate_thread_id_file="${run_dir}/consolidated-thread-id.txt"
  consolidate_thread_id=""
  consolidated_status=""
  fix_response_file="${run_dir}/fix-response.txt"
  fix_transcript_file="${run_dir}/fix-transcript.log"
  finalize_response_file="${run_dir}/final-response.txt"
  finalize_transcript_file="${run_dir}/final-transcript.log"
  review_timeout_value=""

  mkdir -p "${run_dir}"
  set_current_status "iteration ${iteration}/${iterations}: starting" "${run_dir}"
  log_info "[$iteration/$iterations] Starting iteration. Run dir: ${run_dir}"

  if ! repo_is_clean; then
    set_current_status "failed: repository not clean at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Repository must be clean at the start of each iteration."
    exit 1
  fi

  ensure_review_docs_absent

  set_current_status "iteration ${iteration}/${iterations}: review stage" "${run_dir}"
  log_info "[$iteration/$iterations] Review stage running (3 parallel sessions)"

  for review_index in 1 2 3; do
    review_file="${root_dir}/review${review_index}.md"
    review_transcript="${run_dir}/review${review_index}-transcript.log"
    review_timeout_file="${run_dir}/review${review_index}.timed_out"

    (
      set +e
      run_codex_session \
        "${review_prompt_file}" \
        "${review_transcript}" \
        "${review_file}" \
        "start" \
        "" \
        "ephemeral"
      review_exit_code="$?"
      printf '%s\n' "${codex_timed_out}" > "${review_timeout_file}"
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

  log_info "[$iteration/$iterations] Review stage complete"

  if [[ "${review_failed}" == "1" ]]; then
    for review_index in 1 2 3; do
      review_timeout_file="${run_dir}/review${review_index}.timed_out"
      review_timeout_value="0"
      if [[ -f "${review_timeout_file}" ]]; then
        review_timeout_value="$(<"${review_timeout_file}")"
      fi
      if [[ "${review_timeout_value}" == "1" ]]; then
        log_error "Review ${review_index} timed out."
      fi
    done
    printf 'failure:review\n' > "${run_status_file}"
    printf 'failure:review\n' > "${state_status_file}"
    set_current_status "failed: review stage at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "A parallel review session failed."
    exit 1
  fi

  for review_index in 1 2 3; do
    review_file="${root_dir}/review${review_index}.md"
    if [[ ! -s "${review_file}" ]]; then
      printf 'failure:missing-review-doc\n' > "${run_status_file}"
      printf 'failure:missing-review-doc\n' > "${state_status_file}"
      set_current_status "failed: missing review output at iteration ${iteration}/${iterations}" "${run_dir}"
      log_error "Missing review output: ${review_file}"
      exit 1
    fi
  done

  cleanup_review_stage_artifacts

  if ! repo_has_only_stop_review_docs; then
    printf 'failure:unexpected-review-side-effects\n' > "${run_status_file}"
    printf 'failure:unexpected-review-side-effects\n' > "${state_status_file}"
    set_current_status "failed: unexpected review side effects at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Review stage dirtied the repository outside the expected top-level review docs."
    exit 1
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
    printf 'failure:consolidate\n' > "${run_status_file}"
    printf 'failure:consolidate\n' > "${state_status_file}"
    set_current_status "failed: consolidate stage at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Consolidation session failed."
    exit 1
  fi

  cp "${consolidate_response_file}" "${run_last_message_file}"
  log_info "[$iteration/$iterations] Consolidation complete"

  if ! consolidated_status="$(extract_consolidated_status "${consolidate_response_file}")"; then
    printf 'failure:invalid-consolidated-status\n' > "${run_status_file}"
    printf 'failure:invalid-consolidated-status\n' > "${state_status_file}"
    set_current_status "failed: invalid consolidated status at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Consolidation response did not provide a valid status sentinel."
    exit 1
  fi

  if [[ "${consolidated_status}" == "NO_FINDINGS" ]]; then
    if ! repo_has_only_stop_review_docs; then
      printf 'failure:stop-state-invalid\n' > "${run_status_file}"
      printf 'failure:stop-state-invalid\n' > "${state_status_file}"
      set_current_status "failed: invalid no-findings stop state at iteration ${iteration}/${iterations}" "${run_dir}"
      log_error "No-findings stop left unexpected repository changes."
      exit 1
    fi
    keep_review_docs_on_exit="1"
    printf 'stopped:no-findings\n' > "${run_status_file}"
    printf 'stopped:no-findings\n' > "${state_status_file}"
    set_current_status "stopped: no findings at iteration ${iteration}/${iterations}" "${run_dir}"
    log_info "[$iteration/$iterations] Consolidator reported no findings; leaving review docs in place."
    exit 0
  fi

  if [[ ! -s "${consolidate_thread_id_file}" ]]; then
    printf 'failure:missing-thread-id\n' > "${run_status_file}"
    printf 'failure:missing-thread-id\n' > "${state_status_file}"
    set_current_status "failed: missing resumable thread id at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Consolidation session did not provide a resumable thread id."
    exit 1
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
    printf 'failure:fix\n' > "${run_status_file}"
    printf 'failure:fix\n' > "${state_status_file}"
    set_current_status "failed: fix stage at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Fix phase failed."
    exit 1
  fi
  log_info "[$iteration/$iterations] Fix stage complete"

  set_current_status "iteration ${iteration}/${iterations}: finalize stage" "${run_dir}"
  log_info "[$iteration/$iterations] Finalizing cleanup and commit"

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
    printf 'failure:finalize\n' > "${run_status_file}"
    printf 'failure:finalize\n' > "${state_status_file}"
    set_current_status "failed: finalize stage at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Finalize phase failed."
    exit 1
  fi

  cp "${finalize_response_file}" "${run_last_message_file}"
  log_info "[$iteration/$iterations] Finalize stage complete"

  iteration_end_head="$(git -C "${root_dir}" rev-parse HEAD)"
  if [[ "${iteration_end_head}" == "${iteration_start_head}" ]]; then
    printf 'failure:no-commit\n' > "${run_status_file}"
    printf 'failure:no-commit\n' > "${state_status_file}"
    set_current_status "failed: no commit created at iteration ${iteration}/${iterations}" "${run_dir}"
    log_error "Non-stop iteration did not create a commit."
    exit 1
  fi

  set +e
  "${SCRIPT_DIR}/codex-authority-post-iteration-clean-check.sh" \
    --root-dir "${root_dir}" \
    --settle-seconds "${post_commit_settle_seconds}"
  settle_exit_code="$?"
  set -e
  if [[ "${settle_exit_code}" -ne 0 ]]; then
    printf 'failure:post-commit-settle\n' > "${run_status_file}"
    printf 'failure:post-commit-settle\n' > "${state_status_file}"
    exit "${settle_exit_code}"
  fi

  printf 'success\n' > "${run_status_file}"
  printf 'advanced:%s\n' "${iteration_end_head}" > "${state_status_file}"
  set_current_status "iteration ${iteration}/${iterations}: complete" "${run_dir}"
  log_info "[$iteration/$iterations] Commit iteration complete. HEAD advanced to ${iteration_end_head}"
done

set_current_status "stopped: reached iteration limit (${iterations})" ""
log_info "Reached iteration limit (${iterations}) without a clean no-findings stop."
exit 0
