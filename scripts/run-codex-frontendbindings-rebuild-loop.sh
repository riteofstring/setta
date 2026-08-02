#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-frontendbindings-rebuild-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to rebuild the Go -> TypeScript frontend
binding pipeline from scratch so it matches the high-level shape of the main
branch Python -> TypeScript converters, adapted to Go.

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.5`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Stop when Codex explicitly reports the frontendbindings rebuild is complete
- Require every non-stop iteration to leave a clean worktree and advance HEAD

Options:
  --iterations N         Maximum loop iterations. Default: 1000
  --output-dir PATH      Directory for prompts, checklist, logs, and loop runs.
                         Default: mktemp dir under TMPDIR
  --state-dir PATH       Directory for checklist and loop state.
                         Default: <output-dir>/state
  --model NAME           Model override passed to codex exec.
                         Default: gpt-5.5
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-frontendbindings-rebuild-loop.sh
  ./scripts/run-codex-frontendbindings-rebuild-loop.sh --model gpt-5.5
  ./scripts/run-codex-frontendbindings-rebuild-loop.sh -- --config reasoning_effort=\"high\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
output_dir=""
state_dir=""
model="gpt-5.5"
yolo_mode="1"
complete_exit_code="42"
stop_sentinel="CODEX_LOOP_STOP: FRONTENDBINDINGS_REBUILT"
codex_extra_args=()
default_codex_extra_args=(
  --config
  'reasoning_effort="xhigh"'
)

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
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-frontendbindings-rebuild-loop.${timestamp}.XXXXXX")"
else
  output_dir="$(resolve_path_without_creating "${output_dir}")"
  if [[ "${output_dir}" == "${ROOT_DIR}" ]] || [[ "${output_dir}" == "${ROOT_DIR}/"* ]]; then
    echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
  mkdir -p "${output_dir}"
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

mkdir -p "${output_dir}" "${state_dir}"

checklist_file="${state_dir}/checklist.md"
prompt_file="${state_dir}/prompt.md"

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<'EOF'
# Frontendbindings Rebuild Checklist

- [ ] Delete the current `internal/frontendbindings` implementation wholesale and rebuild only the minimal files that survive the new architecture.
- [ ] Replace handwritten endpoint inventory with typed backend route registration or discovery that both the server and generator consume.
- [ ] Reduce type generation to one generic reflection/discovery pipeline plus a tiny true-exception layer.
- [ ] Remove per-type default and factory duplication for generated contracts, especially `map[string]any` payload tables, contract-name switches, and field-by-field `createX` logic.
- [ ] Delete remaining mirrored contract ownership from `internal/frontendbindings`.
- [ ] Delete tautological `frontendbindings` tests and keep only owner-package or downstream behavior verification.
- [ ] Regenerate downstream TypeScript and Python surfaces and adapt callers without compatibility-name shims.
- [ ] Confirm `internal/frontendbindings` is a thin generator boundary rather than a second contract tree.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop to rebuild the Go -> TypeScript
frontend binding pipeline from scratch.

Primary goal:
- Replace the current \`internal/frontendbindings\` approach with the same
  high-level shape as \`origin/main\`'s
  \`frontend/generation/convert_pydantic_to_js.py\` and
  \`frontend/generation/convert_endpoints.py\`, adapted to Go.
- Use a scorched-earth approach: assume the current \`internal/frontendbindings\`
  implementation can be deleted wholesale and rebuilt from scratch. Do not try
  to salvage or incrementally preserve the existing package shape.

Read first, in this order:
- ${ROOT_DIR}/AGENTS.md
- \`git log --oneline --decorate -n 15\`
- \`git show origin/main:frontend/generation/convert_pydantic_to_js.py | sed -n '1,220p'\`
- \`git show origin/main:frontend/generation/convert_endpoints.py | sed -n '1,220p'\`
- ${checklist_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Non-negotiable architecture rules:
- Do not preserve the existing generated TypeScript or Python surface just for
  compatibility.
- Update downstream Go, TypeScript, and Python callers instead of adding
  compatibility-name shims.
- Do not move handwritten knowledge from one file to another and call it
  progress.
- Do not add or preserve wrapper-owned contracts in
  \`internal/frontendbindings\`.
- Do not add or preserve handwritten endpoint inventories like \`specs.go\`.
- Do not add or preserve per-type metadata piles, compatibility-name tables, or
  exception registries unless they are tiny and obviously unavoidable.
- Do not add or preserve per-type \`createX\` builders or field-by-field
  downstream object construction.
- Do not encode generated frontend contract defaults as \`map[string]any\`
  payload tables or big \`switch\` statements over contract names.
- If a default must be explicit, prefer a typed Go constructor or typed Go
  value owned by the real package, not an untyped mirror of the TypeScript
  object shape.
- Delete tautological generator tests and do not add new ones.
- Generated artifacts may change. Cleaner generation is more important than
  preserving current output.

Target shape:
- one generic Go-owned type converter
- one endpoint converter driven by typed backend registration or discovery
- a very small exception layer for true unions, tuples, type guards, or
  reflection gaps
- owner packages own contracts
- \`internal/frontendbindings\` is a thin generator boundary, not a second
  schema tree

Execution workflow for every iteration:
- Start with a fresh audit against the checklist and the main-branch model.
- Pick the highest-leverage remaining violation and fix it.
- Prefer demolition over compatibility work.
- Default to deleting code, files, and tests rather than adapting them.
- Delete dead code and dead tests immediately instead of staging transitional
  junk.
- When changing generator or Go-owned contract surfaces, regenerate before
  finishing the iteration.
- Run \`./gcf.sh\` before committing. If it fails, either fix the failure or
  stop without committing; do not commit half-regenerated output.
- Run focused verification for the area you changed. Minimum expected
  verification for \`frontendbindings\` generator work is
  \`./scripts/go.sh test ./cmd/setta-gen-frontend-bindings ./internal/frontendbindings -count=1\`,
  plus any directly affected owner-package or frontend tests.
- Run \`./check_quality.sh\` before committing.
- End every non-stop iteration with a clean worktree and a new commit whose
  message starts with \`codex-frontendbindings:\`.

Progress rules:
- Temporary broader app breakage is acceptable if the change materially deletes
  hardcoded garbage and moves the architecture toward the target shape.
- Do not spend an iteration adding shims just to keep old generated names or
  helper APIs alive.
- Do not stop at "moved the hardcoding behind helpers, templates, or metadata".
  That is not progress.
- Keep ${checklist_file} accurate. Mark an item done only when the repo
  actually reflects it. If later edits reopen the issue, mark it undone again.

If a fresh audit finds no remaining actionable violations of these rules and the
checklist is complete, make no repo changes, leave the worktree clean, and end
your final response with this exact line:
  ${stop_sentinel}

Completion discipline:
- Any session that does not emit the stop sentinel must produce a new clean
  commit.
- Never end the session with uncommitted, unstaged, or untracked repo changes.
- Do not ask for follow-up.
EOF

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
)

if [[ -n "${model}" ]]; then
  loop_args+=(--model "${model}")
fi

if [[ "${yolo_mode}" == "1" ]]; then
  loop_args+=(--yolo)
fi

combined_codex_extra_args=("${default_codex_extra_args[@]}")
if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
  combined_codex_extra_args+=("${codex_extra_args[@]}")
fi

if [[ ${#combined_codex_extra_args[@]} -gt 0 ]]; then
  loop_args+=(-- "${combined_codex_extra_args[@]}")
fi

echo "Checklist: ${checklist_file}"
echo "Loop output directory: ${output_dir}"
echo "Iterations: ${iterations}"
echo "New session every: 1"
echo "Model: ${model}"
echo 'Reasoning effort: xhigh'

exec "${loop_args[@]}"
