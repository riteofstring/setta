#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  local program_name
  program_name="${RALPH_PROGRAM_NAME:-$(basename "${0}")}"
  cat <<'EOF' | sed "s/__PROGRAM_NAME__/${program_name}/g"
Usage: __PROGRAM_NAME__ [options] [-- <extra codex exec args>]

Runs codex exec in a loop using a reusable loop config file.

Defaults:
- --config-file defaults to ./RALPH.md
- --prompt-file defaults to scripts/ralph-default-prompt.md
- --new-session-every defaults to 1 so each iteration starts fresh

The loop expects the agent to end each iteration with:
  LOOP_STATUS: SUBTASK_DONE|TASK_DONE|BLOCKED
  LOOP_SUMMARY: ...
  LOOP_NEXT_ACTION: ...
  LOOP_VERIFY_COMMAND: ...
  LOOP_VERIFY_RESULT: ...
  LOOP_COMMIT: ...

Options:
  --config-file PATH         Loop config markdown file. Default: ./RALPH.md
  --prompt-file PATH         Prompt template for session starts.
  --followup-prompt-file PATH
                             Prompt template for resumed sessions.
                             Defaults to --prompt-file.
  --plan-file PATH           Override the plan file from the config.
  --log-file PATH            Override the log file from the config.
  --verify-command CMD       Verification guidance injected into the prompt.
  --pre-session-command CMD  Shell command to run before each fresh session
                             batch starts. Runs in --workdir.
  --stop-on-pre-session-exit-code N
                             Stop the loop cleanly if the pre-session command
                             exits with code N.
  --iterations N             Total loop iterations. Default: config or 100
  --new-session-every N      Start a fresh Codex session every N iterations.
                             Default: config or 1
  --output-dir PATH          Directory for run logs and responses.
                             Default: mktemp dir
  --workdir PATH             Working directory passed to `codex exec --cd`.
                             Default: config or repo root
  --worktree-lifecycle MODE  One-time pre-loop lifecycle for this worktree:
                             none|kill|ai|aireset|restart-ai|restart-aireset
  --terminal-mode MODE       Lifecycle launch mode:
                             auto|background|tmux
  --model NAME               Optional model override passed to `codex exec`
  --yolo                     Run with `--dangerously-bypass-approvals-and-sandbox`
  --no-yolo                  Disable the default/configured yolo mode
  --stop-on-error            Exit immediately after a failed iteration
  --print-prompt             Render the resolved start prompt and exit
  --help                     Show this help text

Examples:
  ./__PROGRAM_NAME__ --iterations 3
  ./__PROGRAM_NAME__ --config-file ./RALPH.md --output-dir ./tmp/ralph-loop
  ./__PROGRAM_NAME__ --terminal-mode tmux --worktree-lifecycle restart-aireset
  ./__PROGRAM_NAME__ --iterations 20 -- --full-auto
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

parse_bool() {
  local raw_value="${1:-}"
  local normalized=""
  normalized="$(printf '%s' "${raw_value}" | tr '[:upper:]' '[:lower:]')"
  case "${normalized}" in
    1|true|yes|on)
      printf '1\n'
      ;;
    0|false|no|off|'')
      printf '0\n'
      ;;
    *)
      echo "Invalid boolean value: ${raw_value}" >&2
      exit 1
      ;;
  esac
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

sanitize_single_line() {
  local value="$1"
  value="${value//$'\r'/ }"
  value="${value//$'\n'/ }"
  printf '%s\n' "${value}"
}

discover_main_worktree_root() {
  local repo_root="$1"
  git -C "${repo_root}" worktree list --porcelain 2>/dev/null | awk '
    $1 == "worktree" { current = $2; next }
    $1 == "branch" && $2 == "refs/heads/main" { print current; exit }
  '
}

workspace_setta_status_payload() {
  local target_root="$1"
  local status_payload=""

  if [[ -f "${target_root}/activate.sh" ]]; then
    # shellcheck disable=SC1090
    source "${target_root}/activate.sh"
  fi

  if ! command -v setta >/dev/null 2>&1; then
    return 1
  fi

  status_payload="$(
    setta status --connect-info --latest --json --workspace "${target_root}" 2>/dev/null || true
  )"
  if [[ "${status_payload}" != __SETTA_JSON_B64__* ]]; then
    return 1
  fi

  printf '%s\n' "${status_payload}"
}

workspace_has_live_setta_session() {
  local target_root="$1"
  local status_payload=""

  if status_payload="$(workspace_setta_status_payload "${target_root}")"; then
    [[ -n "${status_payload}" ]]
    return 0
  fi

  return 1
}

workspace_session_state() {
  local target_root="$1"
  if workspace_has_live_setta_session "${target_root}"; then
    printf 'running\n'
  else
    printf 'not_running\n'
  fi
}

resolve_terminal_mode() {
  local requested_mode="$1"

  case "${requested_mode}" in
    background)
      printf 'background\n'
      return 0
      ;;
    tmux)
      if command -v tmux >/dev/null 2>&1 && [[ -n "${TMUX:-}" ]]; then
        printf 'tmux\n'
        return 0
      fi
      echo "Requested terminal mode tmux, but tmux is not available in this shell." >&2
      exit 1
      ;;
    auto|'')
      if command -v tmux >/dev/null 2>&1 && [[ -n "${TMUX:-}" ]]; then
        printf 'tmux\n'
      else
        printf 'background\n'
      fi
      return 0
      ;;
    *)
      echo "Unsupported terminal mode: ${requested_mode}" >&2
      exit 1
      ;;
  esac
}

tmux_window_name() {
  local target_name="$1"
  local target_root="$2"
  local label="$3"
  local suffix=""
  suffix="$(basename "${target_root}")"
  printf 'ralph-%s-%s-%s\n' "${target_name}" "${suffix}" "${label}"
}

start_command_in_tmux_window() {
  local target_name="$1"
  local target_root="$2"
  local label="$3"
  local command_display="$4"
  local command_body="$5"
  local run_dir="$6"
  local window_name=""
  local log_path=""
  local shell_path=""

  if ! command -v tmux >/dev/null 2>&1 || [[ -z "${TMUX:-}" ]]; then
    echo "tmux window launch requested, but tmux is unavailable in this shell." >&2
    exit 1
  fi

  window_name="$(tmux_window_name "${target_name}" "${target_root}" "${label}")"
  log_path="${run_dir}/${target_name}-${label}.log"
  shell_path="${SHELL:-/bin/zsh}"

  echo "[bootstrap] ${target_name}: opening tmux window ${window_name} for ${command_display}"
  tmux new-window -n "${window_name}" \
    "cd '${target_root}' && ( ${command_body} ) 2>&1 | tee '${log_path}'; exit_code=\${PIPESTATUS[0]}; echo; echo '[ralph] ${window_name} exited with code' \$exit_code; exec '${shell_path}' -l"
}

run_lifecycle_mode() {
  local target_name="$1"
  local target_root="$2"
  local lifecycle_mode="$3"
  local run_dir="$4"
  local resolved_terminal_mode="$5"
  local label=""
  local launcher_path=""
  local command_display=""
  local command_body=""
  local should_restart="0"
  local session_state="not_running"

  if [[ -z "${lifecycle_mode}" ]] || [[ "${lifecycle_mode}" == "none" ]]; then
    return 0
  fi

  if [[ ! -d "${target_root}" ]]; then
    echo "Lifecycle target root not found for ${target_name}: ${target_root}" >&2
    exit 1
  fi

  local kill_script="${target_root}/kill.sh"
  local ai_script="${target_root}/ai.sh"
  local aireset_script="${target_root}/aireset.sh"

  case "${lifecycle_mode}" in
    kill)
      local log_path="${run_dir}/${target_name}-kill.log"
      echo "[bootstrap] ${target_name}: kill"
      (
        cd "${target_root}"
        "${kill_script}"
      ) 2>&1 | tee "${log_path}"
      ;;
    ai)
      label="ai"
      launcher_path="${ai_script}"
      command_display="./ai.sh"
      command_body="\"${ai_script}\""
      ;;
    aireset)
      label="aireset"
      launcher_path="${aireset_script}"
      command_display="./aireset.sh (fallback ./ai.sh)"
      command_body="\"${aireset_script}\" || \"${ai_script}\""
      ;;
    restart-ai)
      label="ai"
      launcher_path="${ai_script}"
      command_display="./ai.sh"
      command_body="\"${ai_script}\""
      should_restart="1"
      ;;
    restart-aireset)
      label="aireset"
      launcher_path="${aireset_script}"
      command_display="./aireset.sh (fallback ./ai.sh)"
      command_body="\"${aireset_script}\" || \"${ai_script}\""
      should_restart="1"
      ;;
    *)
      echo "Unsupported lifecycle mode for ${target_name}: ${lifecycle_mode}" >&2
      exit 1
      ;;
  esac

  if [[ -n "${label}" ]]; then
    if workspace_has_live_setta_session "${target_root}"; then
      session_state="running"
    fi
    echo "[bootstrap] ${target_name}: session state ${session_state}"

    if [[ "${should_restart}" == "1" ]]; then
      local kill_log_path="${run_dir}/${target_name}-kill.log"
      echo "[bootstrap] ${target_name}: restart requested"
      (
        cd "${target_root}"
        "${kill_script}"
      ) 2>&1 | tee "${kill_log_path}"
    elif [[ "${session_state}" == "running" ]]; then
      echo "[bootstrap] ${target_name}: skipping ${label}; a Setta session already exists for ${target_root}"
      return 0
    fi

    if [[ ! -x "${launcher_path}" ]]; then
      echo "Launcher not found or not executable: ${launcher_path}" >&2
      exit 1
    fi

    if [[ "${resolved_terminal_mode}" == "tmux" ]]; then
      start_command_in_tmux_window "${target_name}" "${target_root}" "${label}" "${command_display}" "${command_body}" "${run_dir}"
      return 0
    fi

    local log_path="${run_dir}/${target_name}-${label}.log"
    local pid_path="${run_dir}/${target_name}-${label}.pid"
    local pid=""
    echo "[bootstrap] ${target_name}: starting ${command_display} in background"
    pid="$(
      cd "${target_root}"
      nohup bash -lc "${command_body}" > "${log_path}" 2>&1 &
      echo $!
    )"
    printf '%s\n' "${pid}" > "${pid_path}"
    sleep 3
    if ! kill -0 "${pid}" 2>/dev/null; then
      echo "Background startup failed for ${target_name} via ${launcher_path}" >&2
      if [[ -f "${log_path}" ]]; then
        echo "Last log lines from ${log_path}:" >&2
        tail -n 40 "${log_path}" >&2 || true
      fi
      exit 1
    fi
  fi
}

render_prompt() {
  local prompt_template="$1"
  local destination="$2"
  local mode_label="$3"

  cat > "${destination}" <<EOF
You are running inside an automated Codex loop iteration for this repository.

Read these files first:
- ${config_file}
- ${plan_file}
- ${log_file}

Loop context:
- mode: ${mode_label}
- repository root: ${ROOT_DIR}
- working directory: ${workdir}
- verification guidance: ${verify_command}
- follow the repository's AGENTS.md instructions as the highest-priority repo policy
- use the plan and log files as the durable handoff instead of relying on prior chat context

After reading the files, continue the current effort by selecting exactly one bounded next subtask that can be completed, verified, logged, and committed within this iteration.

EOF
  cat "${prompt_template}" >> "${destination}"
  cat >> "${destination}" <<'EOF'

End your response with these exact lines:
LOOP_STATUS: SUBTASK_DONE|TASK_DONE|BLOCKED
LOOP_SUMMARY: <one sentence>
LOOP_NEXT_ACTION: <one sentence>
LOOP_VERIFY_COMMAND: <command or none>
LOOP_VERIFY_RESULT: <pass|fail|not_run|blocked>
LOOP_COMMIT: <full sha|none>
EOF
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

run_pre_session_command() {
  local working_dir="$1"
  local command="$2"
  local log_path="$3"

  (
    cd "${working_dir}"
    bash -lc "${command}"
  ) 2>&1 | tee "${log_path}"
}

extract_loop_field() {
  local file_path="$1"
  local field_name="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi

  sed -n "s/^${field_name}: //p" "${file_path}" | tail -n1
}

write_status_file() {
  local status_path="$1"
  shift
  : > "${status_path}"
  while [[ $# -gt 0 ]]; do
    printf '%s\n' "$1" >> "${status_path}"
    shift
  done
}

config_file="${ROOT_DIR}/RALPH.md"
prompt_file=""
followup_prompt_file=""
plan_file=""
log_file=""
verify_command=""
pre_session_command=""
iterations=""
new_session_every=""
output_dir=""
workdir=""
worktree_lifecycle=""
terminal_mode=""
model=""
yolo_mode=""
stop_on_error="0"
print_prompt_only="0"
stop_on_pre_session_exit_code=""
codex_extra_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config-file)
      require_value "$1" "${2:-}"
      config_file="$2"
      shift 2
      ;;
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
    --plan-file)
      require_value "$1" "${2:-}"
      plan_file="$2"
      shift 2
      ;;
    --log-file)
      require_value "$1" "${2:-}"
      log_file="$2"
      shift 2
      ;;
    --verify-command)
      require_value "$1" "${2:-}"
      verify_command="$2"
      shift 2
      ;;
    --pre-session-command)
      require_value "$1" "${2:-}"
      pre_session_command="$2"
      shift 2
      ;;
    --stop-on-pre-session-exit-code)
      require_value "$1" "${2:-}"
      stop_on_pre_session_exit_code="$2"
      shift 2
      ;;
    --iterations)
      require_value "$1" "${2:-}"
      iterations="$2"
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
    --worktree-lifecycle)
      require_value "$1" "${2:-}"
      worktree_lifecycle="$2"
      shift 2
      ;;
    --terminal-mode)
      require_value "$1" "${2:-}"
      terminal_mode="$2"
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
    --no-yolo)
      yolo_mode="0"
      shift
      ;;
    --stop-on-error)
      stop_on_error="1"
      shift
      ;;
    --print-prompt)
      print_prompt_only="1"
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

if [[ ! -f "${config_file}" ]]; then
  echo "Config file not found: ${config_file}" >&2
  exit 1
fi

config_file="$(cd "$(dirname "${config_file}")" && pwd)/$(basename "${config_file}")"
config_dir="$(cd "$(dirname "${config_file}")" && pwd)"

config_prompt_file="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "prompt_file")")")"
config_followup_prompt_file="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "followup_prompt_file")")")"
config_plan_file="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "plan_path")")")"
config_log_file="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "log_path")")")"
config_verify_command="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "verify_command")")")"
config_pre_session_command="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "pre_session_command")")")"
config_iterations="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "iterations")")")"
config_new_session_every="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "new_session_every")")")"
config_workdir="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "workdir")")")"
config_worktree_lifecycle="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "worktree_lifecycle")")")"
config_terminal_mode="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "terminal_mode")")")"
config_model="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "model")")")"
config_yolo="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "yolo")")")"
config_stop_on_pre_session_exit_code="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "stop_on_pre_session_exit_code")")")"

if [[ -z "${prompt_file}" ]]; then
  if [[ -n "${config_prompt_file}" ]]; then
    prompt_file="${config_prompt_file}"
  else
    prompt_file="${SCRIPT_DIR}/ralph-default-prompt.md"
  fi
fi

if [[ -z "${followup_prompt_file}" ]]; then
  if [[ -n "${config_followup_prompt_file}" ]]; then
    followup_prompt_file="${config_followup_prompt_file}"
  else
    followup_prompt_file="${prompt_file}"
  fi
fi

if [[ -z "${plan_file}" ]]; then
  plan_file="${config_plan_file}"
fi

if [[ -z "${log_file}" ]]; then
  log_file="${config_log_file}"
fi

if [[ -z "${verify_command}" ]]; then
  verify_command="${config_verify_command}"
fi

if [[ -z "${pre_session_command}" ]]; then
  pre_session_command="${config_pre_session_command}"
fi

if [[ -z "${iterations}" ]]; then
  if [[ -n "${config_iterations}" ]]; then
    iterations="${config_iterations}"
  else
    iterations="100"
  fi
fi

if [[ -z "${new_session_every}" ]]; then
  if [[ -n "${config_new_session_every}" ]]; then
    new_session_every="${config_new_session_every}"
  else
    new_session_every="1"
  fi
fi

if [[ -z "${workdir}" ]]; then
  if [[ -n "${config_workdir}" ]]; then
    workdir="${config_workdir}"
  else
    workdir="${ROOT_DIR}"
  fi
fi

if [[ -z "${worktree_lifecycle}" ]]; then
  worktree_lifecycle="${config_worktree_lifecycle}"
fi

if [[ -z "${terminal_mode}" ]]; then
  terminal_mode="${config_terminal_mode}"
fi

if [[ -z "${model}" ]]; then
  model="${config_model}"
fi

if [[ -z "${yolo_mode}" ]]; then
  yolo_mode="$(parse_bool "${config_yolo}")"
fi

if [[ -z "${stop_on_pre_session_exit_code}" ]]; then
  stop_on_pre_session_exit_code="${config_stop_on_pre_session_exit_code}"
fi

prompt_file="$(resolve_path "${config_dir}" "${prompt_file}")"
followup_prompt_file="$(resolve_path "${config_dir}" "${followup_prompt_file}")"
plan_file="$(resolve_path "${config_dir}" "${plan_file}")"
log_file="$(resolve_path "${config_dir}" "${log_file}")"
workdir="$(resolve_path "${config_dir}" "${workdir}")"
if [[ -n "${output_dir}" ]]; then
  output_dir="$(resolve_path "${ROOT_DIR}" "${output_dir}")"
fi

if [[ -z "${plan_file}" ]]; then
  echo "No plan file configured. Set plan_path in ${config_file} or pass --plan-file." >&2
  exit 1
fi

if [[ -z "${log_file}" ]]; then
  echo "No log file configured. Set log_path in ${config_file} or pass --log-file." >&2
  exit 1
fi

if [[ -z "${verify_command}" ]]; then
  verify_command="Choose the narrowest relevant verification for the current subtask, and include CDP verification when UI work requires it."
fi

if [[ ! -f "${prompt_file}" ]]; then
  echo "Prompt file not found: ${prompt_file}" >&2
  exit 1
fi

if [[ ! -s "${prompt_file}" ]]; then
  echo "Prompt file is empty: ${prompt_file}" >&2
  exit 1
fi

if [[ ! -f "${followup_prompt_file}" ]]; then
  echo "Follow-up prompt file not found: ${followup_prompt_file}" >&2
  exit 1
fi

if [[ ! -s "${followup_prompt_file}" ]]; then
  echo "Follow-up prompt file is empty: ${followup_prompt_file}" >&2
  exit 1
fi

if [[ ! -f "${plan_file}" ]]; then
  echo "Plan file not found: ${plan_file}" >&2
  exit 1
fi

if [[ ! -f "${log_file}" ]]; then
  echo "Log file not found: ${log_file}" >&2
  exit 1
fi

if [[ ! "${iterations}" =~ ^[0-9]+$ ]] || [[ "${iterations}" -lt 1 ]]; then
  echo "--iterations must be a positive integer" >&2
  exit 1
fi

if [[ ! "${new_session_every}" =~ ^[0-9]+$ ]] || [[ "${new_session_every}" -lt 1 ]]; then
  echo "--new-session-every must be a positive integer" >&2
  exit 1
fi

if [[ -n "${stop_on_pre_session_exit_code}" ]] && (
  [[ ! "${stop_on_pre_session_exit_code}" =~ ^[0-9]+$ ]] \
  || [[ "${stop_on_pre_session_exit_code}" -lt 0 ]] \
  || [[ "${stop_on_pre_session_exit_code}" -gt 255 ]]
); then
  echo "--stop-on-pre-session-exit-code must be an integer between 0 and 255" >&2
  exit 1
fi

if [[ ! -d "${workdir}" ]]; then
  echo "Working directory not found: ${workdir}" >&2
  exit 1
fi

if [[ -n "${worktree_lifecycle}" ]]; then
  case "${worktree_lifecycle}" in
    none|kill|ai|aireset|restart-ai|restart-aireset) ;;
    *)
      echo "Unsupported --worktree-lifecycle value: ${worktree_lifecycle}" >&2
      exit 1
      ;;
  esac
fi

resolved_terminal_mode="$(resolve_terminal_mode "${terminal_mode}")"

if [[ "${print_prompt_only}" != "1" ]] && ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-loop.XXXXXX")"
fi

mkdir -p "${output_dir}"

start_prompt_file="${output_dir}/rendered-start-prompt.txt"
followup_rendered_prompt_file="${output_dir}/rendered-followup-prompt.txt"
render_prompt "${prompt_file}" "${start_prompt_file}" "start"
render_prompt "${followup_prompt_file}" "${followup_rendered_prompt_file}" "resume"

cp "${config_file}" "${output_dir}/RALPH.md"
cp "${prompt_file}" "${output_dir}/prompt-template.md"
if [[ "${followup_prompt_file}" != "${prompt_file}" ]]; then
  cp "${followup_prompt_file}" "${output_dir}/followup-prompt-template.md"
fi

echo "Output directory: ${output_dir}"
echo "Iterations: ${iterations}"
echo "New session every: ${new_session_every}"
echo "Workdir: ${workdir}"
echo "Config file: ${config_file}"
echo "Plan file: ${plan_file}"
echo "Log file: ${log_file}"
echo "Yolo mode: ${yolo_mode}"
echo "Worktree lifecycle: ${worktree_lifecycle:-none}"
echo "Terminal mode: ${resolved_terminal_mode}"

main_worktree_root="$(discover_main_worktree_root "${workdir}" || true)"
if [[ -n "${main_worktree_root}" ]]; then
  echo "Main worktree root: ${main_worktree_root}"
  if [[ "$(cd "${workdir}" && pwd -P)" == "$(cd "${main_worktree_root}" && pwd -P)" ]]; then
    echo "Refusing to run Ralph in the main worktree. Main must remain pristine and untouched." >&2
    exit 1
  fi
fi

if [[ "${print_prompt_only}" == "1" ]]; then
  cat "${start_prompt_file}"
  exit 0
fi

echo "Worktree session: $(workspace_session_state "${workdir}")"

if [[ "${worktree_lifecycle}" != "none" ]] && [[ -n "${worktree_lifecycle}" ]]; then
  run_lifecycle_mode "worktree" "${workdir}" "${worktree_lifecycle}" "${output_dir}" "${resolved_terminal_mode}"
fi

for ((iteration = 1; iteration <= iterations; iteration += 1)); do
  run_dir="$(printf '%s/run-%03d' "${output_dir}" "${iteration}")"
  response_file="${run_dir}/last-message.txt"
  transcript_file="${run_dir}/transcript.log"
  status_file="${run_dir}/status.txt"
  session_batch_index="$((((iteration - 1) / new_session_every) + 1))"
  batch_iteration_index="$((((iteration - 1) % new_session_every) + 1))"
  session_batch_id="$(printf '%03d' "${session_batch_index}")"
  session_id_file="${output_dir}/session-${session_batch_id}-id.txt"
  prompt_for_iteration="${start_prompt_file}"
  mode="start"
  session_id=""
  before_log_cksum="$(cksum "${log_file}" | awk '{print $1 ":" $2}')"
  before_head="$(git -C "${workdir}" rev-parse HEAD 2>/dev/null || true)"

  if [[ "${batch_iteration_index}" -gt 1 ]] && [[ -s "${session_id_file}" ]]; then
    prompt_for_iteration="${followup_rendered_prompt_file}"
    mode="resume"
    session_id="$(<"${session_id_file}")"
  fi

  mkdir -p "${run_dir}"
  if [[ "${mode}" == "start" ]] && [[ -n "${pre_session_command}" ]]; then
    pre_session_log="${run_dir}/pre-session.log"
    echo "[$iteration/$iterations] Running pre-session command"
    set +e
    run_pre_session_command "${workdir}" "${pre_session_command}" "${pre_session_log}"
    pre_session_exit_code="$?"
    set -e
    if [[ "${pre_session_exit_code}" -ne 0 ]]; then
      write_status_file "${status_file}" \
        "status=pre-session-failure" \
        "exit_code=${pre_session_exit_code}"
      if [[ -n "${stop_on_pre_session_exit_code}" ]] && [[ "${pre_session_exit_code}" == "${stop_on_pre_session_exit_code}" ]]; then
        echo "[$iteration/$iterations] Stopping loop after pre-session command exit code ${pre_session_exit_code}"
        break
      fi
      echo "[$iteration/$iterations] Pre-session command failed with exit code ${pre_session_exit_code}" >&2
      if [[ "${stop_on_error}" == "1" ]]; then
        exit "${pre_session_exit_code}"
      fi
      continue
    fi
  fi

  echo "[$iteration/$iterations] Starting Codex (${mode})"

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

  set +e
  codex "${codex_args[@]}" < "${prompt_for_iteration}" 2>&1 | tee "${transcript_file}"
  exit_code="${PIPESTATUS[0]}"
  set -e

  if [[ "${mode}" == "start" ]] && [[ "${new_session_every}" -gt 1 ]] && [[ ! -s "${session_id_file}" ]]; then
    if thread_id="$(extract_thread_id "${transcript_file}")"; then
      printf '%s\n' "${thread_id}" > "${session_id_file}"
    fi
  fi

  if [[ "${exit_code}" -ne 0 ]]; then
    write_status_file "${status_file}" \
      "status=failure" \
      "mode=${mode}" \
      "exit_code=${exit_code}"
    echo "[$iteration/$iterations] Codex failed with exit code ${exit_code}" >&2
    if [[ "${stop_on_error}" == "1" ]]; then
      exit "${exit_code}"
    fi
    continue
  fi

  loop_status="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_STATUS")")"
  loop_summary="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_SUMMARY")")"
  loop_next_action="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_NEXT_ACTION")")"
  loop_verify_command="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_VERIFY_COMMAND")")"
  loop_verify_result="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_VERIFY_RESULT")")"
  loop_commit="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_COMMIT")")"

  if [[ -z "${loop_status}" ]] && [[ -f "${transcript_file}" ]]; then
    loop_status="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_STATUS")")"
    loop_summary="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_SUMMARY")")"
    loop_next_action="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_NEXT_ACTION")")"
    loop_verify_command="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_VERIFY_COMMAND")")"
    loop_verify_result="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_VERIFY_RESULT")")"
    loop_commit="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_COMMIT")")"
  fi

  if [[ "${loop_status}" != "SUBTASK_DONE" ]] && [[ "${loop_status}" != "TASK_DONE" ]] && [[ "${loop_status}" != "BLOCKED" ]]; then
    write_status_file "${status_file}" \
      "status=invalid-output" \
      "mode=${mode}" \
      "loop_status=${loop_status}"
    echo "[$iteration/$iterations] Missing or invalid LOOP_STATUS in the agent output" >&2
    if [[ "${stop_on_error}" == "1" ]]; then
      exit 1
    fi
    continue
  fi

  after_log_cksum="$(cksum "${log_file}" | awk '{print $1 ":" $2}')"
  after_head="$(git -C "${workdir}" rev-parse HEAD 2>/dev/null || true)"

  if [[ "${loop_status}" != "BLOCKED" ]] && [[ "${before_log_cksum}" == "${after_log_cksum}" ]]; then
    write_status_file "${status_file}" \
      "status=missing-log-update" \
      "mode=${mode}" \
      "loop_status=${loop_status}" \
      "loop_summary=${loop_summary}"
    echo "[$iteration/$iterations] Log file did not change; refusing to continue blindly" >&2
    exit 1
  fi

  write_status_file "${status_file}" \
    "status=success" \
    "mode=${mode}" \
    "loop_status=${loop_status}" \
    "loop_summary=${loop_summary}" \
    "loop_next_action=${loop_next_action}" \
    "loop_verify_command=${loop_verify_command}" \
    "loop_verify_result=${loop_verify_result}" \
    "loop_commit=${loop_commit}" \
    "before_head=${before_head}" \
    "after_head=${after_head}"

  echo "[$iteration/$iterations] ${loop_status}: ${loop_summary}"

  if [[ -n "${loop_commit}" ]] && [[ "${loop_commit}" != "none" ]] && [[ -n "${after_head}" ]] && [[ "${loop_commit}" != "${after_head}" ]]; then
    echo "[$iteration/$iterations] Warning: reported commit ${loop_commit} does not match HEAD ${after_head}" >&2
  fi

  if [[ "${loop_status}" == "TASK_DONE" ]]; then
    echo "[$iteration/$iterations] Task complete. Stop here and start the next fresh conversation from the updated docs."
    break
  fi

  if [[ "${loop_status}" == "BLOCKED" ]]; then
    echo "[$iteration/$iterations] Blocked. Stop here and inspect the blocker before starting another conversation."
    break
  fi
done
