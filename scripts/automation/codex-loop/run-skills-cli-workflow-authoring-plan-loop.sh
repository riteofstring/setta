#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

PLAN_PATH="docs/plans/skills-cli-workflow-authoring-plan.md"
SENTINEL="SKILLS_CLI_WORKFLOW_AUTHORING_PLAN_COMPLETE"
MODEL="gpt-5.5"
REASONING_CONFIG='reasoning_effort="xhigh"'
OUTPUT_DIR=""
PROGRESS_LOG_INTERVAL_SECONDS="60"
MAX_ITERATIONS="0"

usage() {
  cat <<'EOF'
Usage: scripts/automation/codex-loop/run-skills-cli-workflow-authoring-plan-loop.sh [options]

Runs two fresh Codex agents in a loop for:
  docs/plans/skills-cli-workflow-authoring-plan.md

Agent 1 implements the next coherent step in the plan and commits the work.
Agent 2 audits the work, fixes or documents any gaps, commits if needed, and
the loop stops only when Agent 2's final message is exactly:
  SKILLS_CLI_WORKFLOW_AUTHORING_PLAN_COMPLETE
Agent 2 may also use that sentinel when the plan is implemented as much as
possible and the remaining work is blocked.

This dedicated automation helper intentionally runs Codex in the current
repository checkout with approvals and sandbox bypassed. That behavior is
acceptable here because the loop is for unattended repo-local plan execution
where agents are expected to edit and commit directly in the working tree.

Codex transcripts are written to per-agent log files. The terminal prints only
loop status and periodic progress updates.

Options:
  --output-dir PATH   Directory for per-iteration transcripts and last messages.
                      Default: mktemp directory outside the repository.
  --iterations N      Maximum number of loop iterations. Default: 0, which
                      means no iteration cap.
  --model NAME        Codex model to use. Default: gpt-5.5.
  --progress-log-interval-seconds N
                      Print a status line at most once every N seconds while an
                      agent is still running. Default: 60. Use 0 to disable.
  --help             Show this help text.
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

timestamp_now() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
  printf '[%s] %s\n' "$(timestamp_now)" "$*"
}

run_agent() {
  local agent_name="$1"
  local prompt="$2"
  local run_dir="$3"
  local transcript_file="${run_dir}/${agent_name}.transcript.log"
  local last_message_file="${run_dir}/${agent_name}.last-message.txt"
  local status_file="${run_dir}/${agent_name}.status.txt"
  local codex_pid=""
  local start_epoch=""
  local last_progress_log_epoch=""
  local current_epoch=""
  local elapsed_seconds=""
  local exit_code="0"

  mkdir -p "${run_dir}"

  log_info "Starting ${agent_name}. Transcript: ${transcript_file}. Last message: ${last_message_file}"

  # This dedicated plan loop is intentionally allowed to mutate and commit in
  # the current checkout without approval prompts or filesystem sandboxing.
  codex exec \
    --color never \
    --cd "${ROOT_DIR}" \
    --ephemeral \
    --model "${MODEL}" \
    --config "${REASONING_CONFIG}" \
    --dangerously-bypass-approvals-and-sandbox \
    --output-last-message "${last_message_file}" \
    "${prompt}" >"${transcript_file}" 2>&1 &
  codex_pid="$!"

  start_epoch="$(date +%s)"
  last_progress_log_epoch="${start_epoch}"

  while kill -0 "${codex_pid}" 2>/dev/null; do
    current_epoch="$(date +%s)"
    if [[ "${PROGRESS_LOG_INTERVAL_SECONDS}" -gt 0 ]] \
      && [[ "$((current_epoch - last_progress_log_epoch))" -ge "${PROGRESS_LOG_INTERVAL_SECONDS}" ]]; then
      elapsed_seconds="$((current_epoch - start_epoch))"
      log_info "${agent_name} still running after ${elapsed_seconds}s. Transcript: ${transcript_file}"
      last_progress_log_epoch="${current_epoch}"
    fi
    sleep 1
  done

  set +e
  wait "${codex_pid}"
  exit_code="$?"
  set -e

  printf '%s\n' "${exit_code}" >"${status_file}"
  if [[ "${exit_code}" -ne 0 ]]; then
    echo "${agent_name} failed with exit code ${exit_code}. See ${transcript_file}" >&2
    exit "${exit_code}"
  fi

  if [[ ! -s "${last_message_file}" ]]; then
    echo "${agent_name} did not produce a last-message file: ${last_message_file}" >&2
    exit 1
  fi

  log_info "${agent_name} finished."
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
    --progress-log-interval-seconds)
      require_value "$1" "${2:-}"
      PROGRESS_LOG_INTERVAL_SECONDS="$2"
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

if [[ ! "${PROGRESS_LOG_INTERVAL_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "--progress-log-interval-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${MAX_ITERATIONS}" =~ ^[0-9]+$ ]]; then
  echo "--iterations must be a non-negative integer" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if [[ -z "${OUTPUT_DIR}" ]]; then
  OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/skills-cli-workflow-authoring-loop.$(date '+%Y%m%d-%H%M%S').XXXXXX")"
else
  mkdir -p "${OUTPUT_DIR}"
fi

AGENT_ONE_PROMPT="Implement the next coherent step in ${PLAN_PATH}.

First inspect the plan, any source plans it references, AGENTS.md, git history, and the current source to determine which step is next. Respect dependency order and ownership boundaries from the plan. Keep the slice disciplined: finish the smallest coherent step that can be verified and committed cleanly. Follow AGENTS.md exactly, including generated contract rules, no-backward-compatibility rules, and required Electron/live Codex verification when the touched area requires it. Do not add polling or timer-based guessing, parse text with keyword heuristics, add silent fallbacks, add compatibility shims, add migrations, add transitional dual paths, or do unrelated cleanup.

When the step is implemented and verified, update ${PLAN_PATH} and any directly affected source plan docs with the progress made, verification performed, and any remaining work or blockers discovered. Commit the implementation, tests, generated artifacts, and plan updates together."

AGENT_TWO_PROMPT="Another agent worked on the next step in ${PLAN_PATH}. Audit the result against the plan, AGENTS.md, and the actual code.

If the audit finds gaps, fix them if practical, run the required focused verification, and commit your fixes. If plan docs need to be updated to reflect what was learned, update and commit them. If the current step is good and the next step is ready, say so in your final message.

If the whole plan is fully implemented and verified, or if the plan is implemented as much as possible and a genuine blocker prevents full completion after you update and commit the plan with the blocker and remaining work, respond with exactly:
${SENTINEL}"

log_info "Output directory: ${OUTPUT_DIR}"
log_info "Plan: ${ROOT_DIR}/${PLAN_PATH}"
log_info "Model: ${MODEL}"
log_info "Reasoning effort: xhigh"
log_info "Approvals/sandbox bypass: enabled"
if [[ "${MAX_ITERATIONS}" -eq 0 ]]; then
  log_info "Iteration cap: none"
else
  log_info "Iteration cap: ${MAX_ITERATIONS}"
fi
log_info "Stop sentinel: ${SENTINEL}"
log_info "Progress log interval: ${PROGRESS_LOG_INTERVAL_SECONDS}s"

iteration=1
while true; do
  if [[ "${MAX_ITERATIONS}" -ne 0 ]] && [[ "${iteration}" -gt "${MAX_ITERATIONS}" ]]; then
    log_info "Reached iteration cap (${MAX_ITERATIONS}); stopping loop."
    exit 0
  fi

  run_dir="$(printf '%s/iteration-%04d' "${OUTPUT_DIR}" "${iteration}")"
  reviewer_last_message="${run_dir}/agent-2.last-message.txt"
  reviewer_message=""

  log_info "Starting iteration ${iteration}."
  run_agent "agent-1" "${AGENT_ONE_PROMPT}" "${run_dir}"
  run_agent "agent-2" "${AGENT_TWO_PROMPT}" "${run_dir}"

  reviewer_message="$(trimmed_nonempty_message "${reviewer_last_message}")"
  if [[ "${reviewer_message}" == "${SENTINEL}" ]]; then
    log_info "Agent 2 returned ${SENTINEL}; stopping loop."
    exit 0
  fi

  log_info "Agent 2 did not return ${SENTINEL}; continuing."
  iteration="$((iteration + 1))"
done
