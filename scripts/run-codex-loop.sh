#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: run-codex-loop.sh --prompt-file PATH [options] [-- <extra codex exec args>]

Runs `codex exec` in a loop.

- `--iterations N` controls the total number of loop iterations.
- `--new-session-every M` starts a fresh Codex session every M iterations.
- The first iteration in each session batch uses `--prompt-file`.
- Remaining iterations in the same batch use `--followup-prompt-file`.
- `--pre-iteration-command` runs before every iteration.
- `--inactivity-timeout-seconds N` aborts an iteration if Codex emits no new
  transcript output for N seconds.
- Retryable Codex failures can optionally sleep before retrying the next
  iteration.
- The loop continues on error by default. Use `--stop-on-error` to fail fast.

Options:
  --prompt-file PATH         File containing the session-start prompt.
  --followup-prompt-file PATH
                             File containing the in-session follow-up prompt.
                             Defaults to --prompt-file.
  --pre-session-command CMD  Shell command to run before each fresh session
                             batch starts. Runs in --workdir.
  --stop-on-pre-session-exit-code N
                             Stop the loop cleanly if the pre-session command
                             exits with code N.
  --pre-iteration-command CMD
                             Shell command to run before every iteration.
                             Runs in --workdir.
  --post-iteration-command CMD
                             Shell command to run after each successful Codex
                             iteration. Runs in --workdir.
  --inactivity-timeout-seconds N
                             Abort an iteration if the transcript receives no
                             new output for N seconds. Default: disabled
  --watchdog-interval-seconds N
                             Poll interval used by the inactivity watchdog.
                             Default: 15
  --continue-on-inactivity-timeout
                             If an inactivity timeout occurs, record the
                             failure and continue to the next iteration even
                             when --stop-on-error is enabled.
  --continue-on-codex-failure
                             If the Codex command exits non-zero, record the
                             failure and continue to the next iteration even
                             when --stop-on-error is enabled.
  --retry-sleep-seconds N    Sleep N seconds before the next retryable
                             iteration after an inactivity timeout or retryable
                             Codex failure. Default: 0
  --quiet                    Do not stream Codex transcripts or hook command
                             output to the terminal. Write them to per-run log
                             files and print only status/progress logs.
  --progress-log-interval-seconds N
                             When --quiet is enabled, print a progress log at
                             most once every N seconds while Codex is still
                             running. Default: 60
  --stop-on-pre-iteration-exit-code N
                             Stop the loop cleanly if the pre-iteration
                             command exits with code N.
  --stop-on-post-iteration-exit-code N
                             Stop the loop cleanly if the post-iteration
                             command exits with code N.
  --iterations N             Total number of loop iterations. Default: 100
  --new-session-every N      Start a new Codex session every N iterations.
                             Default: 1
  --output-dir PATH          Directory for run logs and responses. Default: mktemp dir
  --workdir PATH             Working directory passed to `codex exec --cd`.
                             Default: repo root
  --model NAME               Model passed to `codex exec --model`.
                             Default: gpt-5.5
  --yolo                     Run with `--dangerously-bypass-approvals-and-sandbox`
  --stop-on-error            Exit immediately after a failed iteration
  --help                     Show this help text

Examples:
  scripts/run-codex-loop.sh --prompt-file ./prompt.txt --iterations 5
  scripts/run-codex-loop.sh --prompt-file ./start.txt --followup-prompt-file ./continue.txt --iterations 100 --new-session-every 10
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

prompt_file=""
followup_prompt_file=""
pre_session_command=""
pre_iteration_command=""
post_iteration_command=""
inactivity_timeout_seconds="0"
watchdog_interval_seconds="15"
continue_on_inactivity_timeout="0"
continue_on_codex_failure="0"
retry_sleep_seconds="0"
quiet_mode="0"
progress_log_interval_seconds="60"
iterations="100"
new_session_every="1"
output_dir=""
workdir="${ROOT_DIR}"
model="gpt-5.5"
yolo_mode="0"
stop_on_error="0"
stop_on_pre_session_exit_code=""
stop_on_pre_iteration_exit_code=""
stop_on_post_iteration_exit_code=""
codex_extra_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt-file)
      require_value "$1" "${2:-}"
      prompt_file="$2"
      shift 2
      ;;
    --followup-prompt-file)
      require_value "$1" "${2:-}"
      followup_prompt_file="$2"
      shift 2
      ;;
    --pre-session-command)
      require_value "$1" "${2:-}"
      pre_session_command="$2"
      shift 2
      ;;
    --iterations)
      require_value "$1" "${2:-}"
      iterations="$2"
      shift 2
      ;;
    --pre-iteration-command)
      require_value "$1" "${2:-}"
      pre_iteration_command="$2"
      shift 2
      ;;
    --post-iteration-command)
      require_value "$1" "${2:-}"
      post_iteration_command="$2"
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
    --continue-on-inactivity-timeout)
      continue_on_inactivity_timeout="1"
      shift
      ;;
    --continue-on-codex-failure)
      continue_on_codex_failure="1"
      shift
      ;;
    --retry-sleep-seconds)
      require_value "$1" "${2:-}"
      retry_sleep_seconds="$2"
      shift 2
      ;;
    --quiet)
      quiet_mode="1"
      shift
      ;;
    --progress-log-interval-seconds)
      require_value "$1" "${2:-}"
      progress_log_interval_seconds="$2"
      shift 2
      ;;
    --stop-on-pre-session-exit-code)
      require_value "$1" "${2:-}"
      stop_on_pre_session_exit_code="$2"
      shift 2
      ;;
    --stop-on-pre-iteration-exit-code)
      require_value "$1" "${2:-}"
      stop_on_pre_iteration_exit_code="$2"
      shift 2
      ;;
    --stop-on-post-iteration-exit-code)
      require_value "$1" "${2:-}"
      stop_on_post_iteration_exit_code="$2"
      shift 2
      ;;
    --new-session-every)
      require_value "$1" "${2:-}"
      new_session_every="$2"
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
    --yolo)
      yolo_mode="1"
      shift
      ;;
    --stop-on-error)
      stop_on_error="1"
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

if [[ -z "${prompt_file}" ]]; then
  echo "--prompt-file is required" >&2
  usage >&2
  exit 1
fi

if [[ ! -f "${prompt_file}" ]]; then
  echo "Prompt file not found: ${prompt_file}" >&2
  exit 1
fi

if [[ ! -s "${prompt_file}" ]]; then
  echo "Prompt file is empty: ${prompt_file}" >&2
  exit 1
fi

if [[ -z "${followup_prompt_file}" ]]; then
  followup_prompt_file="${prompt_file}"
fi

if [[ ! -f "${followup_prompt_file}" ]]; then
  echo "Follow-up prompt file not found: ${followup_prompt_file}" >&2
  exit 1
fi

if [[ ! -s "${followup_prompt_file}" ]]; then
  echo "Follow-up prompt file is empty: ${followup_prompt_file}" >&2
  exit 1
fi

if [[ ! "${iterations}" =~ ^[0-9]+$ ]] || [[ "${iterations}" -lt 1 ]]; then
  echo "--iterations must be a positive integer" >&2
  exit 1
fi

if [[ ! "${inactivity_timeout_seconds}" =~ ^[0-9]+$ ]] || [[ "${inactivity_timeout_seconds}" -lt 0 ]]; then
  echo "--inactivity-timeout-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${watchdog_interval_seconds}" =~ ^[0-9]+$ ]] || [[ "${watchdog_interval_seconds}" -lt 1 ]]; then
  echo "--watchdog-interval-seconds must be a positive integer" >&2
  exit 1
fi

if [[ ! "${retry_sleep_seconds}" =~ ^[0-9]+$ ]] || [[ "${retry_sleep_seconds}" -lt 0 ]]; then
  echo "--retry-sleep-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${progress_log_interval_seconds}" =~ ^[0-9]+$ ]] || [[ "${progress_log_interval_seconds}" -lt 0 ]]; then
  echo "--progress-log-interval-seconds must be a non-negative integer" >&2
  exit 1
fi

validate_stop_exit_code() {
  local flag_name="$1"
  local value="$2"

  if [[ -z "${value}" ]]; then
    return
  fi

  if (
    [[ ! "${value}" =~ ^[0-9]+$ ]] \
    || [[ "${value}" -lt 0 ]] \
    || [[ "${value}" -gt 255 ]]
  ); then
    echo "${flag_name} must be an integer between 0 and 255" >&2
    exit 1
  fi
}

validate_stop_exit_code "--stop-on-pre-session-exit-code" "${stop_on_pre_session_exit_code}"
validate_stop_exit_code "--stop-on-pre-iteration-exit-code" "${stop_on_pre_iteration_exit_code}"
validate_stop_exit_code "--stop-on-post-iteration-exit-code" "${stop_on_post_iteration_exit_code}"

if [[ ! "${new_session_every}" =~ ^[0-9]+$ ]] || [[ "${new_session_every}" -lt 1 ]]; then
  echo "--new-session-every must be a positive integer" >&2
  exit 1
fi

if [[ ! -d "${workdir}" ]]; then
  echo "Working directory not found: ${workdir}" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-loop.XXXXXX")"
fi

mkdir -p "${output_dir}"
cp "${prompt_file}" "${output_dir}/prompt.txt"
if [[ "${followup_prompt_file}" != "${prompt_file}" ]]; then
  cp "${followup_prompt_file}" "${output_dir}/followup-prompt.txt"
fi

echo "Output directory: ${output_dir}"
echo "Iterations: ${iterations}"
echo "New session every: ${new_session_every}"
echo "Workdir: ${workdir}"
if [[ "${quiet_mode}" == "1" ]]; then
  echo "Terminal output mode: quiet status logs"
  echo "Quiet progress log interval: ${progress_log_interval_seconds}s"
fi
if [[ "${inactivity_timeout_seconds}" -gt 0 ]]; then
  echo "Inactivity timeout: ${inactivity_timeout_seconds}s"
fi
if [[ "${continue_on_codex_failure}" == "1" ]] || [[ "${continue_on_inactivity_timeout}" == "1" ]]; then
  echo "Retry sleep: ${retry_sleep_seconds}s"
fi

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

timestamp_now() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
  printf '[%s] %s\n' "$(timestamp_now)" "$*"
}

log_error() {
  printf '[%s] ERROR: %s\n' "$(timestamp_now)" "$*" >&2
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

  for pid in "${pids[@]}"; do
    if kill -0 "${pid}" 2>/dev/null; then
      still_running+=("${pid}")
    fi
  done

  if [[ "${#still_running[@]}" -gt 0 ]]; then
    kill -KILL "${still_running[@]}" 2>/dev/null || true
  fi
}

codex_exit_code="0"
codex_timed_out="0"

run_codex_command() {
  local prompt_path="$1"
  local transcript_path="$2"
  local fifo_path=""
  local codex_pid=""
  local transcript_writer_pid=""
  local last_activity_epoch=""
  local current_epoch=""
  local transcript_epoch=""
  local last_progress_log_epoch=""
  local inactivity_age_seconds=""

  codex_exit_code="0"
  codex_timed_out="0"

  if [[ "${inactivity_timeout_seconds}" -eq 0 ]] && [[ "${quiet_mode}" != "1" ]]; then
    set +e
    codex "${codex_args[@]}" < "${prompt_path}" 2>&1 | tee "${transcript_path}"
    codex_exit_code="${PIPESTATUS[0]}"
    set -e
    return
  fi

  fifo_path="${run_dir}/codex-output.fifo"
  rm -f "${fifo_path}"
  mkfifo "${fifo_path}"

  if [[ "${quiet_mode}" == "1" ]]; then
    cat < "${fifo_path}" > "${transcript_path}" &
  else
    tee "${transcript_path}" < "${fifo_path}" &
  fi
  transcript_writer_pid="$!"

  codex "${codex_args[@]}" < "${prompt_path}" > "${fifo_path}" 2>&1 &
  codex_pid="$!"

  last_activity_epoch="$(date +%s)"
  last_progress_log_epoch="${last_activity_epoch}"

  while kill -0 "${codex_pid}" 2>/dev/null; do
    if [[ -f "${transcript_path}" ]]; then
      transcript_epoch="$(file_mtime_epoch "${transcript_path}")"
      if [[ "${transcript_epoch}" -gt "${last_activity_epoch}" ]]; then
        last_activity_epoch="${transcript_epoch}"
      fi
    fi

    current_epoch="$(date +%s)"
    inactivity_age_seconds="$((current_epoch - last_activity_epoch))"

    if (
      [[ "${quiet_mode}" == "1" ]] \
      && [[ "${progress_log_interval_seconds}" -gt 0 ]] \
      && [[ "$((current_epoch - last_progress_log_epoch))" -ge "${progress_log_interval_seconds}" ]]
    ); then
      log_info "[$iteration/$iterations] Codex still running (${mode}); last transcript update ${inactivity_age_seconds}s ago. Transcript: ${transcript_path}"
      last_progress_log_epoch="${current_epoch}"
    fi

    if [[ "${inactivity_timeout_seconds}" -gt 0 ]] && [[ "${inactivity_age_seconds}" -ge "${inactivity_timeout_seconds}" ]]; then
      codex_timed_out="1"
      codex_exit_code="124"
      if [[ "${quiet_mode}" == "1" ]]; then
        log_error "[$iteration/$iterations] Iteration timed out after ${inactivity_timeout_seconds}s without transcript updates. Transcript: ${transcript_path}"
      else
        echo "Iteration timed out after ${inactivity_timeout_seconds}s without transcript updates; terminating Codex process tree." >&2
      fi
      terminate_process_tree "${codex_pid}"
      break
    fi

    sleep "${watchdog_interval_seconds}"
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

run_hook_command() {
  local workdir="$1"
  local command="$2"
  local log_path="$3"

  if [[ "${quiet_mode}" == "1" ]]; then
    (
      cd "${workdir}"
      bash -lc "${command}"
    ) > "${log_path}" 2>&1
    return
  fi

  (
    cd "${workdir}"
    bash -lc "${command}"
  ) 2>&1 | tee "${log_path}"
}

sleep_before_retry() {
  local reason="$1"

  if [[ "${retry_sleep_seconds}" -le 0 ]]; then
    return
  fi

  echo "Sleeping ${retry_sleep_seconds}s before retry after ${reason}"
  sleep "${retry_sleep_seconds}"
}

for ((iteration = 1; iteration <= iterations; iteration += 1)); do
  run_dir="$(printf '%s/run-%03d' "${output_dir}" "${iteration}")"
  response_file="${run_dir}/last-message.txt"
  transcript_file="${run_dir}/transcript.log"
  status_file="${run_dir}/status.txt"
  session_batch_index="$((((iteration - 1) / new_session_every) + 1))"
  batch_iteration_index="$((((iteration - 1) % new_session_every) + 1))"
  session_batch_id="$(printf '%03d' "${session_batch_index}")"
  session_id_file="${output_dir}/session-${session_batch_id}-id.txt"
  prompt_for_iteration="${prompt_file}"
  mode="start"
  session_id=""

  if [[ "${batch_iteration_index}" -gt 1 ]] && [[ -s "${session_id_file}" ]]; then
    prompt_for_iteration="${followup_prompt_file}"
    mode="resume"
    session_id="$(<"${session_id_file}")"
  fi

  mkdir -p "${run_dir}"
  if [[ -n "${pre_iteration_command}" ]]; then
    pre_iteration_log="${run_dir}/pre-iteration.log"
    if [[ "${quiet_mode}" == "1" ]]; then
      log_info "[$iteration/$iterations] Running pre-iteration command. Log: ${pre_iteration_log}"
    else
      echo "[$iteration/$iterations] Running pre-iteration command"
    fi
    set +e
    run_hook_command "${workdir}" "${pre_iteration_command}" "${pre_iteration_log}"
    pre_iteration_exit_code="$?"
    set -e
    if [[ "${pre_iteration_exit_code}" -ne 0 ]]; then
      if [[ -n "${stop_on_pre_iteration_exit_code}" ]] && [[ "${pre_iteration_exit_code}" == "${stop_on_pre_iteration_exit_code}" ]]; then
        echo "stopped:pre-iteration-exit:${pre_iteration_exit_code}" > "${status_file}"
        if [[ "${quiet_mode}" == "1" ]]; then
          log_info "[$iteration/$iterations] Stopping loop after pre-iteration command exit code ${pre_iteration_exit_code}. Log: ${pre_iteration_log}"
        else
          echo "[$iteration/$iterations] Stopping loop after pre-iteration command exit code ${pre_iteration_exit_code}"
        fi
        break
      fi
      echo "pre-iteration-failure:${pre_iteration_exit_code}" > "${status_file}"
      if [[ "${quiet_mode}" == "1" ]]; then
        log_error "[$iteration/$iterations] Pre-iteration command failed with exit code ${pre_iteration_exit_code}. Log: ${pre_iteration_log}"
      else
        echo "[$iteration/$iterations] Pre-iteration command failed with exit code ${pre_iteration_exit_code}" >&2
      fi
      if [[ "${stop_on_error}" == "1" ]]; then
        exit "${pre_iteration_exit_code}"
      fi
      continue
    fi
  fi

  if [[ "${mode}" == "start" ]] && [[ -n "${pre_session_command}" ]]; then
    pre_session_log="${run_dir}/pre-session.log"
    if [[ "${quiet_mode}" == "1" ]]; then
      log_info "[$iteration/$iterations] Running pre-session command. Log: ${pre_session_log}"
    else
      echo "[$iteration/$iterations] Running pre-session command"
    fi
    set +e
    run_hook_command "${workdir}" "${pre_session_command}" "${pre_session_log}"
    pre_session_exit_code="$?"
    set -e
    if [[ "${pre_session_exit_code}" -ne 0 ]]; then
      if [[ -n "${stop_on_pre_session_exit_code}" ]] && [[ "${pre_session_exit_code}" == "${stop_on_pre_session_exit_code}" ]]; then
        echo "stopped:pre-session-exit:${pre_session_exit_code}" > "${status_file}"
        if [[ "${quiet_mode}" == "1" ]]; then
          log_info "[$iteration/$iterations] Stopping loop after pre-session command exit code ${pre_session_exit_code}. Log: ${pre_session_log}"
        else
          echo "[$iteration/$iterations] Stopping loop after pre-session command exit code ${pre_session_exit_code}"
        fi
        break
      fi
      echo "pre-session-failure:${pre_session_exit_code}" > "${status_file}"
      if [[ "${quiet_mode}" == "1" ]]; then
        log_error "[$iteration/$iterations] Pre-session command failed with exit code ${pre_session_exit_code}. Log: ${pre_session_log}"
      else
        echo "[$iteration/$iterations] Pre-session command failed with exit code ${pre_session_exit_code}" >&2
      fi
      if [[ "${stop_on_error}" == "1" ]]; then
        exit "${pre_session_exit_code}"
      fi
      continue
    fi
  fi

  if [[ "${quiet_mode}" == "1" ]]; then
    log_info "[$iteration/$iterations] Starting Codex (${mode}). Transcript: ${transcript_file}. Last message: ${response_file}"
  else
    echo "[$iteration/$iterations] Starting Codex"
  fi

  codex_args=()
  if [[ "${mode}" == "resume" ]]; then
    codex_args=(
      exec
      resume
      --output-last-message
      "${response_file}"
    )
  else
    codex_args=(
      exec
      --color
      never
      --cd
      "${workdir}"
      --output-last-message
      "${response_file}"
    )
    if [[ "${new_session_every}" -gt 1 ]]; then
      codex_args+=(--json)
    else
      codex_args+=(--ephemeral)
    fi
  fi

  if [[ -n "${model}" ]]; then
    codex_args+=(--model "${model}")
  fi
  if [[ "${yolo_mode}" == "1" ]]; then
    codex_args+=(--dangerously-bypass-approvals-and-sandbox)
  fi
  if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
    codex_args+=("${codex_extra_args[@]}")
  fi
  if [[ "${mode}" == "resume" ]]; then
    codex_args+=("${session_id}" -)
  else
    codex_args+=(-)
  fi

  run_codex_command "${prompt_for_iteration}" "${transcript_file}"
  exit_code="${codex_exit_code}"

  if [[ "${mode}" == "start" ]] && [[ "${new_session_every}" -gt 1 ]] && [[ ! -s "${session_id_file}" ]]; then
    if thread_id="$(extract_thread_id "${transcript_file}")"; then
      printf '%s\n' "${thread_id}" > "${session_id_file}"
    fi
  fi

  if [[ "${exit_code}" -eq 0 ]]; then
    if [[ -n "${post_iteration_command}" ]]; then
      post_iteration_log="${run_dir}/post-iteration.log"
      if [[ "${quiet_mode}" == "1" ]]; then
        log_info "[$iteration/$iterations] Running post-iteration command. Log: ${post_iteration_log}"
      else
        echo "[$iteration/$iterations] Running post-iteration command"
      fi
      set +e
      run_hook_command "${workdir}" "${post_iteration_command}" "${post_iteration_log}"
      post_iteration_exit_code="$?"
      set -e
      if [[ "${post_iteration_exit_code}" -ne 0 ]]; then
        if [[ -n "${stop_on_post_iteration_exit_code}" ]] && [[ "${post_iteration_exit_code}" == "${stop_on_post_iteration_exit_code}" ]]; then
          echo "stopped:post-iteration-exit:${post_iteration_exit_code}" > "${status_file}"
          if [[ "${quiet_mode}" == "1" ]]; then
            log_info "[$iteration/$iterations] Stopping loop after post-iteration command exit code ${post_iteration_exit_code}. Log: ${post_iteration_log}"
          else
            echo "[$iteration/$iterations] Stopping loop after post-iteration command exit code ${post_iteration_exit_code}"
          fi
          break
        fi
        echo "post-iteration-failure:${post_iteration_exit_code}" > "${status_file}"
        if [[ "${quiet_mode}" == "1" ]]; then
          log_error "[$iteration/$iterations] Post-iteration command failed with exit code ${post_iteration_exit_code}. Log: ${post_iteration_log}"
        else
          echo "[$iteration/$iterations] Post-iteration command failed with exit code ${post_iteration_exit_code}" >&2
        fi
        if [[ "${stop_on_error}" == "1" ]]; then
          exit "${post_iteration_exit_code}"
        fi
        continue
      fi
    fi
    echo "success" > "${status_file}"
    if [[ "${quiet_mode}" == "1" ]]; then
      log_info "[$iteration/$iterations] Codex iteration completed successfully."
    else
      echo "[$iteration/$iterations] Codex session ended"
    fi
    continue
  fi

  if [[ "${codex_timed_out}" == "1" ]]; then
    echo "failure:inactivity-timeout:${exit_code}" > "${status_file}"
  else
    echo "failure:${exit_code}" > "${status_file}"
  fi
  if [[ "${quiet_mode}" == "1" ]]; then
    log_error "[$iteration/$iterations] Codex failed with exit code ${exit_code}. Transcript: ${transcript_file}. Last message: ${response_file}"
  else
    echo "[$iteration/$iterations] Codex failed with exit code ${exit_code}" >&2
  fi
  if [[ "${codex_timed_out}" == "1" ]] && [[ "${continue_on_inactivity_timeout}" == "1" ]]; then
    sleep_before_retry "inactivity timeout"
    if [[ "${quiet_mode}" == "1" ]]; then
      log_info "[$iteration/$iterations] Continuing after inactivity timeout."
    else
      echo "[$iteration/$iterations] Continuing after inactivity timeout"
    fi
    continue
  fi
  if [[ "${continue_on_codex_failure}" == "1" ]]; then
    sleep_before_retry "Codex failure"
    if [[ "${quiet_mode}" == "1" ]]; then
      log_info "[$iteration/$iterations] Continuing after Codex failure."
    else
      echo "[$iteration/$iterations] Continuing after Codex failure"
    fi
    continue
  fi
  if [[ "${stop_on_error}" == "1" ]]; then
    exit "${exit_code}"
  fi
done
