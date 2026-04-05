#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-frontendbindings-openapi-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to replace the bespoke HTTP half of
`internal/frontendbindings` with an OpenAPI-based pipeline.

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Stop when Codex explicitly reports the HTTP/OpenAPI migration is complete
- Require every non-stop iteration to leave a clean worktree and advance HEAD

Options:
  --iterations N         Maximum loop iterations. Default: 1000
  --output-dir PATH      Directory for prompts, checklist, logs, and loop runs.
                         Default: mktemp dir under TMPDIR
  --state-dir PATH       Directory for checklist and loop state.
                         Default: <output-dir>/state
  --model NAME           Model override passed to codex exec.
                         Default: gpt-5.4
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-frontendbindings-openapi-loop.sh
  ./scripts/run-codex-frontendbindings-openapi-loop.sh --model gpt-5.4
  ./scripts/run-codex-frontendbindings-openapi-loop.sh -- --config reasoning_effort=\"high\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
output_dir=""
state_dir=""
model="gpt-5.4"
yolo_mode="1"
complete_exit_code="42"
stop_sentinel="CODEX_LOOP_STOP: FRONTENDBINDINGS_HTTP_OPENAPI_COMPLETE"
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
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-frontendbindings-openapi-loop.${timestamp}.XXXXXX")"
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
# Frontendbindings HTTP OpenAPI Migration Checklist

- [ ] Replace bespoke HTTP endpoint discovery in `internal/frontendbindings` with explicit backend-owned operation metadata.
- [ ] Adopt `Huma` for HTTP OpenAPI generation, or prove a concrete blocker and replace it with explicit typed route registration plus a standard OpenAPI emitter.
- [ ] Make `/api/openapi.json` a real backend output.
- [ ] Generate frontend HTTP types and endpoint functions from OpenAPI using a standard generator instead of custom Go -> TS endpoint conversion.
- [ ] Delete `internal/frontendbindings` HTTP endpoint discovery, naming inference, and HTTP endpoint templates.
- [ ] Keep `internal/frontendbindings` only for non-HTTP frontend contract generation that OpenAPI does not cover.
- [ ] Update frontend callers to the OpenAPI-generated client without compatibility shims.
- [ ] Keep the repo clean: regenerate, test, run `./gcf.sh`, run `./check_quality.sh`, and commit every non-stop iteration.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop to replace the bespoke HTTP half
of \`internal/frontendbindings\` with an OpenAPI-based pipeline.

Primary goal:
- Stop maintaining custom Go -> TypeScript HTTP endpoint conversion logic.
- Make backend HTTP contract metadata explicit and backend-owned.
- Generate frontend HTTP types and endpoint functions from OpenAPI with a
  standard tool.
- Reduce \`internal/frontendbindings\` to the non-HTTP leftovers that OpenAPI
  does not cover.

Read first, in this order:
- ${ROOT_DIR}/AGENTS.md
- ${ROOT_DIR}/docs/notes/chatgpt_recommendation.md
- ${ROOT_DIR}/docs/plans/frontendbindings-openapi-replacement-plan.md
- \`git log --oneline --decorate -n 15\`
- ${checklist_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Chosen architecture:
- backend HTTP contract layer: Huma + OpenAPI 3.1
- frontend HTTP generation: standard OpenAPI generator, default
  \`@hey-api/openapi-ts\`
- keep custom generation only for non-HTTP surfaces like websocket payloads,
  frontend constants, and true TS-only reflection gaps

Non-negotiable rules:
- Do not preserve the current custom HTTP endpoint conversion path.
- Do not keep AST/body inference in \`internal/frontendbindings\` for HTTP.
- Do not write a second custom OpenAPI emitter unless Huma is concretely
  blocked. "Blocked" means a demonstrated code-level incompatibility, not
  discomfort or habit.
- If Huma is blocked, the only acceptable fallback is explicit typed route
  registration in \`internal/httpapi\` plus a standard OpenAPI emitter.
- Do not add or preserve handwritten endpoint inventories, route manifests,
  compatibility-name shims, or per-endpoint wrapper tables.
- Do not add or preserve per-endpoint wrappers around the generated OpenAPI
  client.
- Do not preserve existing generated TypeScript or Python names for
  compatibility.
- Update callers instead of shimming.
- Keep temporary breakage acceptable if the change materially deletes the old
  custom HTTP generator path.
- Do not rebuild a new bespoke endpoint compiler under another name.
- Do not add tautological generator tests.

Execution workflow for every iteration:
- Start with a fresh audit against the checklist.
- Pick the highest-leverage remaining violation on the HTTP/OpenAPI path.
- Prefer deleting old HTTP generator code over adapting it.
- When the change touches generation or generated outputs, regenerate before
  finishing the iteration.
- Run \`./gcf.sh\` before committing. If it fails, fix the failure or stop
  without committing.
- Run focused verification for the area you changed.
- Minimum expected verification for HTTP/OpenAPI generator work is:
  - focused \`./scripts/go.sh test\` on touched \`internal/httpapi\` and
    generator packages
  - frontend tests for touched callers when frontend code changes
  - \`./check_quality.sh\`
- End every non-stop iteration with a clean worktree and a new commit whose
  message starts with \`codex-frontendbindings-openapi:\`.

Practical guidance:
- Do not spend more than one iteration on architectural hesitation.
- Either land Huma-based OpenAPI registration, or prove a concrete blocker and
  move to the typed-registration fallback immediately.
- Preserve backend behavior, auth, and mode requirements, but do not preserve
  old generated helper APIs just because they existed.
- A thin shared transport configuration layer is acceptable if it configures the
  generated OpenAPI client once. It must not restate endpoints or schemas.
- \`internal/frontendbindings\` may continue to exist for websocket contracts,
  constants, defaults, and small TS metadata hooks, but HTTP endpoint discovery
  and HTTP endpoint rendering must leave that package.

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
