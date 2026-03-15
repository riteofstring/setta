#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: run-codex-loop.sh --prompt-file PATH [options] [-- <extra codex exec args>]

Runs `codex exec` in a loop. Each iteration starts a fresh ephemeral Codex run,
waits for the response, writes the last assistant message to disk, and exits.

Options:
  --prompt-file PATH       File containing the prompt to send to Codex.
  --iterations N           Number of runs to execute. Default: 100
  --output-dir PATH        Directory for run logs and responses. Default: mktemp dir
  --workdir PATH           Working directory passed to `codex exec --cd`. Default: repo root
  --model NAME             Optional model override passed to `codex exec --model`
  --yolo                   Run `codex exec` with the `codex --yolo` execution
                           policy equivalent (`--dangerously-bypass-approvals-and-sandbox`)
  --continue-on-error      Keep looping after a failed iteration
  --help                   Show this help text

Examples:
  scripts/run-codex-loop.sh --prompt-file /tmp/prompt.txt
  scripts/run-codex-loop.sh --prompt-file /tmp/prompt.txt --yolo
  scripts/run-codex-loop.sh --prompt-file ./prompt.txt --iterations 5 -- --skip-git-repo-check
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
iterations="100"
output_dir=""
workdir="${ROOT_DIR}"
model=""
yolo_mode="0"
continue_on_error="0"
codex_extra_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt-file)
      require_value "$1" "${2:-}"
      prompt_file="$2"
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
    --yolo)
      yolo_mode="1"
      shift
      ;;
    --continue-on-error)
      continue_on_error="1"
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

if [[ ! "${iterations}" =~ ^[0-9]+$ ]] || [[ "${iterations}" -lt 1 ]]; then
  echo "--iterations must be a positive integer" >&2
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

echo "Output directory: ${output_dir}"
echo "Iterations: ${iterations}"
echo "Workdir: ${workdir}"

for ((iteration = 1; iteration <= iterations; iteration += 1)); do
  run_dir="$(printf '%s/run-%03d' "${output_dir}" "${iteration}")"
  response_file="${run_dir}/last-message.txt"
  transcript_file="${run_dir}/transcript.log"
  status_file="${run_dir}/status.txt"

  mkdir -p "${run_dir}"
  echo "[$iteration/$iterations] Starting Codex"

  codex_args=(
    exec
    --ephemeral
    --color
    never
    --cd
    "${workdir}"
    --output-last-message
    "${response_file}"
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

  if codex "${codex_args[@]}" < "${prompt_file}" 2>&1 | tee "${transcript_file}"; then
    echo "success" > "${status_file}"
    echo "[$iteration/$iterations] Codex session ended"
    continue
  fi

  exit_code=$?
  echo "failure:${exit_code}" > "${status_file}"
  echo "[$iteration/$iterations] Codex failed with exit code ${exit_code}" >&2
  if [[ "${continue_on_error}" != "1" ]]; then
    exit "${exit_code}"
  fi
done
