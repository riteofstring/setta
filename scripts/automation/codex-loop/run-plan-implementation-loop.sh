#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

PLAN_PATH=""
COMPLETION_SENTINEL="PLAN_IMPLEMENTATION_COMPLETE"
FINAL_AUDIT_SENTINEL="PLAN_IMPLEMENTATION_READY_FOR_FINAL_AUDIT"
PHASE_AUDIT_SENTINEL="PLAN_PHASE_READY_FOR_AUDIT"
PHASE_COMPLETE_SENTINEL="PLAN_PHASE_AUDIT_COMPLETE"
MODEL="gpt-5.5"
AGENT_ONE_REASONING_EFFORT="xhigh"
AGENT_TWO_REASONING_EFFORT="xhigh"
OUTPUT_DIR=""
INITIAL_RETRY_DELAY_SECONDS="15"
MAX_RETRY_DELAY_SECONDS="300"
PROGRESS_LOG_INTERVAL_SECONDS="120"
CODEX_REFERENCE_REPO="${CODEX_REFERENCE_REPO:-/Users/kevin/Documents/AppDevelopment/reference_repos/codex}"
ACTIVE_CODEX_PID=""

usage() {
  cat <<'EOF'
Usage: scripts/automation/codex-loop/run-plan-implementation-loop.sh PLAN_PATH [options]

Runs fresh Codex agents in a loop for the repository-relative plan document
passed as PLAN_PATH.

Agent 1 implements coherent batches from the current plan phase and uses
focused checks while the batch is changing. Routine batches are not followed
by a redundant second-agent review. Agent 2 reviews and runs broader gates only
when Agent 1 declares the current phase ready for audit. When Agent 1 finds no
remaining repository work, Agent 2 performs a separate whole-plan completion
audit.

Within a phase, agents should update all assumptions affected by a contract or
behavior change before rerunning a focused end-to-end scenario. Broad matrices
and live-provider suites are phase/final gates, not per-checkbox debugging
loops.

The loop succeeds only when Agent 2's final message is exactly:
  PLAN_IMPLEMENTATION_COMPLETE

Review findings, failing checks, and incomplete plan work advance to another
iteration. The loop has no iteration cap and does not stop before the separate
whole-plan audit confirms completion. Operational script failures and manual
termination still exit non-zero.

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
  --model NAME          Codex model for both agents. Default: gpt-5.5.
  --codex-reference-repo PATH
                        Full Codex source checkout used for protocol/source
                        verification. Default:
                        /Users/kevin/Documents/AppDevelopment/reference_repos/codex
  --retry-delay N       Initial transient retry delay in seconds. Default: 15.
  --retry-max-delay N   Maximum transient retry delay in seconds. Default: 300.
  --progress-log-interval-seconds N
                        Print an in-flight agent status line at most every N
                        seconds. Default: 120. Use 0 to disable.
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
  local attempt_prompt="${prompt}"
  local run_dir="$3"
  local reasoning_effort="$4"
  local must_finish_clean="$5"
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
  local worktree_state="clean"

  mkdir -p "${run_dir}"
  rm -f "${transcript_file}" "${last_message_file}" "${status_file}"

  log_info "Starting ${agent_name}. Transcript: ${transcript_file}. Last message: ${last_message_file}"

  while true; do
    attempt_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
    rm -f "${last_message_file}"
    printf '\n===== attempt %s at %s =====\n' \
      "${attempt}" \
      "$(timestamp_now)" >>"${transcript_file}"

    codex exec \
      --color never \
      --cd "${ROOT_DIR}" \
      --ephemeral \
      --model "${MODEL}" \
      --config "model_reasoning_effort=\"${reasoning_effort}\"" \
      --dangerously-bypass-approvals-and-sandbox \
      --output-last-message "${last_message_file}" \
      "${attempt_prompt}" >>"${transcript_file}" 2>&1 &
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
    worktree_state="clean"
    if ! repo_is_clean; then
      worktree_state="dirty"
    fi

    printf 'attempt=%s exit_code=%s last_message=%s worktree=%s head_before=%s head_after=%s\n' \
      "${attempt}" \
      "${exit_code}" \
      "${last_message_state}" \
      "${worktree_state}" \
      "${attempt_head}" \
      "${completed_head}" \
      >>"${status_file}"

    if [[ "${exit_code}" -eq 0 ]] && [[ -s "${last_message_file}" ]]; then
      if [[ "${must_finish_clean}" -eq 0 ]] || [[ "${worktree_state}" == "clean" ]]; then
        log_info "${agent_name} finished after ${attempt} attempt(s)."
        return
      fi

      attempt_prompt="Finish and commit the current work. Do not start another plan batch."
      log_info "${agent_name} left work to finish; starting another attempt in ${retry_delay_seconds}s."
    elif [[ "${completed_head}" != "${attempt_head}" ]] || [[ "${worktree_state}" == "dirty" ]]; then
      if [[ ! -s "${last_message_file}" ]]; then
        printf '%s\n' \
          "${agent_name} left work in the repository; inspect and continue it." \
          >"${last_message_file}"
      fi

      if [[ "${must_finish_clean}" -eq 0 ]] || [[ "${worktree_state}" == "clean" ]]; then
        log_info "${agent_name} left work for the next agent to inspect."
        return
      fi

      attempt_prompt="Finish and commit the current work. Do not start another plan batch."
      log_info "${agent_name} left work to finish after an incomplete result; retrying in ${retry_delay_seconds}s."
    elif [[ "${exit_code}" -ne 0 ]]; then
      log_info "${agent_name} attempt ${attempt} failed without changing the repository; retrying in ${retry_delay_seconds}s."
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
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "${PLAN_PATH}" ]]; then
        echo "Unexpected argument: $1" >&2
        usage >&2
        exit 1
      fi
      PLAN_PATH="$1"
      shift
      ;;
  esac
done
if [[ -z "${PLAN_PATH}" ]]; then
  echo "Missing required PLAN_PATH" >&2
  usage >&2
  exit 1
fi
if [[ "${PLAN_PATH}" == /* ]]; then
  echo "PLAN_PATH must be relative to the repository root" >&2
  exit 1
fi
if [[ ! -f "${ROOT_DIR}/${PLAN_PATH}" ]]; then
  echo "Plan file not found: ${ROOT_DIR}/${PLAN_PATH}" >&2
  exit 1
fi

if [[ ! "${PROGRESS_LOG_INTERVAL_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "--progress-log-interval-seconds must be a non-negative integer" >&2
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

require_clean_repo "before starting the loop"

if [[ -z "${OUTPUT_DIR}" ]]; then
  output_base_dir="$(resolve_path_without_creating "${TMPDIR:-/tmp}")"
  if [[ "${output_base_dir}" == "${ROOT_DIR}" ]] || [[ "${output_base_dir}" == "${ROOT_DIR}/"* ]]; then
    echo "TMPDIR must be outside the repository" >&2
    exit 1
  fi
  mkdir -p "${output_base_dir}"
  OUTPUT_DIR="$(mktemp -d "${output_base_dir}/plan-implementation-loop.$(date '+%Y%m%d-%H%M%S').XXXXXX")"
else
  OUTPUT_DIR="$(resolve_path_without_creating "${OUTPUT_DIR}")"
fi
if [[ "${OUTPUT_DIR}" == "${ROOT_DIR}" ]] || [[ "${OUTPUT_DIR}" == "${ROOT_DIR}/"* ]]; then
  echo "--output-dir must be outside the repository" >&2
  exit 1
fi
mkdir -p "${OUTPUT_DIR}"
OUTPUT_DIR="$(cd "${OUTPUT_DIR}" && pwd -P)"

AGENT_ONE_PROMPT="Before acting, inspect ${PLAN_PATH} and its recent commit history. Work in the earliest phase or milestone with incomplete repository-actionable work; unavailable external evidence does not make a phase actionable. Implement a coherent batch of adjacent, tightly coupled items from that phase, and prefer finishing the coupled batch in one implementation and one commit instead of stopping after one checkbox. Keep plan status current, but never create a status-only commit. During implementation, run the narrowest checks that exercise the changing behavior. Use a directly affected workflow selector instead of a whole workflow matrix while debugging. If a contract or removed behavior changes an end-to-end scenario, search for and update every assumption tied to that behavior before the first rerun; do not discover stale assertions one at a time through repeated long runs. After a check fails, fix the cause and rerun only that focused check until stable. Do not run broad deterministic matrices, complete live-provider suites, or duplicate already-green broad gates during routine implementation; those run at the phase audit, unless repository instructions explicitly require a gate before this commit. Before committing source, obey the repository's required formatting, changed-file quality, and supply-chain rules. Commit the coherent batch and leave a clean worktree. Never seek missing credentials, privileges, GUI applications, background services, or remote access; record unavailable external verification once as a release gate. Avoid repeatedly printing complete diffs or large failure artifacts into the transcript; narrow inspection to relevant files and failure excerpts. Use ${CODEX_REFERENCE_REPO} when needed. If this commit finishes the current phase but later repository-actionable phases remain, return exactly ${PHASE_AUDIT_SENTINEL}. If all repository-actionable plan work is implemented, return exactly ${FINAL_AUDIT_SENTINEL}. Otherwise summarize the committed batch normally."

log_info "Output directory: ${OUTPUT_DIR}"
log_info "Plan: ${ROOT_DIR}/${PLAN_PATH}"
log_info "Codex reference source: ${CODEX_REFERENCE_REPO}"
log_info "Model: ${MODEL}"
log_info "Agent 1 reasoning effort: ${AGENT_ONE_REASONING_EFFORT}"
log_info "Agent 2 reasoning effort: ${AGENT_TWO_REASONING_EFFORT}"
log_info "Agent attempts: unlimited"
log_info "Retry delays: ${INITIAL_RETRY_DELAY_SECONDS}s initial, ${MAX_RETRY_DELAY_SECONDS}s maximum"
log_info "Progress log interval: ${PROGRESS_LOG_INTERVAL_SECONDS}s"
log_info "Approvals/sandbox bypass: enabled"
log_info "Iteration cap: none"
log_info "Review cadence: phase and final audits only"
log_info "Completion sentinel: ${COMPLETION_SENTINEL}"
log_info "Phase audit request: ${PHASE_AUDIT_SENTINEL}"
log_info "Phase audit completion: ${PHASE_COMPLETE_SENTINEL}"
log_info "Final audit request: ${FINAL_AUDIT_SENTINEL}"

iteration=1
phase_start_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
while true; do
  run_dir="$(printf '%s/iteration-%04d' "${OUTPUT_DIR}" "${iteration}")"
  implementer_last_message="${run_dir}/agent-1.last-message.txt"
  implementer_message=""
  reviewer_last_message="${run_dir}/agent-2.last-message.txt"
  reviewer_message=""
  iteration_start_head=""
  implementer_head=""
  audit_kind=""
  final_audit="0"
  reviewer_prompt=""
  log_info "Starting iteration ${iteration}."
  require_clean_repo "before iteration ${iteration}"
  iteration_start_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
  run_agent "agent-1" "${AGENT_ONE_PROMPT}" "${run_dir}" "${AGENT_ONE_REASONING_EFFORT}" 1
  implementer_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
  implementer_message="$(trimmed_nonempty_message "${implementer_last_message}")"
  if [[ "${implementer_message}" == "${FINAL_AUDIT_SENTINEL}" ]] && repo_is_clean; then
    final_audit="1"
    audit_kind="final"
    reviewer_prompt="Perform the final whole-plan audit against ${PLAN_PATH} and its implementation history. Inspect phase-audit evidence before running commands. Do not rerun a broad deterministic or live-provider gate that already passed after the last relevant code change. Run only missing required whole-plan gates, once, after static review is complete. If a gate fails, isolate the cause with the narrowest check, make all related fixes, and reserve one final broad rerun for the stable tree. Reject status-only work and do not retry unavailable external verification; keep it as a release gate. Fix, verify, and commit actionable issues without starting work outside the plan. If all repository-actionable implementation and verification are complete, return exactly ${COMPLETION_SENTINEL}. Otherwise report the concrete remaining work. Do not seek missing credentials, privileges, GUI applications, background services, or remote access."
    log_info "Agent 1 requested the final whole-plan audit."
  elif [[ "${implementer_message}" == "${PHASE_AUDIT_SENTINEL}" ]] && repo_is_clean; then
    audit_kind="phase"
    reviewer_prompt="Audit the completed current phase of ${PLAN_PATH} as one coherent change. Treat ${phase_start_head}..${implementer_head} as the minimum change range, and expand the review to earlier commits for this phase when the loop was restarted mid-phase. Inspect the implementation and existing verification evidence before running commands. Check all assumptions affected by changed or removed behavior in one static pass. Run the phase's applicable required broad deterministic matrix and live-provider suite at most once, after review and fixes are stable; do not duplicate already-green gates that postdate the last relevant code change. If a broad gate fails, use the narrowest failing workflow while fixing it, then run one final applicable broad gate after all edits. Fix, verify, and commit issues in the current phase, but do not start the next phase. Reject status-only work and do not retry unavailable external verification. If the current phase is complete and its required available gates are satisfied, return exactly ${PHASE_COMPLETE_SENTINEL}. Otherwise report the remaining current-phase work. Do not seek missing credentials, privileges, GUI applications, background services, or remote access."
    log_info "Agent 1 requested a phase audit for ${phase_start_head}..${implementer_head}."
  else
    require_clean_repo "after implementation batch ${iteration}"
    if [[ "${implementer_head}" == "${iteration_start_head}" ]]; then
      log_info "Agent 1 made no commit and did not request an audit; continuing without a redundant reviewer."
    else
      log_info "Agent 1 committed an implementation batch; phase review is deferred until the phase audit."
    fi
    iteration="$((iteration + 1))"
    continue
  fi
  run_agent "agent-2" "${reviewer_prompt}" "${run_dir}" "${AGENT_TWO_REASONING_EFFORT}" 1
  require_clean_repo "after agent-2 review"

  reviewer_message="$(trimmed_nonempty_message "${reviewer_last_message}")"
  if [[ "${final_audit}" -eq 1 ]] && [[ "${reviewer_message}" == "${COMPLETION_SENTINEL}" ]]; then
    require_clean_repo "at completion"
    log_info "Agent 2 returned ${COMPLETION_SENTINEL}; implementation is complete."
    exit 0
  fi

  if [[ "${audit_kind}" == "phase" ]] && [[ "${reviewer_message}" == "${PHASE_COMPLETE_SENTINEL}" ]]; then
    phase_start_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
    log_info "Agent 2 completed the phase audit; the next implementation batch starts at ${phase_start_head}."
  elif [[ "${final_audit}" -eq 1 ]]; then
    log_info "The final audit found remaining work; continuing."
  else
    log_info "The phase audit found remaining current-phase work; continuing."
  fi
  iteration="$((iteration + 1))"
done
