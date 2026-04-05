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
- Stop when Codex explicitly reports either true audited completion or a documented sustained plateau
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
stop_sentinel="CODEX_LOOP_STOP: AUTHORITY_SEQUENCE_AUDITED_STOP"
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
duplication_audit_file="${state_dir}/duplication-audit.md"
polling_audit_file="${state_dir}/polling-audit.md"
hotspot_review_file="${state_dir}/hotspot-review.md"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

if [[ ! -f "${duplication_audit_file}" ]]; then
  cat > "${duplication_audit_file}" <<EOF
# Phase 1 Duplication Audit

Update this file during Phase 1.

## Remaining unjustified duplication

## Remaining justified duplication
- Add file references plus concrete rationale for every remaining justified case.
EOF
fi

if [[ ! -f "${polling_audit_file}" ]]; then
  cat > "${polling_audit_file}" <<EOF
# Phase 2 Polling Audit

Update this file during Phase 2.

## Remaining actionable polling

## Remaining justified polling
- Add file references plus the concrete backend/runtime constraint for every remaining justified case.
EOF
fi

if [[ ! -f "${hotspot_review_file}" ]]; then
  cat > "${hotspot_review_file}" <<EOF
# Phase 3 Hotspot Review

Update this file during Phase 3.

## Latest top-10 hotspot snapshot

## Current target

## Before/after result

## Consecutive no-material-reduction Phase 3 iterations
- 0

## Remaining top hotspots and rationale
- Add file references plus why each remaining top hotspot is either still actionable or currently blocked/plateaued.
EOF
fi

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
- The latest saved Phase 1 duplication audit should live at: ${duplication_audit_file}
- The latest saved Phase 2 polling audit should live at: ${polling_audit_file}
- The latest saved Phase 3 hotspot report should live at: ${hotspot_report_file}
- The latest saved Phase 3 hotspot review should live at: ${hotspot_review_file}

## Phase 1: Remove Unjustified Cross-Language Duplication
- [ ] Update the Phase 1 duplication audit at ${duplication_audit_file} on every Phase 1 iteration.
- [ ] Audit duplicated logic across Go, Python, and TypeScript and identify the highest-leverage unjustified duplication still remaining.
- [ ] Remove unjustified duplication while keeping Go as the source of truth for canonical behavior, validation, metadata, contracts, and correctness-sensitive runtime behavior.
- [ ] Regenerate any affected downstream artifacts when Go-owned contracts, frontend generation inputs, backend endpoints, or Go-owned shared types change.
- [ ] Record every remaining justified duplication in ${duplication_audit_file} with file references and concrete rationale.
- [ ] Mark Phase 1 complete only after ${duplication_audit_file} reflects the current repo state and a fresh audit finds no remaining actionable unjustified duplication under the repo rules.

## Phase 2: Replace Unjustified Polling With Websocket Pushes
- [ ] Update the Phase 2 polling audit at ${polling_audit_file} on every Phase 2 iteration.
- [ ] Audit polling paths only after Phase 1 is complete.
- [ ] Replace unjustified polling with websocket pushes when the backend already knows when state changes.
- [ ] Record every remaining justified polling path in ${polling_audit_file} with file references and the concrete backend/runtime constraint.
- [ ] Mark Phase 2 complete only after ${polling_audit_file} reflects the current repo state and a fresh audit finds no remaining actionable polling-to-websocket replacements under the repo rules.

## Phase 3: Fix Quality Hotspots
- [ ] Run \`./report_quality_hotspots.sh\` at the start of every Phase 3 iteration and save the latest output to ${hotspot_report_file}.
- [ ] Update the Phase 3 hotspot review at ${hotspot_review_file} on every Phase 3 iteration.
- [ ] Use the latest hotspot report to choose the highest-leverage actionable hotspot or tight cluster of hotspots.
- [ ] Count a Phase 3 iteration as material only when it removes a current top-10 hotspot, lowers a current top-10 hotspot score, or clearly reduces structural branching in a current top-10 hotspot file without just moving complexity sideways.
- [ ] If Phase 3 plateaus, require three consecutive audited no-material-reduction iterations documented in ${hotspot_review_file} before stopping.
- [ ] Mark Phase 3 complete only after ${hotspot_review_file} and a fresh hotspot report show no remaining actionable hotspot cleanup worth landing without churn. Do not mark it complete when the real result is plateau.

## Completion
- [ ] Before every non-stop commit, run focused verification, \`./gcf.sh\`, and \`./scripts/check_quality_for_git_changes.sh\`.
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
- ${duplication_audit_file} if it exists
- ${polling_audit_file} if it exists
- ${hotspot_review_file} if it exists
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
- Before every non-stop commit, run \`./gcf.sh\` and then \`./scripts/check_quality_for_git_changes.sh\`. If either fails, fix the failure or stop without committing.
- Treat \`No supported files to check.\` from \`./scripts/check_quality_for_git_changes.sh\` as acceptable only when the current git diff contains no Go, Python, or frontend source files that \`./check_quality.sh\` would normally inspect.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-cleanup:\`.
- Do not create a commit if you made no repo changes.
- Do not ask for follow-up.

Phase 1 rules:
- Audit for duplicated logic across Go, Python, and TypeScript and remove unjustified duplication.
- Update ${duplication_audit_file} during every Phase 1 iteration.
- Go is authoritative for canonical behavior, validation, derived metadata, shared contracts, endpoint shapes, and correctness-sensitive local runtime behavior unless the repo explicitly says otherwise.
- Any remaining non-trivial Python or TypeScript duplication must have a concrete justification such as latency, offline requirements, or a platform constraint, and that reason must be documented near the implementation or in relevant design notes.
- Do not count work as progress if it merely moves duplicated downstream structure into helper calls, templates, or per-type builder functions without making Go the authoritative source.
- Before marking Phase 1 complete, make sure ${duplication_audit_file} lists every remaining justified duplication with file references and concrete rationale.
- Mark Phase 1 complete only after a fresh audit finds no remaining actionable unjustified duplication.

Phase 2 rules:
- Enter Phase 2 only after Phase 1 is complete in the checklist.
- Update ${polling_audit_file} during every Phase 2 iteration.
- Audit polling paths and replace unjustified polling with websocket pushes when the backend already knows when state changes.
- Keep HTTP routes thin under \`internal/httpapi\`, websocket transports thin under \`internal/wsapi\`, and business logic in focused \`internal/*\` services.
- Do not keep polling just because it is convenient. If polling remains, there must be a concrete documented constraint.
- Before marking Phase 2 complete, make sure ${polling_audit_file} lists every remaining justified polling path with file references and the concrete backend/runtime constraint.
- Mark Phase 2 complete only after a fresh audit finds no remaining actionable polling-to-websocket replacements.

Phase 3 rules:
- Enter Phase 3 only after Phase 2 is complete in the checklist.
- At the start of every Phase 3 iteration, run:
  \`./report_quality_hotspots.sh > ${hotspot_report_file}\`
- Read the saved report at ${hotspot_report_file} before choosing work.
- Update ${hotspot_review_file} during every Phase 3 iteration.
- Use the report to pick the highest-leverage actionable hotspot or tight cluster of related hotspots, then simplify it without regressing behavior.
- Favor real structural simplification over just shuffling complexity into neighboring helpers.
- Do not mark Phase 3 complete just because the remaining hotspots are orchestration paths. You must name the concrete reason they are no longer good cleanup targets.
- A Phase 3 iteration counts as material only if it does at least one of:
  - removes a current top-10 hotspot from the saved report
  - lowers the reported complexity score of a current top-10 hotspot
  - clearly reduces structural branching in a current top-10 hotspot file without merely moving that complexity into adjacent helpers
- Keep a consecutive no-material-reduction counter in ${hotspot_review_file}.
- If three consecutive audited Phase 3 iterations fail to achieve a material reduction, make no repo changes, leave the Phase 3 completion checkbox unchecked, explain that the stop reason is plateau, and end with the stop sentinel.
- Mark Phase 3 complete only after a fresh hotspot report and ${hotspot_review_file} show no remaining actionable hotspot cleanup worth landing without churn.

If a fresh audit shows all three phases are complete under these rules, make no repo changes, leave the worktree clean, state that the stop reason is complete, and end your final response with this exact line:
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
echo "Phase 1 audit file: ${duplication_audit_file}"
echo "Phase 2 audit file: ${polling_audit_file}"
echo "Latest hotspot report path: ${hotspot_report_file}"
echo "Phase 3 review file: ${hotspot_review_file}"
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
