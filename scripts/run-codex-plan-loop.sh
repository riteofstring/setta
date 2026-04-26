#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-plan-loop.sh --plan PATH --sentinel TEXT --name NAME [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop for a repository plan document.

Required:
  --plan PATH            Plan file path relative to the repository root.
  --sentinel TEXT        Exact completion sentinel expected from Codex.
  --name NAME            Short loop name used for artifact paths and branches.

Options:
  --commit-prefix TEXT   Commit prefix Codex should use when it changes files.
  --iterations N         Maximum loop iterations. Default: 1000
  --output-dir PATH      Directory for prompts, checklist, logs, and loop runs.
                         Default: mktemp dir under TMPDIR
  --state-dir PATH       Directory for checklist and loop state.
                         Default: <output-dir>/state
  --model NAME           Model override passed to codex exec.
                         Default: gpt-5.5
  --inactivity-timeout-seconds N
                         Abort and retry an iteration if Codex produces no
                         transcript output for N seconds. Default: 1800
  --post-commit-settle-seconds N
                         Wait N seconds after each successful iteration and
                         verify the repo is still clean before marking that
                         iteration successful. Default: 20
  --retry-sleep-seconds N
                         Sleep N seconds before retrying a transient clean
                         Codex failure or inactivity timeout. Default: 15
  --allow-clean-failures N
                         Tolerate up to N consecutive clean Codex failures that
                         leave HEAD unchanged and the worktree clean.
                         Default: 10
  --progress-log-interval-seconds N
                         Print at most one status progress line every N seconds.
                         Default: 120
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
output_dir=""
state_dir=""
model="gpt-5.5"
yolo_mode="1"
inactivity_timeout_seconds="1800"
post_commit_settle_seconds="20"
retry_sleep_seconds="15"
allow_clean_failures="10"
progress_log_interval_seconds="120"
complete_exit_code="42"
plan_relpath=""
stop_sentinel=""
loop_name=""
commit_prefix="codex-plan:"
loop_root_dir="${SOURCE_ROOT_DIR}"
execution_mode="in-place"
managed_worktree_dir=""
managed_worktree_branch=""
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
  local argument=""

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
  local root_dir="$1"

  if ! git -C "${root_dir}" diff --quiet --no-ext-diff --exit-code --; then
    return 1
  fi
  if ! git -C "${root_dir}" diff --cached --quiet --no-ext-diff --exit-code --; then
    return 1
  fi
  if git -C "${root_dir}" ls-files --others --exclude-standard | grep -q .; then
    return 1
  fi
  return 0
}

copy_untracked_file_into_worktree() {
  local relative_path="$1"
  local source_path="${SOURCE_ROOT_DIR}/${relative_path}"
  local dest_path="${managed_worktree_dir}/${relative_path}"
  local dest_parent=""

  dest_parent="$(dirname "${dest_path}")"
  mkdir -p "${dest_parent}"
  rm -rf "${dest_path}"
  cp -pR "${source_path}" "${dest_path}"
}

prepare_managed_worktree_from_dirty_repo() {
  local tracked_patch_file="${output_dir}/dirty-start-tracked.patch"
  local untracked_list_file="${output_dir}/dirty-start-untracked.txt"
  local relative_path=""

  managed_worktree_dir="${output_dir}/managed-worktree"
  managed_worktree_branch="codex-${loop_name}-loop-$(date '+%Y%m%d-%H%M%S')-$$"

  git -C "${SOURCE_ROOT_DIR}" diff --binary HEAD -- > "${tracked_patch_file}"
  git -C "${SOURCE_ROOT_DIR}" ls-files --others --exclude-standard > "${untracked_list_file}"
  git -C "${SOURCE_ROOT_DIR}" worktree add -b "${managed_worktree_branch}" "${managed_worktree_dir}" HEAD

  if [[ -s "${tracked_patch_file}" ]]; then
    git -C "${managed_worktree_dir}" apply --whitespace=nowarn "${tracked_patch_file}"
  fi
  if [[ -s "${untracked_list_file}" ]]; then
    while IFS= read -r relative_path; do
      [[ -n "${relative_path}" ]] || continue
      copy_untracked_file_into_worktree "${relative_path}"
    done < "${untracked_list_file}"
  fi
  if ! repo_is_clean "${managed_worktree_dir}"; then
    git -C "${managed_worktree_dir}" add -A -- .
    git -C "${managed_worktree_dir}" commit -m \
      "codex-loop-baseline: snapshot dirty starting state for ${loop_name} loop"
  fi
  if ! repo_is_clean "${managed_worktree_dir}"; then
    echo "Managed worktree is still dirty after creating the baseline snapshot." >&2
    exit 1
  fi

  execution_mode="managed-worktree"
  loop_root_dir="${managed_worktree_dir}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      require_value "$1" "${2:-}"
      plan_relpath="$2"
      shift 2
      ;;
    --sentinel)
      require_value "$1" "${2:-}"
      stop_sentinel="$2"
      shift 2
      ;;
    --name)
      require_value "$1" "${2:-}"
      loop_name="$2"
      shift 2
      ;;
    --commit-prefix)
      require_value "$1" "${2:-}"
      commit_prefix="$2"
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
    --retry-sleep-seconds)
      require_value "$1" "${2:-}"
      retry_sleep_seconds="$2"
      shift 2
      ;;
    --allow-clean-failures)
      require_value "$1" "${2:-}"
      allow_clean_failures="$2"
      shift 2
      ;;
    --progress-log-interval-seconds)
      require_value "$1" "${2:-}"
      progress_log_interval_seconds="$2"
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

if [[ -z "${plan_relpath}" || -z "${stop_sentinel}" || -z "${loop_name}" ]]; then
  echo "--plan, --sentinel, and --name are required" >&2
  usage >&2
  exit 1
fi
if [[ "${plan_relpath}" == /* ]]; then
  echo "--plan must be relative to the repository root" >&2
  exit 1
fi
if [[ ! "${loop_name}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "--name may contain only letters, numbers, dots, underscores, and dashes" >&2
  exit 1
fi
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
if [[ ! "${retry_sleep_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--retry-sleep-seconds must be a non-negative integer" >&2
  exit 1
fi
if [[ ! "${allow_clean_failures}" =~ ^[0-9]+$ ]]; then
  echo "--allow-clean-failures must be a non-negative integer" >&2
  exit 1
fi
if [[ ! "${progress_log_interval_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--progress-log-interval-seconds must be a non-negative integer" >&2
  exit 1
fi
if [[ ! -f "${SOURCE_ROOT_DIR}/${plan_relpath}" ]]; then
  echo "Plan file not found: ${SOURCE_ROOT_DIR}/${plan_relpath}" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-${loop_name}-loop.${timestamp}.XXXXXX")"
else
  output_dir="$(resolve_path_without_creating "${output_dir}")"
  mkdir -p "${output_dir}"
fi
if [[ "${output_dir}" == "${SOURCE_ROOT_DIR}" ]] || [[ "${output_dir}" == "${SOURCE_ROOT_DIR}/"* ]]; then
  echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
  exit 1
fi

if [[ -z "${state_dir}" ]]; then
  state_dir="${output_dir}/state"
else
  state_dir="$(resolve_path_without_creating "${state_dir}")"
  mkdir -p "${state_dir}"
fi
if [[ "${state_dir}" == "${SOURCE_ROOT_DIR}" ]] || [[ "${state_dir}" == "${SOURCE_ROOT_DIR}/"* ]]; then
  echo "--state-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
  exit 1
fi

mkdir -p "${output_dir}" "${state_dir}"

if ! repo_is_clean "${SOURCE_ROOT_DIR}"; then
  prepare_managed_worktree_from_dirty_repo
fi

plan_file="${loop_root_dir}/${plan_relpath}"
if [[ ! -f "${plan_file}" ]]; then
  echo "Plan file not found after preparing the loop workspace: ${plan_file}" >&2
  exit 1
fi

checklist_file="${state_dir}/checklist.md"
prompt_file="${state_dir}/prompt.md"
audit_file="${state_dir}/architecture-audit.md"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

if [[ ! -f "${audit_file}" ]]; then
  cat > "${audit_file}" <<EOF
# ${loop_name} Audit

Keep this file compact and overwrite stale notes instead of appending a diary.
Update it at the start and end of every iteration.

## Current phase

## Current target

## Remaining work

## Verification

## Current blockers or risks

## Next highest-priority remaining step
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# ${loop_name} Checklist

Keep this file accurate while the loop runs.

Rules:
- Treat ${plan_file} as the source-of-truth plan.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later change reopens an earlier item.
- Mark a checklist item \`[x]\` only after fresh code inspection and targeted verification show it is complete.
- Keep the current audit in ${audit_file}.
- Prefer owner-level fixes over compatibility shims, fallback paths, or duplicate implementations.

## Plan Audit
- [ ] Read and audit ${plan_file}.
- [ ] Translate the next incomplete plan item into one tightly scoped implementation target.
- [ ] Run focused verification for the changed owner.
- [ ] Run required cleanup and quality checks before committing.

## Completion
- [ ] Emit the stop sentinel only after all plan work is complete and a fresh audit finds no remaining actionable work.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop for this repository.

Mission:
Execute ${plan_file} to completion.

Read first, in this order:
- ${loop_root_dir}/AGENTS.md
- ${plan_file}
- \`git log --oneline --decorate -n 20\`
- ${checklist_file}
- ${audit_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Execution rules for every iteration:
- Start with a fresh targeted audit of the active checklist item and update ${audit_file}.
- Pick one actionable issue or one tightly related cluster you can complete confidently in this session.
- Prefer owner-level fixes that remove issue classes instead of patching symptoms at multiple call sites.
- Do not hand-edit generated files.
- If Go-owned contracts, generator inputs, Python SDK contracts, or frontend generation inputs change, regenerate affected outputs before cleanup.
- Run focused verification for the behavior you changed.
- For frontend runtime, UI, browser, or performance verification, you may start the repo-root dev/CDP helper with \`./ai.sh\`; use \`./aireset.sh\` only when a clean app-state reset is required. Do not use pnpm ai/aireset wrappers.
- For HTML-in-Canvas verification, start the helper with a Chromium build that exposes the API and pass the experimental flag when needed, for example \`CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh\` or set \`CHROME_BIN\` to Chrome Canary/compatible Chromium plus the same \`CHROME_EXTRA_ARGS\`.
- If you started \`./ai.sh\` or \`./aireset.sh\` for temporary verification, stop that session before finishing the iteration; \`./kill.sh\` is the repo-scoped fallback. If you only started browser MCP directly, stop it with \`./scripts/stop-browser-mcp.sh --devtools\`.
- Before every commit, run the repository-required cleanup and quality checks from the plan or AGENTS.md.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`${commit_prefix}\`.
- If you make no repo changes, leave the repo clean and advance ${checklist_file} and/or ${audit_file} meaningfully for the next audited step.
- Do not ask for follow-up.

If a fresh audit shows the plan is complete under these rules, make no repo changes, leave the worktree clean, explain that the stop reason is complete, and end your final response with this exact line:
  ${stop_sentinel}
EOF

if [[ ! -f "${status_file}" ]]; then
  printf 'pending\n' > "${status_file}"
fi
if [[ ! -f "${head_file}" ]]; then
  git -C "${loop_root_dir}" rev-parse HEAD > "${head_file}"
fi

pre_iteration_command="$(
  shell_join \
    "${SOURCE_ROOT_DIR}/scripts/codex-authority-cleanup-loop-check.sh" \
    --root-dir "${loop_root_dir}" \
    --output-dir "${output_dir}" \
    --state-dir "${state_dir}" \
    --complete-exit-code "${complete_exit_code}" \
    --sentinel "${stop_sentinel}" \
    --progress-file "${checklist_file}" \
    --progress-file "${audit_file}" \
    --allow-clean-failures "${allow_clean_failures}"
)"

post_iteration_command="$(
  shell_join \
    "${SOURCE_ROOT_DIR}/scripts/codex-authority-post-iteration-clean-check.sh" \
    --root-dir "${loop_root_dir}" \
    --settle-seconds "${post_commit_settle_seconds}"
)"

loop_args=(
  "${SOURCE_ROOT_DIR}/scripts/run-codex-loop.sh"
  --prompt-file "${prompt_file}"
  --followup-prompt-file "${prompt_file}"
  --iterations "${iterations}"
  --new-session-every "1"
  --output-dir "${output_dir}"
  --workdir "${loop_root_dir}"
  --quiet
  --progress-log-interval-seconds "${progress_log_interval_seconds}"
  --inactivity-timeout-seconds "${inactivity_timeout_seconds}"
  --watchdog-interval-seconds "30"
  --continue-on-inactivity-timeout
  --continue-on-codex-failure
  --retry-sleep-seconds "${retry_sleep_seconds}"
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

echo "Plan: ${plan_file}"
echo "Checklist: ${checklist_file}"
echo "Architecture audit file: ${audit_file}"
echo "Execution mode: ${execution_mode}"
echo "Execution root: ${loop_root_dir}"
if [[ "${execution_mode}" == "managed-worktree" ]]; then
  echo "Managed worktree branch: ${managed_worktree_branch}"
fi
echo "Loop output directory: ${output_dir}"
echo "Loop state directory: ${state_dir}"
echo "Iterations: ${iterations}"
echo "New session every: 1"
echo "Model: ${model}"
echo 'Reasoning effort: xhigh'
echo "Terminal output mode: quiet status logs"
echo "Quiet progress log interval: ${progress_log_interval_seconds}s"
echo "Inactivity timeout: ${inactivity_timeout_seconds}s"
echo "Retry sleep: ${retry_sleep_seconds}s"
echo "Allowed consecutive clean Codex failures: ${allow_clean_failures}"
echo "Post-commit settle check: ${post_commit_settle_seconds}s"
if [[ "${yolo_mode}" == "1" ]]; then
  echo "Yolo mode: enabled"
else
  echo "Yolo mode: disabled"
fi

exec "${loop_args[@]}"
