#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-simple-plan-loop.sh --plan PATH [options] [-- <extra codex exec args>]

Run a simple two-session Codex loop for a plan document:
1. Start a fresh implementer session and ask it to fully implement the plan.
2. Start a fresh verifier session and ask whether the plan is complete.
3. Stop only when the verifier replies exactly:
   PLAN DOC IS FULLY IMPLEMENTED

Codex failures, inactivity timeouts, network disconnects, and overloaded-service
failures are retried at the same step. The verifier is retried as a verifier;
it does not fall through to a new implementation session until it completes
successfully and says the plan is not yet complete.

Options:
  --plan PATH                     Plan document path. Relative paths are
                                  resolved from the current directory.
  --iterations N                  Maximum implement/verify cycles. Default: 0
                                  means unlimited.
  --output-dir PATH               Directory for prompts, transcripts, and
                                  responses. Default: mktemp dir under TMPDIR.
  --workdir PATH                  Working directory passed to codex exec --cd.
                                  Default: repository root.
  --model NAME                    Model passed to codex exec --model.
                                  Default: gpt-5.5.
  --inactivity-timeout-seconds N  Retry the current step if Codex emits no
                                  transcript output for N seconds. Default: 1800.
                                  Use 0 to disable.
  --watchdog-interval-seconds N   Poll interval for the inactivity watchdog.
                                  Default: 30.
  --progress-log-interval-seconds N
                                  Progress log interval while Codex is running.
                                  Default: 120.
  --retry-sleep-seconds N         Sleep before retrying a failed step.
                                  Default: 60.
  --no-yolo                       Disable
                                  --dangerously-bypass-approvals-and-sandbox.
  --help                          Show this help text.

Extra arguments after -- are passed through to codex exec. By default this
script passes:
  --config reasoning_effort="xhigh"

Examples:
  ./scripts/run-codex-simple-plan-loop.sh --plan docs/plans/example.md
  ./scripts/run-codex-simple-plan-loop.sh --plan docs/plans/example.md --iterations 20
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

completion_sentinel="PLAN DOC IS FULLY IMPLEMENTED"
plan_path=""
iterations="0"
output_dir=""
workdir="${ROOT_DIR}"
model="gpt-5.5"
yolo_mode="1"
inactivity_timeout_seconds="1800"
watchdog_interval_seconds="30"
progress_log_interval_seconds="120"
retry_sleep_seconds="60"
codex_extra_args=()
default_codex_extra_args=(
  --config
  'reasoning_effort="xhigh"'
)
last_response_file=""

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

resolve_existing_file() {
  local candidate="$1"
  local parent_dir=""
  local basename_part=""

  if [[ "${candidate}" != /* ]]; then
    candidate="${PWD}/${candidate}"
  fi
  if [[ ! -f "${candidate}" ]]; then
    echo "File not found: ${candidate}" >&2
    exit 1
  fi

  parent_dir="$(cd "$(dirname "${candidate}")" && pwd)"
  basename_part="$(basename "${candidate}")"
  printf '%s/%s\n' "${parent_dir}" "${basename_part}"
}

resolve_existing_dir() {
  local candidate="$1"

  if [[ "${candidate}" != /* ]]; then
    candidate="${PWD}/${candidate}"
  fi
  if [[ ! -d "${candidate}" ]]; then
    echo "Directory not found: ${candidate}" >&2
    exit 1
  fi

  (cd "${candidate}" && pwd)
}

resolve_output_dir() {
  local candidate="$1"
  local parent_dir=""
  local basename_part=""

  if [[ "${candidate}" != /* ]]; then
    candidate="${PWD}/${candidate}"
  fi
  parent_dir="$(dirname "${candidate}")"
  basename_part="$(basename "${candidate}")"
  mkdir -p "${parent_dir}"
  parent_dir="$(cd "${parent_dir}" && pwd)"
  printf '%s/%s\n' "${parent_dir}" "${basename_part}"
}

validate_non_negative_integer() {
  local flag="$1"
  local value="$2"

  if [[ ! "${value}" =~ ^[0-9]+$ ]]; then
    echo "${flag} must be a non-negative integer" >&2
    exit 1
  fi
}

validate_positive_integer() {
  local flag="$1"
  local value="$2"

  if [[ ! "${value}" =~ ^[0-9]+$ ]] || [[ "${value}" -lt 1 ]]; then
    echo "${flag} must be a positive integer" >&2
    exit 1
  fi
}

timestamp_now() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
  printf '[%s] %s\n' "$(timestamp_now)" "$*"
}

log_error() {
  printf '[%s] ERROR: %s\n' "$(timestamp_now)" "$*" >&2
}

format_counter() {
  local value="$1"
  printf '%06d' "${value}"
}

write_implementer_prompt() {
  local prompt_file="$1"

  printf "/goal Fully implement %s. Commit your work when you're finished.\n" "${plan_file}" > "${prompt_file}"
}

write_verifier_prompt() {
  local prompt_file="$1"

  cat > "${prompt_file}" <<EOF
Is ${plan_file} fully implemented?

If it is, reply with just:
${completion_sentinel}

Otherwise, reply with an explanation of why it is not fully implemented.

Do not make any code changes.
EOF
}

normalize_response() {
  local response_file="$1"

  perl -0pe 's/\r\n/\n/g; s/\A[[:space:]]+//; s/[[:space:]]+\z//' "${response_file}"
}

run_codex_step_once() {
  local prompt_file="$1"
  local step_output_dir="$2"
  local -a loop_args=()
  local -a combined_codex_extra_args=()

  combined_codex_extra_args=("${default_codex_extra_args[@]}")
  if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
    combined_codex_extra_args+=("${codex_extra_args[@]}")
  fi

  loop_args=(
    "${ROOT_DIR}/scripts/run-codex-loop.sh"
    --prompt-file "${prompt_file}"
    --iterations "1"
    --new-session-every "1"
    --output-dir "${step_output_dir}"
    --workdir "${workdir}"
    --quiet
    --progress-log-interval-seconds "${progress_log_interval_seconds}"
    --inactivity-timeout-seconds "${inactivity_timeout_seconds}"
    --watchdog-interval-seconds "${watchdog_interval_seconds}"
    --stop-on-error
  )

  if [[ -n "${model}" ]]; then
    loop_args+=(--model "${model}")
  fi
  if [[ "${yolo_mode}" == "1" ]]; then
    loop_args+=(--yolo)
  fi
  if [[ ${#combined_codex_extra_args[@]} -gt 0 ]]; then
    loop_args+=(-- "${combined_codex_extra_args[@]}")
  fi

  "${loop_args[@]}"
}

run_codex_step_until_success() {
  local cycle_dir="$1"
  local step_name="$2"
  local prompt_file="$3"
  local attempt="1"
  local attempt_label=""
  local step_output_dir=""
  local response_file=""
  local exit_code="0"

  while true; do
    attempt_label="$(format_counter "${attempt}")"
    step_output_dir="${cycle_dir}/${step_name}-attempt-${attempt_label}"
    response_file="${step_output_dir}/run-001/last-message.txt"

    log_info "Starting ${step_name} attempt ${attempt_label}. Output: ${step_output_dir}"
    set +e
    run_codex_step_once "${prompt_file}" "${step_output_dir}"
    exit_code="$?"
    set -e

    if [[ "${exit_code}" -eq 0 && -s "${response_file}" ]]; then
      last_response_file="${response_file}"
      log_info "${step_name} attempt ${attempt_label} completed. Last message: ${response_file}"
      return 0
    fi

    if [[ "${exit_code}" -eq 0 ]]; then
      log_error "${step_name} attempt ${attempt_label} did not produce a last-message file; retrying the same step."
    else
      log_error "${step_name} attempt ${attempt_label} failed with exit code ${exit_code}; retrying the same step."
    fi

    if [[ "${retry_sleep_seconds}" -gt 0 ]]; then
      log_info "Sleeping ${retry_sleep_seconds}s before retrying ${step_name}."
      sleep "${retry_sleep_seconds}"
    fi
    attempt="$((attempt + 1))"
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      require_value "$1" "${2:-}"
      plan_path="$2"
      shift 2
      ;;
    --iterations)
      require_value "$1" "${2:-}"
      iterations="$2"
      shift 2
      ;;
    --output-dir)
      require_value "$1" "${2:-}"
      output_dir="$2"
      shift 2
      ;;
    --workdir)
      require_value "$1" "${2:-}"
      workdir="$2"
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
    --watchdog-interval-seconds)
      require_value "$1" "${2:-}"
      watchdog_interval_seconds="$2"
      shift 2
      ;;
    --progress-log-interval-seconds)
      require_value "$1" "${2:-}"
      progress_log_interval_seconds="$2"
      shift 2
      ;;
    --retry-sleep-seconds)
      require_value "$1" "${2:-}"
      retry_sleep_seconds="$2"
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

if [[ -z "${plan_path}" ]]; then
  echo "--plan is required" >&2
  usage >&2
  exit 1
fi

validate_non_negative_integer "--iterations" "${iterations}"
validate_non_negative_integer "--inactivity-timeout-seconds" "${inactivity_timeout_seconds}"
validate_positive_integer "--watchdog-interval-seconds" "${watchdog_interval_seconds}"
validate_non_negative_integer "--progress-log-interval-seconds" "${progress_log_interval_seconds}"
validate_non_negative_integer "--retry-sleep-seconds" "${retry_sleep_seconds}"

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if [[ ! -x "${ROOT_DIR}/scripts/run-codex-loop.sh" ]]; then
  echo "Expected executable helper not found: ${ROOT_DIR}/scripts/run-codex-loop.sh" >&2
  exit 1
fi

plan_file="$(resolve_existing_file "${plan_path}")"
workdir="$(resolve_existing_dir "${workdir}")"
if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-simple-plan-loop.${timestamp}.XXXXXX")"
else
  output_dir="$(resolve_output_dir "${output_dir}")"
  mkdir -p "${output_dir}"
fi

state_dir="${output_dir}/state"
mkdir -p "${state_dir}"

implementer_prompt_file="${state_dir}/implementer-prompt.md"
verifier_prompt_file="${state_dir}/verifier-prompt.md"
latest_verifier_result_file="${state_dir}/latest-verifier-result.md"

write_implementer_prompt "${implementer_prompt_file}"
write_verifier_prompt "${verifier_prompt_file}"

log_info "Plan: ${plan_file}"
log_info "Output directory: ${output_dir}"
log_info "Workdir: ${workdir}"
log_info "Model: ${model}"
log_info "Reasoning effort: xhigh"
if [[ "${iterations}" -eq 0 ]]; then
  log_info "Implement/verify cycles: unlimited"
else
  log_info "Implement/verify cycles: ${iterations}"
fi
log_info "Inactivity timeout: ${inactivity_timeout_seconds}s"
log_info "Retry sleep: ${retry_sleep_seconds}s"
if [[ "${yolo_mode}" == "1" ]]; then
  log_info "Yolo mode: enabled"
else
  log_info "Yolo mode: disabled"
fi

cycle="1"
while [[ "${iterations}" -eq 0 || "${cycle}" -le "${iterations}" ]]; do
  cycle_label="$(format_counter "${cycle}")"
  cycle_dir="${output_dir}/cycle-${cycle_label}"
  mkdir -p "${cycle_dir}"

  write_implementer_prompt "${implementer_prompt_file}"

  log_info "Cycle ${cycle_label}: implementation step"
  run_codex_step_until_success "${cycle_dir}" "implement" "${implementer_prompt_file}"

  log_info "Cycle ${cycle_label}: verification step"
  run_codex_step_until_success "${cycle_dir}" "verify" "${verifier_prompt_file}"
  cp "${last_response_file}" "${latest_verifier_result_file}"

  verifier_response="$(normalize_response "${last_response_file}")"
  if [[ "${verifier_response}" == "${completion_sentinel}" ]]; then
    log_info "Verifier reported completion."
    log_info "${completion_sentinel}"
    exit 0
  fi

  log_info "Verifier did not report completion; next cycle will run a fresh implementation session."
  log_info "Latest verifier result: ${latest_verifier_result_file}"

  cycle="$((cycle + 1))"
done

log_error "Stopped after ${iterations} implement/verify cycles without the completion sentinel."
exit 1
