#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-app-subsystem-real-plugin-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to execute
`docs/plans/app-subsystem-real-plugin-plan.md` to completion.

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- If the starting repo is dirty, snapshot it into a managed worktree and run
  the loop there instead of aborting
- Inactivity timeout: 1800 seconds without transcript updates
- Retry after transient Codex failures and inactivity timeouts
- Tolerate 10 consecutive clean Codex failures before stopping
- Terminal logging defaults to quiet status/progress lines only
- Stop only when Codex explicitly reports audited completion of the plan
- Require every non-stop iteration to leave a clean worktree and either advance
  HEAD or advance the saved checklist/audit state

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
  --retry-sleep-seconds N
                         Sleep N seconds before retrying a transient clean
                         Codex failure or inactivity timeout. Default: 15
  --allow-clean-failures N
                         Tolerate up to N consecutive clean Codex failures that
                         leave HEAD unchanged and the worktree clean.
                         Default: 10
  --progress-log-interval-seconds N
                         When Codex is still running, print at most one status
                         progress line every N seconds. Default: 120
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-app-subsystem-real-plugin-loop.sh
  ./scripts/run-codex-app-subsystem-real-plugin-loop.sh --model gpt-5.4
  ./scripts/run-codex-app-subsystem-real-plugin-loop.sh -- --config reasoning_effort=\"xhigh\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
output_dir=""
state_dir=""
model="gpt-5.4"
yolo_mode="1"
inactivity_timeout_seconds="1800"
post_commit_settle_seconds="20"
retry_sleep_seconds="15"
allow_clean_failures="10"
progress_log_interval_seconds="120"
complete_exit_code="42"
stop_sentinel="CODEX_LOOP_STOP: APP_SUBSYSTEM_REAL_PLUGIN_COMPLETE"
plan_relpath="docs/plans/app-subsystem-real-plugin-plan.md"
loop_root_dir="${SOURCE_ROOT_DIR}"
execution_mode="in-place"
managed_worktree_dir=""
managed_worktree_branch=""
plan_file=""
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
  managed_worktree_branch="codex-app-subsystem-real-plugin-loop-$(date '+%Y%m%d-%H%M%S')-$$"

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
      "codex-loop-baseline: snapshot dirty starting state for app subsystem real plugin loop"
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
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-app-subsystem-real-plugin-loop.${timestamp}.XXXXXX")"
else
  output_dir="$(resolve_path_without_creating "${output_dir}")"
  if [[ "${output_dir}" == "${SOURCE_ROOT_DIR}" ]] || [[ "${output_dir}" == "${SOURCE_ROOT_DIR}/"* ]]; then
    echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
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
  if [[ "${state_dir}" == "${SOURCE_ROOT_DIR}" ]] || [[ "${state_dir}" == "${SOURCE_ROOT_DIR}/"* ]]; then
    echo "--state-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
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
architecture_audit_file="${state_dir}/architecture-audit.md"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

if [[ ! -f "${architecture_audit_file}" ]]; then
  cat > "${architecture_audit_file}" <<EOF
# App Subsystem Real Plugin Audit

Keep this file compact and overwrite stale notes instead of appending a diary.
Update it at the start and end of every iteration.

## Current phase

## Current target

## Remaining violations of a real plugin boundary

## Current contract mismatch

## Verification

## Current blockers or risks

## Next highest-priority remaining step
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# App Subsystem Real Plugin Checklist

Keep this file accurate while the loop runs.

Rules:
- Treat ${plan_file} as the source-of-truth plan.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later change reopens an earlier item.
- If a later change reopens an earlier item, change that earlier item back to \`[ ]\` and return to it immediately.
- Mark a checklist item \`[x]\` only after fresh code inspection and targeted verification show it is complete.
- Do not delete items.
- Keep the current audit in ${architecture_audit_file}.
- Do not add backward compatibility, migration shims, dual contracts, repo-local import exceptions, or temporary host/plugin bridges.

## Phase A: Frontend Contract Cutover
- [ ] Update ${architecture_audit_file} before and after every iteration.
- [ ] Replace raw app-subsystem \`ComponentType\` registrations with a renderer-based contract that the host mounts into DOM containers.
- [ ] Add an explicit controller/host API for cross-surface app-subsystem behavior instead of host/plugin source imports.
- [ ] Delete the old \`ComponentType\`-based contract rather than carrying both shapes in parallel.
- [ ] Add focused tests for the new contract shape and runtime lifecycle.
- [ ] Mark Phase A complete only after the host no longer expects raw plugin React components for app-subsystem surfaces.

## Phase B: Frontend Plugin SDK
- [ ] Introduce a stable frontend plugin SDK for app-subsystem providers.
- [ ] Expose only explicit host capabilities through the SDK or typed host object.
- [ ] Move plugin-facing route client/types access to plugin-safe generated outputs or SDK artifacts instead of host-source imports.
- [ ] Add focused tests for the plugin-facing SDK and typed host API.
- [ ] Mark Phase B complete only after app-subsystem providers can target a published frontend API instead of host source aliases.

## Phase C: Host Renderer Integration
- [ ] Convert overview, preview, app-route, and app-deployment-modal host render sites to container-based mount/update/unmount flow.
- [ ] Keep the host generic and plugin-id-agnostic while mounting the resolved provider.
- [ ] Remove any fallback path that still renders raw plugin React components directly in the host tree.
- [ ] Add focused frontend tests for mount/update/unmount cleanup and provider reload behavior.
- [ ] Mark Phase C complete only after the host treats app-subsystem UI like actual plugin-rendered surfaces.

## Phase D: First-Party Provider Migration
- [ ] Remove host source alias imports from \`plugins/setta-json-render-app-gen/frontend\`.
- [ ] Replace host \`components/*\`, \`openapi/*\`, \`plugins/*\`, \`state/*\`, and \`utils/*\` imports with SDK services or plugin-owned code.
- [ ] Make the plugin frontend build root self-contained and stop aliasing host source directories into the plugin bundle.
- [ ] Verify the installed plugin artifact works through runtime metadata rather than repo-local frontend imports.
- [ ] If a landed change materially alters frontend runtime UI, use CDP visual verification only when an already-running developer-started browser session is available; otherwise pick another actionable slice and record the blocker in ${architecture_audit_file}.
- [ ] Mark Phase D complete only after \`plugins/setta-json-render-app-gen\` behaves like an actual isolated plugin frontend.

## Phase E: Generality And Guardrails
- [ ] Add an unknown-id fixture app-subsystem provider that uses the same frontend contract.
- [ ] Add regression guardrails that fail if host runtime frontend code imports \`plugins/*/frontend/src\` outside tests or packaging-only code.
- [ ] Add regression guardrails that fail if plugin frontends import host source aliases such as \`components\`, \`openapi\`, \`plugins\`, \`state\`, or \`utils\`.
- [ ] Add focused tests proving the same contract works for an unknown plugin id.
- [ ] Before every commit, run focused verification plus \`./gcf.sh\` and \`./check_quality.sh\`.
- [ ] Mark Phase E complete only after first-party exceptions are structurally impossible.

## Completion
- [ ] Any session that does not emit the stop sentinel must either produce a new clean commit whose message starts with \`codex-realplugin:\` or leave the repo unchanged while advancing ${checklist_file} and/or ${architecture_audit_file} for the next audited step.
- [ ] Emit the stop sentinel only after all phases above are complete and a fresh audit of ${plan_file} finds no remaining actionable work.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop for this repository.

Mission:
Execute ${plan_file} to completion.

Read first, in this order:
- ${loop_root_dir}/AGENTS.md
- ${loop_root_dir}/docs/reference/go-backed-python.md
- ${loop_root_dir}/docs/reference/generation-contracts.md
- ${plan_file}
- \`git log --oneline --decorate -n 15\`
- ${checklist_file}
- ${architecture_audit_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Primary design constraints:
- The main app must not import from \`plugins/...\` at runtime outside tests, generators, or packaging-only code.
- The plugin frontend must not import host source aliases like \`components\`, \`openapi\`, \`plugins\`, \`state\`, or \`utils\`.
- App-subsystem frontend surfaces must use an explicit renderer contract, not raw plugin React \`ComponentType\` values rendered directly inside the host React tree.
- The host must load app-subsystem frontend code only from installed plugin runtime metadata.
- Any host capability the plugin needs must be exposed through a versioned SDK or typed host API, not through source imports.
- Do not add backward compatibility, legacy support, migrations, dual contracts, repo-local import exceptions, or temporary bridges.
- Treat the first-party provider exactly like an unknown-id provider. No plugin-id-specific runtime exceptions.

Phase-order rules:
- Treat ${checklist_file} as the execution source of truth derived from ${plan_file}.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later edit reopens an earlier item.
- Start each iteration by refreshing ${checklist_file} and ${architecture_audit_file} so they match the actual repo state before choosing the next task.
- Treat this session as standalone. Do not rely on follow-up prompts.

Execution rules for every iteration:
- Start with a fresh targeted audit of the active phase.
- Update ${architecture_audit_file} before editing code with the current phase, current target, remaining violations of a real plugin boundary, verification plan, and next highest-priority step.
- Pick one actionable issue or one tightly related cluster inside the active phase that you can complete confidently in this session.
- Prefer explicit renderer contracts, typed host APIs, and plugin-owned code over bundler tricks or first-party exceptions.
- Keep Go authoritative for correctness-sensitive contracts, validation, runtime behavior, and shared metadata unless repo rules explicitly say otherwise.
- Do not hand-edit generated files.
- If Go-owned contracts, endpoints, plugin metadata generation inputs, or frontend generation inputs change, regenerate affected outputs before cleanup.
- Run focused verification for the behavior you changed.
- Before every commit, run \`./gcf.sh\` and then \`./check_quality.sh\`. If either fails, fix the failure or stop without committing.
- If a landed change materially alters frontend runtime UI and an already-running developer-started browser session is available, use CDP visual verification. Do not burn loop iterations starting, waiting on, or debugging browser tooling. If that verification is required but unavailable, record it in ${architecture_audit_file} and choose another actionable slice.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-realplugin:\`.
- If you make no repo changes, leave the repo clean and advance ${checklist_file} and/or ${architecture_audit_file} meaningfully for the next audited step.
- Do not ask for follow-up.

Phase A guidance:
- Replace the app-subsystem frontend registration contract in \`frontend/src/plugins/appSubsystem.ts\` so the host no longer expects raw React components.
- Design the new contract around \`mount/update/unmount\` renderers and a small explicit controller API.
- Delete the old contract instead of carrying both old and new shapes.

Phase B guidance:
- Build a plugin-facing frontend SDK for app-subsystem providers.
- Remove the need for plugin frontend code to import host source trees directly.
- Route plugin-facing client/types access through generated outputs or SDK-owned surfaces rather than host-source OpenAPI imports.

Phase C guidance:
- Convert host render sites to generic container-based lifecycle handling.
- Keep the host plugin-id-agnostic and framework-agnostic.
- Do not keep a compatibility path that still renders plugin React components directly.

Phase D guidance:
- Migrate \`plugins/setta-json-render-app-gen/frontend\` to the new SDK and contract.
- Remove imports of \`components/*\`, \`openapi/*\`, \`plugins/*\`, \`state/*\`, and \`utils/*\` from the plugin frontend.
- Make the plugin build root self-contained and stop aliasing host source into the bundle.
- Verify the installed plugin artifact, not only repo-local source assumptions.

Phase E guidance:
- Add an unknown-id fixture provider that uses the same app-subsystem frontend contract.
- Add guardrails that fail if host runtime code imports plugin frontend source directly.
- Add guardrails that fail if plugin frontends import host source aliases directly.

Progress discipline:
- Include in your final response for the iteration:
  - the phase you worked on
  - the concrete target you changed or audited
  - the focused verification you ran
  - the next highest-priority remaining step if the plan is not complete
- Any session that does not emit the stop sentinel must either produce a new clean commit or leave the repo unchanged while advancing ${checklist_file} and/or ${architecture_audit_file}.
- Never end the session with uncommitted, unstaged, or untracked repo changes.

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
    --progress-file "${architecture_audit_file}" \
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
echo "Architecture audit file: ${architecture_audit_file}"
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
