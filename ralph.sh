#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: ./ralph.sh [--config-file PATH] [--prompt-file PATH] [run-codex-loop options] [-- <extra codex exec args>]

Generic Ralph convenience entrypoint.

If --prompt-file is not provided, Ralph uses:
  1. $RALPH_PROMPT_FILE, when set
  2. prompt_file from ./RALPH.md, when present
  3. ./scripts/ralph-default-prompt.md, when present
  4. ./PROMPT.md, when present

All options are forwarded to scripts/run-codex-loop.sh.
EOF
}

has_arg_with_value() {
  local name="$1"
  shift
  local arg=""

  for arg in "$@"; do
    if [[ "${arg}" == "${name}" ]] || [[ "${arg}" == "${name}="* ]]; then
      return 0
    fi
  done

  return 1
}

frontmatter_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi

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

config_value() {
  local key="$1"
  strip_wrapping_quotes "$(trim_value "$(frontmatter_value "${config_file}" "${key}")")"
}

resolve_config_path() {
  local target_path="$1"
  local config_dir=""

  if [[ -z "${target_path}" ]]; then
    return 0
  fi
  if [[ "${target_path}" == /* ]]; then
    printf '%s\n' "${target_path}"
    return 0
  fi

  config_dir="$(cd "$(dirname "${config_file}")" && pwd)"
  printf '%s/%s\n' "${config_dir}" "${target_path}"
}

is_true_value() {
  [[ "${1:-0}" =~ ^(1|true|yes)$ ]]
}

args=("$@")
config_file="${RALPH_CONFIG_FILE:-${SCRIPT_DIR}/RALPH.md}"
forwarded_args=()

if [[ "${#args[@]}" -gt 0 ]]; then
  case "${args[0]}" in
    --help|-h)
      usage
      echo
      exec "${SCRIPT_DIR}/scripts/run-codex-loop.sh" --help
      ;;
  esac
fi

while [[ "${#args[@]}" -gt 0 ]]; do
  case "${args[0]}" in
    --config-file)
      if [[ "${#args[@]}" -lt 2 ]]; then
        echo "Missing value for --config-file" >&2
        exit 1
      fi
      config_file="${args[1]}"
      args=("${args[@]:2}")
      ;;
    --config-file=*)
      config_file="${args[0]#--config-file=}"
      args=("${args[@]:1}")
      ;;
    --)
      forwarded_args+=("${args[@]}")
      args=()
      ;;
    *)
      forwarded_args+=("${args[0]}")
      args=("${args[@]:1}")
      ;;
  esac
done
args=("${forwarded_args[@]}")

if [[ -n "${config_file}" && "${config_file}" != /* ]]; then
  config_file="${SCRIPT_DIR}/${config_file}"
fi

if ! has_arg_with_value "--prompt-file" "${args[@]}"; then
  prompt_file="${RALPH_PROMPT_FILE:-}"
  if [[ -z "${prompt_file}" && -f "${config_file}" ]]; then
    prompt_file="$(resolve_config_path "$(config_value "prompt_file")")"
  fi
  if [[ -z "${prompt_file}" && -f "${SCRIPT_DIR}/scripts/ralph-default-prompt.md" ]]; then
    prompt_file="${SCRIPT_DIR}/scripts/ralph-default-prompt.md"
  fi
  if [[ -z "${prompt_file}" ]]; then
    prompt_file="${SCRIPT_DIR}/PROMPT.md"
  fi
  if [[ ! -f "${prompt_file}" ]]; then
    echo "Ralph prompt file not found: ${prompt_file}" >&2
    echo "Create RALPH.md with prompt_file, create PROMPT.md, set RALPH_PROMPT_FILE, or pass --prompt-file PATH." >&2
    exit 1
  fi
  args=(--prompt-file "${prompt_file}" "${args[@]}")
fi

if [[ -f "${config_file}" ]]; then
  config_workdir="$(config_value "workdir")"
  config_iterations="$(config_value "iterations")"
  config_new_session_every="$(config_value "new_session_every")"
  config_inactivity_timeout="$(config_value "codex_inactivity_timeout_seconds")"
  config_yolo="$(config_value "yolo")"
else
  config_workdir=""
  config_iterations=""
  config_new_session_every=""
  config_inactivity_timeout=""
  config_yolo=""
fi

if [[ -n "${RALPH_OUTPUT_DIR:-}" ]] && ! has_arg_with_value "--output-dir" "${args[@]}"; then
  args+=(--output-dir "${RALPH_OUTPUT_DIR}")
fi

if [[ -n "${RALPH_WORKDIR:-}" ]] && ! has_arg_with_value "--workdir" "${args[@]}"; then
  args+=(--workdir "${RALPH_WORKDIR}")
elif [[ -n "${config_workdir}" ]] && ! has_arg_with_value "--workdir" "${args[@]}"; then
  args+=(--workdir "$(resolve_config_path "${config_workdir}")")
fi

if [[ -n "${RALPH_ITERATIONS:-}" ]] && ! has_arg_with_value "--iterations" "${args[@]}"; then
  args+=(--iterations "${RALPH_ITERATIONS}")
elif [[ -n "${config_iterations}" && "${config_iterations}" != "until_done" ]] && ! has_arg_with_value "--iterations" "${args[@]}"; then
  args+=(--iterations "${config_iterations}")
fi

if [[ -n "${config_new_session_every}" ]] && ! has_arg_with_value "--new-session-every" "${args[@]}"; then
  args+=(--new-session-every "${config_new_session_every}")
fi

if [[ -n "${config_inactivity_timeout}" ]] && ! has_arg_with_value "--inactivity-timeout-seconds" "${args[@]}"; then
  args+=(--inactivity-timeout-seconds "${config_inactivity_timeout}")
fi

if is_true_value "${RALPH_YOLO:-0}" && ! has_arg_with_value "--yolo" "${args[@]}"; then
  args+=(--yolo)
elif is_true_value "${config_yolo}" && ! has_arg_with_value "--yolo" "${args[@]}"; then
  args+=(--yolo)
fi

exec "${SCRIPT_DIR}/scripts/run-codex-loop.sh" "${args[@]}"
