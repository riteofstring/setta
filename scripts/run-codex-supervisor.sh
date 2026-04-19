#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
. "${SCRIPT_DIR}/lib/codex_cli.sh"

usage() {
  local program_name
  program_name="${RALPH_PROGRAM_NAME:-$(basename "${0}")}"
  cat <<'EOF' | sed "s/__PROGRAM_NAME__/${program_name}/g"
Usage: __PROGRAM_NAME__ [supervisor options] [-- <run-codex-loop args>]

Runs a polling supervisor around `scripts/run-codex-loop.sh`.

The supervisor launches the inner Ralph loop in isolated `loop-XXX`
directories, watches for repeated failures or stalled activity, and performs a
bounded recovery ladder:
1. stop the inner loop
2. run an optional deterministic repair hook
3. optionally run a one-shot Codex repair incident
4. restart the loop or stop if recovery reports a blocker

Supervisor options:
  --config-file PATH           Config file used to resolve the default workdir.
                               Default: ./RALPH.md
  --workdir PATH               Working directory for repair hooks and repair
                               Codex runs. Defaults to loop args, config
                               frontmatter, or repo root.
  --output-dir PATH            Supervisor output root. Each loop launch gets
                               its own `loop-XXX/` subdirectory here.
                               Default: mktemp dir
  --loop-script PATH           Inner loop script. Default:
                               scripts/run-codex-loop.sh
  --poll-seconds N             Poll interval for health checks. Default: 120
  --stale-seconds N            Mark the active loop as stalled after this many
                               seconds without activity in its output dir.
                               Default: 900
  --repeat-failure-threshold N Trigger recovery after N consecutive matching
                               failure keys from run status files. Default: 2
  --repair-command CMD         Deterministic repair hook run after stopping the
                               loop and before any repair Codex escalation.
                               Default: ./aireset.sh for non-main worktrees
                               when present; disabled otherwise.
  --repair-model NAME          Optional model override for repair Codex runs.
  --yolo                       Run repair Codex with bypass approvals/sandbox.
  --no-codex-repair            Disable one-shot repair Codex escalation.
  --max-codex-repair-attempts N
                               Maximum repair Codex incidents per failure key.
                               Default: 1
  --help                       Show this help text

Any args after `--` are forwarded to the inner run-codex-loop.sh invocation.
The supervisor manages the inner `--output-dir` automatically.

Examples:
  ./__PROGRAM_NAME__
  ./__PROGRAM_NAME__ --poll-seconds 60 --stale-seconds 300
  ./__PROGRAM_NAME__ --repair-command './aireset.sh' -- --config-file ./RALPH.md
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

trim_value() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s\n' "${value}"
}

strip_wrapping_quotes() {
  local value="$1"
  if [[ "${value}" == \"*\" ]] && [[ "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' ]] && [[ "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s\n' "${value}"
}

frontmatter_value() {
  local file_path="$1"
  local key="$2"

  awk -v target="${key}" '
    NR == 1 && $0 == "---" {
      in_frontmatter = 1
      next
    }
    in_frontmatter && $0 == "---" {
      exit
    }
    in_frontmatter {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      if (line ~ ("^" target ":[[:space:]]*")) {
        sub(("^" target ":[[:space:]]*"), "", line)
        print line
        exit
      }
    }
  ' "${file_path}"
}

resolve_path() {
  local base_dir="$1"
  local target_path="$2"

  if [[ -z "${target_path}" ]]; then
    return 0
  fi
  if [[ "${target_path}" == /* ]]; then
    printf '%s\n' "${target_path}"
    return 0
  fi
  printf '%s/%s\n' "${base_dir}" "${target_path}"
}

resolve_ralph_runtime_state_dir() {
  local configured_dir="${RALPH_RUNTIME_STATE_DIR:-}"
  local git_dir=""

  if [[ -n "${configured_dir}" ]]; then
    mkdir -p "${configured_dir}"
    (
      cd "${configured_dir}"
      pwd -P
    )
    return 0
  fi

  if git_dir="$(git -C "${ROOT_DIR}" rev-parse --absolute-git-dir 2>/dev/null)" \
    && [[ -n "${git_dir}" ]]; then
    mkdir -p "${git_dir}/ralph-runtime"
    printf '%s\n' "${git_dir}/ralph-runtime"
    return 0
  fi

  mkdir -p "${ROOT_DIR}/.ralph-runtime"
  printf '%s\n' "${ROOT_DIR}/.ralph-runtime"
}

file_mtime_seconds() {
  local file_path="$1"

  if [[ ! -e "${file_path}" ]]; then
    return 1
  fi

  if stat -f '%m' "${file_path}" >/dev/null 2>&1; then
    stat -f '%m' "${file_path}"
    return 0
  fi

  stat -c '%Y' "${file_path}"
}

latest_activity_epoch() {
  local fallback_epoch="$1"
  shift
  local latest_epoch="${fallback_epoch}"
  local candidate_epoch=""
  local candidate_path=""

  for candidate_path in "$@"; do
    if candidate_epoch="$(file_mtime_seconds "${candidate_path}" 2>/dev/null)"; then
      if [[ "${candidate_epoch}" -gt "${latest_epoch}" ]]; then
        latest_epoch="${candidate_epoch}"
      fi
    fi
  done

  printf '%s\n' "${latest_epoch}"
}

discover_main_worktree_root() {
  local repo_root="$1"
  local discovered_root=""
  local repo_root_real=""
  local sibling_parent=""
  local current_origin_url=""
  local candidate_root=""
  local candidate_root_real=""
  local candidate_origin_url=""
  local candidate_branch=""

  discovered_root="$(git -C "${repo_root}" worktree list --porcelain 2>/dev/null | awk '
    $1 == "worktree" { current = $2; next }
    $1 == "branch" && $2 == "refs/heads/main" { print current; exit }
  ')"
  if [[ -n "${discovered_root}" ]]; then
    printf '%s\n' "${discovered_root}"
    return 0
  fi

  repo_root_real="$(cd "${repo_root}" && pwd -P 2>/dev/null || printf '%s' "${repo_root}")"
  sibling_parent="$(dirname "${repo_root_real}")"
  current_origin_url="$(git -C "${repo_root_real}" config --get remote.origin.url 2>/dev/null || true)"
  [[ -d "${sibling_parent}" ]] || return 1

  for candidate_root in "${sibling_parent}"/*; do
    [[ -d "${candidate_root}" ]] || continue
    candidate_root_real="$(cd "${candidate_root}" && pwd -P 2>/dev/null || printf '%s' "${candidate_root}")"
    [[ "${candidate_root_real}" == "${repo_root_real}" ]] && continue
    [[ -d "${candidate_root_real}/backend/setta" ]] || continue
    [[ -x "${candidate_root_real}/scripts/dev-runtime-info.sh" ]] || continue
    if ! git -C "${candidate_root_real}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      continue
    fi
    candidate_branch="$(git -C "${candidate_root_real}" symbolic-ref --quiet --short HEAD 2>/dev/null || git -C "${candidate_root_real}" branch --show-current 2>/dev/null || true)"
    [[ "${candidate_branch}" == "main" ]] || continue
    if [[ -n "${current_origin_url}" ]]; then
      candidate_origin_url="$(git -C "${candidate_root_real}" config --get remote.origin.url 2>/dev/null || true)"
      [[ "${candidate_origin_url}" == "${current_origin_url}" ]] || continue
    fi
    printf '%s\n' "${candidate_root_real}"
    return 0
  done

  return 1
}

terminate_process_tree() {
  local target_pid="$1"
  local signal_name="${2:-TERM}"
  local child_pid=""

  if ! kill -0 "${target_pid}" >/dev/null 2>&1; then
    return 0
  fi

  while read -r child_pid; do
    [[ -z "${child_pid}" ]] && continue
    terminate_process_tree "${child_pid}" "${signal_name}" || true
  done < <(pgrep -P "${target_pid}" 2>/dev/null || true)

  kill "-${signal_name}" "${target_pid}" >/dev/null 2>&1 || true
}

extract_field() {
  local file_path="$1"
  local field_name="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi

  awk -v key="${field_name}" '
    BEGIN {
      prefix = key ":"
    }
    index($0, prefix) == 1 {
      value = substr($0, length(prefix) + 1)
      sub(/^[[:space:]]+/, "", value)
      print value
      exit
    }
  ' "${file_path}"
}

status_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi

  awk -F= -v target="${key}" '$1 == target { print substr($0, index($0, "=") + 1); exit }' "${file_path}"
}

write_active_supervisor_run_file() {
  local status="$1"
  local note="${2:-}"

  if [[ -z "${supervisor_active_run_file:-}" ]]; then
    return 0
  fi

  cat > "${supervisor_active_run_file}" <<EOF
mode=supervisor
pid=$$
root_dir=${ROOT_DIR}
workdir=${workdir:-}
output_dir=${output_dir:-}
supervisor_dir=${supervisor_dir:-}
current_loop_dir=${current_loop_dir:-}
current_loop_pid=${current_loop_pid:-}
stop_request_file=${stop_request_file:-}
status=${status}
note=${note}
EOF
}

clear_active_supervisor_run_file_if_owned() {
  local owner_pid=""
  local owner_root=""

  if [[ -z "${supervisor_active_run_file:-}" ]]; then
    return 0
  fi

  if [[ -f "${supervisor_active_run_file}" ]]; then
    owner_pid="$(status_value "${supervisor_active_run_file}" "pid")"
    owner_root="$(status_value "${supervisor_active_run_file}" "root_dir")"
    if [[ "${owner_pid}" == "$$" ]] && [[ "${owner_root}" == "${ROOT_DIR}" ]]; then
      rm -f "${supervisor_active_run_file}" >/dev/null 2>&1 || true
    fi
  fi

  if [[ -n "${stop_request_file:-}" ]]; then
    rm -f "${stop_request_file}" >/dev/null 2>&1 || true
  fi
}

latest_run_dir() {
  local loop_dir="$1"
  local candidates=()

  shopt -s nullglob
  candidates=("${loop_dir}"/run-*)
  shopt -u nullglob

  if [[ ${#candidates[@]} -eq 0 ]]; then
    return 1
  fi

  printf '%s\n' "${candidates[@]}" | sort | tail -n1
}

latest_loop_activity_epoch() {
  local loop_dir="$1"
  local fallback_epoch="$2"
  local candidates=()

  shopt -s nullglob
  candidates=(
    "${loop_dir}/"*.log
    "${loop_dir}/run-"*/status.txt
    "${loop_dir}/run-"*/transcript.log
    "${loop_dir}/run-"*/last-message.txt
    "${loop_dir}/run-"*/worktree-*.log
    "${loop_dir}/run-"*/main-*.log
    "${loop_dir}/progress-review-"*/status.txt
    "${loop_dir}/progress-review-"*/progress-review-transcript.log
    "${loop_dir}/progress-review-"*/progress-review-last-message.txt
    "${loop_dir}/progress-review-"*/progress-review-prompt.txt
  )
  shopt -u nullglob

  latest_activity_epoch "${fallback_epoch}" "${candidates[@]}"
}

failure_key_from_status_file() {
  local status_file="$1"
  local status=""
  local exit_code=""
  local lifecycle_mode=""
  local loop_status=""
  local loop_verify_result=""

  status="$(status_value "${status_file}" "status")"
  case "${status}" in
    ""|success)
      return 1
      ;;
    bootstrap-failure)
      exit_code="$(status_value "${status_file}" "exit_code")"
      lifecycle_mode="$(status_value "${status_file}" "lifecycle_mode")"
      printf 'status=%s|exit_code=%s|lifecycle_mode=%s\n' \
        "${status}" "${exit_code}" "${lifecycle_mode}"
      ;;
    invalid-output)
      loop_status="$(status_value "${status_file}" "loop_status")"
      loop_verify_result="$(status_value "${status_file}" "loop_verify_result")"
      printf 'status=%s|loop_status=%s|loop_verify_result=%s\n' \
        "${status}" "${loop_status}" "${loop_verify_result}"
      ;;
    failure|pre-session-failure|stalled-timeout)
      exit_code="$(status_value "${status_file}" "exit_code")"
      printf 'status=%s|exit_code=%s\n' "${status}" "${exit_code}"
      ;;
    *)
      printf 'status=%s\n' "${status}"
      ;;
  esac
}

write_supervisor_status() {
  local status="$1"
  local note="${2:-}"
  cat > "${supervisor_status_file}" <<EOF
status=${status}
current_loop_dir=${current_loop_dir:-}
current_loop_pid=${current_loop_pid:-}
incident_count=${incident_count}
last_failure_key=${last_failure_key:-}
note=${note}
EOF
  write_active_supervisor_run_file "${status}" "${note}"
}

stop_requested_after_successful_iteration() {
  local latest_status_file="$1"
  local latest_status=""

  if [[ -z "${stop_request_file:-}" ]] || [[ ! -f "${stop_request_file}" ]]; then
    return 1
  fi

  if [[ -z "${latest_status_file}" ]] || [[ ! -f "${latest_status_file}" ]]; then
    return 1
  fi

  latest_status="$(status_value "${latest_status_file}" "status")"
  [[ "${latest_status}" == "success" ]]
}

start_loop() {
  loop_launch_count="$((loop_launch_count + 1))"
  current_loop_dir="$(printf '%s/loop-%03d' "${output_dir}" "${loop_launch_count}")"
  current_loop_log="${current_loop_dir}/supervisor-loop.log"
  current_loop_pipe="${current_loop_dir}/supervisor-loop.pipe"
  mkdir -p "${current_loop_dir}"
  ln -snf "${current_loop_dir}" "${output_dir}/latest-loop"

  local cmd=("${loop_script}")
  cmd+=("${loop_args[@]}")
  cmd+=("--output-dir" "${current_loop_dir}")
  cmd+=("--stop-after-iteration-file" "${stop_request_file}")

  printf '%s\n' "[supervisor] starting loop launch ${loop_launch_count} in ${current_loop_dir}" | tee -a "${supervisor_log_file}"
  rm -f "${current_loop_pipe}"
  mkfifo "${current_loop_pipe}"
  tee -a "${current_loop_log}" < "${current_loop_pipe}" &
  current_loop_relay_pid="$!"
  RALPH_SUPERVISED_LOOP=1 "${cmd[@]}" > "${current_loop_pipe}" 2>&1 &
  current_loop_pid="$!"
  current_loop_started_epoch="$(date +%s)"
  current_loop_exit_code=""
  last_observed_status_token=""
  write_supervisor_status "running" "loop_started"
}

stop_loop() {
  if [[ -z "${current_loop_pid:-}" ]]; then
    if [[ -n "${current_loop_relay_pid:-}" ]]; then
      kill "${current_loop_relay_pid}" >/dev/null 2>&1 || true
      wait "${current_loop_relay_pid}" >/dev/null 2>&1 || true
      current_loop_relay_pid=""
    fi
    rm -f "${current_loop_pipe:-}" >/dev/null 2>&1 || true
    return 0
  fi
  if ! kill -0 "${current_loop_pid}" >/dev/null 2>&1; then
    current_loop_pid=""
    if [[ -n "${current_loop_relay_pid:-}" ]]; then
      kill "${current_loop_relay_pid}" >/dev/null 2>&1 || true
      wait "${current_loop_relay_pid}" >/dev/null 2>&1 || true
      current_loop_relay_pid=""
    fi
    rm -f "${current_loop_pipe:-}" >/dev/null 2>&1 || true
    return 0
  fi

  printf '%s\n' "[supervisor] stopping loop pid ${current_loop_pid}" | tee -a "${supervisor_log_file}"
  terminate_process_tree "${current_loop_pid}" TERM || true

  local waited=0
  while kill -0 "${current_loop_pid}" >/dev/null 2>&1 && [[ "${waited}" -lt 10 ]]; do
    sleep 1
    waited="$((waited + 1))"
  done

  if kill -0 "${current_loop_pid}" >/dev/null 2>&1; then
    terminate_process_tree "${current_loop_pid}" KILL || true
  fi

  wait "${current_loop_pid}" >/dev/null 2>&1 || true
  current_loop_pid=""
  if [[ -n "${current_loop_relay_pid:-}" ]]; then
    kill "${current_loop_relay_pid}" >/dev/null 2>&1 || true
    wait "${current_loop_relay_pid}" >/dev/null 2>&1 || true
    current_loop_relay_pid=""
  fi
  rm -f "${current_loop_pipe:-}" >/dev/null 2>&1 || true
}

run_deterministic_repair() {
  local incident_dir="$1"
  local repair_log="${incident_dir}/deterministic-repair.log"

  if [[ -z "${repair_command}" ]]; then
    return 1
  fi

  printf '%s\n' "[supervisor] running deterministic repair: ${repair_command}" | tee -a "${supervisor_log_file}"
  write_supervisor_status "recovering" "deterministic_repair"
  (
    cd "${workdir}"
    bash -lc "${repair_command}"
  ) > "${repair_log}" 2>&1
}

build_repair_prompt() {
  local prompt_path="$1"
  local incident_reason="$2"
  local failure_key="$3"
  local latest_run_path="$4"
  local latest_status_file="$5"

  cat > "${prompt_path}" <<EOF
Ralph supervisor detected an unhealthy loop in this worktree and stopped the inner loop before escalating to you.

Context:
- workdir: ${workdir}
- supervisor output root: ${output_dir}
- current loop output dir: ${current_loop_dir}
- incident reason: ${incident_reason}
- repeated failure key: ${failure_key}
- latest run dir: ${latest_run_path}
- latest status file: ${latest_status_file}
- supervisor log: ${supervisor_log_file}

Files to inspect first:
- ${latest_status_file}
- ${current_loop_log}
- ${latest_run_path}/transcript.log
- ${latest_run_path}/last-message.txt
- ${latest_run_path}/worktree-ai.log
- ${latest_run_path}/worktree-aireset.log
- ${latest_run_path}/main-ai.log
- ${latest_run_path}/main-aireset.log

Task:
1. Diagnose the blocker that kept Ralph from making forward progress.
2. Apply the smallest real fix needed so the loop can resume safely.
3. Run the narrowest verification that proves the repair.
4. Do not start another Ralph loop yourself.

If the issue is corrupted local runtime state, it is acceptable to reset only the current worktree runtime state. Do not touch the main worktree.

End your final response with exactly these fields:
REPAIR_STATUS: fixed|blocked|no_change
REPAIR_SUMMARY: <one line>
REPAIR_VERIFY: <one line>
EOF
}

run_codex_repair() {
  local incident_dir="$1"
  local incident_reason="$2"
  local failure_key="$3"
  local latest_run_path="$4"
  local latest_status_file="$5"
  local codex_bin="${SETTA_CODEX_BIN:-codex}"
  local repair_prompt="${incident_dir}/repair-prompt.txt"
  local repair_last_message="${incident_dir}/repair-last-message.txt"
  local repair_transcript="${incident_dir}/repair-transcript.log"
  local cmd=("${codex_bin}" exec --color never --cd "${workdir}" --output-last-message "${repair_last_message}" --ephemeral)

  build_repair_prompt "${repair_prompt}" "${incident_reason}" "${failure_key}" "${latest_run_path}" "${latest_status_file}"

  if [[ -n "${repair_model}" ]]; then
    cmd+=(--model "${repair_model}")
  fi
  if [[ "${repair_yolo}" == "1" ]]; then
    cmd+=(--dangerously-bypass-approvals-and-sandbox)
  fi
  cmd+=(-)

  printf '%s\n' "[supervisor] running repair Codex incident" | tee -a "${supervisor_log_file}"
  write_supervisor_status "recovering" "codex_repair"
  set +e
  "${cmd[@]}" < "${repair_prompt}" | tee "${repair_transcript}"
  local repair_exit_code="$?"
  set -e

  if [[ "${repair_exit_code}" -ne 0 ]]; then
    printf '%s\n' "[supervisor] repair Codex exited ${repair_exit_code}" | tee -a "${supervisor_log_file}"
    return "${repair_exit_code}"
  fi

  repair_status="$(extract_field "${repair_last_message}" "REPAIR_STATUS")"
  repair_summary="$(extract_field "${repair_last_message}" "REPAIR_SUMMARY")"
  repair_verify="$(extract_field "${repair_last_message}" "REPAIR_VERIFY")"

  if [[ -z "${repair_status}" ]]; then
    repair_status="$(extract_field "${repair_transcript}" "REPAIR_STATUS")"
  fi
  if [[ -z "${repair_summary}" ]]; then
    repair_summary="$(extract_field "${repair_transcript}" "REPAIR_SUMMARY")"
  fi
  if [[ -z "${repair_verify}" ]]; then
    repair_verify="$(extract_field "${repair_transcript}" "REPAIR_VERIFY")"
  fi

  printf '%s\n' "repair_status=${repair_status}" >> "${incident_dir}/metadata.txt"
  printf '%s\n' "repair_summary=${repair_summary}" >> "${incident_dir}/metadata.txt"
  printf '%s\n' "repair_verify=${repair_verify}" >> "${incident_dir}/metadata.txt"

  if [[ "${repair_status}" != "fixed" ]] && [[ "${repair_status}" != "blocked" ]] && [[ "${repair_status}" != "no_change" ]]; then
    printf '%s\n' "[supervisor] repair Codex did not emit a valid REPAIR_STATUS" | tee -a "${supervisor_log_file}"
    return 1
  fi

  return 0
}

handle_incident() {
  local incident_reason="$1"
  local failure_key="$2"
  local latest_run_path="$3"
  local latest_status_file="$4"
  local incident_dir=""
  local repair_command_exit_code=0

  incident_count="$((incident_count + 1))"
  incident_dir="$(printf '%s/incident-%03d' "${supervisor_dir}" "${incident_count}")"
  mkdir -p "${incident_dir}"
  cat > "${incident_dir}/metadata.txt" <<EOF
incident_reason=${incident_reason}
failure_key=${failure_key}
loop_dir=${current_loop_dir}
latest_run_dir=${latest_run_path}
latest_status_file=${latest_status_file}
EOF

  printf '%s\n' "[supervisor] incident ${incident_count}: ${incident_reason} (${failure_key})" | tee -a "${supervisor_log_file}"
  last_failure_key="${failure_key}"
  stop_loop

  if [[ "${failure_key}" != "${recovery_key}" ]]; then
    recovery_key="${failure_key}"
    deterministic_repair_done_for_key="0"
    codex_repair_attempts_for_key="0"
  fi

  if [[ "${deterministic_repair_done_for_key}" == "0" ]] && [[ -n "${repair_command}" ]]; then
    deterministic_repair_done_for_key="1"
    set +e
    run_deterministic_repair "${incident_dir}"
    repair_command_exit_code="$?"
    set -e
    printf '%s\n' "deterministic_repair_exit_code=${repair_command_exit_code}" >> "${incident_dir}/metadata.txt"
    if [[ "${repair_command_exit_code}" -eq 0 ]]; then
      start_loop
      return 0
    fi
  fi

  if [[ "${codex_repair_enabled}" != "1" ]]; then
    printf '%s\n' "[supervisor] codex repair disabled; stopping" | tee -a "${supervisor_log_file}"
    return 1
  fi

  if [[ "${codex_repair_attempts_for_key}" -ge "${max_codex_repair_attempts}" ]]; then
    printf '%s\n' "[supervisor] exhausted repair Codex attempts for ${failure_key}" | tee -a "${supervisor_log_file}"
    return 1
  fi

  codex_repair_attempts_for_key="$((codex_repair_attempts_for_key + 1))"
  if ! run_codex_repair "${incident_dir}" "${incident_reason}" "${failure_key}" "${latest_run_path}" "${latest_status_file}"; then
    return 1
  fi

  case "${repair_status}" in
    fixed|no_change)
      start_loop
      return 0
      ;;
    blocked)
      printf '%s\n' "[supervisor] repair Codex reported BLOCKED: ${repair_summary}" | tee -a "${supervisor_log_file}"
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

cleanup() {
  if [[ "${cleanup_ran}" == "1" ]]; then
    return 0
  fi
  cleanup_ran="1"
  stop_loop || true
  clear_active_supervisor_run_file_if_owned || true
  rm -rf "${lock_dir}" >/dev/null 2>&1 || true
}

config_file="${ROOT_DIR}/RALPH.md"
workdir=""
output_dir=""
loop_script="${SCRIPT_DIR}/run-codex-loop.sh"
poll_seconds="120"
stale_seconds="900"
repeat_failure_threshold="2"
repair_command=""
repair_model=""
repair_yolo=""
codex_repair_enabled="1"
max_codex_repair_attempts="1"

loop_args=()
parse_loop_args="0"

while [[ $# -gt 0 ]]; do
  if [[ "${parse_loop_args}" == "1" ]]; then
    loop_args+=("$1")
    shift
    continue
  fi
  case "$1" in
    --config-file)
      require_value "$1" "${2:-}"
      config_file="$2"
      shift 2
      ;;
    --workdir)
      require_value "$1" "${2:-}"
      workdir="$2"
      shift 2
      ;;
    --output-dir)
      require_value "$1" "${2:-}"
      output_dir="$2"
      shift 2
      ;;
    --loop-script)
      require_value "$1" "${2:-}"
      loop_script="$2"
      shift 2
      ;;
    --poll-seconds)
      require_value "$1" "${2:-}"
      poll_seconds="$2"
      shift 2
      ;;
    --stale-seconds)
      require_value "$1" "${2:-}"
      stale_seconds="$2"
      shift 2
      ;;
    --repeat-failure-threshold)
      require_value "$1" "${2:-}"
      repeat_failure_threshold="$2"
      shift 2
      ;;
    --repair-command)
      require_value "$1" "${2:-}"
      repair_command="$2"
      shift 2
      ;;
    --repair-model)
      require_value "$1" "${2:-}"
      repair_model="$2"
      shift 2
      ;;
    --yolo)
      repair_yolo="1"
      shift
      ;;
    --no-codex-repair)
      codex_repair_enabled="0"
      shift
      ;;
    --max-codex-repair-attempts)
      require_value "$1" "${2:-}"
      max_codex_repair_attempts="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      parse_loop_args="1"
      shift
      ;;
    *)
      loop_args+=("$1")
      shift
      ;;
  esac
done

if [[ ! "${poll_seconds}" =~ ^[0-9]+$ ]] || [[ "${poll_seconds}" -lt 1 ]]; then
  echo "--poll-seconds must be a positive integer" >&2
  exit 1
fi
if [[ ! "${stale_seconds}" =~ ^[0-9]+$ ]] || [[ "${stale_seconds}" -lt 1 ]]; then
  echo "--stale-seconds must be a positive integer" >&2
  exit 1
fi
if [[ ! "${repeat_failure_threshold}" =~ ^[0-9]+$ ]] || [[ "${repeat_failure_threshold}" -lt 1 ]]; then
  echo "--repeat-failure-threshold must be a positive integer" >&2
  exit 1
fi
if [[ ! "${max_codex_repair_attempts}" =~ ^[0-9]+$ ]] || [[ "${max_codex_repair_attempts}" -lt 0 ]]; then
  echo "--max-codex-repair-attempts must be a non-negative integer" >&2
  exit 1
fi

if [[ ! -f "${config_file}" ]]; then
  echo "Config file not found: ${config_file}" >&2
  exit 1
fi
config_file="$(cd "$(dirname "${config_file}")" && pwd)/$(basename "${config_file}")"
config_dir="$(cd "$(dirname "${config_file}")" && pwd)"

forwarded_workdir=""
forwarded_config_file="${config_file}"
forwarded_model=""
forwarded_yolo=""
loop_has_config_file="0"
loop_has_workdir="0"
sanitized_loop_args=()

while [[ ${#loop_args[@]} -gt 0 ]]; do
  arg="${loop_args[0]}"
  loop_args=("${loop_args[@]:1}")
  case "${arg}" in
    --output-dir)
      if [[ ${#loop_args[@]} -eq 0 ]]; then
        echo "Missing value for --output-dir in forwarded loop args" >&2
        exit 1
      fi
      loop_args=("${loop_args[@]:1}")
      ;;
    --stop-after-iteration-file)
      if [[ ${#loop_args[@]} -eq 0 ]]; then
        echo "Missing value for --stop-after-iteration-file in forwarded loop args" >&2
        exit 1
      fi
      loop_args=("${loop_args[@]:1}")
      ;;
    --workdir)
      if [[ ${#loop_args[@]} -eq 0 ]]; then
        echo "Missing value for --workdir in forwarded loop args" >&2
        exit 1
      fi
      forwarded_workdir="${loop_args[0]}"
      loop_has_workdir="1"
      sanitized_loop_args+=("${arg}" "${loop_args[0]}")
      loop_args=("${loop_args[@]:1}")
      ;;
    --config-file)
      if [[ ${#loop_args[@]} -eq 0 ]]; then
        echo "Missing value for --config-file in forwarded loop args" >&2
        exit 1
      fi
      forwarded_config_file="${loop_args[0]}"
      loop_has_config_file="1"
      sanitized_loop_args+=("${arg}" "${loop_args[0]}")
      loop_args=("${loop_args[@]:1}")
      ;;
    --model)
      if [[ ${#loop_args[@]} -eq 0 ]]; then
        echo "Missing value for --model in forwarded loop args" >&2
        exit 1
      fi
      forwarded_model="${loop_args[0]}"
      sanitized_loop_args+=("${arg}" "${loop_args[0]}")
      loop_args=("${loop_args[@]:1}")
      ;;
    --yolo)
      forwarded_yolo="1"
      sanitized_loop_args+=("${arg}")
      ;;
    --no-yolo)
      forwarded_yolo="0"
      sanitized_loop_args+=("${arg}")
      ;;
    *)
      sanitized_loop_args+=("${arg}")
      ;;
  esac
done
loop_args=("${sanitized_loop_args[@]}")

forwarded_config_file="$(resolve_path "${ROOT_DIR}" "${forwarded_config_file}")"
if [[ ! -f "${forwarded_config_file}" ]]; then
  echo "Forwarded config file not found: ${forwarded_config_file}" >&2
  exit 1
fi
forwarded_config_dir="$(cd "$(dirname "${forwarded_config_file}")" && pwd)"

if [[ -z "${workdir}" ]]; then
  if [[ -n "${forwarded_workdir}" ]]; then
    workdir="$(resolve_path "${forwarded_config_dir}" "${forwarded_workdir}")"
  else
    config_workdir="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${forwarded_config_file}" "workdir")")")"
    if [[ -n "${config_workdir}" ]]; then
      workdir="$(resolve_path "${forwarded_config_dir}" "${config_workdir}")"
    else
      workdir="${ROOT_DIR}"
    fi
  fi
fi
workdir="$(resolve_path "${ROOT_DIR}" "${workdir}")"

if [[ ! -d "${workdir}" ]]; then
  echo "Working directory not found: ${workdir}" >&2
  exit 1
fi

loop_script="$(resolve_path "${ROOT_DIR}" "${loop_script}")"
if [[ ! -x "${loop_script}" ]]; then
  echo "Loop script not executable: ${loop_script}" >&2
  exit 1
fi

if [[ -z "${repair_model}" ]] && [[ -n "${forwarded_model}" ]]; then
  repair_model="${forwarded_model}"
fi
if [[ -z "${repair_yolo}" ]]; then
  repair_yolo="${forwarded_yolo:-0}"
fi
if [[ "${loop_has_config_file}" != "1" ]]; then
  loop_args+=(--config-file "${forwarded_config_file}")
fi
if [[ "${loop_has_workdir}" != "1" ]]; then
  loop_args+=(--workdir "${workdir}")
fi

config_main_worktree_root="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${forwarded_config_file}" "main_worktree_root")")")"
if [[ -n "${config_main_worktree_root}" ]]; then
  main_worktree_root="$(resolve_path "${forwarded_config_dir}" "${config_main_worktree_root}")"
else
  main_worktree_root="$(discover_main_worktree_root "${workdir}" || true)"
fi
if [[ -z "${repair_command}" ]] && [[ -x "${workdir}/aireset.sh" ]]; then
  workdir_real="$(cd "${workdir}" && pwd -P)"
  main_real=""
  if [[ -n "${main_worktree_root}" ]]; then
    main_real="$(cd "${main_worktree_root}" && pwd -P 2>/dev/null || printf '%s' "${main_worktree_root}")"
  fi
  if [[ -z "${main_real}" ]] || [[ "${workdir_real}" != "${main_real}" ]]; then
    repair_command="./aireset.sh"
  fi
fi

if [[ "${codex_repair_enabled}" == "1" ]] && ! setta_ensure_codex_cli "${ROOT_DIR}"; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-supervisor.XXXXXX")"
fi
output_dir="$(resolve_path "${ROOT_DIR}" "${output_dir}")"
mkdir -p "${output_dir}"

supervisor_dir="${output_dir}/supervisor"
mkdir -p "${supervisor_dir}"
runtime_state_dir="$(resolve_ralph_runtime_state_dir)"
supervisor_active_run_file="${runtime_state_dir}/supervisor-active-run.env"
stop_request_file="${runtime_state_dir}/supervisor-stop-after-iteration.request"
rm -f "${stop_request_file}" >/dev/null 2>&1 || true
supervisor_log_file="${supervisor_dir}/supervisor.log"
supervisor_status_file="${supervisor_dir}/status.txt"
lock_dir="${supervisor_dir}/lock"
if ! mkdir "${lock_dir}" 2>/dev/null; then
  echo "Supervisor already running for ${output_dir}" >&2
  exit 1
fi

cleanup_ran="0"
current_loop_pid=""
current_loop_dir=""
current_loop_log=""
current_loop_pipe=""
current_loop_relay_pid=""
current_loop_started_epoch=""
current_loop_exit_code=""
loop_launch_count="0"
incident_count="0"
last_observed_status_token=""
consecutive_failure_key=""
consecutive_failure_count="0"
recovery_key=""
deterministic_repair_done_for_key="0"
codex_repair_attempts_for_key="0"
last_failure_key=""
repair_status=""
repair_summary=""
repair_verify=""

trap cleanup EXIT INT TERM

printf '%s\n' "Output directory: ${output_dir}" | tee -a "${supervisor_log_file}"
printf '%s\n' "Workdir: ${workdir}" | tee -a "${supervisor_log_file}"
printf '%s\n' "Loop script: ${loop_script}" | tee -a "${supervisor_log_file}"
printf '%s\n' "Poll seconds: ${poll_seconds}" | tee -a "${supervisor_log_file}"
printf '%s\n' "Stale seconds: ${stale_seconds}" | tee -a "${supervisor_log_file}"
printf '%s\n' "Repeat failure threshold: ${repeat_failure_threshold}" | tee -a "${supervisor_log_file}"
printf '%s\n' "Repair command: ${repair_command:-<none>}" | tee -a "${supervisor_log_file}"
printf '%s\n' "Codex repair enabled: ${codex_repair_enabled}" | tee -a "${supervisor_log_file}"
printf '%s\n' "Max repair Codex attempts: ${max_codex_repair_attempts}" | tee -a "${supervisor_log_file}"

start_loop

while true; do
  sleep "${poll_seconds}"

  latest_run_path=""
  latest_status_file=""
  latest_status_token=""
  failure_key=""
  loop_activity_epoch="${current_loop_started_epoch}"

  if [[ -n "${current_loop_dir}" ]]; then
    loop_activity_epoch="$(latest_loop_activity_epoch "${current_loop_dir}" "${current_loop_started_epoch}")"
  fi

  if [[ -n "${current_loop_dir}" ]] && latest_run_path="$(latest_run_dir "${current_loop_dir}" 2>/dev/null || true)"; then
    if [[ -n "${latest_run_path}" ]]; then
      latest_status_file="${latest_run_path}/status.txt"
      if [[ -f "${latest_status_file}" ]]; then
        latest_status_mtime="$(file_mtime_seconds "${latest_status_file}")"
        latest_status_token="${latest_status_file}:${latest_status_mtime}"
      fi
    fi
  fi

  if [[ -n "${latest_status_token}" ]] && [[ "${latest_status_token}" != "${last_observed_status_token}" ]]; then
    last_observed_status_token="${latest_status_token}"
    if failure_key="$(failure_key_from_status_file "${latest_status_file}" 2>/dev/null || true)"; then
      if [[ -n "${failure_key}" ]]; then
        if [[ "${failure_key}" == "${consecutive_failure_key}" ]]; then
          consecutive_failure_count="$((consecutive_failure_count + 1))"
        else
          consecutive_failure_key="${failure_key}"
          consecutive_failure_count="1"
        fi
        printf '%s\n' "[supervisor] observed failure ${failure_key} (${consecutive_failure_count}/${repeat_failure_threshold})" | tee -a "${supervisor_log_file}"
        if [[ "${consecutive_failure_count}" -ge "${repeat_failure_threshold}" ]]; then
          if ! handle_incident "repeated_failure" "${failure_key}" "${latest_run_path}" "${latest_status_file}"; then
            write_supervisor_status "blocked" "recovery_failed"
            exit 1
          fi
          continue
        fi
      fi
    else
      consecutive_failure_key=""
      consecutive_failure_count="0"
      recovery_key=""
      deterministic_repair_done_for_key="0"
      codex_repair_attempts_for_key="0"
    fi
  fi

  now_epoch="$(date +%s)"
  if [[ -n "${current_loop_pid}" ]] && kill -0 "${current_loop_pid}" >/dev/null 2>&1; then
    if [[ "$((now_epoch - loop_activity_epoch))" -ge "${stale_seconds}" ]]; then
      if ! handle_incident "stalled_loop" "stalled_loop" "${latest_run_path:-${current_loop_dir}}" "${latest_status_file:-}"; then
        write_supervisor_status "blocked" "stalled_recovery_failed"
        exit 1
      fi
      continue
    fi
  else
    if [[ -n "${current_loop_pid}" ]]; then
      set +e
      wait "${current_loop_pid}"
      current_loop_exit_code="$?"
      set -e
      current_loop_pid=""
    else
      current_loop_exit_code="1"
    fi

    if [[ "${current_loop_exit_code}" -eq 0 ]]; then
      write_supervisor_status "completed" "loop_exited_cleanly"
      printf '%s\n' "[supervisor] inner loop exited cleanly" | tee -a "${supervisor_log_file}"
      exit 0
    fi

    if stop_requested_after_successful_iteration "${latest_status_file:-}"; then
      write_supervisor_status "completed" "stop_requested_after_success"
      printf '%s\n' "[supervisor] stop requested and latest iteration completed successfully; exiting cleanly" | tee -a "${supervisor_log_file}"
      exit 0
    fi

    if ! handle_incident "loop_exit" "loop_exit:${current_loop_exit_code}" "${latest_run_path:-${current_loop_dir}}" "${latest_status_file:-}"; then
      write_supervisor_status "blocked" "loop_exit_recovery_failed"
      exit "${current_loop_exit_code}"
    fi
  fi
done
