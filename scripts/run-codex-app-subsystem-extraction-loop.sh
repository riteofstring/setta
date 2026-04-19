#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-app-subsystem-extraction-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to execute
`docs/plans/app-subsystem-extraction-plan.md` end to end.

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Inactivity timeout: 1800 seconds without transcript updates
- Quiet status-log mode: on
- Quiet progress log interval: 60 seconds
- Retry sleep after retryable Codex failures: 60 seconds
- Stop only when Codex explicitly reports the app-subsystem extraction plan is fully executed
- Require every non-stop iteration to leave a clean worktree and either advance HEAD or advance the checklist/review state
- If an iteration leaves the repo in an invalid state, reset back to the last clean HEAD and continue
- Before every non-stop commit, run focused verification, `./gcf.sh`, and `./check_quality.sh`, then fix any failures before committing

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
                         Sleep N seconds before retrying after inactivity
                         timeouts or Codex command failures. Default: 60
  --progress-log-interval-seconds N
                         When the loop is in quiet terminal mode, print a
                         progress log at most once every N seconds while
                         Codex is still running. Default: 60
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-app-subsystem-extraction-loop.sh
  ./scripts/run-codex-app-subsystem-extraction-loop.sh --model gpt-5.4
  ./scripts/run-codex-app-subsystem-extraction-loop.sh -- --config reasoning_effort=\"high\"
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
retry_sleep_seconds="60"
progress_log_interval_seconds="60"
complete_exit_code="42"
stop_sentinel="CODEX_LOOP_STOP: APP_SUBSYSTEM_EXTRACTION_COMPLETE"
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
    --retry-sleep-seconds)
      require_value "$1" "${2:-}"
      retry_sleep_seconds="$2"
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

if [[ ! "${progress_log_interval_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--progress-log-interval-seconds must be a non-negative integer" >&2
  exit 1
fi

if ! repo_is_clean; then
  echo "Refusing to start: repository is not clean." >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-app-subsystem-extraction-loop.${timestamp}.XXXXXX")"
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

plan_file="${ROOT_DIR}/docs/plans/app-subsystem-extraction-plan.md"
checklist_file="${state_dir}/checklist.md"
phase_review_file="${state_dir}/phase-review.md"
prompt_file="${state_dir}/prompt.md"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"
recovery_state_file="${state_dir}/recovery-state.txt"
plugin_required_error='App mode requires the first-party plugin "setta-json-render-app-gen" to be enabled.'

if [[ ! -f "${phase_review_file}" ]]; then
  cat > "${phase_review_file}" <<EOF
# App Subsystem Extraction Phase Review

Keep this file compact and current-state only.
Overwrite stale notes instead of appending an iteration diary.

Source plan:
- ${plan_file}

## Current phase

## Current repo state

## Remaining blockers and coupling

## Disabled-state and compatibility gaps

## Verification gaps
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# App Subsystem Extraction Checklist

Keep this file accurate while the loop runs.

Rules:
- The source plan is ${plan_file}
- Treat the plan plus this checklist as the source of truth.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase. Do not start a later phase early.
- If a later-phase change reopens an earlier-phase guarantee, change that earlier item back to \`[ ]\` and return to it immediately.
- Mark a phase item \`[x]\` only after fresh verification proves it.
- Do not delete items.
- Keep current-state notes in ${phase_review_file}.

## Phase 0: Freeze Behavior And Define The Cut Line
- [ ] Inventory all app-specific routes, tools, pages, stores, deployment/runtime paths, and generated surfaces in ${phase_review_file}.
- [ ] Freeze the first-pass public names: \`json_render\`, \`json_render_with_image\`, app-definition MCP tool names, and app-definition HTTP route names.
- [ ] Add or tighten tests where coverage is missing for app-generation prompt selection, streamed preview patch application, app-definition validation/write flow, and app deployment publish/load/runtime.
- [ ] Document and verify the intended disabled-state behavior in ${phase_review_file}.
- [ ] Mark Phase 0 complete only after the inventory is written and current happy-path plus disabled-state coverage exists.

## Phase 1: Add Host Registries And Capability Gating
- [ ] Add backend registries for HTTP routes, MCP tools, chat mode/prompt contributions, deployment types, publish/load/runtime handlers, and capability descriptors.
- [ ] Add frontend registries for routes/pages, overview panes/tabs, slash commands, feature-scoped state initialization/reset hooks, and capability gating.
- [ ] Add a backend-owned capability manifest flow from backend startup to frontend startup.
- [ ] Create \`plugins/setta-json-render-app-gen/\` with plugin id \`setta-json-render-app-gen\` and \`enabledByDefault: false\`.
- [ ] Register the current app subsystem through the new plugin/registry path before large code moves.
- [ ] Remove unconditional host mounting/imports of app pages, panes, routes, and commands, then verify plugin-disabled host behavior.
- [ ] Mark Phase 1 complete only after core bootstraps app behavior through registries and disabling the plugin hides app UI/routes without breaking non-app core behavior.

## Phase 2: Isolate Backend AppSpec And AppDefinition Ownership
- [ ] Move AppSpec/AppDefinition backend ownership behind \`plugins/setta-json-render-app-gen/backend/...\`.
- [ ] Move app-definition HTTP route registration out of generic \`internal/httpapi\` bootstrapping into the feature registration path.
- [ ] Move app-definition MCP tool registration out of generic \`internal/mcpx\` bootstrapping into the feature registration path.
- [ ] Move app-definition validation, write, and stream helpers behind subsystem-owned services while keeping core storage compatibility only as opaque legacy payload.
- [ ] Mark Phase 2 complete only after core no longer imports app-specific validators, tool definitions, or route handlers directly.

## Phase 3: Isolate App-Generation Integration
- [ ] Replace hard-coded app-generation mode branching in generic chat services with plugin-owned chat mode contributions.
- [ ] Move prompt building, image-mode validation, tool guidance, and slash-command ownership into the plugin.
- [ ] Gate chat hydration and replay so missing plugin support does not crash on historical app-generation provenance.
- [ ] Restrict app-generation generated surface imports to plugin-owned code.
- [ ] Mark Phase 3 complete only after generic chat code no longer needs to know what \`json_render\` means and disabling the plugin removes app-generation behavior without breaking plain chat.

## Phase 4: Isolate Frontend Authoring And Runtime UI
- [ ] Move app frontend renderer/runtime components into \`plugins/setta-json-render-app-gen/frontend/...\`.
- [ ] Move App Config, App Preview, and App mode registration/wiring behind the plugin frontend entry.
- [ ] Move or namespace app preview state under feature-owned stores and controllers.
- [ ] Route streamed app patch previews through feature-owned preview control.
- [ ] Mark Phase 4 complete only after the host frontend mounts app UI only through feature registration and plugin-disabled host behavior removes app UI cleanly.

## Phase 5: Isolate App Deployment Mode And Publish/Runtime Behavior
- [ ] Introduce a deployment type registry and feature-owned publish/load/runtime registration.
- [ ] Move app deployment session bootstrap, state routes, publish/load/runtime behavior, and related runtime wiring behind the plugin.
- [ ] Remove unconditional core assumptions that app deployments exist.
- [ ] Keep \`setta app\` as a reserved host command that fails with this exact plugin-required error when unavailable: ${plugin_required_error}
- [ ] Mark Phase 5 complete only after core deployment/runtime code works without app deployment support and enabling the plugin restores app deployment behavior.

## Phase 6: Clean Up Persistence And Generated Contracts
- [ ] Preserve or migrate persistence intentionally while keeping core storage compatibility only as opaque legacy payload unless a controlled migration is required.
- [ ] Prevent host-owned code from importing app-only generated or shared contract surfaces.
- [ ] Keep new app-only generated surfaces out of generic host-owned code.
- [ ] Document the ownership model for app-specific persisted state and generated surfaces in ${phase_review_file}.
- [ ] Mark Phase 6 complete only after the subsystem boundary is explicit in persistence/generation ownership and host code no longer grows new app-only contract dependencies.

## Phase 7: Package The Subsystem
- [ ] Materialize the final package structure under \`plugins/setta-json-render-app-gen/\`.
- [ ] Ensure packaging includes backend registrars, frontend bundle/assets, generated contract surfaces, and compatibility metadata.
- [ ] Add startup wiring that loads the plugin when enabled and reports disabled capabilities when absent.
- [ ] Ensure developer install/build flows cover enabled vs disabled distributions.
- [ ] Mark Phase 7 complete only after a distribution can run without the plugin and a distribution with the plugin enabled preserves current behavior.

## Completion
- [ ] Before every non-stop commit, run focused verification, \`./gcf.sh\`, and \`./check_quality.sh\`, and fix any failures before committing.
- [ ] Every non-stop iteration ends with a clean worktree and a commit whose message starts with \`codex-app-subsystem:\`.
- [ ] Do not emit the stop sentinel until the Definition Of Done in ${plan_file} is satisfied and re-audited against current code.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop for this repository.

Mission:
Execute ${plan_file} end to end until the plan is fully implemented.

Read first, in this order:
- ${ROOT_DIR}/AGENTS.md
- ${plan_file}
- ${ROOT_DIR}/docs/reference/go-backed-python.md
- ${ROOT_DIR}/docs/reference/generation-contracts.md
- ${ROOT_DIR}/docs/guides/dev-scripts.md
- ${ROOT_DIR}/docs/guides/verification-checklist.md
- \`git log --oneline --decorate -n 15\`
- ${checklist_file}
- ${phase_review_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Fixed plan decisions you must preserve:
- The extracted subsystem lives in \`plugins/setta-json-render-app-gen/\`.
- The plugin id is \`setta-json-render-app-gen\`.
- The plugin manifest must keep \`enabledByDefault: false\`.
- At the product surface, disabled and absent mean the same thing: no app routes, no app MCP tools, no app-generation commands, no app UI, and no app deployment runtime.
- Core may keep legacy \`project.json.appDefinition\` and \`app_specs/\` only as opaque compatibility payload. Only the plugin may parse, validate, mutate, publish, or interpret that app data.
- The host frontend must not statically import app plugin UI. Capability discovery must drive lazy loading and registration.
- \`setta app\` remains a reserved host command. If the plugin is unavailable, it must fail immediately with this exact error: ${plugin_required_error}
- Historical chat data containing app-generation provenance must hydrate safely without the plugin; editing or replaying unsupported app-generation turns must fail clearly rather than silently degrading.

Phase-order rules:
- Treat ${checklist_file} as the source of truth for active work.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase. Do not do later-phase work early.
- If a later edit reopens an earlier-phase guarantee, set that earlier item back to \`[ ]\` and return to it immediately.
- Do not move large app surfaces into \`plugins/setta-json-render-app-gen/\` before the required host registries and capability gating exist.
- Treat this session as standalone. Do not rely on follow-up prompts.

Execution rules for every iteration:
- Start with a fresh audit against the active phase in ${checklist_file} and refresh ${phase_review_file} so it reflects the current repo state.
- Pick one actionable phase-owned slice or tightly-related cluster that you can land completely in this session.
- Favor changes that materially advance the ownership boundary, capability gating, disabled-state behavior, or plugin registration path over helper churn.
- Keep Go as the source of truth for canonical behavior, validation, derived metadata, shared contracts, endpoint shapes, and correctness-sensitive runtime behavior unless the repo explicitly says otherwise.
- If you touch frontend generation inputs, backend endpoints, or Go-owned types used by frontend or Python surfaces, regenerate affected outputs before cleanup and before finishing the iteration.
- When runtime behavior changes, add or tighten focused tests beside the owner package. When Python/package boundaries change, add focused pytest coverage. When frontend behavior changes, add focused frontend tests.
- If UI behavior or visual surfaces change in a way that requires visual confirmation, use Chrome DevTools verification per repo rules when relevant. Do not fake a visual check.
- If browser verification is genuinely required, use an already-running developer-started browser session only. Do not spend the iteration starting or debugging browser infrastructure.
- For Python/package commands, explicitly activate the repo environment first with \`source activate.sh && ...\`.
- Run Go through \`./scripts/go.sh\`.
- Before every non-stop commit, run focused verification for the area you changed, then run \`./gcf.sh\`, then run \`./check_quality.sh\`. If any of those fail, fix the issue or stop without committing.
- Treat \`./gcf.sh\` and \`./check_quality.sh\` as mandatory before every non-stop commit, even for small changes.
- When you launch a long-running shell command such as \`./gcf.sh\`, wait for it to exit successfully before inspecting diffs, running more commands, or committing.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-app-subsystem:\`.
- If a fresh audit advances only ${checklist_file} or ${phase_review_file} and makes no repo changes, leave the repo unchanged and the worktree clean.
- Do not create a commit if you made no repo changes.
- Do not ask for follow-up.

Phase guidance:
- Phase 0 is about freezing behavior, documenting the cut line, and closing missing test coverage for the current behavior and disabled-state expectations before structural extraction work expands.
- Phase 1 is about registries, capability manifest flow, plugin skeleton, and host gating. Finish the host extension points before large subsystem moves.
- Phase 2 is about backend AppSpec/AppDefinition ownership, route/tool registration, and keeping core storage compatibility opaque.
- Phase 3 is about moving app-generation mode, prompt, validation, slash commands, and historical provenance handling behind plugin-owned chat contributions.
- Phase 4 is about moving App Config, App Preview, App mode, renderer/runtime components, and patch-preview state behind the plugin frontend entry.
- Phase 5 is about deployment-type registration, app publish/load/runtime ownership, app deployment routes, and the reserved \`setta app\` command behavior.
- Phase 6 is about persistence ownership and generated-contract boundaries. Keep compatibility first; avoid growing new host-owned app-specific contracts.
- Phase 7 is about packaging, startup wiring, capability reporting, and enabled-vs-disabled distribution behavior.

Definition of done:
- Do not emit the stop sentinel until every phase in ${checklist_file} is complete and the Definition Of Done in ${plan_file} is satisfied in the current codebase.
- The plan is complete only when core backend and frontend run without the app subsystem enabled, the plugin exists and is disabled by default, the app subsystem registers its own routes/tools/chat modes/pages, generic chat/deployment/shell code no longer hard-code app concepts, enabled behavior is preserved, disabled-state behavior is tested/documented, and the subsystem is enabled through the plugin system rather than compiled in as a mandatory default feature.

If a fresh audit shows the full plan is complete under those rules, make no repo changes, leave the worktree clean, state that the stop reason is complete, and end your final response with this exact line:
  ${stop_sentinel}

Completion discipline:
- Any session that does not emit the stop sentinel must either produce a new clean commit or leave the repo unchanged while advancing ${checklist_file} and/or ${phase_review_file}.
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
    "${ROOT_DIR}/scripts/codex-app-subsystem-extraction-loop-pre-iteration.sh" \
    --root-dir "${ROOT_DIR}" \
    --output-dir "${output_dir}" \
    --state-dir "${state_dir}" \
    --complete-exit-code "${complete_exit_code}" \
    --sentinel "${stop_sentinel}" \
    --progress-file "${checklist_file}" \
    --progress-file "${phase_review_file}" \
    --recovery-file "${recovery_state_file}" \
    --allow-clean-failures "${iterations}"
)"

post_iteration_command="$(
  shell_join \
    "${ROOT_DIR}/scripts/codex-app-subsystem-extraction-loop-post-iteration.sh" \
    --root-dir "${ROOT_DIR}" \
    --state-dir "${state_dir}" \
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
echo "Phase review file: ${phase_review_file}"
echo "Recovery state file: ${recovery_state_file}"
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
echo "Post-commit settle check: ${post_commit_settle_seconds}s"
if [[ "${yolo_mode}" == "1" ]]; then
  echo "Yolo mode: enabled"
else
  echo "Yolo mode: disabled"
fi

exec "${loop_args[@]}"
