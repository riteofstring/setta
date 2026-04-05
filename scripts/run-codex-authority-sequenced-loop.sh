#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-authority-sequenced-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop with three strict phases:
1. remove unjustified duplicated logic across Go, Python, and TypeScript
2. replace unjustified polling with websocket pushes
3. run `./report_quality_hotspots.sh` and fix actionable code quality hotspots

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Stop when Codex explicitly reports all three phases are complete
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
  ./scripts/run-codex-authority-sequenced-loop.sh
  ./scripts/run-codex-authority-sequenced-loop.sh --model gpt-5.4
  ./scripts/run-codex-authority-sequenced-loop.sh -- --config reasoning_effort=\"high\"
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
stop_sentinel="CODEX_LOOP_STOP: AUTHORITY_SEQUENCE_COMPLETE"
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
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-authority-sequenced-loop.${timestamp}.XXXXXX")"
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

checklist_file="${state_dir}/checklist.md"
prompt_file="${state_dir}/prompt.md"
hotspot_report_file="${state_dir}/quality-hotspots.txt"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# Authority Sequenced Cleanup Checklist

Keep this file accurate while the loop runs.

Rules:
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase. Do not start a later phase early.
- If a later-phase change reopens an earlier-phase issue, change that earlier item back to \`[ ]\` and return to it immediately.
- Mark a phase item \`[x]\` only after a fresh targeted audit or report proves it is complete.
- Do not delete items.
- The latest saved Phase 3 hotspot report should live at: ${hotspot_report_file}

## Phase 1: Remove Unjustified Cross-Language Duplication
- [ ] Audit duplicated logic across Go, Python, and TypeScript and identify the highest-leverage unjustified duplication still remaining.
- [ ] Remove unjustified duplication while keeping Go as the source of truth for canonical behavior, validation, metadata, contracts, and correctness-sensitive runtime behavior.
- [ ] Regenerate any affected downstream artifacts when Go-owned contracts, frontend generation inputs, backend endpoints, or Go-owned shared types change.
- [ ] Leave only narrowly-scoped, explicitly justified duplication where a concrete platform constraint requires it.
- [ ] Mark Phase 1 complete only after a fresh audit finds no remaining actionable unjustified duplication under the repo rules.

## Phase 2: Replace Unjustified Polling With Websocket Pushes
- [ ] Audit polling paths only after Phase 1 is complete.
- [ ] Replace unjustified polling with websocket pushes when the backend already knows when state changes.
- [ ] Keep any remaining polling only when a concrete documented constraint justifies it.
- [ ] Mark Phase 2 complete only after a fresh audit finds no remaining actionable polling-to-websocket replacements under the repo rules.

## Phase 3: Fix Quality Hotspots
- [ ] Run \`./report_quality_hotspots.sh\` at the start of every Phase 3 iteration and save the latest output to ${hotspot_report_file}.
- [ ] Use the latest hotspot report to choose the highest-leverage actionable hotspot or tight cluster of hotspots.
- [ ] Fix the chosen hotspot work without behavior regressions, fake fallbacks, or avoidable complexity moves.
- [ ] Mark Phase 3 complete only after a fresh hotspot report finds no remaining actionable hotspot cleanup worth landing without churn.

## Completion
- [ ] Before every non-stop commit, run focused verification, \`./gcf.sh\`, and \`./check_quality.sh\`.
- [ ] Every non-stop iteration ends with a clean worktree and a commit whose message starts with \`codex-cleanup:\`.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop for this repository.

Mission:
Complete these three phases in strict order:
1. remove unjustified duplicated logic across Go, Python, and TypeScript
2. replace unjustified polling with websocket pushes
3. run \`./report_quality_hotspots.sh\` and fix actionable code quality hotspots

Read first, in this order:
- ${ROOT_DIR}/AGENTS.md
- ${ROOT_DIR}/docs/reference/go-backed-python.md
- ${ROOT_DIR}/docs/reference/generation-contracts.md
- \`git log --oneline --decorate -n 15\`
- ${checklist_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Phase-order rules:
- Treat the checklist at ${checklist_file} as the source of truth.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase. Do not do Phase 2 work before Phase 1 is complete. Do not do Phase 3 work before Phase 2 is complete.
- If a later edit reopens an earlier-phase issue, set that earlier checklist item back to \`[ ]\` and return to that phase immediately.
- Start each iteration by refreshing the checklist so it matches the actual repo state before you choose the next task.
- Treat this session as standalone. Do not rely on follow-up prompts.

Execution rules for every iteration:
- Start with a fresh targeted audit of the active phase.
- Pick one actionable issue or tightly-related cluster inside the active phase that you can complete confidently in this session.
- Prefer deleting duplicated logic over moving it into wrappers, tiny templates, or helper layers.
- Prefer Go-owned logic, metadata, and generation over duplicated Python or TypeScript logic.
- Regenerate affected downstream artifacts before cleanup when Go-owned contracts, shared types, backend endpoints, or frontend generation inputs change.
- Run focused verification for the behavior you changed.
- Before every non-stop commit, run \`./gcf.sh\` and \`./check_quality.sh\`. If either fails, fix the failure or stop without committing.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-cleanup:\`.
- Do not create a commit if you made no repo changes.
- Do not ask for follow-up.

Phase 1 rules:
- Audit for duplicated logic across Go, Python, and TypeScript and remove unjustified duplication.
- Go is authoritative for canonical behavior, validation, derived metadata, shared contracts, endpoint shapes, and correctness-sensitive local runtime behavior unless the repo explicitly says otherwise.
- Any remaining non-trivial Python or TypeScript duplication must have a concrete justification such as latency, offline requirements, or a platform constraint, and that reason must be documented near the implementation or in relevant design notes.
- Do not count work as progress if it merely moves duplicated downstream structure into helper calls, templates, or per-type builder functions without making Go the authoritative source.
- Mark Phase 1 complete only after a fresh audit finds no remaining actionable unjustified duplication.

Phase 2 rules:
- Enter Phase 2 only after Phase 1 is complete in the checklist.
- Audit polling paths and replace unjustified polling with websocket pushes when the backend already knows when state changes.
- Keep HTTP routes thin under \`internal/httpapi\`, websocket transports thin under \`internal/wsapi\`, and business logic in focused \`internal/*\` services.
- Do not keep polling just because it is convenient. If polling remains, there must be a concrete documented constraint.
- Mark Phase 2 complete only after a fresh audit finds no remaining actionable polling-to-websocket replacements.

Phase 3 rules:
- Enter Phase 3 only after Phase 2 is complete in the checklist.
- At the start of every Phase 3 iteration, run:
  \`./report_quality_hotspots.sh > ${hotspot_report_file}\`
- Read the saved report at ${hotspot_report_file} before choosing work.
- Use the report to pick the highest-leverage actionable hotspot or tight cluster of related hotspots, then simplify it without regressing behavior.
- Favor real structural simplification over just shuffling complexity into neighboring helpers.
- Mark Phase 3 complete only after a fresh hotspot report finds no remaining actionable hotspot cleanup worth landing without churn.

If a fresh audit shows all three phases are complete under these rules, make no repo changes, leave the worktree clean, and end your final response with this exact line:
  ${stop_sentinel}

Completion discipline:
- Any session that does not emit the stop sentinel must produce a new clean commit.
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
  --stop-on-error
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
echo "Latest hotspot report path: ${hotspot_report_file}"
echo "Loop output directory: ${output_dir}"
echo "Loop state directory: ${state_dir}"
echo "Iterations: ${iterations}"
echo "New session every: 1"
echo "Model: ${model}"
echo 'Reasoning effort: xhigh'
if [[ "${yolo_mode}" == "1" ]]; then
  echo "Yolo mode: enabled"
else
  echo "Yolo mode: disabled"
fi

exec "${loop_args[@]}"
