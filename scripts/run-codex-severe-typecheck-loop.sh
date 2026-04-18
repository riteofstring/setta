#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-severe-typecheck-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop with one strict phase:
1. fix all actionable severe type errors without churning on non-severe type backlog

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Inactivity timeout: 1800 seconds without transcript updates
- Stop only when Codex explicitly reports that no actionable severe type errors remain
- Require every non-stop iteration to leave a clean worktree and either advance HEAD or advance the saved checklist/audit state

Options:
  --iterations N         Maximum loop iterations. Default: 1000
  --output-dir PATH      Directory for prompts, checklist, logs, and loop runs.
                         Default: mktemp dir under TMPDIR
  --state-dir PATH       Directory for checklist and loop state.
                         Default: <output-dir>/state
  --model NAME           Model override passed to codex exec.
                         Default: gpt-5.4
  --inactivity-timeout-seconds N
                         Abort and retry an iteration if Codex produces no
                         transcript output for N seconds. Default: 1800
  --post-commit-settle-seconds N
                         Wait N seconds after each successful iteration and
                         verify the repo is still clean before marking that
                         iteration successful. Default: 20
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-severe-typecheck-loop.sh
  ./scripts/run-codex-severe-typecheck-loop.sh --model gpt-5.4
  ./scripts/run-codex-severe-typecheck-loop.sh -- --config reasoning_effort=\"high\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
output_dir=""
state_dir=""
model="gpt-5.4"
yolo_mode="1"
inactivity_timeout_seconds="1800"
post_commit_settle_seconds="20"
complete_exit_code="42"
complete_stop_sentinel="CODEX_LOOP_STOP: SEVERE_TYPECHECK_AUDITED_STOP"
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
    --inactivity-timeout-seconds)
      require_value "$1" "${2:-}"
      inactivity_timeout_seconds="$2"
      shift 2
      ;;
    --post-commit-settle-seconds)
      require_value "$1" "${2:-}"
      post_commit_settle_seconds="$2"
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

if [[ ! "${inactivity_timeout_seconds}" =~ ^[0-9]+$ ]] || [[ "${inactivity_timeout_seconds}" -lt 1 ]]; then
  echo "--inactivity-timeout-seconds must be a positive integer" >&2
  exit 1
fi

if [[ ! "${post_commit_settle_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--post-commit-settle-seconds must be a non-negative integer" >&2
  exit 1
fi

if ! repo_is_clean; then
  echo "Refusing to start: repository is not clean." >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-severe-typecheck-loop.${timestamp}.XXXXXX")"
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

frontend_typecheck_command="$(
  shell_join \
    "./check_types.sh" \
    --frontend
)"
python_typecheck_command="$(
  shell_join \
    "./check_types.sh" \
    --python
)"
go_typecheck_command="$(
  shell_join \
    "./check_types.sh" \
    --go
)"

checklist_file="${state_dir}/checklist.md"
prompt_file="${state_dir}/prompt.md"
severe_type_audit_file="${state_dir}/severe-type-audit.md"
frontend_typecheck_file="${state_dir}/frontend-typecheck.txt"
python_typecheck_file="${state_dir}/python-typecheck.txt"
go_typecheck_file="${state_dir}/go-typecheck.txt"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

if [[ ! -f "${severe_type_audit_file}" ]]; then
  cat > "${severe_type_audit_file}" <<EOF
# Severe Type Audit

Keep this file compact and current-state only.
Overwrite stale notes instead of appending an iteration diary.

## Severity rubric
- Severe:
  - likely runtime or protocol breakage on supported production paths
  - broken owner/generated contract drift across Go, Python, and TypeScript
  - missing or renamed exports, imports, symbols, properties, discriminants, or required fields that production code depends on
  - handler-map, enum, JSX, or component typing that points to a real live-code crash, dropped message, or broken dispatch path
- Duplication policy:
  - Do not introduce duplicate code or logic merely to satisfy the type checker.
  - Before adding a local type, helper, wrapper, adapter, or normalizer, first reuse an existing authoritative type or helper if one already exists.
  - If the only problem is that an owner-side helper type is private, prefer exporting and reusing it from the owner module instead of re-declaring the same shape locally.
  - If a normalization boundary is genuinely unavoidable because two owner surfaces are materially different, keep it minimal, make it the only such boundary for that concept, and record the reason briefly in this audit.
- Usually not severe by default:
  - exactOptionalPropertyTypes or nullability churn that does not indicate runtime breakage
  - test-only fixture typing or helper typing backlog
  - generated-file noise unless it points back to an owner-side severe contract drift
  - broad legacy typing backlog that is not required to land the current severe fix

## Current severe actionable findings

## Current target

## High-risk contract surfaces checked
- Before completion, explicitly audit high-risk shared-contract and runtime-dispatch surfaces that can evade raw typecheck output.

## Deferred non-severe or test-only backlog

## Completion basis
- Completion means no actionable severe type errors remain under the rubric above.
- Non-severe type backlog may remain and should stay listed briefly here instead of consuming loop iterations.
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# Severe Type Error Checklist

Keep this file accurate while the loop runs.

Rules:
- This loop has one phase only: fix actionable severe type errors.
- Treat ${severe_type_audit_file} as the current severity source of truth.
- Mark an item \`[x]\` only after a fresh audit or verification proves it.
- Do not delete items.
- The latest saved frontend typecheck output should live at: ${frontend_typecheck_file}
- The latest saved Python typecheck output should live at: ${python_typecheck_file}
- Save Go typecheck output to: ${go_typecheck_file} when Go changes or before declaring completion.

## Phase 1: Fix Severe Type Errors
- [ ] Refresh ${frontend_typecheck_file} with ${frontend_typecheck_command} at the start of every iteration and save stdout/stderr there.
- [ ] Refresh ${python_typecheck_file} with ${python_typecheck_command} at the start of every iteration and save stdout/stderr there.
- [ ] Update ${severe_type_audit_file} on every iteration with only the current severe actionable findings, current target, and brief deferred non-severe backlog needed for triage.
- [ ] Use the saved typecheck outputs as candidate generators, not a blanket todo list. Fix only actionable severe errors under the severity rubric.
- [ ] Choose one highest-leverage severe error or tightly related severe error cluster and fix it fully before moving on.
- [ ] Do not introduce duplicate code or logic to satisfy the type checker. Reuse existing authoritative types and helpers first; if an owner-side helper type is private, export and reuse it instead of copying its shape locally.
- [ ] Manually audit high-risk shared-contract and dispatch surfaces that can evade raw typecheck output, especially generated enums or unions used by runtime handler maps.
- [ ] When generated artifacts are implicated, fix the owner inputs and regenerate instead of manually editing generated files.
- [ ] Run focused verification and the relevant language type checks for the code you changed.
- [ ] Before every non-stop commit, run \`./gcf.sh\` and \`./scripts/check_quality_for_git_changes.sh\`.
- [ ] Every non-stop iteration ends with a clean worktree and a commit whose message starts with \`codex-typefix:\`.

## Completion
- [ ] Mark completion only after a fresh severe-type audit plus fresh saved typecheck outputs show no remaining actionable severe type errors under the severity rubric, and the high-risk shared-contract/dispatch audit is also clean. Non-severe backlog may remain.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop for this repository.

Mission:
Complete the single phase of this loop:
fix all actionable severe type errors in the repo without burning time on non-severe type backlog.

Read first, in this order:
- ${ROOT_DIR}/AGENTS.md
- ${ROOT_DIR}/docs/guides/dev-scripts.md
- ${ROOT_DIR}/docs/reference/go-backed-python.md
- \`git log --oneline --decorate -n 15\`
- ${checklist_file}
- ${severe_type_audit_file} if it exists
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Severity rubric:
- Count an error as severe when it points to likely runtime breakage or broken ownership/contract drift on supported production paths.
- Typical severe examples:
  - missing or renamed exports, imports, symbols, properties, enum members, discriminants, or required fields used by production code
  - generated contract drift that breaks protocol dispatch, handler maps, or other live runtime wiring
  - JSX/component type failures that imply a component may be undefined or called with impossible live props
  - owner/generated mismatches across Go, Python, and TypeScript that indicate a broken shared contract
- Duplication policy for this loop:
  - Do not introduce duplicate code or logic merely to silence type errors.
  - Before adding a local type, helper, wrapper, adapter, or normalizer, first search for an existing authoritative type or helper and reuse it.
  - If the only issue is that an owner-side helper type is private, export and reuse it from the owner module instead of re-declaring the same structure locally.
  - If two owner surfaces are genuinely different and a normalization boundary is unavoidable, keep it minimal, keep exactly one such boundary for that concept, and record the reason in ${severe_type_audit_file}.
- Usually not severe by default:
  - exactOptionalPropertyTypes, nullability, or narrowing churn that does not indicate runtime breakage
  - test-only fixture typing, helper typing, or broad legacy test backlog
  - generated-file noise unless it points back to an owner-side severe contract regression
  - broad repo type backlog that is not required to land the current severe fix
- If an error is ambiguous, use production-path runtime impact as the decision rule and record the rationale briefly in ${severe_type_audit_file}.
- Typecheck outputs are candidate generators only. Some severe protocol and shared-contract regressions can evade raw typecheck output or be masked by generated types/tests.

Execution rules for every iteration:
- Treat the checklist at ${checklist_file} and the audit at ${severe_type_audit_file} as the source of truth.
- Start each iteration by refreshing the saved typecheck outputs:
  - run ${frontend_typecheck_command} and save stdout/stderr to ${frontend_typecheck_file}
  - run ${python_typecheck_command} and save stdout/stderr to ${python_typecheck_file}
- Run ${go_typecheck_command} and save stdout/stderr to ${go_typecheck_file} whenever you touch Go code or before declaring completion.
- After refreshing outputs, update ${severe_type_audit_file} so it reflects only current severe actionable findings and the brief deferred non-severe backlog relevant to triage.
- Use the saved typecheck outputs as candidate generators, not as a blanket requirement to fix every reported issue.
- Pick one actionable severe error or tightly related severe cluster that you can complete confidently in this session.
- Prefer owner-side fixes and regeneration over papering over generated outputs or adding compatibility wrappers.
- Prefer exporting and reusing authoritative helper types over copying the same union or object shape into another file.
- Do not create duplicate app-local types or logic when an existing owner type or helper can be reused directly.
- In addition to reading typecheck outputs, manually audit high-risk shared-contract surfaces that often evade raw typecheck logs:
  - generated enums and unions used by runtime dispatch maps
  - owner/generated contract pairs where live runtime string constants can diverge from generated unions
  - frontend handler maps whose computed keys depend on generated enum members
  - Any drift that can leave production-path runtime dispatch unable to handle real owner-side messages or payloads must block completion.
- Do not hand-edit generated files. If a generated file is wrong, fix the owner and regenerate.
- Run focused verification for the behavior you changed.
- Do not use Chrome DevTools, browser MCP, or other browser-driven verification in this loop. This is a type-error cleanup loop; prefer static checks, generation, and focused tests.
- Before every non-stop commit, run the relevant language type checks for the code you touched, then run \`./gcf.sh\`, then run \`./scripts/check_quality_for_git_changes.sh\`.
- When you launch a long-running shell command such as \`./gcf.sh\`, treat partial streamed output as still in progress. Do not inspect diffs, run follow-up commands, or commit until that command has fully exited successfully.
- Treat \`No supported files to check.\` from \`./scripts/check_quality_for_git_changes.sh\` as acceptable only when the current git diff contains no Go, Python, or frontend source files that \`./check_quality.sh\` would normally inspect.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-typefix:\`.
- Do not create a commit if you made no repo changes.
- Do not ask for follow-up.

Severe-only discipline:
- Do not spend an iteration fixing broad non-severe type backlog just because it appears in the saved typecheck outputs.
- It is acceptable to leave non-severe type errors in place when they do not indicate runtime breakage and do not block the current severe fix.
- If you must touch a little non-severe typing to land a severe fix cleanly, keep that spillover minimal and targeted.
- Production code and shared contract surfaces matter more than test-only typing.
- If a severe issue originates in shared contracts, generated frontend types, or Go-owned Python surfaces, fix the authoritative owner and regenerate downstream artifacts before cleanup.
- A type-only duplication that papers over an existing authoritative helper or shape is not an acceptable fix for this loop.

Completion rule:
- If a fresh audit plus fresh saved typecheck outputs and high-risk shared-contract audit show no remaining actionable severe type errors under the severity rubric, make no repo changes, leave the worktree clean, state that the stop reason is complete, and end your final response with this exact line:
  ${complete_stop_sentinel}

Completion discipline:
- Any session that does not emit the stop sentinel must either produce a new clean commit or leave the repo unchanged while advancing the checklist and audit state needed for the next severe fix.
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
    --sentinel "${complete_stop_sentinel}" \
    --progress-file "${checklist_file}" \
    --progress-file "${severe_type_audit_file}" \
    --allow-clean-failures "3"
)"

post_iteration_command="$(
  shell_join \
    "${ROOT_DIR}/scripts/codex-authority-post-iteration-clean-check.sh" \
    --root-dir "${ROOT_DIR}" \
    --settle-seconds "${post_commit_settle_seconds}"
)"

loop_args=(
  "${ROOT_DIR}/scripts/run-codex-loop.sh"
  --prompt-file "${prompt_file}"
  --followup-prompt-file "${prompt_file}"
  --iterations "${iterations}"
  --new-session-every "1"
  --output-dir "${output_dir}"
  --workdir "${ROOT_DIR}"
  --inactivity-timeout-seconds "${inactivity_timeout_seconds}"
  --watchdog-interval-seconds "30"
  --continue-on-inactivity-timeout
  --pre-iteration-command "${pre_iteration_command}"
  --post-iteration-command "${post_iteration_command}"
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
echo "Severe type audit file: ${severe_type_audit_file}"
echo "Frontend typecheck log: ${frontend_typecheck_file}"
echo "Python typecheck log: ${python_typecheck_file}"
echo "Go typecheck log: ${go_typecheck_file}"
echo "Loop output directory: ${output_dir}"
echo "Loop state directory: ${state_dir}"
echo "Iterations: ${iterations}"
echo "New session every: 1"
echo "Model: ${model}"
echo 'Reasoning effort: xhigh'
echo "Inactivity timeout: ${inactivity_timeout_seconds}s"
echo "Post-commit settle check: ${post_commit_settle_seconds}s"
if [[ "${yolo_mode}" == "1" ]]; then
  echo "Yolo mode: enabled"
else
  echo "Yolo mode: disabled"
fi

exec "${loop_args[@]}"
