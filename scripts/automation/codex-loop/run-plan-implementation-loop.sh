#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

PLAN_PATH=""
COMPLETION_SENTINEL="PLAN_IMPLEMENTATION_COMPLETE"
BLOCKED_SENTINEL="PLAN_IMPLEMENTATION_BLOCKED"
BLOCKED_EXIT_CODE="3"
APPROVAL_SENTINEL="PLAN_IMPLEMENTATION_AWAITING_DEVELOPER_APPROVAL"
APPROVAL_EXIT_CODE="4"
FINAL_AUDIT_SENTINEL="PLAN_IMPLEMENTATION_READY_FOR_FINAL_AUDIT"
PHASE_AUDIT_SENTINEL="PLAN_PHASE_READY_FOR_AUDIT"
PHASE_COMPLETE_SENTINEL="PLAN_PHASE_AUDIT_COMPLETE"
AGENT_ONE_RUNNER="codex"
AGENT_ONE_MODEL="gpt-5.6-sol"
AGENT_ONE_EFFORT="max"
AGENT_ONE_MODEL_WAS_SET="0"
AGENT_ONE_EFFORT_WAS_SET="0"
AGENT_TWO_RUNNER="codex"
AGENT_TWO_MODEL="gpt-5.6-sol"
AGENT_TWO_EFFORT="max"
AGENT_TWO_MODEL_WAS_SET="0"
AGENT_TWO_EFFORT_WAS_SET="0"
OUTPUT_DIR=""
INITIAL_RETRY_DELAY_SECONDS="15"
MAX_RETRY_DELAY_SECONDS="300"
PROGRESS_LOG_INTERVAL_SECONDS="120"
VERIFICATION_AUTHORIZATION="none"
VERIFICATION_AUTHORIZATION_PROMPT=""
CODEX_REFERENCE_REPO="${CODEX_REFERENCE_REPO:-/Users/kevin/Documents/AppDevelopment/reference_repos/codex}"
ACTIVE_AGENT_PID=""

usage() {
  cat <<'EOF'
Usage: scripts/automation/codex-loop/run-plan-implementation-loop.sh PLAN_PATH [options]

Runs fresh automation agents in a loop for the repository-relative plan document
passed as PLAN_PATH.

Agent 1 implements coherent batches from the current plan phase and uses
focused checks when repository policy and current user authorization permit
them. Routine batches are not followed by a redundant second-agent review.
Agent 2 reviews at phase boundaries and runs broader gates only when they are
authorized. When Agent 1 finds no remaining repository work, Agent 2 performs a
separate whole-plan completion audit.

Within a phase, agents should update all assumptions affected by a contract or
behavior change before rerunning a focused end-to-end scenario. Broad matrices
and live-provider suites are phase/final gates, not per-checkbox debugging
loops.

The loop succeeds only when Agent 2's final non-empty line is exactly:
  PLAN_IMPLEMENTATION_COMPLETE

The loop exits with status 3 when either agent establishes a genuine plan-level
blocker, commits the required evidence, and ends its response with the exact line:
  PLAN_IMPLEMENTATION_BLOCKED

The loop exits with status 4 when the earliest incomplete phase has reached a
developer-only evidence or approval gate and the agent's final non-empty line is:
  PLAN_IMPLEMENTATION_AWAITING_DEVELOPER_APPROVAL

Required developer gates are not release gates and cannot be waived by either
agent. After the developer supplies and records the required evidence or
approval, restart the loop normally.

Review findings, failing checks, and incomplete plan work advance to another
iteration. The loop has no iteration cap and does not stop before the separate
whole-plan audit confirms completion. Operational script failures and manual
termination still exit non-zero.

This dedicated automation helper intentionally runs two independently
configured Codex or Claude Code CLI agents in the current repository checkout
with permission checks bypassed. That behavior is acceptable here because the
loop is for unattended repo-local plan execution where agents are expected to
edit, verify, and commit directly in a clean working tree.

Agent transcripts are written outside the repository to per-agent log files.
The terminal prints loop status and periodic progress lines.

Options:
  --output-dir PATH     Directory for per-iteration transcripts and last
                        messages. Must be outside the repository. Default:
                        mktemp directory under TMPDIR.
  --agent-1-runner NAME CLI for Agent 1: codex or claude. Default: codex.
  --agent-1-model NAME  Model for Agent 1. Default: gpt-5.6-sol for codex;
                        required when the runner is claude.
  --agent-1-reasoning-effort LEVEL
                        Reasoning effort for Agent 1. Default: max for codex;
                        required when the runner is claude.
  --agent-2-runner NAME CLI for Agent 2: codex or claude. Default: codex.
  --agent-2-model NAME  Model for Agent 2. Default: gpt-5.6-sol for codex;
                        required when the runner is claude.
  --agent-2-reasoning-effort LEVEL
                        Reasoning effort for Agent 2. Default: max for codex;
                        required when the runner is claude.
  --codex-reference-repo PATH
                        Full Codex source checkout used for protocol/source
                        verification. Default:
                        /Users/kevin/Documents/AppDevelopment/reference_repos/codex
  --retry-delay N       Initial transient retry delay in seconds. Default: 15.
  --retry-max-delay N   Maximum transient retry delay in seconds. Default: 300.
  --progress-log-interval-seconds N
                        Print an in-flight agent status line at most every N
                        seconds. Default: 120. Use 0 to disable.
  --verification-authorization SCOPE
                        Verification authorized by the current user: none,
                        plan-probes, or tests. Default: none. plan-probes permits
                        only non-destructive live probes explicitly authorized
                        by the plan; tests records explicit test authorization,
                        still subject to repository policy.
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

collect_process_tree_pids() {
  local root_pid="$1"
  local child_pid=""

  for child_pid in $(pgrep -P "${root_pid}" 2>/dev/null || true); do
    collect_process_tree_pids "${child_pid}"
  done
  printf '%s\n' "${root_pid}"
}

terminate_process_tree() {
  local root_pid="$1"
  local process_tree_pids=""
  local process_pid=""

  if [[ -z "${root_pid}" ]] || ! kill -0 "${root_pid}" 2>/dev/null; then
    return
  fi

  process_tree_pids="$(collect_process_tree_pids "${root_pid}")"
  while IFS= read -r process_pid; do
    kill -TERM "${process_pid}" 2>/dev/null || true
  done <<<"${process_tree_pids}"

  sleep 2

  while IFS= read -r process_pid; do
    if kill -0 "${process_pid}" 2>/dev/null; then
      kill -KILL "${process_pid}" 2>/dev/null || true
    fi
  done <<<"${process_tree_pids}"
}

stop_active_agent() {
  if [[ -z "${ACTIVE_AGENT_PID}" ]] || ! kill -0 "${ACTIVE_AGENT_PID}" 2>/dev/null; then
    return
  fi

  terminate_process_tree "${ACTIVE_AGENT_PID}"
  wait "${ACTIVE_AGENT_PID}" 2>/dev/null || true
  ACTIVE_AGENT_PID=""
}

handle_termination_signal() {
  stop_active_agent
  exit 130
}

trap stop_active_agent EXIT
trap handle_termination_signal INT TERM

run_agent() {
  local agent_name="$1"
  local prompt="$2"
  local attempt_prompt="${VERIFICATION_AUTHORIZATION_PROMPT} ${prompt}"
  local run_dir="$3"
  local runner="$4"
  local model="$5"
  local effort="$6"
  local must_finish_clean="$7"
  local transcript_file="${run_dir}/${agent_name}.transcript.log"
  local last_message_file="${run_dir}/${agent_name}.last-message.txt"
  local status_file="${run_dir}/${agent_name}.status.txt"
  local exit_code="0"
  local attempt="1"
  local retry_delay_seconds="${INITIAL_RETRY_DELAY_SECONDS}"
  local attempt_head=""
  local completed_head=""
  local agent_pid=""
  local start_epoch=""
  local last_progress_epoch=""
  local current_epoch=""
  local elapsed_seconds=""
  local last_message_state="missing"
  local worktree_state="clean"

  mkdir -p "${run_dir}"
  rm -f "${transcript_file}" "${last_message_file}" "${status_file}"

  log_info "Starting ${agent_name} via ${runner}. Transcript: ${transcript_file}. Last message: ${last_message_file}"

  while true; do
    attempt_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
    rm -f "${last_message_file}"
    printf '\n===== attempt %s at %s =====\n' \
      "${attempt}" \
      "$(timestamp_now)" >>"${transcript_file}"

    (
      cd "${ROOT_DIR}"
      case "${runner}" in
        claude)
          claude \
            --print \
            --output-format text \
            --model "${model}" \
            --effort "${effort}" \
            --dangerously-skip-permissions \
            --no-session-persistence \
            "${attempt_prompt}" \
            2> >(sed 's/^/[stderr] /' >>"${transcript_file}") |
            tee "${last_message_file}" >>"${transcript_file}"
          ;;
        codex)
          codex exec \
            --model "${model}" \
            --config "model_reasoning_effort=\"${effort}\"" \
            --sandbox danger-full-access \
            --dangerously-bypass-approvals-and-sandbox \
            --ephemeral \
            --cd "${ROOT_DIR}" \
            --output-last-message "${last_message_file}" \
            "${attempt_prompt}" \
            >>"${transcript_file}" \
            2> >(sed 's/^/[stderr] /' >>"${transcript_file}")
          ;;
        *)
          echo "Unsupported agent runner: ${runner}" >&2
          exit 1
          ;;
      esac
    ) &
    agent_pid="$!"
    ACTIVE_AGENT_PID="${agent_pid}"

    start_epoch="$(date +%s)"
    last_progress_epoch="${start_epoch}"
    while kill -0 "${agent_pid}" 2>/dev/null; do
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
    wait "${agent_pid}"
    exit_code="$?"
    set -e
    agent_pid=""
    ACTIVE_AGENT_PID=""

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

      attempt_prompt="${VERIFICATION_AUTHORIZATION_PROMPT} Finish and commit the current work. Do not start another plan batch."
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

      attempt_prompt="${VERIFICATION_AUTHORIZATION_PROMPT} Finish and commit the current work. Do not start another plan batch."
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

last_trimmed_nonempty_line() {
  local message_file="$1"

  sed \
    -e 's/\r$//' \
    -e 's/^[[:space:]]*//' \
    -e 's/[[:space:]]*$//' \
    -e '/^$/d' \
    "${message_file}" |
    tail -n 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      require_value "$1" "${2:-}"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --agent-1-runner)
      require_value "$1" "${2:-}"
      AGENT_ONE_RUNNER="$2"
      shift 2
      ;;
    --agent-1-model)
      require_value "$1" "${2:-}"
      AGENT_ONE_MODEL="$2"
      AGENT_ONE_MODEL_WAS_SET="1"
      shift 2
      ;;
    --agent-1-reasoning-effort)
      require_value "$1" "${2:-}"
      AGENT_ONE_EFFORT="$2"
      AGENT_ONE_EFFORT_WAS_SET="1"
      shift 2
      ;;
    --agent-2-runner)
      require_value "$1" "${2:-}"
      AGENT_TWO_RUNNER="$2"
      shift 2
      ;;
    --agent-2-model)
      require_value "$1" "${2:-}"
      AGENT_TWO_MODEL="$2"
      AGENT_TWO_MODEL_WAS_SET="1"
      shift 2
      ;;
    --agent-2-reasoning-effort)
      require_value "$1" "${2:-}"
      AGENT_TWO_EFFORT="$2"
      AGENT_TWO_EFFORT_WAS_SET="1"
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
    --verification-authorization)
      require_value "$1" "${2:-}"
      VERIFICATION_AUTHORIZATION="$2"
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

case "${VERIFICATION_AUTHORIZATION}" in
  none)
    VERIFICATION_AUTHORIZATION_PROMPT="This loop invocation carries no user authorization for automated tests, verification gates, live-provider suites, or live probes. Do not run them. Static inspection and formatting are allowed."
    ;;
  plan-probes)
    VERIFICATION_AUTHORIZATION_PROMPT="This loop invocation authorizes only non-destructive benign live probes that the plan explicitly identifies as authorized. It does not authorize automated tests, quality or supply-chain gates, workflow matrices, live-provider suites, or any other live execution. Static inspection and formatting are allowed."
    ;;
  tests)
    VERIFICATION_AUTHORIZATION_PROMPT="This loop invocation records explicit user authorization for automated verification. Repository policy, phase readiness, and the plan still govern which checks may run; this does not authorize destructive probes or work outside the plan."
    ;;
  *)
    echo "--verification-authorization must be none, plan-probes, or tests" >&2
    exit 1
    ;;
esac

if ! command -v pgrep >/dev/null 2>&1; then
  echo "pgrep is required for safe Agent process-tree cleanup" >&2
  exit 1
fi

for agent_configuration in \
  "agent-1:${AGENT_ONE_RUNNER}:${AGENT_ONE_MODEL_WAS_SET}:${AGENT_ONE_EFFORT_WAS_SET}" \
  "agent-2:${AGENT_TWO_RUNNER}:${AGENT_TWO_MODEL_WAS_SET}:${AGENT_TWO_EFFORT_WAS_SET}"; do
  IFS=: read -r agent_flag_prefix runner model_was_set effort_was_set <<<"${agent_configuration}"
  case "${runner}" in
    claude)
      if [[ "${model_was_set}" != "1" ]] || [[ "${effort_was_set}" != "1" ]]; then
        echo "--${agent_flag_prefix}-model and --${agent_flag_prefix}-reasoning-effort are required when --${agent_flag_prefix}-runner is claude" >&2
        exit 1
      fi
      ;;
    codex)
      ;;
    *)
      echo "--${agent_flag_prefix}-runner must be codex or claude" >&2
      exit 1
      ;;
  esac
  if ! command -v "${runner}" >/dev/null 2>&1; then
    echo "${runner} CLI not found on PATH" >&2
    exit 1
  fi
done

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

AGENT_ONE_PROMPT="Before acting, inspect ${PLAN_PATH} and its recent commit history. Work in the earliest phase or milestone with incomplete repository-actionable work; unavailable external evidence does not make a phase actionable. Never skip an incomplete developer evidence or approval gate to work in a later phase. Implement a coherent batch of adjacent, tightly coupled items from that phase, and prefer finishing the coupled batch in one implementation and one commit instead of stopping after one checkbox. Keep plan status current, but never create a status-only commit. Obey the repository's verification policy: run checks only when repository instructions and current user authorization permit them. When checks are authorized, use the narrowest checks that exercise the changing behavior and a directly affected workflow selector instead of a whole workflow matrix while debugging. If a contract or removed behavior changes an end-to-end scenario, search for and update every assumption tied to that behavior before the first authorized rerun; do not discover stale assertions one at a time through repeated long runs. After an authorized check fails, fix the cause and rerun only that focused check until stable. Do not run broad deterministic matrices, complete live-provider suites, or duplicate already-green broad gates during routine implementation. Before committing source, obey the repository's required formatting, changed-file quality, and supply-chain rules. Commit the coherent batch and leave a clean worktree. Never seek missing credentials, privileges, GUI applications, background services, or remote access; record unavailable or unauthorized external verification once as a release gate. A developer evidence or approval gate required by the plan is not a release gate and cannot be waived or merely recorded as pending. Avoid repeatedly printing complete diffs or large failure artifacts into the transcript; narrow inspection to relevant files and failure excerpts. Use ${CODEX_REFERENCE_REPO} when needed. Only when safe source inspection and any plan-authorized benign probes establish a genuine plan-level blocker, write and commit the evidence required by the plan, leave a clean worktree, and return exactly ${BLOCKED_SENTINEL}; never use that sentinel for a transient command, network, service, credential, or verification failure. If this commit finishes the current phase's repository work, return exactly ${PHASE_AUDIT_SENTINEL} so Agent 2 audits it before any gate stop. If the earliest incomplete phase has no remaining repository-actionable work and is waiting for required developer evidence or approval, return exactly ${APPROVAL_SENTINEL}. Return exactly ${FINAL_AUDIT_SENTINEL} only when all repository-actionable work and every required developer gate in the whole plan are complete. Otherwise summarize the committed batch normally."

log_info "Output directory: ${OUTPUT_DIR}"
log_info "Plan: ${ROOT_DIR}/${PLAN_PATH}"
log_info "Codex reference source: ${CODEX_REFERENCE_REPO}"
log_info "Agent 1 runner: ${AGENT_ONE_RUNNER}"
log_info "Agent 1 model: ${AGENT_ONE_MODEL}"
log_info "Agent 1 effort: ${AGENT_ONE_EFFORT}"
log_info "Agent 2 runner: ${AGENT_TWO_RUNNER}"
log_info "Agent 2 model: ${AGENT_TWO_MODEL}"
log_info "Agent 2 effort: ${AGENT_TWO_EFFORT}"
log_info "Dangerously skip permissions: enabled"
log_info "Agent attempts: unlimited"
log_info "Retry delays: ${INITIAL_RETRY_DELAY_SECONDS}s initial, ${MAX_RETRY_DELAY_SECONDS}s maximum"
log_info "Progress log interval: ${PROGRESS_LOG_INTERVAL_SECONDS}s"
log_info "Verification authorization: ${VERIFICATION_AUTHORIZATION}"
log_info "Iteration cap: none"
log_info "Review cadence: phase and final audits only"
log_info "Completion sentinel: ${COMPLETION_SENTINEL}"
log_info "Blocked sentinel: ${BLOCKED_SENTINEL}"
log_info "Developer approval sentinel: ${APPROVAL_SENTINEL}"
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
  run_agent "agent-1" "${AGENT_ONE_PROMPT}" "${run_dir}" "${AGENT_ONE_RUNNER}" "${AGENT_ONE_MODEL}" "${AGENT_ONE_EFFORT}" 1
  implementer_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
  implementer_message="$(last_trimmed_nonempty_line "${implementer_last_message}")"
  if [[ "${implementer_message}" == "${BLOCKED_SENTINEL}" ]] && repo_is_clean; then
    require_clean_repo "at the Agent 1 blocked exit"
    log_info "Agent 1 returned ${BLOCKED_SENTINEL}; implementation is blocked by committed plan evidence."
    exit "${BLOCKED_EXIT_CODE}"
  elif [[ "${implementer_message}" == "${APPROVAL_SENTINEL}" ]] && repo_is_clean; then
    require_clean_repo "at the Agent 1 developer-approval exit"
    log_info "Agent 1 returned ${APPROVAL_SENTINEL}; implementation is waiting at a required developer gate."
    exit "${APPROVAL_EXIT_CODE}"
  elif [[ "${implementer_message}" == "${FINAL_AUDIT_SENTINEL}" ]] && repo_is_clean; then
    final_audit="1"
    audit_kind="final"
    reviewer_prompt="Perform the final whole-plan audit against ${PLAN_PATH} and its implementation history. Inspect phase-audit evidence before running commands. Obey the repository's verification policy: run gates only when repository instructions and current user authorization permit them. Do not rerun a broad deterministic or live-provider gate that already passed after the last relevant code change. When gates are authorized, run only missing required whole-plan gates, once, after static review is complete. If an authorized gate fails, isolate the cause with the narrowest check, make all related fixes, and reserve one final broad rerun for the stable tree. Reject status-only work and do not retry unavailable or unauthorized external verification; keep ordinary unavailable external verification as a release gate. Required developer evidence and approval gates are not release gates and cannot be waived or recorded as sufficient. Fix and commit actionable issues without starting work outside the plan. If safe source inspection and plan-authorized benign probes establish a genuine plan-level blocker, commit the required evidence and return exactly ${BLOCKED_SENTINEL}; never use it for a transient command, network, service, credential, or verification failure. If any required developer evidence or approval gate remains incomplete, return exactly ${APPROVAL_SENTINEL}. If all repository-actionable implementation is complete, every required developer gate is complete, and every currently authorized verification requirement is satisfied or recorded as an ordinary release gate, return exactly ${COMPLETION_SENTINEL}. Otherwise report the concrete remaining work. Do not seek missing credentials, privileges, GUI applications, background services, or remote access."
    log_info "Agent 1 requested the final whole-plan audit."
  elif [[ "${implementer_message}" == "${PHASE_AUDIT_SENTINEL}" ]] && repo_is_clean; then
    audit_kind="phase"
    reviewer_prompt="Audit the completed current phase of ${PLAN_PATH} as one coherent change. Treat ${phase_start_head}..${implementer_head} as the minimum change range, and expand the review to earlier commits for this phase when the loop was restarted mid-phase. Inspect the implementation and existing verification evidence before running commands. Check all assumptions affected by changed or removed behavior in one static pass. Obey the repository's verification policy: run gates only when repository instructions and current user authorization permit them. When gates are authorized, run the phase's applicable required broad deterministic matrix and live-provider suite at most once, after review and fixes are stable; do not duplicate already-green gates that postdate the last relevant code change. If an authorized broad gate fails, use the narrowest failing workflow while fixing it, then run one final applicable broad gate after all edits. Fix and commit issues in the current phase, but do not start the next phase. Reject status-only work and do not retry unavailable or unauthorized external verification; keep ordinary unavailable external verification as a release gate. Required developer evidence and approval gates are not release gates and cannot be waived or recorded as sufficient. If safe source inspection and plan-authorized benign probes establish a genuine plan-level blocker, commit the required evidence and return exactly ${BLOCKED_SENTINEL}; never use it for a transient command, network, service, credential, or verification failure. If the current phase's repository work is complete but required developer evidence or approval remains incomplete, return exactly ${APPROVAL_SENTINEL}. Return exactly ${PHASE_COMPLETE_SENTINEL} only when the current phase and its required developer gate are complete and every currently authorized verification requirement is satisfied or recorded as an ordinary release gate. Otherwise report the remaining current-phase work. Do not seek missing credentials, privileges, GUI applications, background services, or remote access."
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
  run_agent "agent-2" "${reviewer_prompt}" "${run_dir}" "${AGENT_TWO_RUNNER}" "${AGENT_TWO_MODEL}" "${AGENT_TWO_EFFORT}" 1
  require_clean_repo "after agent-2 review"

  reviewer_message="$(last_trimmed_nonempty_line "${reviewer_last_message}")"
  if [[ "${reviewer_message}" == "${BLOCKED_SENTINEL}" ]]; then
    require_clean_repo "at the Agent 2 blocked exit"
    log_info "Agent 2 returned ${BLOCKED_SENTINEL}; implementation is blocked by committed plan evidence."
    exit "${BLOCKED_EXIT_CODE}"
  elif [[ "${reviewer_message}" == "${APPROVAL_SENTINEL}" ]]; then
    require_clean_repo "at the Agent 2 developer-approval exit"
    log_info "Agent 2 returned ${APPROVAL_SENTINEL}; implementation is waiting at a required developer gate."
    exit "${APPROVAL_EXIT_CODE}"
  elif [[ "${final_audit}" -eq 1 ]] && [[ "${reviewer_message}" == "${COMPLETION_SENTINEL}" ]]; then
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
