#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
. "${SCRIPT_DIR}/lib/codex_cli.sh"
VISIBLE_LAUNCH_HEARTBEAT_SECONDS="${RALPH_VISIBLE_LAUNCH_HEARTBEAT_SECONDS:-15}"
RALPH_ITERATION_CLEANUP="${RALPH_ITERATION_CLEANUP:-1}"
RALPH_KILL_ALL_CHROME_ON_ITERATION_CLEANUP="${RALPH_KILL_ALL_CHROME_ON_ITERATION_CLEANUP:-1}"

resolve_ralph_python_bin() {
  local configured_bin="${RALPH_PYTHON_BIN:-}"
  local candidate=""

  if [[ -n "${configured_bin}" ]]; then
    if [[ -x "${configured_bin}" ]]; then
      printf '%s\n' "${configured_bin}"
      return 0
    fi
    if command -v "${configured_bin}" >/dev/null 2>&1; then
      command -v "${configured_bin}"
      return 0
    fi
    echo "Configured RALPH_PYTHON_BIN is not executable: ${configured_bin}" >&2
    exit 1
  fi

  for candidate in python3 python; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      command -v "${candidate}"
      return 0
    fi
  done

  if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
    printf '%s\n' "${ROOT_DIR}/.venv/bin/python"
    return 0
  fi

  echo "Could not resolve a Python interpreter for Ralph. Set RALPH_PYTHON_BIN or ensure python3 is on PATH." >&2
  return 1
}

RALPH_PYTHON_BIN="$(resolve_ralph_python_bin)"

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
  LOOP_STATUS: SUBTASK_DONE|TASK_DONE|BLOCKED|REPLAN_REQUIRED
  LOOP_SUMMARY: ...
  LOOP_NEXT_ACTION: ...
  LOOP_VERIFY_COMMAND: ...
  LOOP_VERIFY_RESULT: pass|fail|not_run|blocked|deferred_visual_gate
  LOOP_RECOVERY: none|restart_worktree_lifecycle|retry_next_iteration
  LOOP_COMMIT: ...
  LOOP_TERMINAL_MARKER: none|task_done|replan_required

Options:
  --config-file PATH         Loop config markdown file. Default: ./RALPH.md
  --prompt-file PATH         Prompt template for session starts.
  --followup-prompt-file PATH
                             Prompt template for resumed sessions.
                             Defaults to --prompt-file.
  --plan-file PATH           Override the plan file from the config.
  --handoff-file PATH        Override the handoff file from the config.
  --history-file PATH        Override the append-only history file from the config.
  --log-file PATH            Deprecated alias for --history-file.
  --verify-command CMD       Verification guidance injected into the prompt.
  --post-iteration-command CMD
                             Shell command to run after a successful iteration.
                             Runs in --workdir.
  --pre-session-command CMD  Shell command to run before each fresh session
                             batch starts. Runs in --workdir.
  --stop-on-pre-session-exit-code N
                             Stop the loop cleanly if the pre-session command
                             exits with code N.
  --iterations N|until_done  Total loop iterations, or run until TASK_DONE,
                             REPLAN_REQUIRED, or a non-recoverable BLOCKED
                             state.
                             Default: config or until_done
  --new-session-every N      Start a fresh Codex session every N iterations.
                             Default: config or 1
  --progress-review-every N  Run a separate Codex progress review after every
                             N successful iterations. 0 disables the review.
                             Default: config or 10
  --codex-inactivity-timeout-seconds N
                             Kill and retry a Codex iteration after N seconds
                             without transcript activity. 0 disables the
                             watchdog. Default: config or 1800
  --inactivity-timeout-seconds N
                             Deprecated alias for
                             --codex-inactivity-timeout-seconds
  --watchdog-interval-seconds N
                             Deprecated no-op compatibility flag
  --output-dir PATH          Directory for run logs and responses.
                             Default: mktemp dir
  --workdir PATH             Working directory passed to `codex exec --cd`.
                             Default: config or repo root
  --worktree-lifecycle MODE  Per-iteration lifecycle for this worktree:
                             none|kill|ai|aireset|restart-ai|restart-aireset
  --main-lifecycle MODE      Read-only reference lifecycle for main:
                             none|kill|ai|aireset|restart-ai|restart-aireset
  --terminal-mode MODE       Visible launch mode for Ralph and lifecycle:
                             auto|background|tmux|cmux|terminal
  --model NAME               Optional model override passed to `codex exec`
  --headed-browser           Opt into headed browser instances for CDP and
                             Playwright launched inside the loop.
                             Default: headless
  --yolo                     Run with `--dangerously-bypass-approvals-and-sandbox`
  --no-yolo                  Disable the default/configured yolo mode
  --stop-on-error            Exit immediately after a failed iteration
  --print-prompt             Render the resolved start prompt and exit
  --help                     Show this help text

Examples:
  ./__PROGRAM_NAME__ --iterations 3
  ./__PROGRAM_NAME__ --iterations until_done
  ./__PROGRAM_NAME__ --config-file ./RALPH.md --output-dir ./tmp/ralph-loop
  ./__PROGRAM_NAME__ --terminal-mode cmux --worktree-lifecycle restart-aireset
  ./__PROGRAM_NAME__ --terminal-mode terminal --worktree-lifecycle restart-aireset
  ./__PROGRAM_NAME__ --main-lifecycle restart-ai
  ./__PROGRAM_NAME__ --headed-browser --main-lifecycle restart-ai
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

flag_enabled() {
  local raw_value="${1:-}"
  case "$(printf '%s' "${raw_value}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

normalize_iterations_value() {
  local raw_value="${1:-}"
  local normalized=""

  normalized="$(printf '%s' "${raw_value}" | tr '[:upper:]' '[:lower:]')"
  case "${normalized}" in
    until_done|until-done|infinite|unbounded|forever)
      printf 'until_done\n'
      ;;
    *)
      printf '%s\n' "${raw_value}"
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

codex_config_override_value() {
  local target="$1"
  shift || true
  local arg=""
  local override=""
  local value=""

  while [[ $# -gt 0 ]]; do
    arg="$1"
    shift
    if [[ "${arg}" == "--config" ]] && [[ $# -gt 0 ]]; then
      value="$1"
      shift
      case "${value}" in
        "${target}"=*)
          override="${value#*=}"
          ;;
      esac
    fi
  done

  if [[ -n "${override}" ]]; then
    strip_wrapping_quotes "$(trim_value "${override}")"
  fi
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

sanitize_single_line() {
  local value="$1"
  value="${value//$'\r'/ }"
  value="${value//$'\n'/ }"
  printf '%s\n' "${value}"
}

file_contains_exact_line() {
  local file_path="$1"
  local expected_line="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 1
  fi

  grep -Fx -- "${expected_line}" "${file_path}" >/dev/null 2>&1
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

terminate_process_tree() {
  local target_pid="$1"
  local signal_name="${2:-TERM}"
  local child_pid=""

  if ! kill -0 "${target_pid}" >/dev/null 2>&1; then
    return 0
  fi

  while IFS= read -r child_pid; do
    if [[ -n "${child_pid}" ]]; then
      terminate_process_tree "${child_pid}" "${signal_name}"
    fi
  done < <(pgrep -P "${target_pid}" 2>/dev/null || true)

  kill "-${signal_name}" "${target_pid}" >/dev/null 2>&1 || true
}

wait_for_process_exit() {
  local target_pid="$1"
  local timeout_seconds="$2"
  local start_ts=""
  local elapsed_seconds=""

  start_ts="$(date +%s)"
  while kill -0 "${target_pid}" >/dev/null 2>&1; do
    elapsed_seconds="$(( $(date +%s) - start_ts ))"
    if [[ "${elapsed_seconds}" -ge "${timeout_seconds}" ]]; then
      return 1
    fi
    sleep 1
  done

  return 0
}

CODEX_WATCHDOG_TIMED_OUT="0"
CODEX_WATCHDOG_LAST_ACTIVITY_EPOCH=""
CODEX_RUNTIME_WATCHDOG_FAILED="0"
CODEX_RUNTIME_WATCHDOG_TARGET=""
CODEX_RUNTIME_WATCHDOG_REASON=""
main_runtime_pid_path=""

runtime_pid_from_file() {
  local pid_path="$1"
  local pid=""

  [[ -f "${pid_path}" ]] || return 1
  pid="$(tr -d '[:space:]' < "${pid_path}")"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "${pid}"
}

main_runtime_failed_unexpectedly() {
  local pid=""
  local session_state=""

  [[ -n "${main_worktree_root:-}" ]] || return 1
  [[ -n "${main_lifecycle:-}" ]] || return 1
  [[ "${main_lifecycle}" != "none" ]] || return 1
  [[ -n "${main_runtime_pid_path:-}" ]] || return 1

  if ! pid="$(runtime_pid_from_file "${main_runtime_pid_path}" 2>/dev/null)"; then
    return 1
  fi

  if kill -0 "${pid}" >/dev/null 2>&1; then
    return 1
  fi

  session_state="$(workspace_session_state "${main_worktree_root}")"
  if [[ "${session_state}" == "running" ]]; then
    return 1
  fi

  CODEX_RUNTIME_WATCHDOG_TARGET="main"
  CODEX_RUNTIME_WATCHDOG_REASON="main_reference_runtime_exited"
  return 0
}

run_codex_iteration() {
  local prompt_path="$1"
  local transcript_path="$2"
  local response_path="$3"
  local inactivity_timeout_seconds="$4"
  local codex_bin="${SETTA_CODEX_BIN:-codex}"
  local pipe_path="${transcript_path}.pipe"
  local tee_pid=""
  local codex_pid=""
  local exit_code="0"
  local poll_seconds="30"
  local restore_errexit="0"
  local start_ts=""
  local now_ts=""
  local last_activity_epoch=""

  CODEX_WATCHDOG_TIMED_OUT="0"
  CODEX_WATCHDOG_LAST_ACTIVITY_EPOCH=""
  CODEX_RUNTIME_WATCHDOG_FAILED="0"
  CODEX_RUNTIME_WATCHDOG_TARGET=""
  CODEX_RUNTIME_WATCHDOG_REASON=""

  rm -f "${pipe_path}"
  mkfifo "${pipe_path}"
  tee "${transcript_path}" < "${pipe_path}" &
  tee_pid="$!"

  start_ts="$(date +%s)"
  "${codex_bin}" "${codex_args[@]}" < "${prompt_path}" > "${pipe_path}" 2>&1 &
  codex_pid="$!"

  if [[ "${inactivity_timeout_seconds}" -gt 0 ]]; then
    poll_seconds="$(( inactivity_timeout_seconds / 6 ))"
    if [[ "${poll_seconds}" -lt 1 ]]; then
      poll_seconds="1"
    elif [[ "${poll_seconds}" -gt 30 ]]; then
      poll_seconds="30"
    fi
  fi

  while kill -0 "${codex_pid}" >/dev/null 2>&1; do
    sleep "${poll_seconds}"

    if ! kill -0 "${codex_pid}" >/dev/null 2>&1; then
      break
    fi

    if main_runtime_failed_unexpectedly; then
      CODEX_RUNTIME_WATCHDOG_FAILED="1"
      printf '%s\n' "[watchdog] ${CODEX_RUNTIME_WATCHDOG_TARGET} runtime failed (${CODEX_RUNTIME_WATCHDOG_REASON}). Terminating iteration for a fresh outer-loop bootstrap." \
        | tee -a "${transcript_path}"
      terminate_process_tree "${codex_pid}" "TERM"
      if ! wait_for_process_exit "${codex_pid}" "10"; then
        terminate_process_tree "${codex_pid}" "KILL"
        wait_for_process_exit "${codex_pid}" "5" || true
      fi
      break
    fi

    if [[ "${inactivity_timeout_seconds}" -le 0 ]]; then
      continue
    fi

    now_ts="$(date +%s)"
    last_activity_epoch="$(latest_activity_epoch "${start_ts}" "${transcript_path}" "${response_path}")"
    if [[ $(( now_ts - last_activity_epoch )) -lt "${inactivity_timeout_seconds}" ]]; then
      continue
    fi

    CODEX_WATCHDOG_TIMED_OUT="1"
    CODEX_WATCHDOG_LAST_ACTIVITY_EPOCH="${last_activity_epoch}"
    printf '%s\n' "[watchdog] No Codex transcript activity for ${inactivity_timeout_seconds}s. Terminating stalled iteration." \
      | tee -a "${transcript_path}"
    terminate_process_tree "${codex_pid}" "TERM"
    if ! wait_for_process_exit "${codex_pid}" "10"; then
      terminate_process_tree "${codex_pid}" "KILL"
      wait_for_process_exit "${codex_pid}" "5" || true
    fi
    break
  done

  if [[ $- == *e* ]]; then
    restore_errexit="1"
    set +e
  fi
  wait "${codex_pid}"
  exit_code="$?"
  wait "${tee_pid}"
  if [[ "${restore_errexit}" == "1" ]]; then
    set -e
  fi

  rm -f "${pipe_path}"

  if [[ "${CODEX_RUNTIME_WATCHDOG_FAILED}" == "1" ]]; then
    return 125
  fi

  if [[ "${CODEX_WATCHDOG_TIMED_OUT}" == "1" ]]; then
    return 124
  fi

  return "${exit_code}"
}

shell_join_args() {
  local joined=""
  local arg=""
  for arg in "$@"; do
    if [[ -n "${joined}" ]]; then
      joined+=" "
    fi
    joined+="$(printf '%q' "${arg}")"
  done
  printf '%s\n' "${joined}"
}

ensure_pnpm_command_shim_dir() {
  local run_dir="$1"
  local shim_dir="${run_dir}/tool-shims"
  local shim_path="${shim_dir}/pnpm"

  mkdir -p "${shim_dir}"
  if [[ ! -x "${shim_path}" ]]; then
    cat > "${shim_path}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec corepack pnpm "$@"
EOF
    chmod +x "${shim_path}"
  fi

  printf '%s\n' "${shim_dir}"
}

build_node_tooling_bootstrap_prefix() {
  local target_root="$1"
  local run_dir="$2"
  local helper_path="${SCRIPT_DIR}/lib/node_tooling.sh"
  local helper_path_quoted=""
  local pnpm_shim_dir=""
  local pnpm_shim_dir_quoted=""
  local target_root_quoted=""

  if [[ ! -f "${helper_path}" ]]; then
    return 0
  fi

  helper_path_quoted="$(printf '%q' "${helper_path}")"
  pnpm_shim_dir="$(ensure_pnpm_command_shim_dir "${run_dir}")"
  pnpm_shim_dir_quoted="$(printf '%q' "${pnpm_shim_dir}")"
  target_root_quoted="$(printf '%q' "${target_root}")"
  printf '. %s && setta_ensure_node_tooling_on_path %s && if ! command -v pnpm >/dev/null 2>&1; then if command -v corepack >/dev/null 2>&1; then export PATH=%s:$PATH; else echo "pnpm not found on PATH after node tooling bootstrap." >&2; exit 1; fi; fi && ' \
    "${helper_path_quoted}" \
    "${target_root_quoted}" \
    "${pnpm_shim_dir_quoted}"
}

resolve_target_relative_path() {
  local target_root="$1"
  local raw_path="$2"

  "${RALPH_PYTHON_BIN}" - "${target_root}" "${raw_path}" <<'PY'
import os
import sys

target_root = sys.argv[1]
raw_path = sys.argv[2]
expanded = os.path.expandvars(os.path.expanduser(raw_path))
if os.path.isabs(expanded):
    print(os.path.realpath(expanded))
else:
    print(os.path.realpath(os.path.join(target_root, expanded)))
PY
}

workspace_setta_status_env_args=()

build_workspace_setta_status_env_args() {
  local target_root="$1"
  local target_root_real=""
  local default_setta_home=""

  workspace_setta_status_env_args=()
  target_root_real="$(cd "${target_root}" && pwd -P 2>/dev/null || printf '%s' "${target_root}")"

  if [[ -n "${SETTA_FILES_ROOT:-}" ]] && [[ -n "${SETTA_FILES_LOCATION:-}" ]]; then
    return 1
  fi

  if [[ -n "${SETTA_HOME:-}" ]]; then
    workspace_setta_status_env_args+=(
      "SETTA_HOME=$(resolve_target_relative_path "${target_root_real}" "${SETTA_HOME}")"
    )
  elif [[ -n "${SETTA_FILES_LOCATION:-}" || -n "${SETTA_PROFILE:-}" ]]; then
    if [[ -n "${HOME:-}" ]]; then
      default_setta_home="${HOME}/.setta-development"
      workspace_setta_status_env_args+=(
        "SETTA_HOME=$(resolve_target_relative_path "${target_root_real}" "${default_setta_home}")"
      )
    fi
  fi

  if [[ -n "${SETTA_PROFILE:-}" ]]; then
    workspace_setta_status_env_args+=("SETTA_PROFILE=${SETTA_PROFILE}")
  fi

  if [[ -n "${SETTA_RUNTIME_ROOT:-}" ]]; then
    workspace_setta_status_env_args+=(
      "SETTA_RUNTIME_ROOT=$(resolve_target_relative_path "${target_root_real}" "${SETTA_RUNTIME_ROOT}")"
    )
  fi

  if [[ -n "${SETTA_FILES_ROOT:-}" ]]; then
    workspace_setta_status_env_args+=(
      "SETTA_FILES_ROOT=$(resolve_target_relative_path "${target_root_real}" "${SETTA_FILES_ROOT}")"
    )
    return 0
  fi

  if [[ -n "${SETTA_FILES_LOCATION:-}" ]]; then
    workspace_setta_status_env_args+=("SETTA_FILES_LOCATION=${SETTA_FILES_LOCATION}")
    return 0
  fi

  workspace_setta_status_env_args+=(
    "SETTA_FILES_ROOT=${target_root_real}/setta_files_dev"
  )
}

workspace_setta_status_command() {
  local target_root="$1"
  shift
  local command_parts=()

  build_workspace_setta_status_env_args "${target_root}" || return 1

  if [[ ${#workspace_setta_status_env_args[@]} -gt 0 ]]; then
    command_parts+=(env "${workspace_setta_status_env_args[@]}")
  fi
  command_parts+=(setta status "$@")
  shell_join_args "${command_parts[@]}"
}

ai_script_supports_browser_mode_flag() {
  local ai_script="$1"
  local ai_dir=""
  local nested_ai_script=""

  [[ -f "${ai_script}" ]] || return 1
  if grep -Fq -- "--browser-mode" "${ai_script}"; then
    return 0
  fi

  ai_dir="$(cd "$(dirname "${ai_script}")" && pwd)"
  nested_ai_script="${ai_dir}/scripts/ai.sh"
  [[ -f "${nested_ai_script}" ]] || return 1
  grep -Fq -- "--browser-mode" "${nested_ai_script}"
}

ensure_ralph_headless_chrome_wrapper() {
  local run_dir="$1"
  local wrapper_path="${run_dir}/ralph-headless-chrome.sh"

  if [[ -x "${wrapper_path}" ]]; then
    printf '%s\n' "${wrapper_path}"
    return 0
  fi

  cat > "${wrapper_path}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

resolve_ralph_real_chrome_bin() {
  local candidate="${RALPH_REAL_CHROME_BIN:-}"
  if [[ -n "${candidate}" ]] && [[ -x "${candidate}" ]] && [[ "${candidate}" != "$0" ]]; then
    printf '%s\n' "${candidate}"
    return 0
  fi

  candidate="${CHROME_BIN:-}"
  if [[ -n "${candidate}" ]] && [[ -x "${candidate}" ]] && [[ "${candidate}" != "$0" ]]; then
    printf '%s\n' "${candidate}"
    return 0
  fi

  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
      printf '%s\n' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      return 0
    fi
    if [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
      printf '%s\n' "/Applications/Chromium.app/Contents/MacOS/Chromium"
      return 0
    fi
  fi

  candidate="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
  if [[ -n "${candidate}" ]]; then
    printf '%s\n' "${candidate}"
    return 0
  fi

  return 1
}

REAL_CHROME_BIN="$(resolve_ralph_real_chrome_bin || true)"
if [[ -z "${REAL_CHROME_BIN}" ]]; then
  echo "Could not resolve a Chrome/Chromium binary for Ralph headless lifecycle launches." >&2
  exit 1
fi

exec "${REAL_CHROME_BIN}" "$@" --headless
EOF

  chmod +x "${wrapper_path}"
  printf '%s\n' "${wrapper_path}"
}

extract_cmux_ref() {
  local payload="$1"
  local ref_prefix="$2"
  local ref=""

  ref="$(printf '%s\n' "${payload}" | sed -nE "s/.*(${ref_prefix}:[0-9]+).*/\\1/p" | head -n1)"
  if [[ -z "${ref}" ]]; then
    echo "Unable to parse ${ref_prefix} ref from cmux output: ${payload}" >&2
    return 1
  fi

  printf '%s\n' "${ref}"
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

repo_looks_like_setta() {
  [[ -d "${ROOT_DIR}/backend/setta" ]] && [[ -x "${ROOT_DIR}/scripts/dev-runtime-info.sh" ]]
}

resolve_repo_adapter() {
  local requested_adapter="$1"

  case "${requested_adapter}" in
    auto|'')
      if repo_looks_like_setta; then
        printf 'setta\n'
      else
        printf 'generic\n'
      fi
      ;;
    setta|generic)
      printf '%s\n' "${requested_adapter}"
      ;;
    *)
      echo "Unsupported repo_adapter value: ${requested_adapter}" >&2
      exit 1
      ;;
  esac
}

repo_uses_setta_adapter() {
  [[ "${repo_adapter:-generic}" == "setta" ]]
}

repo_looks_like_setta() {
  [[ -d "${ROOT_DIR}/backend/setta" ]] && [[ -x "${ROOT_DIR}/scripts/dev-runtime-info.sh" ]]
}

resolve_repo_adapter() {
  local requested_adapter="$1"

  case "${requested_adapter}" in
    auto|'')
      if repo_looks_like_setta; then
        printf 'setta\n'
      else
        printf 'generic\n'
      fi
      ;;
    setta|generic)
      printf '%s\n' "${requested_adapter}"
      ;;
    *)
      echo "Unsupported repo_adapter value: ${requested_adapter}" >&2
      exit 1
      ;;
  esac
}

repo_uses_setta_adapter() {
  [[ "${repo_adapter:-generic}" == "setta" ]]
}

workspace_setta_status_payload() {
  local target_root="$1"
  local status_payload=""
  local status_command=()

  repo_uses_setta_adapter || return 1

  if [[ -f "${target_root}/activate.sh" ]]; then
    # shellcheck disable=SC1090
    source "${target_root}/activate.sh"
  fi

  if ! command -v setta >/dev/null 2>&1; then
    return 1
  fi

  build_workspace_setta_status_env_args "${target_root}" || return 1
  status_command=(setta status --list-sessions --json --workspace "${target_root}" --server-mode ide)
  if [[ ${#workspace_setta_status_env_args[@]} -gt 0 ]]; then
    status_command=(env "${workspace_setta_status_env_args[@]}" "${status_command[@]}")
  fi

  status_payload="$(
    "${status_command[@]}" 2>/dev/null || true
  )"
  if [[ "${status_payload}" != __SETTA_JSON_B64__* ]]; then
    return 1
  fi

  printf '%s\n' "${status_payload}"
}

workspace_has_live_setta_session() {
  local target_root="$1"
  local status_payload=""

  repo_uses_setta_adapter || return 1

  if ! status_payload="$(workspace_setta_status_payload "${target_root}")"; then
    return 1
  fi

  "${RALPH_PYTHON_BIN}" - "${status_payload}" <<'PY'
import base64
import json
import sys

prefix = "__SETTA_JSON_B64__"
raw_payload = sys.argv[1]
if not raw_payload.startswith(prefix):
    raise SystemExit(1)

try:
    payload = json.loads(base64.b64decode(raw_payload[len(prefix) :]).decode("utf-8"))
except Exception:
    raise SystemExit(1)

sessions = payload.get("sessions")
if not isinstance(sessions, list) or not sessions:
    raise SystemExit(1)
PY
}

workspace_session_state() {
  local target_root="$1"
  if ! repo_uses_setta_adapter; then
    printf 'unknown\n'
    return 0
  fi
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
    cmux)
      if command -v cmux >/dev/null 2>&1 && [[ -n "${CMUX_WORKSPACE_ID:-}" ]]; then
        printf 'cmux\n'
        return 0
      fi
      echo "Requested terminal mode cmux, but this shell is not running inside cmux." >&2
      exit 1
      ;;
    tmux)
      if command -v tmux >/dev/null 2>&1 && [[ -n "${TMUX:-}" ]]; then
        printf 'tmux\n'
        return 0
      fi
      echo "Requested terminal mode tmux, but tmux is not available in this shell." >&2
      exit 1
      ;;
    terminal)
      if [[ "${OSTYPE:-}" == darwin* ]] && command -v osascript >/dev/null 2>&1 \
        && osascript -e 'id of application "Terminal"' >/dev/null 2>&1; then
        printf 'terminal\n'
        return 0
      fi
      echo "Requested terminal mode terminal, but macOS Terminal automation is unavailable." >&2
      exit 1
      ;;
    auto|'')
      if command -v cmux >/dev/null 2>&1 && [[ -n "${CMUX_WORKSPACE_ID:-}" ]]; then
        printf 'cmux\n'
      elif command -v tmux >/dev/null 2>&1 && [[ -n "${TMUX:-}" ]]; then
        printf 'tmux\n'
      elif [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]] \
        && [[ "${OSTYPE:-}" == darwin* ]] \
        && command -v osascript >/dev/null 2>&1 \
        && osascript -e 'id of application "Terminal"' >/dev/null 2>&1; then
        printf 'terminal\n'
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

launch_session_name() {
  local target_name="$1"
  local target_root="$2"
  local label="$3"
  local suffix=""
  suffix="$(basename "${target_root}")"
  printf 'ralph-%s-%s-%s\n' "${target_name}" "${suffix}" "${label}"
}

build_logged_shell_script() {
  local target_root="$1"
  local session_name="$2"
  local command_body="$3"
  local log_path="$4"
  local script_path="$5"
  local status_file="${6:-}"
  local close_on_exit="${7:-0}"
  local shell_path=""
  local target_root_quoted=""
  local log_path_quoted=""
  local shell_path_quoted=""
  local session_name_quoted=""
  local script_dir=""
  local status_file_quoted=""

  shell_path="${SHELL:-/bin/zsh}"
  target_root_quoted="$(printf '%q' "${target_root}")"
  log_path_quoted="$(printf '%q' "${log_path}")"
  shell_path_quoted="$(printf '%q' "${shell_path}")"
  session_name_quoted="$(printf '%q' "${session_name}")"
  script_dir="$(dirname "${script_path}")"

  mkdir -p "${script_dir}"
  cat > "${script_path}" <<EOF
#!/usr/bin/env bash
set -uo pipefail

printf '\\033]0;%s\\007' ${session_name_quoted}
cd ${target_root_quoted}

set +e
( ${command_body} ) 2>&1 | tee ${log_path_quoted}
exit_code=\${PIPESTATUS[0]}
set -e
EOF

  if [[ -n "${status_file}" ]]; then
    status_file_quoted="$(printf '%q' "${status_file}")"
    cat >> "${script_path}" <<EOF
printf '%s\n' "\${exit_code}" > ${status_file_quoted}
EOF
  fi

  if [[ "${close_on_exit}" == "1" ]]; then
    cat >> "${script_path}" <<'EOF'

if [[ -n "${TMUX:-}" ]] && command -v tmux >/dev/null 2>&1; then
  current_window_id="$(tmux display-message -p '#{window_id}' 2>/dev/null || true)"
  if [[ -n "${current_window_id}" ]]; then
    (
      sleep 1
      tmux kill-window -t "${current_window_id}" >/dev/null 2>&1 || true
    ) >/dev/null 2>&1 &
  fi
  exit "${exit_code}"
fi

if [[ -n "${CMUX_SURFACE_ID:-}" ]] && [[ -n "${CMUX_WORKSPACE_ID:-}" ]] \
  && command -v cmux >/dev/null 2>&1; then
  (
    sleep 1
    cmux close-surface --workspace "${CMUX_WORKSPACE_ID}" --surface "${CMUX_SURFACE_ID}" >/dev/null 2>&1 || true
  ) >/dev/null 2>&1 &
  exit "${exit_code}"
fi

if [[ "${OSTYPE:-}" == darwin* ]] && command -v osascript >/dev/null 2>&1; then
  current_tty="$(tty 2>/dev/null || true)"
  if [[ -n "${current_tty}" ]] && [[ "${current_tty}" != "not a tty" ]]; then
    (
      sleep 1
      osascript - "${current_tty}" <<'APPLESCRIPT' >/dev/null 2>&1
on run argv
  set targetTty to item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        try
          if tty of t is targetTty then
            if (count of tabs of w) > 1 then
              close t
            else
              close w
            end if
            return
          end if
        end try
      end repeat
    end repeat
  end tell
end run
APPLESCRIPT
    ) >/dev/null 2>&1 &
  fi
  exit "${exit_code}"
fi

exit "${exit_code}"
EOF
  fi

  cat >> "${script_path}" <<EOF
echo
echo '[ralph] ${session_name} exited with code' "\${exit_code}"
exec ${shell_path_quoted} -l
EOF

  chmod +x "${script_path}"
  printf '%s\n' "${script_path}"
}

start_command_in_tmux_window() {
  local target_name="$1"
  local target_root="$2"
  local label="$3"
  local command_display="$4"
  local command_body="$5"
  local run_dir="$6"
  local status_file="${7:-}"
  local session_name=""
  local log_path=""
  local launch_script=""
  local close_on_exit="${8:-0}"

  if ! command -v tmux >/dev/null 2>&1 || [[ -z "${TMUX:-}" ]]; then
    echo "tmux window launch requested, but tmux is unavailable in this shell." >&2
    return 1
  fi

  session_name="$(launch_session_name "${target_name}" "${target_root}" "${label}")"
  log_path="${run_dir}/${target_name}-${label}.log"
  launch_script="$(build_logged_shell_script "${target_root}" "${session_name}" "${command_body}" "${log_path}" "${run_dir}/${target_name}-${label}-launch.sh" "${status_file}" "${close_on_exit}")"

  echo "[bootstrap] ${target_name}: opening tmux window ${session_name} for ${command_display}"
  tmux new-window -n "${session_name}" "$(shell_join_args "${launch_script}")"
}

start_command_in_cmux_surface() {
  local target_name="$1"
  local target_root="$2"
  local label="$3"
  local command_display="$4"
  local command_body="$5"
  local run_dir="$6"
  local status_file="${7:-}"
  local session_name=""
  local log_path=""
  local launch_script=""
  local surface_ref=""
  local surface_output=""
  local close_on_exit="${8:-0}"

  if ! command -v cmux >/dev/null 2>&1 || [[ -z "${CMUX_WORKSPACE_ID:-}" ]]; then
    echo "cmux launch requested, but this shell is not running inside cmux." >&2
    return 1
  fi

  session_name="$(launch_session_name "${target_name}" "${target_root}" "${label}")"
  log_path="${run_dir}/${target_name}-${label}.log"
  launch_script="$(build_logged_shell_script "${target_root}" "${session_name}" "${command_body}" "${log_path}" "${run_dir}/${target_name}-${label}-launch.sh" "${status_file}" "${close_on_exit}")"

  echo "[bootstrap] ${target_name}: opening cmux tab ${session_name} for ${command_display}"
  if ! surface_output="$(cmux new-surface --type terminal --workspace "${CMUX_WORKSPACE_ID}")"; then
    echo "Failed to create a new cmux terminal tab for ${session_name}" >&2
    return 1
  fi

  if ! surface_ref="$(extract_cmux_ref "${surface_output}" "surface")"; then
    echo "Failed to create a new cmux terminal tab for ${session_name}" >&2
    return 1
  fi

  cmux rename-tab --workspace "${CMUX_WORKSPACE_ID}" --surface "${surface_ref}" "${session_name}" >/dev/null 2>&1 || true
  sleep 1
  if ! cmux send --workspace "${CMUX_WORKSPACE_ID}" --surface "${surface_ref}" "$(shell_join_args "${launch_script}")" >/dev/null 2>&1; then
    echo "Failed to send launch command to cmux tab ${session_name}" >&2
    return 1
  fi
  if ! cmux send-key --workspace "${CMUX_WORKSPACE_ID}" --surface "${surface_ref}" Enter >/dev/null 2>&1; then
    echo "Failed to send Enter to cmux tab ${session_name}" >&2
    return 1
  fi
}

start_command_in_terminal_window() {
  local target_name="$1"
  local target_root="$2"
  local label="$3"
  local command_display="$4"
  local command_body="$5"
  local run_dir="$6"
  local status_file="${7:-}"
  local session_name=""
  local log_path=""
  local launch_script=""
  local close_on_exit="${8:-0}"

  if [[ "${OSTYPE:-}" != darwin* ]] || ! command -v osascript >/dev/null 2>&1; then
    echo "macOS Terminal launch requested, but AppleScript automation is unavailable." >&2
    return 1
  fi

  session_name="$(launch_session_name "${target_name}" "${target_root}" "${label}")"
  log_path="${run_dir}/${target_name}-${label}.log"
  launch_script="$(build_logged_shell_script "${target_root}" "${session_name}" "${command_body}" "${log_path}" "${run_dir}/${target_name}-${label}-launch.sh" "${status_file}" "${close_on_exit}")"

  echo "[bootstrap] ${target_name}: opening Terminal window ${session_name} for ${command_display}"
  osascript - "$(shell_join_args "${launch_script}")" <<'EOF' >/dev/null
on run argv
tell application "Terminal"
  activate
  do script (item 1 of argv)
  end tell
end run
EOF
}

wait_for_launch_heartbeat() {
  local log_path="$1"
  local status_file="$2"
  local timeout_seconds="$3"
  local start_ts=""
  local elapsed=""

  start_ts="$(date +%s)"
  while true; do
    if [[ -f "${log_path}" ]]; then
      return 0
    fi
    if [[ -n "${status_file}" ]] && [[ -f "${status_file}" ]]; then
      return 0
    fi

    elapsed="$(( $(date +%s) - start_ts ))"
    if [[ "${elapsed}" -ge "${timeout_seconds}" ]]; then
      return 1
    fi

    sleep 1
  done
}

start_command_in_background() {
  local target_name="$1"
  local target_root="$2"
  local label="$3"
  local command_display="$4"
  local command_body="$5"
  local run_dir="$6"
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
    echo "Background startup failed for ${target_name} via ${command_display}" >&2
    if [[ -f "${log_path}" ]]; then
      echo "Last log lines from ${log_path}:" >&2
      tail -n 40 "${log_path}" >&2 || true
    fi
    return 1
  fi
}

start_command_in_visible_terminal() {
  local resolved_mode="$1"
  local target_name="$2"
  local target_root="$3"
  local label="$4"
  local command_display="$5"
  local command_body="$6"
  local run_dir="$7"
  local status_file="${8:-}"
  local close_on_exit="${9:-0}"

  case "${resolved_mode}" in
    tmux)
      start_command_in_tmux_window "${target_name}" "${target_root}" "${label}" "${command_display}" "${command_body}" "${run_dir}" "${status_file}" "${close_on_exit}"
      ;;
    cmux)
      start_command_in_cmux_surface "${target_name}" "${target_root}" "${label}" "${command_display}" "${command_body}" "${run_dir}" "${status_file}" "${close_on_exit}"
      ;;
    terminal)
      start_command_in_terminal_window "${target_name}" "${target_root}" "${label}" "${command_display}" "${command_body}" "${run_dir}" "${status_file}" "${close_on_exit}"
      ;;
    *)
      echo "Unsupported visible terminal mode: ${resolved_mode}" >&2
      return 1
      ;;
  esac
}

wait_for_workspace_session_state() {
  local target_name="$1"
  local target_root="$2"
  local expected_state="$3"
  local timeout_seconds="$4"
  local run_dir="$5"
  local label="$6"
  local start_ts=""
  local elapsed=""
  local current_state=""
  local log_path="${run_dir}/${target_name}-${label}.log"

  start_ts="$(date +%s)"
  while true; do
    current_state="$(workspace_session_state "${target_root}")"
    if [[ "${current_state}" == "unknown" ]]; then
      echo "[bootstrap] ${target_name}: no session-state probe configured; continuing without waiting for ${expected_state}"
      return 0
    fi
    if [[ "${current_state}" == "${expected_state}" ]]; then
      echo "[bootstrap] ${target_name}: session state ${expected_state}"
      return 0
    fi

    elapsed="$(( $(date +%s) - start_ts ))"
    if [[ "${elapsed}" -ge "${timeout_seconds}" ]]; then
      echo "Timed out waiting for ${target_name} session state ${expected_state} at ${target_root}" >&2
      if [[ -f "${log_path}" ]]; then
        echo "Last log lines from ${log_path}:" >&2
        tail -n 60 "${log_path}" >&2 || true
      fi
      return 1
    fi

    sleep 2
  done
}

wait_for_dev_stack_ready() {
  local target_name="$1"
  local target_root="$2"
  local log_path="$3"
  local timeout_seconds="$4"
  local start_ts=""
  local elapsed=""
  local observed_frontend_url=""
  local observed_backend_url=""
  local observed_bootstrap_url=""
  local runtime_info_assignments=""
  local frontend_url=""
  local backend_url=""
  local bootstrap_url=""
  local debug_port=""
  local runtime_log_path=""

  start_ts="$(date +%s)"
  while true; do
    observed_frontend_url="$(extract_frontend_url_from_log "${log_path}" || true)"
    observed_backend_url="$(extract_backend_url_from_log "${log_path}" || true)"
    observed_bootstrap_url="$(extract_bootstrap_url_from_log "${log_path}" || true)"

    runtime_info_assignments="$(runtime_info_shell_assignments "${target_root}" "${log_path}" 2>/dev/null || true)"
    if [[ -n "${runtime_info_assignments}" ]]; then
      frontend_url=""
      backend_url=""
      bootstrap_url=""
      debug_port=""
      runtime_log_path=""
      eval "${runtime_info_assignments}"
      if [[ -n "${frontend_url:-}" ]]; then
        observed_frontend_url="${frontend_url}"
      fi
      if [[ -n "${backend_url:-}" ]]; then
        observed_backend_url="${backend_url}"
      fi
      if [[ -n "${bootstrap_url:-}" ]]; then
        observed_bootstrap_url="${bootstrap_url}"
      fi
    fi

    if [[ -n "${observed_frontend_url}" ]] \
      && url_responds "${observed_frontend_url}" \
      && dev_stack_backend_responds "${observed_backend_url}" "${observed_bootstrap_url}"; then
      echo "[bootstrap] ${target_name}: dev stack ready"
      return 0
    fi

    if [[ -f "${log_path}" ]] \
      && grep -E -q "No matching export in |Failed to scan for dependencies from entries:|error when starting dev server:|Transform failed with [0-9]+ error|Build failed with [0-9]+ errors" "${log_path}"; then
      echo "Detected ${target_name} frontend compile blocker during bootstrap." >&2
      echo "Compile-blocker excerpt from ${log_path}:" >&2
      awk '
        /Failed to scan for dependencies from entries:/ {
          capture = 1
          count = 0
        }
        capture {
          print
          count++
          if (count >= 80) {
            exit
          }
        }
      ' "${log_path}" >&2
      return 86
    fi

    elapsed="$(( $(date +%s) - start_ts ))"
    if [[ "${elapsed}" -ge "${timeout_seconds}" ]]; then
      echo "Timed out waiting for ${target_name} dev stack readiness." >&2
      if [[ -n "${observed_frontend_url}" ]]; then
        echo "Last observed ${target_name} frontend url: ${observed_frontend_url}" >&2
      fi
      if [[ -n "${observed_backend_url}" ]]; then
        echo "Last observed ${target_name} backend url: ${observed_backend_url}" >&2
      fi
      if [[ -n "${observed_bootstrap_url}" ]]; then
        echo "Last observed ${target_name} bootstrap url: ${observed_bootstrap_url}" >&2
      fi
      if [[ -f "${log_path}" ]]; then
        echo "Last log lines from ${log_path}:" >&2
        tail -n 60 "${log_path}" >&2 || true
      fi
      return 1
    fi

    sleep 2
  done
}

extract_runtime_value_from_log() {
  local log_path="$1"
  local pattern="$2"
  local replacement="$3"

  if [[ ! -f "${log_path}" ]]; then
    return 1
  fi

  sed -nE "s~${pattern}~${replacement}~p" "${log_path}" | tail -n1
}

extract_frontend_url_from_log() {
  local log_path="$1"
  extract_runtime_value_from_log "${log_path}" '.*Local:[[:space:]]*(http:\/\/[^[:space:]]+).*$' '\1'
}

extract_backend_url_from_log() {
  local log_path="$1"
  local backend_url=""

  backend_url="$(extract_runtime_value_from_log "${log_path}" '.*Ready:[[:space:]]*(http:\/\/[^[:space:]]+).*$' '\1' || true)"
  if [[ -n "${backend_url}" ]]; then
    printf '%s\n' "${backend_url}"
    return 0
  fi

  extract_runtime_value_from_log "${log_path}" '.*Bind:[[:space:]]*([^[:space:]:]+):([0-9]+).*$' 'http://\1:\2'
}

extract_debug_port_from_log() {
  local log_path="$1"
  extract_runtime_value_from_log "${log_path}" '.*Starting Chrome with remote debugging on port ([0-9]+).*$' '\1'
}

extract_bootstrap_url_from_log() {
  local log_path="$1"

  if [[ ! -f "${log_path}" ]]; then
    return 1
  fi

  awk '
    /Bootstrap URL \(recommended\):/ {
      want_url = 1
      next
    }
    want_url {
      if (match($0, /http:\/\/[^[:space:]]+/)) {
        url = substr($0, RSTART, RLENGTH)
        want_url = 0
        next
      }
      if ($0 ~ /[^[:space:]]/) {
        want_url = 0
      }
    }
    END {
      if (url != "") {
        print url
        exit 0
      }
      exit 1
    }
  ' "${log_path}"
}

runtime_info_shell_assignments() {
  local target_root="$1"
  local runtime_log_path="${2:-}"
  local helper_path="${ROOT_DIR}/scripts/dev-runtime-info.sh"
  local helper_json=""
  local restore_errexit="0"

  repo_uses_setta_adapter || return 1
  [[ -x "${helper_path}" ]] || return 1

  if [[ $- == *e* ]]; then
    restore_errexit="1"
    set +e
  fi
  if [[ -n "${runtime_log_path}" ]]; then
    helper_json="$("${helper_path}" --workspace "${target_root}" --runtime-log "${runtime_log_path}" 2>/dev/null)"
  else
    helper_json="$("${helper_path}" --workspace "${target_root}" 2>/dev/null)"
  fi
  local helper_exit_code="$?"
  if [[ "${restore_errexit}" == "1" ]]; then
    set -e
  fi

  if [[ "${helper_exit_code}" -ne 0 || -z "${helper_json}" ]]; then
    return 1
  fi

  RUNTIME_INFO_JSON="${helper_json}" "${RALPH_PYTHON_BIN}" - <<'PY'
import json
import os
import shlex

data = json.loads(os.environ["RUNTIME_INFO_JSON"])
mapping = {
    "frontend_url": data.get("frontendUrl") or "",
    "backend_url": data.get("backendUrl") or "",
    "bootstrap_url": data.get("bootstrapUrl") or "",
    "debug_port": str(data.get("debugPort") or ""),
    "runtime_log_path": data.get("runtimeLogPath") or "",
}
for key, value in mapping.items():
    print(f"{key}={shlex.quote(value)}")
PY
}

connect_info_command_for_root() {
  local target_root="$1"
  local fallback_command=""

  if ! repo_uses_setta_adapter; then
    return 1
  fi

  fallback_command="setta status --connect-info --latest --json --workspace ${target_root}"
  workspace_setta_status_command "${target_root}" --connect-info --latest --json --workspace "${target_root}" \
    || printf '%s\n' "${fallback_command}"
}

runtime_info_command_for_root() {
  local target_root="$1"
  local runtime_log_path="${2:-}"

  if ! repo_uses_setta_adapter; then
    return 1
  fi

  if [[ -n "${runtime_log_path}" ]]; then
    printf './scripts/dev-runtime-info.sh --workspace %s --runtime-log %s\n' "${target_root}" "${runtime_log_path}"
  else
    printf './scripts/dev-runtime-info.sh --workspace %s\n' "${target_root}"
  fi
}

playwright_runtime_command_for_root() {
  local target_root="$1"
  local runtime_log_path="${2:-}"

  if ! repo_uses_setta_adapter; then
    return 1
  fi

  if [[ -n "${runtime_log_path}" ]]; then
    printf './scripts/run-playwright-against-runtime.sh --workspace %s --runtime-log %s --\n' "${target_root}" "${runtime_log_path}"
  else
    printf './scripts/run-playwright-against-runtime.sh --workspace %s --\n' "${target_root}"
  fi
}

lifecycle_log_label() {
  local lifecycle_mode="$1"

  case "${lifecycle_mode}" in
    ai|restart-ai)
      printf 'ai\n'
      ;;
    aireset|restart-aireset)
      printf 'aireset\n'
      ;;
    *)
      return 1
      ;;
  esac
}

normalize_probe_url() {
  local url="$1"

  if [[ -z "${url}" ]]; then
    return 1
  fi

  printf '%s\n' "${url%%#*}"
}

setta_bootstrap_probe_url() {
  local backend_url="$1"
  local normalized_url=""

  normalized_url="$(normalize_probe_url "${backend_url}" || true)"
  if [[ -z "${normalized_url}" ]]; then
    return 1
  fi

  normalized_url="${normalized_url%/}"
  printf '%s/__setta__/bootstrap\n' "${normalized_url}"
}

url_responds() {
  local url="$1"
  local normalized_url=""

  if [[ -z "${url}" ]]; then
    return 1
  fi

  normalized_url="$(normalize_probe_url "${url}" || true)"
  if [[ -z "${normalized_url}" ]]; then
    return 1
  fi

  curl -fsS -o /dev/null --max-time 5 "${normalized_url}"
}

dev_stack_backend_responds() {
  local backend_url="$1"
  local bootstrap_url="$2"
  local derived_bootstrap_url=""

  if [[ -n "${bootstrap_url}" ]] && url_responds "${bootstrap_url}"; then
    return 0
  fi

  if [[ -n "${backend_url}" ]] && url_responds "${backend_url}"; then
    return 0
  fi

  if repo_uses_setta_adapter && [[ -n "${backend_url}" ]]; then
    derived_bootstrap_url="$(setta_bootstrap_probe_url "${backend_url}" || true)"
    if [[ -n "${derived_bootstrap_url}" ]] && url_responds "${derived_bootstrap_url}"; then
      return 0
    fi
  fi

  return 1
}

wait_for_frontend_url_serving() {
  local target_name="$1"
  local log_path="$2"
  local timeout_seconds="$3"
  local start_ts=""
  local elapsed=""
  local frontend_url=""

  start_ts="$(date +%s)"
  while true; do
    frontend_url="$(extract_frontend_url_from_log "${log_path}" || true)"
    if [[ -n "${frontend_url}" ]] && url_responds "${frontend_url}"; then
      echo "[bootstrap] ${target_name}: frontend serving at ${frontend_url}"
      return 0
    fi

    elapsed="$(( $(date +%s) - start_ts ))"
    if [[ "${elapsed}" -ge "${timeout_seconds}" ]]; then
      echo "Timed out waiting for ${target_name} frontend to serve." >&2
      if [[ -n "${frontend_url}" ]]; then
        echo "Last observed ${target_name} frontend url: ${frontend_url}" >&2
      fi
      if [[ -f "${log_path}" ]]; then
        echo "Last log lines from ${log_path}:" >&2
        tail -n 60 "${log_path}" >&2 || true
      fi
      return 1
    fi

    sleep 2
  done
}

wait_for_reference_runtime_ready() {
  local target_root="$1"
  local log_path="$2"
  local timeout_seconds="$3"

  if repo_uses_setta_adapter; then
    wait_for_dev_stack_ready "reference/oracle" "${target_root}" "${log_path}" "${timeout_seconds}"
    return $?
  fi

  wait_for_frontend_url_serving "reference/oracle" "${log_path}" "${timeout_seconds}"
}

refresh_main_runtime_values() {
  local runtime_dir="${1:-${output_dir}}"
  local lifecycle_mode="${2:-${main_effective_lifecycle:-${main_lifecycle:-}}}"
  local main_log_label=""

  main_frontend_url=""
  main_backend_url=""
  main_bootstrap_url=""
  main_debug_port=""
  main_runtime_log_path=""
  main_runtime_pid_path=""

  if [[ -z "${main_worktree_root:-}" ]]; then
    return 0
  fi

  if main_log_label="$(lifecycle_log_label "${lifecycle_mode}")"; then
    main_runtime_log_path="${runtime_dir}/main-${main_log_label}.log"
    main_runtime_pid_path="${runtime_dir}/main-${main_log_label}.pid"
    main_frontend_url="$(extract_frontend_url_from_log "${main_runtime_log_path}" || true)"
    main_backend_url="$(extract_backend_url_from_log "${main_runtime_log_path}" || true)"
    main_bootstrap_url="$(extract_bootstrap_url_from_log "${main_runtime_log_path}" || true)"
    main_debug_port="$(extract_debug_port_from_log "${main_runtime_log_path}" || true)"
  fi

  if runtime_info_assignments="$(runtime_info_shell_assignments "${main_worktree_root}" "${main_runtime_log_path}" 2>/dev/null || true)"; then
    if [[ -n "${runtime_info_assignments}" ]]; then
      eval "${runtime_info_assignments}"
      if [[ -n "${frontend_url:-}" ]]; then
        main_frontend_url="${frontend_url}"
      fi
      if [[ -n "${backend_url:-}" ]]; then
        main_backend_url="${backend_url}"
      fi
      if [[ -n "${bootstrap_url:-}" ]]; then
        main_bootstrap_url="${bootstrap_url}"
      fi
      if [[ -n "${debug_port:-}" ]]; then
        main_debug_port="${debug_port}"
      fi
      if [[ -n "${runtime_log_path:-}" ]]; then
        main_runtime_log_path="${runtime_log_path}"
      fi
    fi
  fi
}

bootstrap_main_reference() {
  local target_root="$1"
  local lifecycle_mode="$2"
  local run_dir="$3"
  local resolved_terminal_mode="$4"
  local iteration_label="$5"
  local frontend_health_timeout="${RALPH_MAIN_FRONTEND_HEALTH_TIMEOUT_SECONDS:-30}"
  local attempted_lifecycle="${lifecycle_mode}"
  local attempted_reset_retry="0"
  local main_lifecycle_exit_code="0"
  local reference_runtime_exit_code="0"
  local main_log_label=""
  local main_log_path=""

  while true; do
    echo "[${iteration_label}] Bootstrapping reference/oracle (${attempted_lifecycle})"
    set +e
    run_lifecycle_mode "main" "${target_root}" "${attempted_lifecycle}" "${run_dir}" "${resolved_terminal_mode}" "0"
    main_lifecycle_exit_code="$?"
    set -e

    main_effective_lifecycle="${attempted_lifecycle}"
    refresh_main_runtime_values "${run_dir}" "${main_effective_lifecycle}"

    if [[ "${main_lifecycle_exit_code}" -eq 0 ]] \
      && main_log_label="$(lifecycle_log_label "${attempted_lifecycle}")"; then
      main_log_path="${run_dir}/main-${main_log_label}.log"
      set +e
      wait_for_reference_runtime_ready "${target_root}" "${main_log_path}" "${frontend_health_timeout}"
      reference_runtime_exit_code="$?"
      set -e
      if [[ "${reference_runtime_exit_code}" -ne 0 ]]; then
        main_lifecycle_exit_code="${reference_runtime_exit_code}"
      fi
    fi

    if [[ "${main_lifecycle_exit_code}" -eq 0 ]]; then
      return 0
    fi

    if [[ "${attempted_reset_retry}" == "0" ]] && [[ "${attempted_lifecycle}" =~ ^(ai|restart-ai)$ ]]; then
      echo "[${iteration_label}] Reference/oracle bootstrap via ${attempted_lifecycle} did not yield a healthy runtime; retrying once with restart-aireset." >&2
      attempted_lifecycle="restart-aireset"
      attempted_reset_retry="1"
      continue
    fi

    return "${main_lifecycle_exit_code}"
  done
}

run_lifecycle_mode() {
  local target_name="$1"
  local target_root="$2"
  local lifecycle_mode="$3"
  local run_dir="$4"
  local resolved_terminal_mode="$5"
  local wait_for_running="${6:-1}"
  local quiet_browser_env="${ralph_browser_env_prefix}"
  local lifecycle_browser_env="${quiet_browser_env}"
  local label=""
  local launcher_path=""
  local command_display=""
  local command_body=""
  local launcher_args=()
  local browser_args_string=""
  local node_tooling_prefix=""
  local should_restart="0"
  local session_state="not_running"
  local log_path=""

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
  local headless_wrapper_path=""

  if ai_script_supports_browser_mode_flag "${ai_script}"; then
    launcher_args=(--browser-mode "${ralph_browser_mode}")
  elif [[ "${ralph_browser_mode}" == "headless" ]]; then
    headless_wrapper_path="$(ensure_ralph_headless_chrome_wrapper "${run_dir}")"
    if [[ -n "${CHROME_BIN:-}" ]]; then
      lifecycle_browser_env+=" RALPH_REAL_CHROME_BIN=$(printf '%q' "${CHROME_BIN}")"
    fi
    lifecycle_browser_env+=" CHROME_BIN=$(printf '%q' "${headless_wrapper_path}")"
  fi

  if [[ ${#launcher_args[@]} -gt 0 ]]; then
    browser_args_string="$(shell_join_args "${launcher_args[@]}")"
  fi

  node_tooling_prefix="$(build_node_tooling_bootstrap_prefix "${target_root}" "${run_dir}")"

  case "${lifecycle_mode}" in
    kill)
      local log_path="${run_dir}/${target_name}-kill.log"
      echo "[bootstrap] ${target_name}: kill"
      (
        cd "${target_root}"
        "${kill_script}"
      ) 2>&1 | tee "${log_path}"
      wait_for_workspace_session_state "${target_name}" "${target_root}" "not_running" "60" "${run_dir}" "kill"
      ;;
    ai)
      label="ai"
      launcher_path="${ai_script}"
      command_display="./ai.sh"
      command_body="${node_tooling_prefix}${lifecycle_browser_env} \"${ai_script}\""
      if [[ -n "${browser_args_string}" ]]; then
        command_body+=" ${browser_args_string}"
      fi
      ;;
    aireset)
      label="aireset"
      launcher_path="${aireset_script}"
      command_display="./aireset.sh (fallback ./ai.sh)"
      command_body="${node_tooling_prefix}${lifecycle_browser_env} \"${aireset_script}\""
      if [[ -n "${browser_args_string}" ]]; then
        command_body+=" ${browser_args_string}"
      fi
      command_body+=" || ${lifecycle_browser_env} \"${ai_script}\""
      if [[ -n "${browser_args_string}" ]]; then
        command_body+=" ${browser_args_string}"
      fi
      ;;
    restart-ai)
      label="ai"
      launcher_path="${ai_script}"
      command_display="./ai.sh"
      command_body="${node_tooling_prefix}${lifecycle_browser_env} \"${ai_script}\""
      if [[ -n "${browser_args_string}" ]]; then
        command_body+=" ${browser_args_string}"
      fi
      should_restart="1"
      ;;
    restart-aireset)
      label="aireset"
      launcher_path="${aireset_script}"
      command_display="./aireset.sh (fallback ./ai.sh)"
      command_body="${node_tooling_prefix}${lifecycle_browser_env} \"${aireset_script}\""
      if [[ -n "${browser_args_string}" ]]; then
        command_body+=" ${browser_args_string}"
      fi
      command_body+=" || ${lifecycle_browser_env} \"${ai_script}\""
      if [[ -n "${browser_args_string}" ]]; then
        command_body+=" ${browser_args_string}"
      fi
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
      wait_for_workspace_session_state "${target_name}" "${target_root}" "not_running" "60" "${run_dir}" "kill"
    elif [[ "${session_state}" == "running" ]]; then
      echo "[bootstrap] ${target_name}: skipping ${label}; an existing live session already exists for ${target_root}"
      return 0
    fi

    if [[ ! -x "${launcher_path}" ]]; then
      echo "Launcher not found or not executable: ${launcher_path}" >&2
      exit 1
    fi

    log_path="${run_dir}/${target_name}-${label}.log"
    if [[ "${resolved_terminal_mode}" == "background" ]]; then
      start_command_in_background "${target_name}" "${target_root}" "${label}" "${command_display}" "${command_body}" "${run_dir}"
    else
      if ! start_command_in_visible_terminal "${resolved_terminal_mode}" "${target_name}" "${target_root}" "${label}" "${command_display}" "${command_body}" "${run_dir}" "" "1"; then
        echo "[bootstrap] ${target_name}: ${resolved_terminal_mode} launch failed; retrying in background" >&2
        start_command_in_background "${target_name}" "${target_root}" "${label}" "${command_display}" "${command_body}" "${run_dir}"
      elif ! wait_for_launch_heartbeat "${log_path}" "" "${VISIBLE_LAUNCH_HEARTBEAT_SECONDS}"; then
        if workspace_has_live_setta_session "${target_root}"; then
          echo "[bootstrap] ${target_name}: session appeared without a visible-launch log heartbeat; continuing"
        else
          echo "[bootstrap] ${target_name}: no visible-launch heartbeat after ${VISIBLE_LAUNCH_HEARTBEAT_SECONDS}s; retrying in background" >&2
          start_command_in_background "${target_name}" "${target_root}" "${label}" "${command_display}" "${command_body}" "${run_dir}"
        fi
      fi
    fi

    if [[ "${wait_for_running}" == "1" ]]; then
      if [[ "${label}" == "ai" ]] || [[ "${label}" == "aireset" ]]; then
        local readiness_exit_code="0"
        set +e
        wait_for_dev_stack_ready "${target_name}" "${target_root}" "${log_path}" "180"
        readiness_exit_code="$?"
        set -e
        if [[ "${readiness_exit_code}" -ne 0 ]]; then
          return "${readiness_exit_code}"
        fi
      else
        wait_for_workspace_session_state "${target_name}" "${target_root}" "running" "180" "${run_dir}" "${label}"
      fi
    else
      echo "[bootstrap] ${target_name}: continuing without blocking on session readiness"
    fi
  fi
}

render_prompt() {
  local prompt_template="$1"
  local destination="$2"
  local mode_label="$3"
  local worktree_connect_info_command=""
  local main_connect_info_command=""
  local worktree_runtime_info_command=""
  local worktree_playwright_command=""
  local main_runtime_info_command=""
  local has_runtime_context="0"

  worktree_connect_info_command="$(connect_info_command_for_root "${workdir}" 2>/dev/null || true)"
  worktree_runtime_info_command="$(runtime_info_command_for_root "${workdir}" "${worktree_runtime_log_path:-}" 2>/dev/null || true)"
  worktree_playwright_command="$(playwright_runtime_command_for_root "${workdir}" "${worktree_runtime_log_path:-}" 2>/dev/null || true)"

  if [[ -n "${main_worktree_root:-}" ]]; then
    main_connect_info_command="$(connect_info_command_for_root "${main_worktree_root}" 2>/dev/null || true)"
    main_runtime_info_command="$(runtime_info_command_for_root "${main_worktree_root}" "${main_runtime_log_path:-}" 2>/dev/null || true)"
  fi

  if [[ -n "${worktree_frontend_url:-}" ]] \
    || [[ -n "${worktree_backend_url:-}" ]] \
    || [[ -n "${worktree_bootstrap_url:-}" ]] \
    || [[ -n "${worktree_debug_port:-}" ]] \
    || [[ -n "${worktree_runtime_log_path:-}" ]] \
    || [[ -n "${worktree_connect_info_command}" ]] \
    || [[ -n "${worktree_runtime_info_command}" ]] \
    || [[ -n "${main_frontend_url:-}" ]] \
    || [[ -n "${main_backend_url:-}" ]] \
    || [[ -n "${main_bootstrap_url:-}" ]] \
    || [[ -n "${main_debug_port:-}" ]] \
    || [[ -n "${main_runtime_log_path:-}" ]] \
    || [[ -n "${main_connect_info_command}" ]] \
    || [[ -n "${main_runtime_info_command}" ]]; then
    has_runtime_context="1"
  fi

  cat > "${destination}" <<EOF
You are running inside an automated Codex loop iteration for this repository.

Read these files first:
- ${config_file}
- ${plan_file}
- ${handoff_file}

Only open the append-only history file if the handoff points you there for older detail:
- ${history_file}

Loop context:
- mode: ${mode_label}
- repository root: ${ROOT_DIR}
- working directory: ${workdir}
- verification guidance: ${verify_command}
- follow the repository's AGENTS.md instructions as the highest-priority repo policy
- use the plan and handoff files as the durable handoff instead of relying on prior chat context
- refresh the handoff file every iteration and append the history file every iteration
- current worktree lifecycle mode: ${worktree_lifecycle:-none}
- browser automation mode for this loop: ${ralph_browser_mode}
- browser env prefix for loop-driven restarts/tests: \`${ralph_browser_env_prefix}\`
- only use headed browser sessions when browser automation mode is headed
EOF

  if [[ "${has_runtime_context}" == "1" ]]; then
    cat >> "${destination}" <<EOF
- current worktree frontend url: ${worktree_frontend_url:-unknown}
- current worktree backend url: ${worktree_backend_url:-unknown}
- current worktree bootstrap url: ${worktree_bootstrap_url:-unknown}
- current worktree debug port: ${worktree_debug_port:-unknown}
- current worktree runtime log: ${worktree_runtime_log_path:-unknown}
EOF
  fi

  if [[ -n "${main_worktree_root:-}" ]]; then
    cat >> "${destination}" <<EOF
- current reference/oracle worktree: ${main_worktree_root}
EOF
    if [[ "${has_runtime_context}" == "1" ]]; then
      cat >> "${destination}" <<EOF
- current reference/oracle frontend url: ${main_frontend_url:-unknown}
- current reference/oracle backend url: ${main_backend_url:-unknown}
- current reference/oracle bootstrap url: ${main_bootstrap_url:-unknown}
- current reference/oracle debug port: ${main_debug_port:-unknown}
- current reference/oracle runtime log: ${main_runtime_log_path:-unknown}
EOF
    fi
  fi

  if [[ -n "${worktree_runtime_info_command}" ]] || [[ -n "${worktree_connect_info_command}" ]] \
    || [[ -n "${main_runtime_info_command}" ]] || [[ -n "${main_connect_info_command}" ]]; then
    cat >> "${destination}" <<EOF
- use these current runtime values instead of guessing old ports if defaults were reassigned during startup
EOF
    if [[ -n "${worktree_runtime_info_command}" ]] || [[ -n "${worktree_connect_info_command}" ]]; then
      cat >> "${destination}" <<EOF
- if you restart the current worktree lifecycle inside the iteration, refresh runtime values before continuing:
EOF
      if [[ -n "${worktree_runtime_info_command}" ]]; then
        cat >> "${destination}" <<EOF
  - canonical runtime info: \`${worktree_runtime_info_command}\`
EOF
      fi
      if [[ -n "${worktree_playwright_command}" ]]; then
        cat >> "${destination}" <<EOF
  - canonical Playwright helper: \`${worktree_playwright_command}\`
EOF
      fi
      if [[ -n "${worktree_connect_info_command}" ]]; then
        cat >> "${destination}" <<EOF
  - connect info fallback: \`${worktree_connect_info_command}\`
EOF
      fi
    fi
    if [[ -n "${main_worktree_root:-}" ]] \
      && ([[ -n "${main_runtime_info_command}" ]] || [[ -n "${main_connect_info_command}" ]]); then
      cat >> "${destination}" <<EOF
- if you need to refresh the current reference/oracle runtime values before a side-by-side check:
EOF
      if [[ -n "${main_runtime_info_command}" ]]; then
        cat >> "${destination}" <<EOF
  - canonical runtime info: \`${main_runtime_info_command}\`
EOF
      fi
      if [[ -n "${main_connect_info_command}" ]]; then
        cat >> "${destination}" <<EOF
  - connect info fallback: \`${main_connect_info_command}\`
EOF
      fi
    fi
  fi

  if [[ -n "${worktree_playwright_command}" ]]; then
    cat >> "${destination}" <<EOF
- For Playwright against the live worktree runtime, prefer the canonical helper instead of assembling env vars by hand: \`${worktree_playwright_command}\`
- Re-run that helper for every separate Playwright invocation so each run gets fresh runtime values and a fresh bootstrap token automatically.
EOF
  fi

  cat >> "${destination}" <<'EOF'
- Treat the bootstrap token inside a runtime info payload or bootstrap URL as single-use.
- Reusing an already-consumed bootstrap token is a tooling failure, not product evidence.
EOF

  if [[ "${worktree_bootstrap_compile_blocker:-0}" == "1" ]]; then
    cat >> "${destination}" <<EOF
- worktree bootstrap state: frontend compile blocker
- worktree compile-blocker log: ${worktree_runtime_log_path:-unknown}
- fix the frontend compile blocker first before treating lifecycle/bootstrap as the active problem
- preserve the current \`origin/go-rewrite\` architecture while fixing it
- choose the smallest go-rewrite-native source fix; do not broad-roll back refactors to make the build green
- do not recreate removed generated exports, copy older branch structure wholesale, or transplant old branch files just to satisfy imports
- if the smallest robust fix appears to require broad structural rollback, stop and return a replan/blocker instead of backsliding
EOF
  fi

  cat >> "${destination}" <<EOF

After reading the files, continue the current effort by selecting exactly one bounded next subtask that can be completed, verified, logged, and committed within this iteration.

EOF
  cat "${prompt_template}" >> "${destination}"
  cat >> "${destination}" <<'EOF'

End your response with these exact lines:
LOOP_STATUS: SUBTASK_DONE|TASK_DONE|BLOCKED|REPLAN_REQUIRED
LOOP_SUMMARY: <one sentence>
LOOP_NEXT_ACTION: <one sentence>
LOOP_VERIFY_COMMAND: <command or none>
LOOP_VERIFY_RESULT: <pass|fail|not_run|blocked|deferred_visual_gate>
LOOP_RECOVERY: <none|restart_worktree_lifecycle|retry_next_iteration>
LOOP_COMMIT: <full sha|none>
LOOP_TERMINAL_MARKER: <none|task_done|replan_required>
EOF
}

recent_run_dirs_for_review() {
  local review_window_size="$1"
  local run_paths=()

  shopt -s nullglob
  run_paths=("${output_dir}"/run-*)
  shopt -u nullglob

  if [[ ${#run_paths[@]} -eq 0 ]]; then
    return 0
  fi

  printf '%s\n' "${run_paths[@]}" | sort | tail -n "${review_window_size}"
}

build_progress_review_prompt() {
  local prompt_path="$1"
  local current_iteration="$2"
  local successful_iteration_count="$3"
  local review_window_size="$4"
  local recent_run_dirs=()
  local run_dir_path=""

  while IFS= read -r run_dir_path; do
    if [[ -n "${run_dir_path}" ]]; then
      recent_run_dirs+=("${run_dir_path}")
    fi
  done < <(recent_run_dirs_for_review "${review_window_size}")

  cat > "${prompt_path}" <<EOF
Progress review checkpoint.

You are pausing an automated Codex loop to assess whether the recent trajectory is still worthwhile.

Context:
- repository root: ${ROOT_DIR}
- working directory: ${workdir}
- config file: ${config_file}
- plan file: ${plan_file}
- handoff file: ${handoff_file}
- history file: ${history_file}
- loop output directory: ${output_dir}
- current loop iteration: ${current_iteration}
- successful iterations completed in this loop: ${successful_iteration_count}
- review cadence: every ${review_window_size} successful iterations

Read these files first:
- ${config_file}
- ${plan_file}
- ${handoff_file}

Use the append-only history file only as needed for recent evidence:
- ${history_file}

Inspect these recent run directories first (newest last):
EOF

  if [[ ${#recent_run_dirs[@]} -eq 0 ]]; then
    cat >> "${prompt_path}" <<'EOF'
- no prior run directories were found
EOF
  else
    for run_dir_path in "${recent_run_dirs[@]}"; do
      cat >> "${prompt_path}" <<EOF
- ${run_dir_path}
  - ${run_dir_path}/status.txt
  - ${run_dir_path}/last-message.txt
  - ${run_dir_path}/transcript.log
EOF
    done
  fi

  cat >> "${prompt_path}" <<'EOF'

Task:
1. Decide whether the recent stretch shows meaningful forward progress toward the current plan.
2. Identify real red herrings, repeated rabbit holes, or diminishing returns when they are present.
3. If the loop should keep going but needs a sharper direction, update the durable plan/handoff/history files before responding.
4. If the current direction should stop because it is no longer worth pursuing automatically, update the handoff/history files before responding.
5. Do not start another Ralph loop, and do not make unrelated code changes.

Decision rules:
- Use `continue` only when the current trajectory still looks worthwhile.
- Use `replan_and_continue` when the loop should keep going, but only after a meaningful durable-plan adjustment.
- Use `stop` when the current direction has reached diminishing returns or needs a human decision before more autonomous work.

If you choose `replan_and_continue` or `stop`, the durable files must reflect that decision before you answer.

End your response with exactly these lines:
PROGRESS_REVIEW_DECISION: <continue|replan_and_continue|stop>
PROGRESS_REVIEW_SUMMARY: <one sentence>
PROGRESS_REVIEW_NEXT_ACTION: <one sentence>
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

file_cksum_value() {
  local file_path="$1"
  cksum "${file_path}" | awk '{print $1 ":" $2}'
}

file_size_bytes() {
  local file_path="$1"
  wc -c < "${file_path}" | tr -d '[:space:]'
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

status_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi

  awk -F= -v target="${key}" '$1 == target { print substr($0, index($0, "=") + 1); exit }' "${file_path}"
}

write_loop_active_run_file() {
  local status="${1:-running}"

  if [[ "${RALPH_SUPERVISED_LOOP:-0}" == "1" ]] || [[ -z "${loop_active_run_file:-}" ]]; then
    return 0
  fi

  cat > "${loop_active_run_file}" <<EOF
mode=raw_loop
pid=$$
root_dir=${ROOT_DIR}
workdir=${workdir:-}
output_dir=${output_dir:-}
stop_request_file=${stop_after_iteration_file:-}
status=${status}
EOF
}

clear_loop_active_run_file_if_owned() {
  local owner_pid=""
  local owner_root=""

  if [[ "${RALPH_SUPERVISED_LOOP:-0}" == "1" ]] || [[ -z "${loop_active_run_file:-}" ]]; then
    return 0
  fi

  if [[ -f "${loop_active_run_file}" ]]; then
    owner_pid="$(status_value "${loop_active_run_file}" "pid")"
    owner_root="$(status_value "${loop_active_run_file}" "root_dir")"
    if [[ "${owner_pid}" == "$$" ]] && [[ "${owner_root}" == "${ROOT_DIR}" ]]; then
      rm -f "${loop_active_run_file}" >/dev/null 2>&1 || true
    fi
  fi

  if [[ -n "${stop_after_iteration_file:-}" ]]; then
    rm -f "${stop_after_iteration_file}" >/dev/null 2>&1 || true
  fi
}

cleanup_loop_runtime_state() {
  clear_loop_active_run_file_if_owned
}

stop_after_iteration_requested() {
  [[ -n "${stop_after_iteration_file:-}" ]] && [[ -f "${stop_after_iteration_file}" ]]
}

PROGRESS_REVIEW_DECISION=""
PROGRESS_REVIEW_SUMMARY=""
PROGRESS_REVIEW_NEXT_ACTION=""

run_progress_review() {
  local review_dir="$1"
  local current_iteration="$2"
  local successful_iteration_count="$3"
  local review_window_size="$4"
  local review_prompt="${review_dir}/progress-review-prompt.txt"
  local review_last_message="${review_dir}/progress-review-last-message.txt"
  local review_transcript="${review_dir}/progress-review-transcript.log"
  local review_status_file="${review_dir}/status.txt"
  local before_plan_cksum=""
  local before_handoff_cksum=""
  local before_history_size=""
  local after_plan_cksum=""
  local after_handoff_cksum=""
  local after_history_size=""
  local review_exit_code="0"
  local restore_errexit="0"

  mkdir -p "${review_dir}"
  build_progress_review_prompt "${review_prompt}" "${current_iteration}" "${successful_iteration_count}" "${review_window_size}"

  before_plan_cksum="$(file_cksum_value "${plan_file}")"
  before_handoff_cksum="$(file_cksum_value "${handoff_file}")"
  before_history_size="$(file_size_bytes "${history_file}")"

  PROGRESS_REVIEW_DECISION=""
  PROGRESS_REVIEW_SUMMARY=""
  PROGRESS_REVIEW_NEXT_ACTION=""

  codex_args=(
    exec
    --color
    never
    --cd
    "${workdir}"
    --output-last-message
    "${review_last_message}"
    --ephemeral
  )

  if [[ -n "${model}" ]]; then
    codex_args+=(--model "${model}")
  fi
  if [[ "${yolo_mode}" == "1" ]]; then
    codex_args+=(--dangerously-bypass-approvals-and-sandbox)
  fi
  if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
    codex_args+=("${codex_extra_args[@]}")
  fi
  codex_args+=(-)

  if [[ $- == *e* ]]; then
    restore_errexit="1"
    set +e
  fi
  run_codex_iteration "${review_prompt}" "${review_transcript}" "${review_last_message}" "${codex_inactivity_timeout_seconds}"
  review_exit_code="$?"
  if [[ "${restore_errexit}" == "1" ]]; then
    set -e
  fi

  if [[ "${review_exit_code}" -ne 0 ]]; then
    write_status_file "${review_status_file}" \
      "status=failure" \
      "exit_code=${review_exit_code}"
    return 1
  fi

  PROGRESS_REVIEW_DECISION="$(sanitize_single_line "$(extract_loop_field "${review_last_message}" "PROGRESS_REVIEW_DECISION")")"
  PROGRESS_REVIEW_SUMMARY="$(sanitize_single_line "$(extract_loop_field "${review_last_message}" "PROGRESS_REVIEW_SUMMARY")")"
  PROGRESS_REVIEW_NEXT_ACTION="$(sanitize_single_line "$(extract_loop_field "${review_last_message}" "PROGRESS_REVIEW_NEXT_ACTION")")"

  if [[ -z "${PROGRESS_REVIEW_DECISION}" ]] && [[ -f "${review_transcript}" ]]; then
    PROGRESS_REVIEW_DECISION="$(sanitize_single_line "$(extract_loop_field "${review_transcript}" "PROGRESS_REVIEW_DECISION")")"
    PROGRESS_REVIEW_SUMMARY="$(sanitize_single_line "$(extract_loop_field "${review_transcript}" "PROGRESS_REVIEW_SUMMARY")")"
    PROGRESS_REVIEW_NEXT_ACTION="$(sanitize_single_line "$(extract_loop_field "${review_transcript}" "PROGRESS_REVIEW_NEXT_ACTION")")"
  fi

  if [[ "${PROGRESS_REVIEW_DECISION}" != "continue" ]] \
    && [[ "${PROGRESS_REVIEW_DECISION}" != "replan_and_continue" ]] \
    && [[ "${PROGRESS_REVIEW_DECISION}" != "stop" ]]; then
    write_status_file "${review_status_file}" \
      "status=invalid-output" \
      "decision=${PROGRESS_REVIEW_DECISION}"
    return 1
  fi

  after_plan_cksum="$(file_cksum_value "${plan_file}")"
  after_handoff_cksum="$(file_cksum_value "${handoff_file}")"
  after_history_size="$(file_size_bytes "${history_file}")"

  if [[ "${PROGRESS_REVIEW_DECISION}" == "replan_and_continue" ]] \
    || [[ "${PROGRESS_REVIEW_DECISION}" == "stop" ]]; then
    if [[ "${after_history_size}" -le "${before_history_size}" ]]; then
      write_status_file "${review_status_file}" \
        "status=missing-history-update" \
        "decision=${PROGRESS_REVIEW_DECISION}" \
        "summary=${PROGRESS_REVIEW_SUMMARY}"
      return 1
    fi
    if [[ "${before_plan_cksum}" == "${after_plan_cksum}" ]] \
      && [[ "${before_handoff_cksum}" == "${after_handoff_cksum}" ]]; then
      write_status_file "${review_status_file}" \
        "status=missing-durable-update" \
        "decision=${PROGRESS_REVIEW_DECISION}" \
        "summary=${PROGRESS_REVIEW_SUMMARY}"
      return 1
    fi
  fi

  write_status_file "${review_status_file}" \
    "status=success" \
    "decision=${PROGRESS_REVIEW_DECISION}" \
    "summary=${PROGRESS_REVIEW_SUMMARY}" \
    "next_action=${PROGRESS_REVIEW_NEXT_ACTION}" \
    "before_plan_cksum=${before_plan_cksum}" \
    "after_plan_cksum=${after_plan_cksum}" \
    "before_handoff_cksum=${before_handoff_cksum}" \
    "after_handoff_cksum=${after_handoff_cksum}" \
    "before_history_size=${before_history_size}" \
    "after_history_size=${after_history_size}" \
    "trigger_iteration=${current_iteration}" \
    "trigger_successful_iterations=${successful_iteration_count}"

  if [[ "${PROGRESS_REVIEW_DECISION}" == "stop" ]]; then
    return 2
  fi

  return 0
}

SELF_EXEC_ARGS=()

build_self_exec_args() {
  SELF_EXEC_ARGS=(
    --config-file "${config_file}"
    --prompt-file "${prompt_file}"
    --followup-prompt-file "${followup_prompt_file}"
    --plan-file "${plan_file}"
    --handoff-file "${handoff_file}"
    --history-file "${history_file}"
    --verify-command "${verify_command}"
    --iterations "${iterations}"
    --new-session-every "${new_session_every}"
    --stop-after-iteration-file "${stop_after_iteration_file}"
    --progress-review-every "${progress_review_every}"
    --codex-inactivity-timeout-seconds "${codex_inactivity_timeout_seconds}"
    --output-dir "${output_dir}"
    --workdir "${workdir}"
    --worktree-lifecycle "${worktree_lifecycle:-none}"
    --main-lifecycle "${main_lifecycle:-none}"
    --terminal-mode "${resolved_terminal_mode}"
  )

  if [[ -n "${pre_session_command}" ]]; then
    SELF_EXEC_ARGS+=(--pre-session-command "${pre_session_command}")
  fi

  if [[ -n "${stop_on_pre_session_exit_code}" ]]; then
    SELF_EXEC_ARGS+=(--stop-on-pre-session-exit-code "${stop_on_pre_session_exit_code}")
  fi

  if [[ -n "${model}" ]]; then
    SELF_EXEC_ARGS+=(--model "${model}")
  fi

  if [[ "${headed_browser}" == "1" ]]; then
    SELF_EXEC_ARGS+=(--headed-browser)
  fi

  if [[ "${yolo_mode}" == "1" ]]; then
    SELF_EXEC_ARGS+=(--yolo)
  else
    SELF_EXEC_ARGS+=(--no-yolo)
  fi

  if [[ "${stop_on_error}" == "1" ]]; then
    SELF_EXEC_ARGS+=(--stop-on-error)
  fi

  if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
    SELF_EXEC_ARGS+=(--)
    SELF_EXEC_ARGS+=("${codex_extra_args[@]}")
  fi
}

launch_self_in_visible_terminal() {
  local resolved_mode="$1"
  local run_dir="$2"
  local program_name=""
  local command_body=""
  local status_file=""
  local log_path=""

  program_name="${RALPH_PROGRAM_NAME:-$(basename "$0")}"
  build_self_exec_args
  status_file="${run_dir}/codex-loop.exit"
  log_path="${run_dir}/codex-loop.log"
  command_body="$(
    shell_join_args \
      env \
      "RALPH_PROGRAM_NAME=${program_name}" \
      "RALPH_VISIBLE_LAUNCHED=1" \
      "${SCRIPT_DIR}/run-codex-loop.sh" \
      "${SELF_EXEC_ARGS[@]}"
  )"

  if ! start_command_in_visible_terminal "${resolved_mode}" "codex" "${workdir}" "loop" "${program_name}" "${command_body}" "${run_dir}" "${status_file}"; then
    echo "[bootstrap] codex: ${resolved_mode} launch failed; continuing in the current shell" >&2
    return 2
  fi

  if ! wait_for_launch_heartbeat "${log_path}" "${status_file}" "${VISIBLE_LAUNCH_HEARTBEAT_SECONDS}"; then
    echo "[bootstrap] codex: no visible-launch heartbeat after ${VISIBLE_LAUNCH_HEARTBEAT_SECONDS}s; continuing in the current shell" >&2
    return 2
  fi
}

follow_visible_launch_output() {
  local run_dir="$1"
  local log_path="${run_dir}/codex-loop.log"
  local status_file="${run_dir}/codex-loop.exit"
  local tail_pid=""
  local exit_code=""

  while [[ ! -f "${log_path}" ]] && [[ ! -f "${status_file}" ]]; do
    sleep 1
  done

  if [[ -f "${log_path}" ]]; then
    tail -n +1 -F "${log_path}" &
    tail_pid=$!
  fi

  while [[ ! -f "${status_file}" ]]; do
    sleep 1
  done

  if [[ -n "${tail_pid}" ]]; then
    kill "${tail_pid}" >/dev/null 2>&1 || true
    wait "${tail_pid}" 2>/dev/null || true
  fi

  exit_code="$(tr -d '[:space:]' < "${status_file}")"
  if [[ -z "${exit_code}" ]]; then
    exit_code="1"
  fi

  return "${exit_code}"
}

cleanup_iteration_target() {
  local target_root="$1"
  local target_name="$2"
  local kill_all_chrome="${3:-0}"
  local kill_script=""

  if [[ -z "${target_root}" ]] || [[ ! -d "${target_root}" ]]; then
    return 1
  fi

  kill_script="${target_root}/kill.sh"
  if [[ ! -x "${kill_script}" ]]; then
    return 1
  fi

  if [[ "${kill_all_chrome}" == "1" ]]; then
    echo "[cleanup] ${target_name}: stopping runtime and all Chrome instances"
    (
      cd "${target_root}"
      SETTA_KILL_ALL_CHROME=1 "${kill_script}"
    ) >/dev/null 2>&1 || true
  else
    echo "[cleanup] ${target_name}: stopping runtime"
    (
      cd "${target_root}"
      "${kill_script}"
    ) >/dev/null 2>&1 || true
  fi

  return 0
}

cleanup_completed_iteration() {
  local chrome_cleanup_pending="0"
  local main_root_real=""
  local worktree_root_real=""

  if ! flag_enabled "${RALPH_ITERATION_CLEANUP}"; then
    return 0
  fi

  if flag_enabled "${RALPH_KILL_ALL_CHROME_ON_ITERATION_CLEANUP}"; then
    chrome_cleanup_pending="1"
  fi

  worktree_root_real="$(cd "${workdir}" && pwd -P 2>/dev/null || printf '%s' "${workdir}")"
  if cleanup_iteration_target "${workdir}" "worktree" "${chrome_cleanup_pending}"; then
    chrome_cleanup_pending="0"
  fi

  if [[ -n "${main_worktree_root:-}" ]]; then
    main_root_real="$(cd "${main_worktree_root}" && pwd -P 2>/dev/null || printf '%s' "${main_worktree_root}")"
    if [[ "${main_root_real}" != "${worktree_root_real}" ]]; then
      cleanup_iteration_target "${main_worktree_root}" "main" "${chrome_cleanup_pending}" || true
    fi
  fi
}

config_file="${ROOT_DIR}/RALPH.md"
prompt_file=""
followup_prompt_file=""
plan_file=""
handoff_file=""
history_file=""
verify_command=""
post_iteration_command=""
pre_session_command=""
iterations=""
new_session_every=""
stop_after_iteration_file=""
progress_review_every=""
output_dir=""
workdir=""
worktree_lifecycle=""
main_lifecycle=""
terminal_mode=""
model=""
repo_adapter=""
headed_browser="0"
yolo_mode=""
stop_on_error="0"
continue_on_inactivity_timeout="0"
print_prompt_only="0"
stop_on_pre_session_exit_code=""
codex_inactivity_timeout_seconds=""
default_codex_extra_args=()
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
    --handoff-file)
      require_value "$1" "${2:-}"
      handoff_file="$2"
      shift 2
      ;;
    --history-file)
      require_value "$1" "${2:-}"
      history_file="$2"
      shift 2
      ;;
    --log-file)
      require_value "$1" "${2:-}"
      history_file="$2"
      shift 2
      ;;
    --verify-command)
      require_value "$1" "${2:-}"
      verify_command="$2"
      shift 2
      ;;
    --post-iteration-command)
      require_value "$1" "${2:-}"
      post_iteration_command="$2"
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
    --stop-after-iteration-file)
      require_value "$1" "${2:-}"
      stop_after_iteration_file="$2"
      shift 2
      ;;
    --progress-review-every)
      require_value "$1" "${2:-}"
      progress_review_every="$2"
      shift 2
      ;;
    --codex-inactivity-timeout-seconds|--inactivity-timeout-seconds)
      require_value "$1" "${2:-}"
      codex_inactivity_timeout_seconds="$2"
      shift 2
      ;;
    --watchdog-interval-seconds)
      require_value "$1" "${2:-}"
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
    --main-lifecycle)
      require_value "$1" "${2:-}"
      main_lifecycle="$2"
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
    --headed-browser)
      headed_browser="1"
      shift
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
    --continue-on-inactivity-timeout)
      continue_on_inactivity_timeout="1"
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
config_handoff_file="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "handoff_path")")")"
config_history_file="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "history_path")")")"
config_legacy_log_file="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "log_path")")")"
config_verify_command="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "verify_command")")")"
config_pre_session_command="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "pre_session_command")")")"
config_iterations="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "iterations")")")"
config_new_session_every="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "new_session_every")")")"
config_progress_review_every="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "progress_review_every")")")"
config_codex_inactivity_timeout_seconds="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "codex_inactivity_timeout_seconds")")")"
config_workdir="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "workdir")")")"
config_worktree_lifecycle="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "worktree_lifecycle")")")"
config_main_lifecycle="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "main_lifecycle")")")"
config_main_worktree_root="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "main_worktree_root")")")"
config_terminal_mode="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "terminal_mode")")")"
config_model="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "model")")")"
config_reasoning_effort="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "reasoning_effort")")")"
config_service_tier="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "service_tier")")")"
config_repo_adapter="$(strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "repo_adapter")")")"
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

if [[ -z "${handoff_file}" ]]; then
  handoff_file="${config_handoff_file}"
fi

if [[ -z "${history_file}" ]]; then
  if [[ -n "${config_history_file}" ]]; then
    history_file="${config_history_file}"
  else
    history_file="${config_legacy_log_file}"
  fi
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
    iterations="until_done"
  fi
fi

iterations="$(normalize_iterations_value "${iterations}")"

if [[ -z "${new_session_every}" ]]; then
  if [[ -n "${config_new_session_every}" ]]; then
    new_session_every="${config_new_session_every}"
  else
    new_session_every="1"
  fi
fi

if [[ -z "${codex_inactivity_timeout_seconds}" ]]; then
  if [[ -n "${config_codex_inactivity_timeout_seconds}" ]]; then
    codex_inactivity_timeout_seconds="${config_codex_inactivity_timeout_seconds}"
  else
    codex_inactivity_timeout_seconds="1800"
  fi
fi

if [[ -z "${progress_review_every}" ]]; then
  if [[ -n "${config_progress_review_every}" ]]; then
    progress_review_every="${config_progress_review_every}"
  else
    progress_review_every="10"
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

if [[ -z "${main_lifecycle}" ]]; then
  main_lifecycle="${config_main_lifecycle}"
fi

if [[ -z "${terminal_mode}" ]]; then
  terminal_mode="${config_terminal_mode}"
fi

if [[ -z "${model}" ]]; then
  model="${config_model}"
fi

if [[ -z "${repo_adapter}" ]]; then
  if [[ -n "${config_repo_adapter}" ]]; then
    repo_adapter="${config_repo_adapter}"
  else
    repo_adapter="auto"
  fi
fi

if [[ -z "${yolo_mode}" ]]; then
  yolo_mode="$(parse_bool "${config_yolo}")"
fi

if [[ -z "${stop_on_pre_session_exit_code}" ]]; then
  stop_on_pre_session_exit_code="${config_stop_on_pre_session_exit_code}"
fi

if [[ -n "${config_reasoning_effort}" ]]; then
  default_codex_extra_args+=(
    --config
    "reasoning_effort=\"${config_reasoning_effort}\""
  )
fi

if [[ -n "${config_service_tier}" ]]; then
  default_codex_extra_args+=(
    --config
    "service_tier=\"${config_service_tier}\""
  )
fi

if [[ "${config_service_tier}" == "fast" ]]; then
  default_codex_extra_args+=(
    --config
    "features.fast_mode=true"
  )
fi

if [[ ${#default_codex_extra_args[@]} -gt 0 ]]; then
  codex_extra_args=("${default_codex_extra_args[@]}" "${codex_extra_args[@]}")
fi

effective_codex_service_tier="$(codex_config_override_value "service_tier" "${codex_extra_args[@]}")"
effective_codex_fast_mode="$(codex_config_override_value "features.fast_mode" "${codex_extra_args[@]}")"

if [[ -z "${effective_codex_service_tier}" ]]; then
  effective_codex_service_tier="default"
fi

if [[ -z "${effective_codex_fast_mode}" ]]; then
  if [[ "${effective_codex_service_tier}" == "fast" ]]; then
    effective_codex_fast_mode="true"
  else
    effective_codex_fast_mode="false"
  fi
fi

prompt_file="$(resolve_path "${config_dir}" "${prompt_file}")"
followup_prompt_file="$(resolve_path "${config_dir}" "${followup_prompt_file}")"
plan_file="$(resolve_path "${config_dir}" "${plan_file}")"
handoff_file="$(resolve_path "${config_dir}" "${handoff_file}")"
history_file="$(resolve_path "${config_dir}" "${history_file}")"
workdir="$(resolve_path "${config_dir}" "${workdir}")"
if [[ -n "${output_dir}" ]]; then
  output_dir="$(resolve_path "${ROOT_DIR}" "${output_dir}")"
fi

if [[ -z "${plan_file}" ]]; then
  echo "No plan file configured. Set plan_path in ${config_file} or pass --plan-file." >&2
  exit 1
fi

if [[ -z "${handoff_file}" ]]; then
  echo "No handoff file configured. Set handoff_path in ${config_file} or pass --handoff-file." >&2
  exit 1
fi

if [[ -z "${history_file}" ]]; then
  echo "No history file configured. Set history_path in ${config_file} or pass --history-file." >&2
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

if [[ ! -f "${handoff_file}" ]]; then
  echo "Handoff file not found: ${handoff_file}" >&2
  exit 1
fi

if [[ ! -f "${history_file}" ]]; then
  echo "History file not found: ${history_file}" >&2
  exit 1
fi

iterations_mode="bounded"
if [[ "${iterations}" == "until_done" ]]; then
  iterations_mode="until_done"
elif [[ ! "${iterations}" =~ ^[0-9]+$ ]] || [[ "${iterations}" -lt 1 ]]; then
  echo "--iterations must be a positive integer or 'until_done'" >&2
  exit 1
fi

if [[ ! "${new_session_every}" =~ ^[0-9]+$ ]] || [[ "${new_session_every}" -lt 1 ]]; then
  echo "--new-session-every must be a positive integer" >&2
  exit 1
fi

if [[ ! "${progress_review_every}" =~ ^[0-9]+$ ]]; then
  echo "--progress-review-every must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${codex_inactivity_timeout_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--codex-inactivity-timeout-seconds must be a non-negative integer" >&2
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

if [[ "${headed_browser}" == "1" ]]; then
  ralph_browser_mode="headed"
  ralph_devtools_headless="0"
  ralph_playwright_headless="0"
else
  ralph_browser_mode="headless"
  ralph_devtools_headless="1"
  ralph_playwright_headless="1"
fi

ralph_browser_env_prefix="BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=${ralph_devtools_headless} PLAYWRIGHT_HEADLESS=${ralph_playwright_headless}"

export BOOTSTRAP_ENABLED="0"
export DEVTOOLS_OPEN_WITH_CHROME="0"
export DEVTOOLS_HEADLESS="${ralph_devtools_headless}"
export PLAYWRIGHT_HEADLESS="${ralph_playwright_headless}"

if [[ -n "${worktree_lifecycle}" ]]; then
  case "${worktree_lifecycle}" in
    none|kill|ai|aireset|restart-ai|restart-aireset) ;;
    *)
      echo "Unsupported --worktree-lifecycle value: ${worktree_lifecycle}" >&2
      exit 1
      ;;
  esac
fi

if [[ -n "${main_lifecycle}" ]]; then
  case "${main_lifecycle}" in
    none|kill|ai|aireset|restart-ai|restart-aireset) ;;
    *)
      echo "Unsupported --main-lifecycle value: ${main_lifecycle}" >&2
      exit 1
      ;;
  esac
fi

resolved_terminal_mode="$(resolve_terminal_mode "${terminal_mode}")"

if [[ "${print_prompt_only}" != "1" ]] && ! setta_ensure_codex_cli "${ROOT_DIR}"; then
  echo "codex CLI not found on PATH" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-loop.XXXXXX")"
fi

mkdir -p "${output_dir}"
runtime_state_dir="$(resolve_ralph_runtime_state_dir)"
loop_active_run_file="${runtime_state_dir}/loop-active-run.env"
if [[ -z "${stop_after_iteration_file}" ]]; then
  stop_after_iteration_file="${runtime_state_dir}/loop-stop-after-iteration.request"
else
  stop_after_iteration_file="$(resolve_path "${ROOT_DIR}" "${stop_after_iteration_file}")"
fi
if [[ "${RALPH_SUPERVISED_LOOP:-0}" != "1" ]]; then
  rm -f "${stop_after_iteration_file}" >/dev/null 2>&1 || true
fi
write_loop_active_run_file "starting"
trap cleanup_loop_runtime_state EXIT INT TERM

worktree_frontend_url=""
worktree_backend_url=""
worktree_bootstrap_url=""
worktree_debug_port=""
worktree_runtime_log_path=""
repo_adapter="$(resolve_repo_adapter "${repo_adapter}")"
if [[ -n "${config_main_worktree_root}" ]]; then
  main_worktree_root="$(resolve_path "${config_dir}" "${config_main_worktree_root}")"
else
  main_worktree_root="$(discover_main_worktree_root "${workdir}" || true)"
fi
main_effective_lifecycle=""
main_frontend_url=""
main_backend_url=""
main_bootstrap_url=""
main_debug_port=""
main_runtime_log_path=""
refresh_main_runtime_values

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
echo "Progress review every: ${progress_review_every}"
echo "Codex inactivity timeout seconds: ${codex_inactivity_timeout_seconds}"
echo "Workdir: ${workdir}"
echo "Config file: ${config_file}"
echo "Plan file: ${plan_file}"
echo "Handoff file: ${handoff_file}"
echo "History file: ${history_file}"
echo "Yolo mode: ${yolo_mode}"
echo "Repo adapter: ${repo_adapter}"
echo "Codex service tier: ${effective_codex_service_tier}"
if [[ "${effective_codex_fast_mode}" == "true" ]]; then
  echo "Fast mode: active"
elif [[ "${effective_codex_fast_mode}" == "false" ]]; then
  echo "Fast mode: inactive"
else
  echo "Fast mode: ${effective_codex_fast_mode}"
fi
echo "Worktree lifecycle: ${worktree_lifecycle:-none} (per iteration)"
echo "Reference/oracle lifecycle: ${main_lifecycle:-none}"
echo "Browser automation mode: ${ralph_browser_mode}"
echo "Terminal mode: ${resolved_terminal_mode}"

if [[ -n "${main_worktree_root}" ]]; then
  echo "Reference/oracle worktree root: ${main_worktree_root}"
  if [[ "$(cd "${workdir}" && pwd -P)" == "$(cd "${main_worktree_root}" && pwd -P)" ]]; then
    echo "Refusing to run Ralph in the reference/oracle worktree. That checkout must remain pristine and untouched." >&2
    exit 1
  fi
fi

if [[ "${print_prompt_only}" == "1" ]]; then
  cat "${start_prompt_file}"
  exit 0
fi

write_loop_active_run_file "running"

if [[ "${resolved_terminal_mode}" != "background" ]] && [[ "${RALPH_VISIBLE_LAUNCHED:-0}" != "1" ]]; then
  set +e
  launch_self_in_visible_terminal "${resolved_terminal_mode}" "${output_dir}"
  launch_self_exit_code="$?"
  set -e

  if [[ "${launch_self_exit_code}" -eq 0 ]]; then
    echo "Launched ${RALPH_PROGRAM_NAME:-ralph.sh} in a visible ${resolved_terminal_mode} session."
    follow_visible_launch_output "${output_dir}"
    exit $?
  fi

  if [[ "${launch_self_exit_code}" -ne 2 ]]; then
    exit "${launch_self_exit_code}"
  fi

  echo "[bootstrap] codex: visible launch fallback engaged; continuing in the current shell"
fi

echo "Worktree session: $(workspace_session_state "${workdir}")"
if [[ -n "${main_worktree_root}" ]]; then
  echo "Main session: $(workspace_session_state "${main_worktree_root}")"
fi

successful_iteration_count="0"
progress_review_count="0"

for ((iteration = 1; ; iteration += 1)); do
  if [[ "${iterations_mode}" == "bounded" ]] && [[ "${iteration}" -gt "${iterations}" ]]; then
    break
  fi
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
  before_handoff_cksum="$(file_cksum_value "${handoff_file}")"
  before_history_size="$(file_size_bytes "${history_file}")"
  before_head="$(git -C "${workdir}" rev-parse HEAD 2>/dev/null || true)"
  worktree_bootstrap_compile_blocker="0"

  if [[ "${batch_iteration_index}" -gt 1 ]] && [[ -s "${session_id_file}" ]]; then
    prompt_for_iteration="${followup_rendered_prompt_file}"
    mode="resume"
    session_id="$(<"${session_id_file}")"
  fi

  mkdir -p "${run_dir}"
  if [[ "${main_lifecycle}" != "none" ]] && [[ -n "${main_lifecycle}" ]]; then
    if [[ -z "${main_worktree_root}" ]]; then
      echo "Cannot run main lifecycle; main worktree root could not be discovered." >&2
      exit 1
    fi
    main_effective_lifecycle="${main_lifecycle}"
    set +e
    bootstrap_main_reference "${main_worktree_root}" "${main_lifecycle}" "${run_dir}" "${resolved_terminal_mode}" "${iteration}/${iterations}"
    main_lifecycle_exit_code="$?"
    set -e
    if [[ "${main_lifecycle_exit_code}" -ne 0 ]]; then
      write_status_file "${status_file}" \
        "status=bootstrap-failure" \
        "mode=bootstrap" \
        "exit_code=${main_lifecycle_exit_code}" \
        "lifecycle_mode=${main_effective_lifecycle:-${main_lifecycle}}"
      echo "[$iteration/$iterations] Main bootstrap failed with exit code ${main_lifecycle_exit_code}; retrying next iteration." >&2
      if [[ "${stop_on_error}" == "1" ]]; then
        exit "${main_lifecycle_exit_code}"
      fi
      sleep 5
      continue
    fi
  fi
  if [[ "${worktree_lifecycle}" != "none" ]] && [[ -n "${worktree_lifecycle}" ]]; then
    echo "[$iteration/$iterations] Bootstrapping worktree (${worktree_lifecycle})"
    set +e
    run_lifecycle_mode "worktree" "${workdir}" "${worktree_lifecycle}" "${run_dir}" "${resolved_terminal_mode}"
    lifecycle_exit_code="$?"
    set -e
    if [[ "${lifecycle_exit_code}" -ne 0 ]]; then
      if [[ "${lifecycle_exit_code}" -eq 86 ]]; then
        worktree_bootstrap_compile_blocker="1"
        write_status_file "${status_file}" \
          "status=bootstrap-compile-blocker" \
          "mode=bootstrap" \
          "exit_code=${lifecycle_exit_code}" \
          "lifecycle_mode=${worktree_lifecycle}"
        echo "[$iteration/$iterations] Worktree bootstrap hit a frontend compile blocker; continuing in repair mode." >&2
      else
        write_status_file "${status_file}" \
          "status=bootstrap-failure" \
          "mode=bootstrap" \
          "exit_code=${lifecycle_exit_code}" \
          "lifecycle_mode=${worktree_lifecycle}"
        echo "[$iteration/$iterations] Worktree bootstrap failed with exit code ${lifecycle_exit_code}; retrying next iteration." >&2
        if [[ "${stop_on_error}" == "1" ]]; then
          exit "${lifecycle_exit_code}"
        fi
        sleep 5
        continue
      fi
    fi
  fi

  worktree_frontend_url=""
  worktree_backend_url=""
  worktree_bootstrap_url=""
  worktree_debug_port=""
  worktree_runtime_log_path=""
  if worktree_log_label="$(lifecycle_log_label "${worktree_lifecycle:-}")"; then
    worktree_runtime_log_path="${run_dir}/worktree-${worktree_log_label}.log"
    worktree_frontend_url="$(extract_frontend_url_from_log "${worktree_runtime_log_path}" || true)"
    worktree_backend_url="$(extract_backend_url_from_log "${worktree_runtime_log_path}" || true)"
    worktree_bootstrap_url="$(extract_bootstrap_url_from_log "${worktree_runtime_log_path}" || true)"
    worktree_debug_port="$(extract_debug_port_from_log "${worktree_runtime_log_path}" || true)"
  fi
  if runtime_info_assignments="$(runtime_info_shell_assignments "${workdir}" "${worktree_runtime_log_path}" 2>/dev/null || true)"; then
    if [[ -n "${runtime_info_assignments}" ]]; then
      eval "${runtime_info_assignments}"
      if [[ -n "${frontend_url:-}" ]]; then
        worktree_frontend_url="${frontend_url}"
      fi
      if [[ -n "${backend_url:-}" ]]; then
        worktree_backend_url="${backend_url}"
      fi
      if [[ -n "${bootstrap_url:-}" ]]; then
        worktree_bootstrap_url="${bootstrap_url}"
      fi
      if [[ -n "${debug_port:-}" ]]; then
        worktree_debug_port="${debug_port}"
      fi
      if [[ -n "${runtime_log_path:-}" ]]; then
        worktree_runtime_log_path="${runtime_log_path}"
      fi
    fi
  fi
  refresh_main_runtime_values "${run_dir}"

  if [[ "${mode}" == "resume" ]]; then
    prompt_for_iteration="${run_dir}/rendered-resume-prompt.txt"
    render_prompt "${followup_prompt_file}" "${prompt_for_iteration}" "resume"
  else
    prompt_for_iteration="${run_dir}/rendered-start-prompt.txt"
    render_prompt "${prompt_file}" "${prompt_for_iteration}" "start"
  fi

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
  run_codex_iteration "${prompt_for_iteration}" "${transcript_file}" "${response_file}" "${codex_inactivity_timeout_seconds}"
  exit_code="$?"
  set -e

  if [[ "${mode}" == "start" ]] && [[ "${new_session_every}" -gt 1 ]] && [[ ! -s "${session_id_file}" ]]; then
    if thread_id="$(extract_thread_id "${transcript_file}")"; then
      printf '%s\n' "${thread_id}" > "${session_id_file}"
    fi
  fi

  if [[ "${exit_code}" -eq 124 ]] && [[ "${CODEX_WATCHDOG_TIMED_OUT}" == "1" ]]; then
    rm -f "${session_id_file}"
    write_status_file "${status_file}" \
      "status=stalled-timeout" \
      "mode=${mode}" \
      "exit_code=${exit_code}" \
      "inactivity_timeout_seconds=${codex_inactivity_timeout_seconds}" \
      "last_activity_epoch=${CODEX_WATCHDOG_LAST_ACTIVITY_EPOCH}"
    echo "[$iteration/$iterations] Codex stalled with no transcript activity for ${codex_inactivity_timeout_seconds}s. Cleared session reuse and continuing." >&2
    if [[ "${stop_on_error}" == "1" ]] && [[ "${continue_on_inactivity_timeout}" != "1" ]]; then
      exit "${exit_code}"
    fi
    continue
  fi

  if [[ "${exit_code}" -eq 125 ]] && [[ "${CODEX_RUNTIME_WATCHDOG_FAILED}" == "1" ]]; then
    rm -f "${session_id_file}"
    write_status_file "${status_file}" \
      "status=runtime-lifecycle-failure" \
      "mode=${mode}" \
      "exit_code=${exit_code}" \
      "target=${CODEX_RUNTIME_WATCHDOG_TARGET}" \
      "reason=${CODEX_RUNTIME_WATCHDOG_REASON}"
    echo "[$iteration/$iterations] ${CODEX_RUNTIME_WATCHDOG_TARGET} runtime failed during the iteration. Cleared session reuse and continuing with a fresh bootstrap." >&2
    if [[ "${stop_on_error}" == "1" ]]; then
      exit "${exit_code}"
    fi
    continue
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
  loop_recovery="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_RECOVERY")")"
  loop_commit="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_COMMIT")")"
  loop_terminal_marker="$(sanitize_single_line "$(extract_loop_field "${response_file}" "LOOP_TERMINAL_MARKER")")"

  if [[ -z "${loop_status}" ]] && [[ -f "${transcript_file}" ]]; then
    loop_status="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_STATUS")")"
    loop_summary="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_SUMMARY")")"
    loop_next_action="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_NEXT_ACTION")")"
    loop_verify_command="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_VERIFY_COMMAND")")"
    loop_verify_result="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_VERIFY_RESULT")")"
    loop_recovery="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_RECOVERY")")"
    loop_commit="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_COMMIT")")"
    loop_terminal_marker="$(sanitize_single_line "$(extract_loop_field "${transcript_file}" "LOOP_TERMINAL_MARKER")")"
  fi

  if [[ -z "${loop_recovery}" ]]; then
    loop_recovery="none"
  fi
  if [[ -z "${loop_terminal_marker}" ]]; then
    loop_terminal_marker="none"
  fi

  if [[ "${loop_status}" != "SUBTASK_DONE" ]] && [[ "${loop_status}" != "TASK_DONE" ]] && [[ "${loop_status}" != "BLOCKED" ]] && [[ "${loop_status}" != "REPLAN_REQUIRED" ]]; then
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

  if [[ "${loop_verify_result}" != "pass" ]] \
    && [[ "${loop_verify_result}" != "fail" ]] \
    && [[ "${loop_verify_result}" != "not_run" ]] \
    && [[ "${loop_verify_result}" != "blocked" ]] \
    && [[ "${loop_verify_result}" != "deferred_visual_gate" ]]; then
    write_status_file "${status_file}" \
      "status=invalid-output" \
      "mode=${mode}" \
      "loop_status=${loop_status}" \
      "loop_verify_result=${loop_verify_result}"
    echo "[$iteration/$iterations] Missing or invalid LOOP_VERIFY_RESULT in the agent output" >&2
    if [[ "${stop_on_error}" == "1" ]]; then
      exit 1
    fi
    continue
  fi

  if [[ "${loop_recovery}" != "none" ]] \
    && [[ "${loop_recovery}" != "restart_worktree_lifecycle" ]] \
    && [[ "${loop_recovery}" != "retry_next_iteration" ]]; then
    write_status_file "${status_file}" \
      "status=invalid-output" \
      "mode=${mode}" \
      "loop_status=${loop_status}" \
      "loop_recovery=${loop_recovery}"
    echo "[$iteration/$iterations] Missing or invalid LOOP_RECOVERY in the agent output" >&2
    if [[ "${stop_on_error}" == "1" ]]; then
      exit 1
    fi
    continue
  fi

  if [[ "${loop_terminal_marker}" != "none" ]] \
    && [[ "${loop_terminal_marker}" != "task_done" ]] \
    && [[ "${loop_terminal_marker}" != "replan_required" ]]; then
    write_status_file "${status_file}" \
      "status=invalid-output" \
      "mode=${mode}" \
      "loop_status=${loop_status}" \
      "loop_terminal_marker=${loop_terminal_marker}"
    echo "[$iteration/$iterations] Missing or invalid LOOP_TERMINAL_MARKER in the agent output" >&2
    if [[ "${stop_on_error}" == "1" ]]; then
      exit 1
    fi
    continue
  fi

  if [[ "${loop_status}" == "TASK_DONE" ]]; then
    if [[ "${loop_verify_result}" != "pass" ]]; then
      write_status_file "${status_file}" \
        "status=invalid-terminal-status" \
        "mode=${mode}" \
        "loop_status=${loop_status}" \
        "loop_verify_result=${loop_verify_result}"
      echo "[$iteration/$iterations] Refusing TASK_DONE without LOOP_VERIFY_RESULT: pass" >&2
      exit 1
    fi
    if [[ "${loop_recovery}" != "none" ]]; then
      write_status_file "${status_file}" \
        "status=invalid-terminal-status" \
        "mode=${mode}" \
        "loop_status=${loop_status}" \
        "loop_recovery=${loop_recovery}"
      echo "[$iteration/$iterations] Refusing TASK_DONE with non-none LOOP_RECOVERY" >&2
      exit 1
    fi
    if [[ "${loop_terminal_marker}" != "task_done" ]]; then
      write_status_file "${status_file}" \
        "status=invalid-terminal-status" \
        "mode=${mode}" \
        "loop_status=${loop_status}" \
        "loop_terminal_marker=${loop_terminal_marker}"
      echo "[$iteration/$iterations] Refusing TASK_DONE without LOOP_TERMINAL_MARKER: task_done" >&2
      exit 1
    fi
  elif [[ "${loop_status}" == "REPLAN_REQUIRED" ]]; then
    if [[ "${loop_recovery}" != "none" ]]; then
      write_status_file "${status_file}" \
        "status=invalid-terminal-status" \
        "mode=${mode}" \
        "loop_status=${loop_status}" \
        "loop_recovery=${loop_recovery}"
      echo "[$iteration/$iterations] Refusing REPLAN_REQUIRED with non-none LOOP_RECOVERY" >&2
      exit 1
    fi
    if [[ "${loop_terminal_marker}" != "replan_required" ]]; then
      write_status_file "${status_file}" \
        "status=invalid-terminal-status" \
        "mode=${mode}" \
        "loop_status=${loop_status}" \
        "loop_terminal_marker=${loop_terminal_marker}"
      echo "[$iteration/$iterations] Refusing REPLAN_REQUIRED without LOOP_TERMINAL_MARKER: replan_required" >&2
      exit 1
    fi
  elif [[ "${loop_terminal_marker}" != "none" ]]; then
    write_status_file "${status_file}" \
      "status=invalid-terminal-status" \
      "mode=${mode}" \
      "loop_status=${loop_status}" \
      "loop_terminal_marker=${loop_terminal_marker}"
    echo "[$iteration/$iterations] Refusing non-terminal status with LOOP_TERMINAL_MARKER: ${loop_terminal_marker}" >&2
    exit 1
  fi

  after_handoff_cksum="$(file_cksum_value "${handoff_file}")"
  after_history_size="$(file_size_bytes "${history_file}")"
  after_head="$(git -C "${workdir}" rev-parse HEAD 2>/dev/null || true)"

  if [[ "${before_handoff_cksum}" == "${after_handoff_cksum}" ]]; then
    write_status_file "${status_file}" \
      "status=missing-handoff-update" \
      "mode=${mode}" \
      "loop_status=${loop_status}" \
      "loop_summary=${loop_summary}"
    echo "[$iteration/$iterations] Handoff file did not change; refusing to continue blindly" >&2
    exit 1
  fi

  if [[ "${after_history_size}" -le "${before_history_size}" ]]; then
    write_status_file "${status_file}" \
      "status=missing-history-append" \
      "mode=${mode}" \
      "loop_status=${loop_status}" \
      "loop_summary=${loop_summary}"
    echo "[$iteration/$iterations] History file did not grow; refusing to continue blindly" >&2
    exit 1
  fi

  if [[ "${loop_terminal_marker}" != "none" ]] \
    && ! file_contains_exact_line "${history_file}" "LOOP_TERMINAL_MARKER: ${loop_terminal_marker}"; then
    write_status_file "${status_file}" \
      "status=missing-terminal-marker" \
      "mode=${mode}" \
      "loop_status=${loop_status}" \
      "loop_terminal_marker=${loop_terminal_marker}"
    echo "[$iteration/$iterations] Updated history is missing terminal marker LOOP_TERMINAL_MARKER: ${loop_terminal_marker}" >&2
    exit 1
  fi

  if [[ -n "${post_iteration_command}" ]]; then
    post_iteration_log="${run_dir}/post-iteration.log"
    set +e
    run_pre_session_command "${workdir}" "${post_iteration_command}" "${post_iteration_log}"
    post_iteration_exit_code="$?"
    set -e
    if [[ "${post_iteration_exit_code}" -ne 0 ]]; then
      write_status_file "${status_file}" \
        "status=post-iteration-failure" \
        "mode=${mode}" \
        "exit_code=${post_iteration_exit_code}"
      echo "[$iteration/$iterations] Post-iteration command failed with exit code ${post_iteration_exit_code}" >&2
      exit "${post_iteration_exit_code}"
    fi
  fi

  write_status_file "${status_file}" \
    "status=success" \
    "mode=${mode}" \
    "loop_status=${loop_status}" \
    "loop_summary=${loop_summary}" \
    "loop_next_action=${loop_next_action}" \
    "loop_verify_command=${loop_verify_command}" \
    "loop_verify_result=${loop_verify_result}" \
    "loop_recovery=${loop_recovery}" \
    "loop_commit=${loop_commit}" \
    "loop_terminal_marker=${loop_terminal_marker}" \
    "before_head=${before_head}" \
    "after_head=${after_head}"

  echo "[$iteration/$iterations] LOOP_STATUS: ${loop_status}"
  echo "[$iteration/$iterations] LOOP_SUMMARY: ${loop_summary}"
  echo "[$iteration/$iterations] LOOP_NEXT_ACTION: ${loop_next_action}"
  echo "[$iteration/$iterations] LOOP_VERIFY_COMMAND: ${loop_verify_command}"
  echo "[$iteration/$iterations] LOOP_VERIFY_RESULT: ${loop_verify_result}"
  echo "[$iteration/$iterations] LOOP_RECOVERY: ${loop_recovery}"
  echo "[$iteration/$iterations] LOOP_COMMIT: ${loop_commit}"
  echo "[$iteration/$iterations] LOOP_TERMINAL_MARKER: ${loop_terminal_marker}"
  echo "[$iteration/$iterations] ${loop_status}: ${loop_summary}"

  if [[ -n "${loop_commit}" ]] && [[ "${loop_commit}" != "none" ]] && [[ -n "${after_head}" ]] && [[ "${loop_commit}" != "${after_head}" ]]; then
    echo "[$iteration/$iterations] Warning: reported commit ${loop_commit} does not match HEAD ${after_head}" >&2
  fi

  successful_iteration_count="$((successful_iteration_count + 1))"
  cleanup_completed_iteration

  continue_loop_after_iteration="0"
  continue_message=""
  stop_message=""

  if [[ "${loop_status}" == "TASK_DONE" ]]; then
    stop_message="[$iteration/$iterations] Task complete. Stop here and start the next fresh conversation from the updated docs."
  elif [[ "${loop_status}" == "REPLAN_REQUIRED" ]]; then
    stop_message="[$iteration/$iterations] Replan required. Stop here and inspect the updated docs before starting another conversation."
  elif [[ "${loop_status}" == "BLOCKED" ]]; then
    if [[ "${loop_recovery}" == "restart_worktree_lifecycle" ]] && [[ "${worktree_lifecycle}" != "none" ]] && [[ -n "${worktree_lifecycle}" ]]; then
      continue_loop_after_iteration="1"
      continue_message="[$iteration/$iterations] Recoverable blocker requested fresh worktree bootstrap. Continue to the next iteration."
    elif [[ "${loop_recovery}" == "retry_next_iteration" ]]; then
      continue_loop_after_iteration="1"
      continue_message="[$iteration/$iterations] Recoverable blocker requested another fresh iteration. Continue to the next iteration."
    else
      stop_message="[$iteration/$iterations] Blocked. Stop here and inspect the blocker before starting another conversation."
    fi
  else
    continue_loop_after_iteration="1"
  fi

  if [[ "${continue_loop_after_iteration}" == "1" ]] && stop_after_iteration_requested; then
    echo "[$iteration/$iterations] Stop requested. Current iteration completed; exiting before the next iteration."
    break
  fi

  if [[ "${continue_loop_after_iteration}" == "1" ]] \
    && [[ "${progress_review_every}" -gt 0 ]] \
    && [[ $((successful_iteration_count % progress_review_every)) -eq 0 ]]; then
    progress_review_count="$((progress_review_count + 1))"
    progress_review_dir="$(printf '%s/progress-review-%03d' "${output_dir}" "${progress_review_count}")"
    echo "[$iteration/$iterations] Running progress review after ${successful_iteration_count} successful iterations."

    set +e
    run_progress_review "${progress_review_dir}" "${iteration}" "${successful_iteration_count}" "${progress_review_every}"
    progress_review_exit_code="$?"
    set -e

    if [[ "${progress_review_exit_code}" -eq 1 ]]; then
      echo "[$iteration/$iterations] Progress review failed; refusing to continue blindly." >&2
      exit 1
    fi

    echo "[$iteration/$iterations] Progress review ${PROGRESS_REVIEW_DECISION}: ${PROGRESS_REVIEW_SUMMARY}"

    if [[ "${progress_review_exit_code}" -eq 2 ]]; then
      echo "[$iteration/$iterations] Progress review stopped the loop. ${PROGRESS_REVIEW_NEXT_ACTION}"
      break
    fi

    if [[ "${PROGRESS_REVIEW_DECISION}" == "replan_and_continue" ]]; then
      echo "[$iteration/$iterations] Progress review updated the durable plan and will continue. ${PROGRESS_REVIEW_NEXT_ACTION}"
    fi
  fi

  if [[ "${continue_loop_after_iteration}" == "1" ]]; then
    if [[ -n "${continue_message}" ]]; then
      echo "${continue_message}"
    fi
    continue
  fi

  echo "${stop_message}"
  break
done
