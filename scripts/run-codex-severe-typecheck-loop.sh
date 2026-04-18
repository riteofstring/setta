#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-severe-typecheck-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop with one strict phase:
1. fix only actionable runtime bugs surfaced by type errors without churning on non-bug type backlog

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Inactivity timeout: 1800 seconds without transcript updates
- Refresh frontend/python/go typecheck logs and the runtime-break shortlist before every iteration
- Stop only when the refreshed shortlist has no actionable runtime-bug findings left
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

checklist_file="${state_dir}/checklist.md"
prompt_file="${state_dir}/prompt.md"
severe_type_audit_file="${state_dir}/severe-type-audit.md"
runtime_break_shortlist_file="${state_dir}/runtime-break-shortlist.md"
frontend_typecheck_file="${state_dir}/frontend-typecheck.txt"
python_typecheck_file="${state_dir}/python-typecheck.txt"
go_typecheck_file="${state_dir}/go-typecheck.txt"

if [[ ! -f "${severe_type_audit_file}" ]]; then
  cat > "${severe_type_audit_file}" <<EOF
# Runtime Bug Audit

Keep this file compact and overwrite stale notes instead of appending a diary.

## Current shortlist snapshot

## Current target

## Concrete runtime failure

## Evidence

## Owner surface to change

## Verification

## Deferred shortlist items
EOF
fi

if [[ ! -f "${runtime_break_shortlist_file}" ]]; then
  cat > "${runtime_break_shortlist_file}" <<EOF
# Runtime-Break Shortlist

No shortlist has been generated yet.
The pre-iteration wrapper refreshes this file before each Codex iteration.
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# Runtime Bug Checklist

Keep this file accurate while the loop runs.

Rules:
- This loop uses type checking as a bug finder, not as a target list to clear.
- The pre-iteration wrapper refreshes ${frontend_typecheck_file}, ${python_typecheck_file}, ${go_typecheck_file}, and ${runtime_break_shortlist_file}.
- Use ${runtime_break_shortlist_file} as the lead queue.
- Update ${severe_type_audit_file} before editing code.
- Fix one shortlist item or one tightly related cluster per iteration.
- Prefer owner-side fixes and regeneration.
- Do not add local shadow types, ReturnType aliases for existing named types, handwritten compatibility helpers, hard-coded generator inventories, or duplicated logic when an authoritative owner surface already exists.
- Run focused verification plus ./gcf.sh and ./scripts/check_quality_for_git_changes.sh before every commit.
- Every non-stop iteration ends with a clean worktree and a commit whose message starts with codex-typefix:.
EOF
fi

cat > "${prompt_file}" <<EOF
Goal: use type checking as a bug finder. Fix only type errors that point to a real runtime bug. Do not try to clear the whole type backlog.

Read in order:
- ${ROOT_DIR}/AGENTS.md
- ${ROOT_DIR}/docs/guides/dev-scripts.md
- ${ROOT_DIR}/docs/reference/go-backed-python.md
- ${ROOT_DIR}/docs/reference/generation-contracts.md
- git log --oneline --decorate -n 15
- ${checklist_file}
- ${runtime_break_shortlist_file}
- ${severe_type_audit_file}
- the most recent prior session response under ${output_dir}/run-*/last-message.txt, if any exist

Rules:
- The shortlist is the lead queue. Start from the highest tier item.
- Before editing code, update the audit with the current target, the concrete runtime failure, the exact file evidence, and the owner surface you plan to change.
- If you cannot explain the real runtime failure clearly, skip that item and record why in the audit.
- Fix one shortlist item or one tightly related cluster per iteration.
- Prefer owner-side fixes and regeneration over local compatibility patches.
- Reuse authoritative named types and helpers. Do not add local shadow types, ReturnType aliases for existing named types, handwritten compatibility helpers, hard-coded generator inventories, or duplicated logic when an owner surface already exists.
- Do not hand-edit generated files.
- Run focused verification for the bug you changed. Before any commit, run the relevant type checks for touched code, then run ./gcf.sh, then run ./scripts/check_quality_for_git_changes.sh.
- If you make repo changes, end with a clean worktree and a commit message starting with codex-typefix:.
- Do not declare the loop complete yourself. The loop stops when the refreshed shortlist is empty.
- Do not ask for follow-up.
EOF

pre_iteration_command="$(
  shell_join \
    "${ROOT_DIR}/scripts/codex-severe-typecheck-loop-pre-iteration.sh" \
    --root-dir "${ROOT_DIR}" \
    --output-dir "${output_dir}" \
    --state-dir "${state_dir}" \
    --complete-exit-code "${complete_exit_code}" \
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
echo "Type audit file: ${severe_type_audit_file}"
echo "Runtime-break shortlist: ${runtime_break_shortlist_file}"
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
