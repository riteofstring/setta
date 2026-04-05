#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-shared-type-generation-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to migrate the remaining non-HTTP shared
TypeScript/Python type generation path onto a Go-generated schema + semantic
sidecar architecture.

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Stop when Codex explicitly reports the shared type schema migration is complete
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
stop_sentinel="CODEX_LOOP_STOP: SHARED_TYPE_SCHEMA_MIGRATION_COMPLETE"
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
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-shared-type-generation-loop.${timestamp}.XXXXXX")"
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
# Shared Type Generation Schema Migration Checklist

- [ ] Keep HTTP/OpenAPI generation untouched; this loop is only for the non-HTTP shared TS/Python model path.
- [ ] Emit a canonical Go-generated JSON Schema path for non-HTTP shared models.
- [ ] Emit a small Go-generated semantic sidecar for defaults, value exports, inventories, and true discriminated-family semantics.
- [ ] Replace bespoke Python shared-model generation with schema + sidecar generation.
- [ ] Replace bespoke TS shared-model generation with schema + sidecar generation, or with a Go-generated OpenAPI projection only if that materially improves TS output.
- [ ] Remove duplicated TS/Python naming policy where schema/sidecar can be the shared source.
- [ ] Remove handwritten Python route/default inventories that the sidecar replaces.
- [ ] Do not add tautological tests or explicit-list assertion tests.
- [ ] Track net handwritten exception surface across `internal/frontendbindings`, `internal/pythonsharedtypes`, `internal/frontendbindingmeta`, touched owner metadata files, and touched generator/schema entrypoints.
- [ ] Keep total audited migration-surface LOC trending downward now that schema + sidecar bootstrap exists.
- [ ] Prioritize the remaining dominant leftovers: `internal/frontendbindings/type_compiler.go`, `internal/frontendbindings/type_naming.go`, `internal/pythonsharedtypes/generator.go`, and `internal/pythonsharedtypes/schema_aliases.go`.
- [ ] Stop when three consecutive iterations fail to achieve a material net reduction.
- [ ] Keep the repo clean: regenerate, test, run `./gcf.sh`, run `./check_quality.sh`, and commit every non-stop iteration.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop to migrate the remaining
non-HTTP shared TypeScript/Python generation path onto a Go-generated schema +
semantic sidecar architecture.

Primary goal:
- make Go emit one canonical non-HTTP shared-model IR as JSON Schema
- make Go emit one small semantic sidecar for defaults, exported values,
  inventories, and true discriminated-family semantics
- generate \`frontend/src/utils/generatedTypes.ts\` and
  \`backend/setta/types/generated/go_shared_types.py\` from that shared
  schema/sidecar path instead of bespoke per-language structural generators
- keep Go as the source of truth
- do not reopen the HTTP/OpenAPI migration problem

Read first, in this order:
- ${ROOT_DIR}/AGENTS.md
- ${ROOT_DIR}/docs/notes/chatgpt_recommendation.md if it exists
- ${ROOT_DIR}/docs/plans/shared-type-generation-minimization-plan.md
- \`git log --oneline --decorate -n 15\`
- ${checklist_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Chosen architecture:
- canonical non-HTTP shared-model IR: JSON Schema 2020-12
- semantic companion artifact: small Go-generated sidecar manifest
- Python generation: standard schema-driven generator
- TypeScript generation: standard schema-driven generator, or a Go-generated
  OpenAPI 3.1 projection only if that materially improves TS union/name output

Main legacy targets:
- \`internal/frontendbindings/type_naming.go\`
- \`internal/frontendbindings/discriminated_object_families.go\`
- \`internal/frontendbindings/type_compiler.go\`
- \`internal/pythonsharedtypes/contracts.go\`
- \`internal/pythonsharedtypes/type_naming.go\`
- \`internal/pythonsharedtypes/generator.go\`
- \`internal/pythonsharedtypes/value_renderer.go\`
- \`internal/frontendbindingmeta/discriminated_object_families.go\`
- \`internal/frontendbindingmeta/type_metadata.go\`

Current highest-priority leftovers:
- \`internal/frontendbindings/type_compiler.go\`
- \`internal/frontendbindings/type_naming.go\`
- \`internal/pythonsharedtypes/generator.go\`
- \`internal/pythonsharedtypes/schema_aliases.go\`

Non-negotiable rules:
- Do not reopen or redesign the HTTP/OpenAPI endpoint path.
- Do not keep bespoke TS/Python structural model generators as the end state.
- Do not build a second handwritten schema tree by hand.
- Do not preserve generated TS/Python names through compatibility shims.
- Do not move the same handwritten logic into another package and call that
  progress.
- Do not add handwritten allowlists when generated registries or owner metadata
  can express the same thing.
- Do not add tautological tests that only restate explicit lists, metadata, or
  defaults written in the same change.
- Do not add tautological owner-metadata tests or explicit-list assertion tests.
- Do not rely on schema \`default\` alone as a full constructor/default
  mechanism. Constructor defaults and exported values belong in the Go-generated
  sidecar.
- Do not add \`map[string]any\` or language-shaped handwritten object tables.
- Do not keep growing \`internal/sharedtypes/schema.go\`,
  \`internal/sharedtypes/sidecar.go\`, or other shared glue unless the same
  commit deletes a larger bespoke path from the priority leftovers above.
- Do not accept net growth in the total audited migration surface now that the
  schema + sidecar bootstrap already exists.
- Do not keep tiny cleanups going forever once the loop has plateaued.

Execution workflow for every iteration:
- Start with a fresh audit against the checklist.
- Update the checklist to reflect the current repo state before choosing the
  next task.
- Audit the net handwritten exception surface across:
  - \`internal/frontendbindings\`
  - \`internal/pythonsharedtypes\`
  - \`internal/frontendbindingmeta\`
  - touched owner-side metadata/default files
  - touched generator/schema entrypoints in \`cmd/\`
- Pick the highest-leverage remaining migration step toward schema + sidecar,
  prioritizing the four dominant leftovers listed above unless a different path
  clearly deletes more audited handwritten surface in the same commit.
- Prefer replacing a bespoke per-language structural path with schema/sidecar
  output over shaving tiny local helper counts.
- Prefer deleting a whole helper/path/file over shrinking line counts by moving
  logic elsewhere.
- Prefer total audited migration-surface reduction over touched-file-only or
  wrapper-only reductions.
- When generation changes, regenerate before finishing the iteration.
- Run \`./gcf.sh\` before committing. If it fails, fix the failure or stop
  without committing.
- Run focused verification for the area you changed.
- End every non-stop iteration with a clean worktree and a new commit whose
  message starts with \`codex-shared-types:\`.

Material reduction rule:
- A keep-going iteration must achieve at least one of:
  - delete a whole helper/path/file
  - reduce total tracked handwritten exception LOC by at least 20
  - delete a real duplicated metadata/inventory path without adding a new
    explicit enumeration elsewhere
  - replace one bespoke TS/Python structural generation path with schema/sidecar
    output for a meaningful surface area
- And, after the initial schema + sidecar bootstrap, the total audited
  migration-surface LOC must be non-increasing. If a candidate iteration grows
  that total, do not land it unless the same commit still yields a net decrease
  across the audited migration surface by deleting a larger bespoke path.
- If three consecutive iterations cannot meet that bar, make no repo changes,
  leave the worktree clean, and emit the stop sentinel.

Verification minimums:
- focused \`./scripts/go.sh test\` on touched generator packages
- \`./gcf.sh\`
- \`./check_quality.sh\`
- when frontend generated callers are materially affected, run focused Vitest
- when Python generated callers are materially affected, run only the narrowest
  meaningful Python/package verification

Include progress in every final iteration message:
- which duplicated/hardcoded path was removed or reduced
- whether the iteration advanced the schema path, sidecar path, or deletion of a
  bespoke TS/Python generator path
- net before/after tracked handwritten exception LOC across all touched tracked
  files
- whether any logic was deleted versus merely moved
- any unchanged major leftovers that still dominate the remaining surface

If a fresh audit finds no remaining actionable reductions under these rules,
make no repo changes, leave the worktree clean, and end your final response
with this exact line:
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
    --sentinel "${stop_sentinel}" \
    --allow-clean-failures "3"
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
