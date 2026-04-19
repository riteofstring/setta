#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-app-plugin-boundary-closure-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to execute
`docs/plans/app-plugin-boundary-closure-plan.md` to completion.

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
  ./scripts/run-codex-app-plugin-boundary-closure-loop.sh
  ./scripts/run-codex-app-plugin-boundary-closure-loop.sh --model gpt-5.4
  ./scripts/run-codex-app-plugin-boundary-closure-loop.sh -- --config reasoning_effort=\"xhigh\"
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
stop_sentinel="CODEX_LOOP_STOP: APP_PLUGIN_BOUNDARY_CLOSURE_COMPLETE"
plan_relpath="docs/plans/app-plugin-boundary-closure-plan.md"
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
  managed_worktree_branch="codex-app-plugin-boundary-closure-loop-$(date '+%Y%m%d-%H%M%S')-$$"

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
      "codex-loop-baseline: snapshot dirty starting state for app-plugin boundary closure loop"
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
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-app-plugin-boundary-closure-loop.${timestamp}.XXXXXX")"
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
# App Plugin Boundary Closure Audit

Keep this file compact and overwrite stale notes instead of appending a diary.
Update it at the start and end of every iteration.

## Current phase

## Current target

## Allowed core-owned infrastructure that must stay intact

## Remaining plugin-owned boundary violations

## Remaining repo-coupled build assumptions

## Remaining staged-source or installed-flow proof gaps

## Verification

## Current blockers or risks

## Next highest-priority remaining step
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# App Plugin Boundary Closure Checklist

Keep this file accurate while the loop runs.

Rules:
- Treat ${plan_file} as the source-of-truth plan.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later change reopens an earlier item.
- If a later change reopens an earlier item, change that earlier item back to \`[ ]\` and return to it immediately.
- Mark a checklist item \`[x]\` only after fresh code inspection and targeted verification show it is complete.
- Do not delete items.
- Keep the current audit in ${architecture_audit_file}.
- Host-owned plugin-family infrastructure is allowed. Do not treat local-core, provider selection, route shapes, or generic plugin lifecycle code as a bug by itself.
- The defect is first-party-only runtime/build coupling, private host imports from plugin-owned code, and repo-only build assumptions.
- This is a clean cutover. Do not add or preserve backward compatibility, legacy support, migrations, transitional code paths, builtin fallbacks, dual contracts, dual build/runtime paths, rollout toggles, compatibility wrappers, or temporary bridges.

## Phase A: Boundary Freeze And Audit
- [ ] Update ${architecture_audit_file} before and after every iteration.
- [ ] Keep the allowed boundary explicit: host-owned family infrastructure is allowed; private host imports and repo-only build assumptions are not.
- [ ] Audit remaining plugin-owned boundary violations and remaining repo-coupled build assumptions.
- [ ] Add or tighten focused boundary checks where the allowed and disallowed lines are still unclear.
- [ ] Mark Phase A complete only after the remaining work is narrowed to concrete source/build and proof issues.

## Phase B: Frontend Source And Build Independence
- [ ] Remove repo-root frontend package resolution and hidden repo-private build assumptions from \`plugins/setta-json-render-app-gen/frontend\`.
- [ ] Keep the plugin frontend dependent only on plugin-owned code, published frontend SDK surfaces, and explicit third-party package dependencies.
- [ ] Ensure any repo convenience wrapper is optional and not the only valid way to build the plugin frontend.
- [ ] Add staged-source build verification outside the repo frontend dependency-resolution path.
- [ ] Mark Phase B complete only after the plugin frontend can be built from staged plugin source with intentional dependencies only.

## Phase C: Staged-Source And Installed-Flow Proof
- [ ] Preserve the published backend SDK and local-core boundary rather than moving canonical semantics into the plugin.
- [ ] Make any required host/runtime dependency intentional in packaging, docs, or tests instead of leaving it as an accidental checkout property.
- [ ] Keep first-party and unknown-id providers on the same runtime contract.
- [ ] Add focused verification for staged-source build, installed-wheel behavior, and any needed linked/runtime parity.
- [ ] Mark Phase C complete only after source/build proof and installed/runtime proof are both explicit and aligned.

## Phase D: Guardrails And Final Audit
- [ ] Add or tighten guardrails against regressions back to repo-root build coupling or private host imports.
- [ ] Re-audit production and checked-in generated host code for concrete first-party app-plugin assumptions and keep only allowed references.
- [ ] Before every commit, run focused verification plus \`./gcf.sh\` and \`./check_quality.sh\`.
- [ ] Mark Phase D complete only after regressions toward repo-only build assumptions and first-party runtime exceptions are structurally blocked.

## Completion
- [ ] Any session that does not emit the stop sentinel must either produce a new clean commit whose message starts with \`codex-apppluginboundary:\` or leave the repo unchanged while advancing ${checklist_file} and/or ${architecture_audit_file} for the next audited step.
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
- ${loop_root_dir}/docs/reference/plugin-language-servers.md
- ${plan_file}
- ${loop_root_dir}/docs/plans/first-party-plugin-standalone-completion-plan.md
- ${loop_root_dir}/docs/plans/third-party-plugin-generalization-plan.md
- \`git log --oneline --decorate -n 20\`
- ${checklist_file}
- ${architecture_audit_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Primary design constraints:
- Do not treat valid host-owned plugin-family infrastructure as a defect. Core-owned provider selection, route shapes, plugin lifecycle plumbing, published SDK surfaces, and local-core delegation are allowed and intended.
- The real defects are: private host imports from plugin-owned code, production or generated first-party runtime exceptions, and repo-root build assumptions that are not part of the plugin's intentional dependency model.
- This is a clean cutover. Do not add or preserve backward compatibility, legacy support, migrations, transitional code paths, dual runtime/build paths, rollout toggles, compatibility wrappers, builtin fallbacks, or temporary bridges.
- Keep Go authoritative for correctness-sensitive app-subsystem behavior.
- Keep published or packaged host SDK and local-core boundaries as the correct integration path for the app plugin.
- Do not move canonical app semantics into the plugin just to make it feel more self-contained.
- Plugin-owned frontend code must depend only on plugin-owned code, published plugin-facing frontend SDK surfaces, and explicit third-party dependencies.
- Plugin-owned backend Python code must depend only on plugin-owned code, published backend plugin-runtime surfaces, and explicit intentional host/runtime dependencies.
- Linked-worktree and package-manager-installed plugin flows must remain equivalent at runtime.
- Unknown-id providers must keep exercising the same runtime contract.
- Keep \`setta-basedpyright\` and \`setta-ty\` stable. Do not reopen language-server generalization work unless a fresh audit finds a real regression.
- Do not add backward compatibility shims, legacy support, builtin fallbacks, rollout toggles, dual contracts, or temporary bridges.

Scope discipline:
- This is a closure plan for the remaining boundary issues, not another broad extraction plan.
- Do not spend iterations trying to remove the host skeleton for the app-subsystem family. That skeleton is allowed.
- Do not stop at "the built bundle loads." The finish line also requires staged-source or equivalently isolated source/build proof.
- Do not preserve repo-only build paths as the safety net. If a plugin-owned build path becomes correct, remove the superseded required path and make any remaining wrapper optional instead of mandatory.
- Defaults-profile references, docs, tests, packaging metadata, and plugin-owned code may still reference concrete first-party ids when that is intentional and not a runtime-boundary violation.

Phase-order rules:
- Treat ${checklist_file} as the execution source of truth derived from ${plan_file}.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase unless a later edit reopens an earlier item.
- Start each iteration by refreshing ${checklist_file} and ${architecture_audit_file} so they match the actual repo state before choosing the next task.
- Treat this session as standalone. Do not rely on follow-up prompts.

Execution rules for every iteration:
- Start with a fresh targeted audit of the active phase.
- Update ${architecture_audit_file} before editing code with the current phase, current target, allowed host-owned infrastructure that must stay intact, remaining plugin-owned boundary violations, remaining repo-coupled build assumptions, remaining staged-source or installed-flow proof gaps, verification plan, and next highest-priority step.
- Pick one actionable issue or one tightly related cluster inside the active phase that you can complete confidently in this session.
- Prefer published SDK boundaries, generic plugin contracts, and explicit local-core clients over private host imports or first-party runtime exceptions.
- Keep the language-server-style model: core owns the family infrastructure, plugins supply provider behavior.
- Prefer direct deletion of superseded compatibility-era or repo-only paths over leaving both paths alive.
- Do not hand-edit generated files.
- If Go-owned contracts, generator inputs, Python SDK contracts, frontend generation inputs, or checked-in build metadata change, regenerate affected outputs before cleanup.
- Run focused verification for the behavior you changed.
- Before every commit, run \`./gcf.sh\` and then \`./check_quality.sh\`. If either fails, fix the failure or stop without committing.
- If a landed change materially alters frontend runtime UI and an already-running developer-started browser session is available, use CDP visual verification. Do not burn loop iterations starting, waiting on, or debugging browser tooling. If that verification is required but unavailable, record it in ${architecture_audit_file} and choose another actionable slice.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-apppluginboundary:\`.
- If you make no repo changes, leave the repo clean and advance ${checklist_file} and/or ${architecture_audit_file} meaningfully for the next audited step.
- Do not ask for follow-up.

Phase A guidance:
- Freeze the allowed boundary and keep the plan focused on real remaining problems.
- Add or tighten checks that distinguish allowed host-owned framework code from disallowed private-host imports or repo-only build assumptions.

Phase B guidance:
- Remove repo-root frontend package resolution from the app plugin build.
- Make the plugin frontend dependency model explicit.
- Make any repo wrapper optional rather than mandatory.
- Prove the plugin frontend builds from staged plugin source.

Phase C guidance:
- Preserve the published backend SDK and local-core boundary.
- Make host/runtime dependency expectations intentional and explicit.
- Keep first-party and unknown-id providers on the same runtime contract.
- Strengthen staged-source and installed-flow proof rather than redesigning runtime architecture.

Phase D guidance:
- Add tests or guards that fail if repo-root build coupling returns.
- Re-audit production and generated host code for concrete first-party app-plugin runtime assumptions.
- Finish with a fresh focused audit, not only a textual plan checklist update.

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
