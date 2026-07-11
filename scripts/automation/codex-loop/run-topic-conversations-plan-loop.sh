#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

PLAN_PATH="docs/plans/topic-conversations-global-master-narrator-20260711.md"
COMPLETION_SENTINEL="TOPIC_CONVERSATIONS_IMPLEMENTATION_COMPLETE"
BLOCKED_SENTINEL="TOPIC_CONVERSATIONS_IMPLEMENTATION_BLOCKED"
MODEL="gpt-5.6-sol"
AGENT_ONE_REASONING_EFFORT="xhigh"
AGENT_TWO_REASONING_EFFORT="max"
OUTPUT_DIR=""
MAX_ITERATIONS="0"
INITIAL_RETRY_DELAY_SECONDS="15"
MAX_RETRY_DELAY_SECONDS="300"
PROGRESS_LOG_INTERVAL_SECONDS="120"
POST_AGENT_SETTLE_SECONDS="20"
CODEX_REFERENCE_REPO="${CODEX_REFERENCE_REPO:-/Users/kevin/Documents/AppDevelopment/reference_repos/codex}"
ACTIVE_CODEX_PID=""

usage() {
  cat <<'EOF'
Usage: scripts/automation/codex-loop/run-topic-conversations-plan-loop.sh [options]

Runs two fresh Codex agents in a loop for:
  docs/plans/topic-conversations-global-master-narrator-20260711.md

Agent 1 implements the earliest coherent incomplete plan slice with xhigh
reasoning and commits it. Agent 2 reviews only that slice with max reasoning,
fixes and commits practical gaps, and decides whether the plan should continue.

The loop succeeds only when Agent 2's final message is exactly:
  TOPIC_CONVERSATIONS_IMPLEMENTATION_COMPLETE

A genuine external blocker has a separate terminal result and exits non-zero:
  TOPIC_CONVERSATIONS_IMPLEMENTATION_BLOCKED

A blocker is never treated as completion. Agents must not skip ahead around a
blocked phase or claim that deterministic fake-provider coverage proves live
Codex behavior.

This dedicated automation helper intentionally runs Codex in the current
repository checkout with approvals and sandbox bypassed. That behavior is
acceptable here because the loop is for unattended repo-local plan execution
where agents are expected to edit, verify, and commit directly in a clean
working tree.

Codex transcripts are written outside the repository to per-agent log files.
The terminal prints loop status and periodic progress lines.

Options:
  --output-dir PATH     Directory for per-iteration transcripts and last
                        messages. Must be outside the repository. Default:
                        mktemp directory under TMPDIR.
  --iterations N        Maximum number of implement/review iterations. Default:
                        0, which means no iteration cap.
  --model NAME          Codex model for both agents. Default: gpt-5.6-sol.
  --codex-reference-repo PATH
                        Full Codex source checkout used for protocol/source
                        verification. Default:
                        /Users/kevin/Documents/AppDevelopment/reference_repos/codex
  --retry-delay N       Initial transient retry delay in seconds. Default: 15.
  --retry-max-delay N   Maximum transient retry delay in seconds. Default: 300.
  --progress-log-interval-seconds N
                        Print an in-flight agent status line at most every N
                        seconds. Default: 120. Use 0 to disable.
  --post-agent-settle-seconds N
                        Verify the clean repository remains settled for N
                        seconds after each agent. Default: 20.
  --help                Show this help text.
EOF
}

require_value() {
  local flag="$1"
  local value="${2:-}"

  if [[ -z "${value}" ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
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

  candidate="$(cd "${candidate}" && pwd -P)"
  printf '%s%s\n' "${candidate}" "${suffix}"
}

timestamp_now() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
  printf '[%s] %s\n' "$(timestamp_now)" "$*"
}

repo_is_clean() {
  if ! git -C "${ROOT_DIR}" diff --quiet --no-ext-diff --exit-code --; then
    return 1
  fi
  if ! git -C "${ROOT_DIR}" diff --cached --quiet --no-ext-diff --exit-code --; then
    return 1
  fi
  if [[ -n "$(git -C "${ROOT_DIR}" ls-files --others --exclude-standard)" ]]; then
    return 1
  fi
  return 0
}

print_repo_state() {
  git -C "${ROOT_DIR}" status --short >&2
}

require_clean_repo() {
  local context="$1"

  if repo_is_clean; then
    return
  fi

  echo "Repository is dirty ${context}; refusing unattended continuation." >&2
  print_repo_state
  exit 1
}

run_post_agent_settle_check() {
  local transcript_file="$1"

  if ! "${SCRIPT_DIR}/codex-authority-post-iteration-clean-check.sh" \
    --root-dir "${ROOT_DIR}" \
    --settle-seconds "${POST_AGENT_SETTLE_SECONDS}" \
    >>"${transcript_file}" 2>&1; then
    echo "Post-agent clean/settle verification failed. See ${transcript_file}" >&2
    print_repo_state
    exit 1
  fi
}

stop_active_codex() {
  if [[ -z "${ACTIVE_CODEX_PID}" ]] || ! kill -0 "${ACTIVE_CODEX_PID}" 2>/dev/null; then
    return
  fi

  kill "${ACTIVE_CODEX_PID}" 2>/dev/null || true
  wait "${ACTIVE_CODEX_PID}" 2>/dev/null || true
  ACTIVE_CODEX_PID=""
}

trap 'stop_active_codex; exit 130' INT TERM

run_agent() {
  local agent_name="$1"
  local prompt="$2"
  local run_dir="$3"
  local reasoning_effort="$4"
  local transcript_file="${run_dir}/${agent_name}.transcript.log"
  local last_message_file="${run_dir}/${agent_name}.last-message.txt"
  local status_file="${run_dir}/${agent_name}.status.txt"
  local exit_code="0"
  local attempt="1"
  local retry_delay_seconds="${INITIAL_RETRY_DELAY_SECONDS}"
  local attempt_head=""
  local completed_head=""
  local codex_pid=""
  local start_epoch=""
  local last_progress_epoch=""
  local current_epoch=""
  local elapsed_seconds=""
  local last_message_state="missing"

  mkdir -p "${run_dir}"
  rm -f "${transcript_file}" "${last_message_file}" "${status_file}"

  log_info "Starting ${agent_name}. Transcript: ${transcript_file}. Last message: ${last_message_file}"

  while true; do
    require_clean_repo "before ${agent_name} attempt ${attempt}"
    attempt_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
    rm -f "${last_message_file}"
    printf '\n===== attempt %s at %s =====\n' \
      "${attempt}" \
      "$(timestamp_now)" >>"${transcript_file}"

    # Retry only clean, unchanged attempts. A failed attempt that dirties the
    # repository stops the loop for manual inspection instead of layering a
    # fresh agent over partial work.
    codex exec \
      --color never \
      --cd "${ROOT_DIR}" \
      --ephemeral \
      --model "${MODEL}" \
      --config "reasoning_effort=\"${reasoning_effort}\"" \
      --dangerously-bypass-approvals-and-sandbox \
      --output-last-message "${last_message_file}" \
      "${prompt}" >>"${transcript_file}" 2>&1 &
    codex_pid="$!"
    ACTIVE_CODEX_PID="${codex_pid}"

    start_epoch="$(date +%s)"
    last_progress_epoch="${start_epoch}"
    while kill -0 "${codex_pid}" 2>/dev/null; do
      current_epoch="$(date +%s)"
      if [[ "${PROGRESS_LOG_INTERVAL_SECONDS}" -gt 0 ]] \
        && [[ "$((current_epoch - last_progress_epoch))" -ge "${PROGRESS_LOG_INTERVAL_SECONDS}" ]]; then
        elapsed_seconds="$((current_epoch - start_epoch))"
        log_info "${agent_name} attempt ${attempt} still running after ${elapsed_seconds}s. Transcript: ${transcript_file}"
        last_progress_epoch="${current_epoch}"
      fi
      sleep 1
    done

    set +e
    wait "${codex_pid}"
    exit_code="$?"
    set -e
    codex_pid=""
    ACTIVE_CODEX_PID=""

    completed_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
    last_message_state="missing"
    if [[ -s "${last_message_file}" ]]; then
      last_message_state="present"
    fi

    printf 'attempt=%s exit_code=%s last_message=%s head_before=%s head_after=%s\n' \
      "${attempt}" \
      "${exit_code}" \
      "${last_message_state}" \
      "${attempt_head}" \
      "${completed_head}" \
      >>"${status_file}"

    if ! repo_is_clean; then
      echo "${agent_name} attempt ${attempt} left the repository dirty; refusing to retry." >&2
      print_repo_state
      exit 1
    fi

    if [[ "${exit_code}" -eq 0 ]] && [[ -s "${last_message_file}" ]]; then
      run_post_agent_settle_check "${transcript_file}"
      log_info "${agent_name} finished after ${attempt} attempt(s)."
      return
    fi

    if [[ "${completed_head}" != "${attempt_head}" ]]; then
      printf '%s\n' \
        "${agent_name} advanced HEAD after an incomplete Codex result; the next audit must inspect the commit." \
        >"${last_message_file}"
      run_post_agent_settle_check "${transcript_file}"
      log_info "${agent_name} advanced HEAD despite an incomplete Codex result; continuing to audit the committed state."
      return
    fi

    if [[ "${exit_code}" -ne 0 ]]; then
      log_info "${agent_name} clean unchanged attempt ${attempt} failed with exit code ${exit_code}; retrying in ${retry_delay_seconds}s."
    else
      log_info "${agent_name} attempt ${attempt} produced no last message; retrying in ${retry_delay_seconds}s."
    fi

    sleep "${retry_delay_seconds}"
    attempt="$((attempt + 1))"
    if [[ "${retry_delay_seconds}" -lt "${MAX_RETRY_DELAY_SECONDS}" ]]; then
      retry_delay_seconds="$((retry_delay_seconds * 2))"
      if [[ "${retry_delay_seconds}" -gt "${MAX_RETRY_DELAY_SECONDS}" ]]; then
        retry_delay_seconds="${MAX_RETRY_DELAY_SECONDS}"
      fi
    fi
  done
}

trimmed_nonempty_message() {
  local message_file="$1"

  sed \
    -e 's/\r$//' \
    -e 's/^[[:space:]]*//' \
    -e 's/[[:space:]]*$//' \
    -e '/^$/d' \
    "${message_file}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      require_value "$1" "${2:-}"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --iterations)
      require_value "$1" "${2:-}"
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --model)
      require_value "$1" "${2:-}"
      MODEL="$2"
      shift 2
      ;;
    --codex-reference-repo)
      require_value "$1" "${2:-}"
      CODEX_REFERENCE_REPO="$2"
      shift 2
      ;;
    --retry-delay)
      require_value "$1" "${2:-}"
      INITIAL_RETRY_DELAY_SECONDS="$2"
      shift 2
      ;;
    --retry-max-delay)
      require_value "$1" "${2:-}"
      MAX_RETRY_DELAY_SECONDS="$2"
      shift 2
      ;;
    --progress-log-interval-seconds)
      require_value "$1" "${2:-}"
      PROGRESS_LOG_INTERVAL_SECONDS="$2"
      shift 2
      ;;
    --post-agent-settle-seconds)
      require_value "$1" "${2:-}"
      POST_AGENT_SETTLE_SECONDS="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${ROOT_DIR}/${PLAN_PATH}" ]]; then
  echo "Plan file not found: ${ROOT_DIR}/${PLAN_PATH}" >&2
  exit 1
fi

if [[ ! "${MAX_ITERATIONS}" =~ ^[0-9]+$ ]]; then
  echo "--iterations must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${PROGRESS_LOG_INTERVAL_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "--progress-log-interval-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${POST_AGENT_SETTLE_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "--post-agent-settle-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${INITIAL_RETRY_DELAY_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "--retry-delay must be a positive integer" >&2
  exit 1
fi

if [[ ! "${MAX_RETRY_DELAY_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "--retry-max-delay must be a positive integer" >&2
  exit 1
fi

if [[ "${MAX_RETRY_DELAY_SECONDS}" -lt "${INITIAL_RETRY_DELAY_SECONDS}" ]]; then
  echo "--retry-max-delay must be greater than or equal to --retry-delay" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if [[ ! -d "${CODEX_REFERENCE_REPO}" ]]; then
  echo "Codex reference repository not found: ${CODEX_REFERENCE_REPO}" >&2
  exit 1
fi
CODEX_REFERENCE_REPO="$(cd "${CODEX_REFERENCE_REPO}" && pwd -P)"
if [[ ! -f "${CODEX_REFERENCE_REPO}/AGENTS.md" ]] \
  || [[ ! -d "${CODEX_REFERENCE_REPO}/codex-rs/app-server-protocol" ]]; then
  echo "Codex reference repository is missing expected source paths: ${CODEX_REFERENCE_REPO}" >&2
  exit 1
fi

require_clean_repo "before starting the loop"

if [[ -z "${OUTPUT_DIR}" ]]; then
  output_base_dir="$(resolve_path_without_creating "${TMPDIR:-/tmp}")"
  if [[ "${output_base_dir}" == "${ROOT_DIR}" ]] || [[ "${output_base_dir}" == "${ROOT_DIR}/"* ]]; then
    echo "TMPDIR must be outside the repository" >&2
    exit 1
  fi
  mkdir -p "${output_base_dir}"
  OUTPUT_DIR="$(mktemp -d "${output_base_dir}/topic-conversations-loop.$(date '+%Y%m%d-%H%M%S').XXXXXX")"
else
  OUTPUT_DIR="$(resolve_path_without_creating "${OUTPUT_DIR}")"
fi
if [[ "${OUTPUT_DIR}" == "${ROOT_DIR}" ]] || [[ "${OUTPUT_DIR}" == "${ROOT_DIR}/"* ]]; then
  echo "--output-dir must be outside the repository" >&2
  exit 1
fi
mkdir -p "${OUTPUT_DIR}"
OUTPUT_DIR="$(cd "${OUTPUT_DIR}" && pwd -P)"

AGENT_ONE_PROMPT="Implement the earliest coherent incomplete slice in ${PLAN_PATH}.

Before acting, read ${PLAN_PATH}. Inspect git status, recent commits, the plan progress log, and the actual owners/tests for the earliest incomplete phase. When Codex behavior or protocol is relevant, inspect the source under ${CODEX_REFERENCE_REPO}; the checked source is the implementation authority for undocumented behavior.

Follow phase dependency order. Do not skip ahead around an unmet exit criterion, and do not treat progress-log claims as proof without fresh source and test evidence. Complete one reviewable owner-level slice. Follow the plan's functional priorities rather than spending the iteration on mockup parity or unrelated visual polish.

Run the verification required for the slice. A scripted provider proves Setta behavior, not live Codex semantics; do not use it to satisfy the plan's live active-turn fork prerequisite.

Update ${PLAN_PATH} with append-only progress evidence: exact scope completed, verification run, generated outputs, remaining work, and genuine blockers. Commit the implementation, tests, generated artifacts, and plan update together, and leave the repository clean. Do not emit either loop sentinel; completion and blocker classification belong to Agent 2."

AGENT_TWO_PROMPT="Review Agent 1's latest slice against ${PLAN_PATH}, recent commits, the current worktree, generated artifacts, and the actual implementation/tests. Do not begin the next implementation slice.

Audit phase ordering, the plan's architectural invariants, Codex behavior, verification evidence, deletion scope, and progress claims as applicable to the slice. Inspect ${CODEX_REFERENCE_REPO} when the review depends on Codex behavior. A fake provider must not be accepted as proof of live active-turn fork semantics.

Fix practical gaps, run the required verification, update ${PLAN_PATH} with evidence, commit all audit fixes, and leave the repository clean. If the slice is correct but the plan remains incomplete, return a concise handoff without either sentinel.

Return exactly ${COMPLETION_SENTINEL} only when every plan phase and acceptance criterion is actually complete, the deletion inventory has no surviving dead vertical slices, generated outputs are current, all required deterministic gates pass, live Codex requirements are satisfied where they gate behavior, the plan records final evidence, and the repository is clean.

Return exactly ${BLOCKED_SENTINEL} only for a genuine external blocker that prevents the earliest remaining phase after safe in-scope alternatives are exhausted. First update and commit the plan with the blocker, evidence, completed work, and precise resume condition. Difficulty, a failing test, missing implementation, unavailable mockup parity, or work remaining is not a blocker and never justifies the completion sentinel."

log_info "Output directory: ${OUTPUT_DIR}"
log_info "Plan: ${ROOT_DIR}/${PLAN_PATH}"
log_info "Codex reference source: ${CODEX_REFERENCE_REPO}"
log_info "Model: ${MODEL}"
log_info "Agent 1 reasoning effort: ${AGENT_ONE_REASONING_EFFORT}"
log_info "Agent 2 reasoning effort: ${AGENT_TWO_REASONING_EFFORT}"
log_info "Agent attempts: unlimited"
log_info "Retry delays: ${INITIAL_RETRY_DELAY_SECONDS}s initial, ${MAX_RETRY_DELAY_SECONDS}s maximum"
log_info "Progress log interval: ${PROGRESS_LOG_INTERVAL_SECONDS}s"
log_info "Post-agent settle check: ${POST_AGENT_SETTLE_SECONDS}s"
log_info "Approvals/sandbox bypass: enabled"
if [[ "${MAX_ITERATIONS}" -eq 0 ]]; then
  log_info "Iteration cap: none"
else
  log_info "Iteration cap: ${MAX_ITERATIONS}"
fi
log_info "Completion sentinel: ${COMPLETION_SENTINEL}"
log_info "Blocked sentinel: ${BLOCKED_SENTINEL}"

iteration=1
while true; do
  if [[ "${MAX_ITERATIONS}" -ne 0 ]] && [[ "${iteration}" -gt "${MAX_ITERATIONS}" ]]; then
    log_info "Reached iteration cap (${MAX_ITERATIONS}) before completion."
    exit 3
  fi

  run_dir="$(printf '%s/iteration-%04d' "${OUTPUT_DIR}" "${iteration}")"
  reviewer_last_message="${run_dir}/agent-2.last-message.txt"
  reviewer_message=""
  iteration_start_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"

  log_info "Starting iteration ${iteration}."
  require_clean_repo "before iteration ${iteration}"
  run_agent "agent-1" "${AGENT_ONE_PROMPT}" "${run_dir}" "${AGENT_ONE_REASONING_EFFORT}"
  run_agent "agent-2" "${AGENT_TWO_PROMPT}" "${run_dir}" "${AGENT_TWO_REASONING_EFFORT}"

  reviewer_message="$(trimmed_nonempty_message "${reviewer_last_message}")"
  if [[ "${reviewer_message}" == "${COMPLETION_SENTINEL}" ]]; then
    require_clean_repo "at completion"
    log_info "Agent 2 returned ${COMPLETION_SENTINEL}; implementation is complete."
    exit 0
  fi

  if [[ "${reviewer_message}" == "${BLOCKED_SENTINEL}" ]]; then
    require_clean_repo "at blocked stop"
    if [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${iteration_start_head}" ]]; then
      echo "Agent 2 returned ${BLOCKED_SENTINEL} without committing blocker evidence to the plan." >&2
      exit 1
    fi
    log_info "Agent 2 returned ${BLOCKED_SENTINEL}; see the plan progress log and ${reviewer_last_message}."
    exit 2
  fi

  log_info "Agent 2 did not return a terminal sentinel; continuing."
  iteration="$((iteration + 1))"
done
