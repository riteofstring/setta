#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-third-party-plugin-generalization-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to execute
`docs/plans/third-party-plugin-generalization-plan.md` to completion.

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
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-third-party-plugin-generalization-loop.sh
  ./scripts/run-codex-third-party-plugin-generalization-loop.sh --model gpt-5.4
  ./scripts/run-codex-third-party-plugin-generalization-loop.sh -- --config reasoning_effort=\"xhigh\"
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
complete_exit_code="42"
stop_sentinel="CODEX_LOOP_STOP: THIRD_PARTY_PLUGIN_GENERALIZATION_COMPLETE"
plan_relpath="docs/plans/third-party-plugin-generalization-plan.md"
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
  managed_worktree_branch="codex-third-party-plugin-generalization-loop-$(date '+%Y%m%d-%H%M%S')-$$"

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
      "codex-loop-baseline: snapshot dirty starting state for third-party plugin generalization loop"
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

if [[ ! -f "${SOURCE_ROOT_DIR}/${plan_relpath}" ]]; then
  echo "Plan file not found: ${SOURCE_ROOT_DIR}/${plan_relpath}" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-third-party-plugin-generalization-loop.${timestamp}.XXXXXX")"
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
migration_audit_file="${state_dir}/migration-audit.md"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

if [[ ! -f "${migration_audit_file}" ]]; then
  cat > "${migration_audit_file}" <<EOF
# Third-Party Plugin Generalization Audit

Keep this file compact and overwrite stale notes instead of appending a diary.
Update it at the start and end of every iteration.

## Current phase

## Current target

## Remaining first-party-only assumptions

## Unknown-id fixture/provider status

## Verification

## Current blockers or risks

## Next highest-priority remaining step
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# Third-Party Plugin Generalization Checklist

Keep this file accurate while the loop runs.

Rules:
- Treat ${plan_file} as the source-of-truth plan.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later change reopens an earlier item.
- If a later change reopens an earlier item, change that earlier item back to \`[ ]\` and return to it immediately.
- Mark a checklist item \`[x]\` only after fresh code inspection and targeted verification show it is complete.
- Do not delete items.
- Keep the current audit in ${migration_audit_file}.

## Phase A: Contract And Runtime Model
- [ ] Update ${migration_audit_file} before and after every iteration.
- [ ] Replace fixed app-subsystem provider detection by plugin id with explicit provider-resolution logic over runtime metadata.
- [ ] Model zero-provider, single-provider, invalid-provider, disabled-provider, and multi-provider conflict states explicitly in runtime/status payloads.
- [ ] Add or update backend tests for provider-resolution behavior using an unknown-id fixture provider.
- [ ] Mark Phase A complete only after app-subsystem availability is resolved by contract rather than by fixed plugin id.

## Phase B: Backend Contract Migration
- [ ] Convert \`plugins/setta-json-render-app-gen\` to the normal plugin packaging shape with declared backend/frontend entrypoints and declared capabilities.
- [ ] Remove core-host backend imports of \`plugins/setta-json-render-app-gen/...\` and replace them with provider contracts/protocols.
- [ ] Route app routes, MCP registrations, deployment/runtime contributions, and app-generation contributions through runtime-managed plugin contracts.
- [ ] Add focused backend tests for provider-owned backend contributions and unknown-id provider behavior where practical.
- [ ] Mark Phase B complete only after the core backend host integrates the app subsystem through generic provider contracts.

## Phase C: Frontend Contract Migration
- [ ] Extend the generic frontend plugin host with the app-subsystem registrations it needs.
- [ ] Move the app-subsystem provider frontend to normal runtime metadata loading and normal plugin registration flow.
- [ ] Delete \`frontend/src/plugins/appSubsystemRuntime.tsx\`.
- [ ] Add focused frontend tests proving app-subsystem surfaces load from plugin runtime metadata rather than repo-local imports.
- [ ] If a landed change materially alters frontend runtime UI, use CDP visual verification only when an already-running developer-started browser session is available; otherwise pick another actionable slice and record the blocker in ${migration_audit_file}.
- [ ] Mark Phase C complete only after app-subsystem UI loads from plugin runtime metadata like other plugins.

## Phase D: Startup And Cleanup
- [ ] Switch app-mode startup and deployment gating to resolved provider status instead of a fixed plugin id.
- [ ] Remove first-party-only wording from affected user-facing errors and statuses.
- [ ] Add regression guardrails that fail if core host code imports \`plugins/setta-json-render-app-gen/...\` outside plugin-owned code and tests.
- [ ] Before every commit, run focused verification plus \`./gcf.sh\` and \`./check_quality.sh\`.
- [ ] Mark Phase D complete only after startup/deployment gating and cleanup guardrails reflect the provider-based design.

## Phase E: Language-Server Cleanup
- [ ] Replace language-server runtime-path injection special cases keyed by plugin id with explicit plugin metadata or probe output.
- [ ] Migrate first-party language-server plugins to the metadata-driven path.
- [ ] Add focused tests proving an unknown plugin id can request the same language-server runtime-path behavior.
- [ ] Mark Phase E complete only after host code no longer switches on specific language-server plugin ids for that runtime-path behavior.

## Completion
- [ ] Any session that does not emit the stop sentinel must either produce a new clean commit whose message starts with \`codex-pluginplan:\` or leave the repo unchanged while advancing ${checklist_file} and/or ${migration_audit_file} for the next audited step.
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
- ${migration_audit_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Primary design constraints:
- Treat the app subsystem as a provider contract, not a fixed plugin id.
- Zero active providers means app subsystem unavailable.
- One active provider means that provider owns the subsystem.
- More than one active provider must fail loudly with explicit conflict status. Do not silently pick a winner.
- The provider must be a real plugin package with normal manifest entrypoints and declared capabilities.
- Core host code must not directly import \`plugins/setta-json-render-app-gen/...\` outside plugin-owned code and tests.
- Frontend app-subsystem surfaces must load from plugin runtime metadata, not repo-local imports.
- Language-server runtime-path injection must be metadata-driven, not plugin-id-driven.
- Use unknown-id fixture providers/tests to prove generality whenever practical.

Phase-order rules:
- Treat ${checklist_file} as the execution source of truth derived from ${plan_file}.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later edit reopens an earlier item.
- Start each iteration by refreshing ${checklist_file} and ${migration_audit_file} so they match the actual repo state before choosing the next task.
- Treat this session as standalone. Do not rely on follow-up prompts.

Execution rules for every iteration:
- Start with a fresh targeted audit of the active phase.
- Update ${migration_audit_file} before editing code with the current phase, current target, remaining first-party-only assumptions, verification plan, and next highest-priority step.
- Pick one actionable issue or one tightly related cluster inside the active phase that you can complete confidently in this session.
- Prefer explicit provider/runtime metadata and typed contracts over heuristics, implicit naming, or first-party assumptions.
- Keep Go authoritative for correctness-sensitive contracts, validation, runtime behavior, and shared metadata unless repo rules explicitly say otherwise.
- Do not add compatibility shims, silent fallbacks, or heuristic provider selection to preserve the old first-party-only shape.
- Do not hand-edit generated files.
- If Go-owned contracts, endpoints, plugin metadata generation inputs, or frontend generation inputs change, regenerate affected outputs before cleanup.
- Run focused verification for the behavior you changed.
- Before every commit, run \`./gcf.sh\` and then \`./check_quality.sh\`. If either fails, fix the failure or stop without committing.
- If a landed change materially alters frontend runtime UI and an already-running developer-started browser session is available, use CDP visual verification. Do not burn loop iterations starting, waiting on, or debugging browser tooling. If that verification is required but unavailable, record it in ${migration_audit_file} and choose another actionable slice.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-pluginplan:\`.
- If you make no repo changes, leave the repo clean and advance ${checklist_file} and/or ${migration_audit_file} meaningfully for the next audited step.
- Do not ask for follow-up.

Phase A guidance:
- Remove fixed-id provider aggregation from \`internal/plugins/runtime.go\` and related runtime/status plumbing.
- Add explicit provider selection status, conflict semantics, and tests that exercise unknown plugin ids.
- Do not count a change as progress if the host still knows the provider as \`setta-json-render-app-gen\`.

Phase B guidance:
- Convert \`plugins/setta-json-render-app-gen\` to normal plugin packaging with declared entrypoints/capabilities.
- Replace core-host direct imports in app routes, deployment/runtime registration, app-generation contributions, MCP integration, and related app-subsystem backend wiring with generic provider contracts or runtime protocols.
- Prefer contracts that keep the host responsible only for generic transport/lifecycle responsibilities.

Phase C guidance:
- Extend the generic frontend plugin host rather than keeping a parallel special loader.
- Move app-subsystem frontend registration into normal plugin \`register(host)\` flow loaded from runtime metadata.
- Delete \`frontend/src/plugins/appSubsystemRuntime.tsx\` once the generic path covers its responsibilities.
- Add focused frontend tests that prove the runtime-metadata loading path, not repo-local imports.

Phase D guidance:
- Switch app-mode startup and deployment gating to resolved provider status.
- Fail loudly on zero-provider and multi-provider conflict states.
- Remove first-party wording from affected user-facing errors/statuses.
- Add a regression guardrail that fails if core host code imports \`plugins/setta-json-render-app-gen/...\` outside plugin-owned code and tests.

Phase E guidance:
- Replace hard-coded plugin-id language-server runtime-path behavior in \`internal/plugins/language_servers.go\` with explicit metadata or probe output.
- Migrate first-party plugins to the new metadata shape.
- Add focused tests proving an unknown plugin id can request the same behavior.

Progress discipline:
- Include in your final response for the iteration:
  - the phase you worked on
  - the concrete target you changed or audited
  - the focused verification you ran
  - the next highest-priority remaining step if the plan is not complete
- Any session that does not emit the stop sentinel must either produce a new clean commit or leave the repo unchanged while advancing ${checklist_file} and/or ${migration_audit_file}.
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
    --progress-file "${migration_audit_file}" \
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
echo "Migration audit file: ${migration_audit_file}"
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
