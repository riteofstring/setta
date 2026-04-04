#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-converter-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop focused on converting
`internal/frontendbindings/converter.go` back into a real generic converter
instead of a handwritten TypeScript schema/default/factory inventory.

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Yolo mode: on
- Stop only when Codex emits the explicit stop sentinel and the converter-specific
  checker agrees that the objective conditions are satisfied
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
  ./scripts/run-codex-converter-loop.sh
  ./scripts/run-codex-converter-loop.sh --model gpt-5.4 -- --config reasoning_effort=\"high\"
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
stop_sentinel="CODEX_LOOP_STOP: CONVERTER_GENERICIZED"
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
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-converter-loop.${timestamp}.XXXXXX")"
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
Primary goal:
- Unfuck ${ROOT_DIR}/internal/frontendbindings/converter.go.
- Make it a real converter again, not a handwritten TypeScript schema/default/factory inventory.

What counts as success:
- Remove per-type hardcoded TypeScript declaration inventories from converter.go.
- Remove field-by-field downstream TS construction patterns from converter.go, including helper-wrapped mirrors such as \`tsObjectField(...)\`, \`objectDeclarationWithCreateExpr(...)\`, \`objectDeclarationWithCreateBody(...)\`, \`exportedResolvedFactoryDeclaration(...)\`, \`exportedDefaultsFactoryDeclaration(...)\`, and similar per-type handwritten output construction.
- Derive ordinary object, alias, and enum declarations from Go reflection and Go-owned metadata.
- Derive defaults and factory behavior from Go-owned defaults or narrow authoritative metadata where possible.
- Keep only narrow semantic special cases that cannot be represented generically.
- Do not "solve" this by moving the same hardcoded inventory into more helper functions, tiny templates, or sibling support files.

Non-goals for this loop:
- Do not broad-audit Python ownership, websocket polling, or unrelated authority cleanup unless directly required by the converter refactor.
- Do not make cosmetic file splits that preserve the same hardcoded logic.

Required reading:
- ${ROOT_DIR}/AGENTS.md
- recent commits: \`git log --oneline --decorate -n 15\`
- ${ROOT_DIR}/internal/frontendbindings/converter.go
- ${ROOT_DIR}/internal/frontendbindings/render.go
- ${ROOT_DIR}/internal/frontendbindings/generator_test.go
- ${ROOT_DIR}/internal/frontendbindings/validation_test.go
- ${ROOT_DIR}/docs/plans/go-owned-type-generation-cleanup-plan.md
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Execution rules:
- Start with a fresh targeted audit of converter.go and only the immediately-adjacent code needed to simplify it correctly.
- Pick one coherent structural slice per session and finish it completely.
- Prefer Go-owned metadata and generic generation over handwritten TS mirrors.
- If a special case must remain, make it narrow, explicit, and justified in code or tests.
- If you touch Go-owned frontend contract generation, regenerate before finishing.
- Before every commit, run \`./gcf.sh\`. If \`./gcf.sh\` fails, fix the failure or stop and report it instead of committing.
- Run focused verification at minimum:
  - \`./scripts/go.sh test ./internal/frontendbindings ./internal/pythonsharedtypes ./internal/pythonsdkcontracts -count=1\`
- End every non-stop iteration with a clean worktree and a commit whose message starts with \`codex-converter:\`.
- Do not create a commit if you made no repo changes.
- Do not ask for follow-up.

Important stop-discipline:
- The loop checker will reject a stop response unless converter.go no longer contains \`manualTypes\`, \`manualExtraDeclarations\`, \`tsObjectField(\`, \`projectStateAliasFactoryDeclarations\`, or \`map[reflect.Type]...\` declaration inventories, and unless the remaining suspicious per-type builder usage has been reduced to a narrow residual level.
- Do not emit the stop sentinel until those conditions are actually true.

If there are no remaining actionable converter-specific hardcoded mirror patterns, make no repo changes, leave the worktree clean, and end your final response with this exact line:
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
    "${ROOT_DIR}/scripts/codex-converter-loop-check.sh" \
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
