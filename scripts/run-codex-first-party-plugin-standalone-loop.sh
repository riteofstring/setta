#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-first-party-plugin-standalone-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to execute
`docs/plans/first-party-plugin-standalone-completion-plan.md` to completion.

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
  ./scripts/run-codex-first-party-plugin-standalone-loop.sh
  ./scripts/run-codex-first-party-plugin-standalone-loop.sh --model gpt-5.4
  ./scripts/run-codex-first-party-plugin-standalone-loop.sh -- --config reasoning_effort=\"xhigh\"
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
stop_sentinel="CODEX_LOOP_STOP: FIRST_PARTY_PLUGIN_STANDALONE_COMPLETE"
plan_relpath="docs/plans/first-party-plugin-standalone-completion-plan.md"
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
  managed_worktree_branch="codex-first-party-plugin-standalone-loop-$(date '+%Y%m%d-%H%M%S')-$$"

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
      "codex-loop-baseline: snapshot dirty starting state for first-party plugin standalone loop"
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

if [[ ! "${retry_sleep_seconds}" =~ ^[0-9]+$ ]] || [[ "${retry_sleep_seconds}" -lt 0 ]]; then
  echo "--retry-sleep-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${allow_clean_failures}" =~ ^[0-9]+$ ]]; then
  echo "--allow-clean-failures must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${progress_log_interval_seconds}" =~ ^[0-9]+$ ]] || [[ "${progress_log_interval_seconds}" -lt 1 ]]; then
  echo "--progress-log-interval-seconds must be a positive integer" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-first-party-plugin-standalone-loop.${timestamp}.XXXXXX")"
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
# First-Party Plugin Standalone Audit

Keep this file compact and overwrite stale notes instead of appending a diary.
Update it at the start and end of every iteration.

## Current phase

## Current target

## Remaining private-host imports in plugin-owned code

## Remaining first-party runtime/build exceptions

## Remaining installed-flow or unknown-id gaps

## Verification

## Current blockers or risks

## Next highest-priority remaining step
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# First-Party Plugin Standalone Checklist

Keep this file accurate while the loop runs.

Rules:
- Treat ${plan_file} as the source-of-truth plan.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later change reopens an earlier item.
- If a later change reopens an earlier item, change that earlier item back to \`[ ]\` and return to it immediately.
- Mark a checklist item \`[x]\` only after fresh code inspection and targeted verification show it is complete.
- Do not delete items.
- Keep the current audit in ${architecture_audit_file}.
- This is a clean cutover. Do not add backward compatibility shims, legacy support, migrations, builtin fallbacks, dual contracts, rollout toggles, or temporary bridges.
- When a standalone path replaces an older internal-only path, delete the superseded path instead of preserving both paths in parallel.
- Standalone here means standalone as a Setta plugin, not hostless. Published or packaged host SDK boundaries are allowed; private host source and package imports are not.

## Phase A: Boundary Freeze And Published SDK Surfaces
- [ ] Update ${architecture_audit_file} before and after every iteration.
- [ ] Audit the remaining plugin-owned imports that still depend on private host source or private host package modules.
- [ ] Define and use explicit published or packaged frontend and backend plugin-facing SDK surfaces instead of private host imports.
- [ ] Add focused verification for the approved plugin-facing SDK surfaces.
- [ ] Mark Phase A complete only after plugin-owned code depends only on plugin-owned code plus published or packaged host SDK boundaries.

## Phase B: Frontend Packaging Isolation
- [ ] Remove repo-source aliasing and unpublished host build-artifact assumptions from \`plugins/setta-json-render-app-gen/frontend\`.
- [ ] Keep the plugin frontend dependent only on plugin-owned code, explicit SDK artifacts, and ordinary package-manager dependencies.
- [ ] Verify the installed plugin artifact rather than only the repo-local build.
- [ ] Mark Phase B complete only after the app plugin frontend builds and runs without repo-source directory assumptions.

## Phase C: Backend Runtime Ownership
- [ ] Replace private host-package imports in \`plugins/setta-json-render-app-gen/runtime_backend/main.py\` with the published backend SDK boundary.
- [ ] Keep the packaged app-plugin backend on a real installed-flow runtime path that does not require a developer Go toolchain.
- [ ] Package or declare any required backend runtime modules and dependencies intentionally.
- [ ] Add focused verification for packaged backend probe/runtime behavior.
- [ ] Mark Phase C complete only after the app plugin package owns its backend contribution surface through a generic runtime contract and published backend SDK boundary.

## Phase D: Remove First-Party Runtime And Build Exceptions
- [ ] Remove remaining production or checked-in generated paths that require a concrete first-party app plugin id to make the app subsystem work.
- [ ] Keep the host provider-family-aware but plugin-id agnostic.
- [ ] Keep \`setta-basedpyright\` and \`setta-ty\` metadata-driven and avoid reopening plugin-id switches.
- [ ] Add focused verification or generator tests for the changed runtime/build metadata paths.
- [ ] Mark Phase D complete only after non-plugin-owned production and generated code no longer relies on concrete first-party app-plugin ids outside allowed locations.

## Phase E: Unknown-Id And Installed-Flow Parity
- [ ] Give the unknown-id app-subsystem fixture the same backend and frontend contract, not frontend-only proof.
- [ ] Cover linked-worktree and package-manager-installed unknown-id provider flows on the remaining backend surfaces.
- [ ] Preserve or expand disabled-provider, invalid-provider, and conflicting-provider coverage.
- [ ] Mark Phase E complete only after unknown-id providers exercise the same contract end-to-end.

## Phase F: Guardrails And Final Audit
- [ ] Add backend-side boundary guardrails that fail if plugin-owned Python code imports private host modules instead of the published backend SDK boundary.
- [ ] Add or tighten guardrails against no-op packaged backends and first-party runtime fallback regressions.
- [ ] Before every commit, run focused verification plus \`./gcf.sh\` and \`./check_quality.sh\`.
- [ ] Mark Phase F complete only after regressions toward private host imports, no-op packaged backends, and first-party runtime exceptions are structurally blocked.

## Completion
- [ ] Any session that does not emit the stop sentinel must either produce a new clean commit whose message starts with \`codex-pluginstandalone:\` or leave the repo unchanged while advancing ${checklist_file} and/or ${architecture_audit_file} for the next audited step.
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
- ${loop_root_dir}/docs/reference/plugin-language-servers.md
- ${plan_file}
- ${loop_root_dir}/docs/plans/app-subsystem-real-plugin-plan.md
- ${loop_root_dir}/docs/plans/first-party-plugin-finalization-plan.md
- ${loop_root_dir}/docs/plans/app-subsystem-backend-externalization-plan.md
- \`git log --oneline --decorate -n 20\`
- ${checklist_file}
- ${architecture_audit_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Primary design constraints:
- Standalone here means standalone as a Setta plugin, not hostless. Published or packaged host SDK and local-core boundaries are allowed. Private host source and private host package imports from plugin-owned code are not.
- Plugin-owned frontend code must depend only on plugin-owned code plus explicit plugin-facing frontend SDK surfaces.
- Plugin-owned backend Python code must depend only on plugin-owned code plus explicit plugin-facing backend SDK or local-core client surfaces.
- Production and checked-in generated host code must not require a concrete first-party plugin id to make the app subsystem work.
- Linked-worktree and package-manager-installed plugin flows must be equivalent at runtime.
- An unknown-id app-subsystem plugin must exercise the same contract.
- Keep Go authoritative for correctness-sensitive contracts, validation, runtime behavior, and shared metadata unless repo rules explicitly say otherwise.
- Keep \`setta-basedpyright\` and \`setta-ty\` metadata-driven and stable. Do not reopen their generalization work unless a fresh audit finds a real boundary violation.
- Do not add backward compatibility shims, legacy support, builtin fallbacks, rollout toggles, dual contracts, or temporary bridges.
- If the correct standalone implementation supersedes an older internal-only path, remove the older path instead of keeping both paths alive.

Scope discipline:
- This plan replaces the fragmented finish line that was previously split across the real-plugin, first-party-finalization, and backend-externalization loops.
- Do not stop at "the host no longer imports the plugin package path." The finish line also includes installed-flow proof, unknown-id parity, plugin-facing SDK boundaries, and guardrails against regressions.
- Do not preserve superseded runtime or build paths for safety. Remove them once the standalone path is correct.
- Defaults-profile references, docs, tests, packaging metadata, and plugin-owned code may still reference concrete first-party ids when that is intentional and not a runtime-boundary violation.

Phase-order rules:
- Treat ${checklist_file} as the execution source of truth derived from ${plan_file}.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later edit reopens an earlier item.
- Start each iteration by refreshing ${checklist_file} and ${architecture_audit_file} so they match the actual repo state before choosing the next task.
- Treat this session as standalone. Do not rely on follow-up prompts.

Execution rules for every iteration:
- Start with a fresh targeted audit of the active phase.
- Update ${architecture_audit_file} before editing code with the current phase, current target, remaining private-host imports in plugin-owned code, remaining first-party runtime/build exceptions, installed-flow or unknown-id gaps, verification plan, and next highest-priority step.
- Pick one actionable issue or one tightly related cluster inside the active phase that you can complete confidently in this session.
- Prefer published SDK boundaries, generic plugin contracts, and explicit local-core clients over private host imports or first-party exceptions.
- Prefer direct deletion of superseded compatibility-era code over leaving dead fallback branches behind.
- Do not hand-edit generated files.
- If Go-owned contracts, generator inputs, Python SDK contracts, or frontend generation inputs change, regenerate affected outputs before cleanup.
- Run focused verification for the behavior you changed.
- Before every commit, run \`./gcf.sh\` and then \`./check_quality.sh\`. If either fails, fix the failure or stop without committing.
- If a landed change materially alters frontend runtime UI and an already-running developer-started browser session is available, use CDP visual verification. Do not burn loop iterations starting, waiting on, or debugging browser tooling. If that verification is required but unavailable, record it in ${architecture_audit_file} and choose another actionable slice.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-pluginstandalone:\`.
- If you make no repo changes, leave the repo clean and advance ${checklist_file} and/or ${architecture_audit_file} meaningfully for the next audited step.
- Do not ask for follow-up.

Phase A guidance:
- Freeze the approved standalone boundary for plugin-owned code.
- Replace private host imports with explicit plugin-facing frontend and backend SDK surfaces.
- If you need backend helpers for plugin-owned Python code, prefer a typed client or generated wrapper over direct imports from internal host modules.

Phase B guidance:
- Finish app-plugin frontend packaging isolation.
- Remove repo-source aliasing and unpublished build-artifact assumptions from the plugin frontend build.
- Verify the installed artifact, not only the repo-local bundle.

Phase C guidance:
- Finish app-plugin backend runtime ownership.
- Keep the installed plugin backend on a real packaged runtime path.
- If Go-backed semantics are still needed, route them through the published backend SDK or local-core client boundary rather than private host imports.

Phase D guidance:
- Remove remaining production or generated first-party runtime and build exceptions.
- Keep host behavior provider-family-aware but concrete-plugin-id agnostic.
- Avoid reopening already-landed language-server generalization work.

Phase E guidance:
- The unknown-id app-subsystem fixture must stop being frontend-only proof.
- Prove linked and installed unknown-id providers use the same contract as the first-party app plugin.

Phase F guidance:
- Add backend-side import-boundary guards for plugin-owned Python code.
- Add or tighten focused guards against no-op packaged backends and first-party fallback regressions.
- Finish with a fresh standalone-boundary audit rather than only an import-path search.

Progress discipline:
- Include in your final response for the iteration:
  - the phase you worked on
  - the concrete target you changed or audited
  - the focused verification you ran
  - the next highest-priority remaining step if the plan is not complete
- Any session that does not emit the stop sentinel must either produce a new clean commit or leave the repo unchanged while advancing ${checklist_file} and/or ${architecture_audit_file}.
- Never end the session with uncommitted, unstaged, or untracked repo changes.

If a fresh audit shows the plan is complete under these rules, make no repo changes, leave the repo clean, explain that the stop reason is complete, and end your final response with this exact line:
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
