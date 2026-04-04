#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-authority-cleanup-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to remove unjustified Go/Python/TypeScript
duplication, eliminate generator source blobs, and replace unjustified polling
with websocket pushes where the backend already knows when state changes.

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Yolo mode: on
- Stop when Codex explicitly reports no remaining issues
- Require every non-stop iteration to leave a clean worktree and advance HEAD

Options:
  --iterations N         Maximum loop iterations. Default: 1000
  --output-dir PATH      Directory for prompts, state, logs, and loop runs.
                         Default: mktemp dir under TMPDIR
  --state-dir PATH       Directory for prompt/checker state.
                         Default: <output-dir>/state
  --model NAME           Optional model override passed to codex exec
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-authority-cleanup-loop.sh
  ./scripts/run-codex-authority-cleanup-loop.sh --model gpt-5.4 -- --config reasoning_effort=\"high\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
output_dir=""
state_dir=""
model=""
yolo_mode="1"
complete_exit_code="42"
stop_sentinel="CODEX_LOOP_STOP: NO_ISSUES_FOUND"
codex_extra_args=()

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

shell_join() {
  local result=""
  local quoted=""
  for argument in "$@"; do
    printf -v quoted '%q' "${argument}"
    if [[ -n "${result}" ]]; then
      result+=" "
    fi
    result+="${quoted}"
  done
  printf '%s\n' "${result}"
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

  candidate="$(cd "${candidate}" && pwd)"
  printf '%s%s\n' "${candidate}" "${suffix}"
}

repo_is_clean() {
  if ! git -C "${ROOT_DIR}" diff --quiet --no-ext-diff --exit-code --; then
    return 1
  fi

  if ! git -C "${ROOT_DIR}" diff --cached --quiet --no-ext-diff --exit-code --; then
    return 1
  fi

  if git -C "${ROOT_DIR}" ls-files --others --exclude-standard | grep -q .; then
    return 1
  fi

  return 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --state-dir)
      require_value "$1" "${2:-}"
      state_dir="$2"
      shift 2
      ;;
    --model)
      require_value "$1" "${2:-}"
      model="$2"
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

if [[ ! "${iterations}" =~ ^[0-9]+$ ]] || [[ "${iterations}" -lt 1 ]]; then
  echo "--iterations must be a positive integer" >&2
  exit 1
fi

if ! repo_is_clean; then
  echo "Refusing to start: repository is not clean." >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-authority-cleanup-loop.${timestamp}.XXXXXX")"
else
  output_dir="$(resolve_path_without_creating "${output_dir}")"
  if [[ "${output_dir}" == "${ROOT_DIR}" ]] || [[ "${output_dir}" == "${ROOT_DIR}/"* ]]; then
    echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
  mkdir -p "${output_dir}"
fi

if [[ "${output_dir}" == "${ROOT_DIR}" ]] || [[ "${output_dir}" == "${ROOT_DIR}/"* ]]; then
  echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
  exit 1
fi

if [[ -z "${state_dir}" ]]; then
  state_dir="${output_dir}/state"
else
  state_dir="$(resolve_path_without_creating "${state_dir}")"
  if [[ "${state_dir}" == "${ROOT_DIR}" ]] || [[ "${state_dir}" == "${ROOT_DIR}/"* ]]; then
    echo "--state-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
  mkdir -p "${state_dir}"
fi

if [[ "${state_dir}" == "${ROOT_DIR}" ]] || [[ "${state_dir}" == "${ROOT_DIR}/"* ]]; then
  echo "--state-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
  exit 1
fi

mkdir -p "${output_dir}" "${state_dir}"

prompt_file="${state_dir}/prompt.md"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

cat > "${prompt_file}" <<EOF
Primary goals, in priority order:
- Find unjustified duplication across Go, Python, and TypeScript, and remove it. Go is authoritative.
- Find large Python or TypeScript source blocks embedded as strings in Go->Python and Go->TypeScript generation scripts, and replace them with structural generation or external templates.
- Find unjustified polling that can be replaced by websocket pushes when the backend already knows when state changes, and make that replacement.

Execution constraints:
- Treat this session as standalone. Do not rely on follow-up prompts.
- Start by reading:
  - ${ROOT_DIR}/AGENTS.md
  - recent commits: \`git log --oneline --decorate -n 15\`
  - the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist
- Start with a fresh targeted audit of the three goal areas.
- Fix any actionable issue or set of tightly-related issues that you can complete confidently in this session.
- Prefer Go-owned logic and generated downstream surfaces over duplicated Python or TypeScript logic.
- Do not leave duplicated non-trivial Python or TypeScript logic in place without an explicit concrete justification.
- Do not leave large Python or TypeScript source blocks embedded as raw strings in generation scripts when a structured or template-backed approach is practical.
- Prefer websocket pushes over polling when the backend already knows when data changed.
- Do not introduce heuristic fallbacks or broad exception handling.
- Before every commit, run \`./gcf.sh\`. If \`./gcf.sh\` fails, fix the failure or stop and report it instead of committing.
- Run focused verification for the behavior you changed.
- If you make repo changes, end the session with a clean worktree and a commit. Use a commit message that starts with \`codex-cleanup:\`.
- Do not create a commit if you made no repo changes.
- Do not ask for follow-up.

If a fresh targeted audit pass finds no remaining actionable issues in any of the three goal areas, make no repo changes, leave the worktree clean, and end your final response with this exact line:
  ${stop_sentinel}

Completion discipline:
- Any session that does not emit the stop sentinel must produce a new commit and leave the worktree clean.
- Never end the session with uncommitted, unstaged, or untracked repo changes.
EOF

if [[ ! -f "${status_file}" ]]; then
  printf 'pending\n' > "${status_file}"
fi

if [[ ! -f "${head_file}" ]]; then
  git -C "${ROOT_DIR}" rev-parse HEAD > "${head_file}"
fi

pre_iteration_command="$(
  shell_join \
    "${ROOT_DIR}/scripts/codex-authority-cleanup-loop-check.sh" \
    --root-dir "${ROOT_DIR}" \
    --output-dir "${output_dir}" \
    --state-dir "${state_dir}" \
    --complete-exit-code "${complete_exit_code}" \
    --sentinel "${stop_sentinel}"
)"

loop_args=(
  "${ROOT_DIR}/scripts/run-codex-loop.sh"
  --prompt-file "${prompt_file}"
  --followup-prompt-file "${prompt_file}"
  --iterations "${iterations}"
  --new-session-every "1"
  --output-dir "${output_dir}"
  --workdir "${ROOT_DIR}"
  --pre-iteration-command "${pre_iteration_command}"
  --stop-on-pre-iteration-exit-code "${complete_exit_code}"
  --stop-on-error
)

if [[ -n "${model}" ]]; then
  loop_args+=(--model "${model}")
fi

if [[ "${yolo_mode}" == "1" ]]; then
  loop_args+=(--yolo)
fi

if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
  loop_args+=(-- "${codex_extra_args[@]}")
fi

echo "Loop output directory: ${output_dir}"
echo "Loop state directory: ${state_dir}"
echo "Prompt file: ${prompt_file}"
echo "Status file: ${status_file}"
echo "Initial HEAD file: ${head_file}"
echo "Iterations: ${iterations}"
echo "New session every: 1"
if [[ -n "${model}" ]]; then
  echo "Model override: ${model}"
fi
if [[ "${yolo_mode}" == "1" ]]; then
  echo "Yolo mode: enabled"
else
  echo "Yolo mode: disabled"
fi

exec "${loop_args[@]}"
