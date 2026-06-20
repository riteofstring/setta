#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

PLAN_PATH="docs/plans/workspace_graph_interaction_refactor_readiness_plan.md"
SENTINEL="PLAN_FULLY_IMPLEMENTED"
MODEL="gpt-5.5"
REASONING_CONFIG='reasoning_effort="xhigh"'
OUTPUT_DIR=""

usage() {
  cat <<'EOF'
Usage: scripts/automation/codex-loop/run-workspace-graph-interaction-refactor-loop.sh [options]

Runs two fresh Codex agents in a loop for:
  docs/plans/workspace_graph_interaction_refactor_readiness_plan.md

Agent 1 implements the next phase.
Agent 2 reviews the implementation, updates and commits the plan if needed, and
the loop stops only when Agent 2's final message is exactly:
  PLAN_FULLY_IMPLEMENTED

Options:
  --output-dir PATH   Directory for per-iteration transcripts and last messages.
                      Default: mktemp directory outside the repository.
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
  local exit_code="0"

  mkdir -p "${run_dir}"

  log_info "Starting ${agent_name}. Transcript: ${transcript_file}. Last message: ${last_message_file}"
  set +e
  codex exec \
    --color never \
    --cd "${ROOT_DIR}" \
    --ephemeral \
    --model "${MODEL}" \
    --config "${REASONING_CONFIG}" \
    --dangerously-bypass-approvals-and-sandbox \
    --output-last-message "${last_message_file}" \
    "${prompt}" 2>&1 | tee "${transcript_file}"
  exit_code="${PIPESTATUS[0]}"
  set -e

  printf '%s\n' "${exit_code}" > "${status_file}"
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

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if [[ -z "${OUTPUT_DIR}" ]]; then
  OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/workspace-graph-refactor-loop.$(date '+%Y%m%d-%H%M%S').XXXXXX")"
else
  mkdir -p "${OUTPUT_DIR}"
fi

AGENT_ONE_PROMPT="Implement the next phase in ${PLAN_PATH}"
AGENT_TWO_PROMPT="Another agent implemented the next phase of ${PLAN_PATH}. Take a look. Is the next phase ready to be implemented? If the doc needs any updating, update it and commit. If the plan has no more phases, i.e. it's fully implemented, then respond with just ${SENTINEL}."

log_info "Output directory: ${OUTPUT_DIR}"
log_info "Plan: ${ROOT_DIR}/${PLAN_PATH}"
log_info "Model: ${MODEL}"
log_info "Reasoning effort: xhigh"
log_info "Approvals/sandbox bypass: enabled"
log_info "Stop sentinel: ${SENTINEL}"

iteration=1
while true; do
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
