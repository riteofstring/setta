#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-python-language-server-pluginization-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop to execute
`docs/plans/python-language-server-pluginization-plan.md`.

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.4`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Inactivity timeout: 1800 seconds without transcript updates
- Stop only when Codex explicitly reports audited completion of the pluginization plan
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
  ./scripts/run-codex-python-language-server-pluginization-loop.sh
  ./scripts/run-codex-python-language-server-pluginization-loop.sh --model gpt-5.4
  ./scripts/run-codex-python-language-server-pluginization-loop.sh -- --config reasoning_effort=\"high\"
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
stop_sentinel="CODEX_LOOP_STOP: PYTHON_LANGUAGE_SERVER_PLUGINIZATION_AUDITED_COMPLETE"
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
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-python-language-server-pluginization-loop.${timestamp}.XXXXXX")"
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

plan_file="${ROOT_DIR}/docs/plans/python-language-server-pluginization-plan.md"
checklist_file="${state_dir}/checklist.md"
prompt_file="${state_dir}/prompt.md"
current_state_audit_file="${state_dir}/current-state-audit.md"
test_matrix_audit_file="${state_dir}/test-matrix-audit.md"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

if [[ ! -f "${current_state_audit_file}" ]]; then
  cat > "${current_state_audit_file}" <<EOF
# Python Language-Server Pluginization Current-State Audit

Keep this file compact and current-state only.
Overwrite stale notes instead of appending an iteration diary.

## Latest repo state
- Keep this section to at most 10 bullets about the current repo state.

## Active phase

## Current target

## Remaining Phase 1 blockers

## Remaining Phase 2 blockers

## Remaining Phase 3 blockers

## Remaining Phase 4 blockers

## Open risks and blockers
EOF
fi

if [[ ! -f "${test_matrix_audit_file}" ]]; then
  cat > "${test_matrix_audit_file}" <<EOF
# Python Language-Server Pluginization Test Matrix Audit

Keep this file compact and current-state only.
Overwrite stale notes instead of appending an iteration diary.

## Core-without-plugin lane

## Language-server plugin contract lane

## Plugin-isolated lane

## Defaults-profile integration lane

## Packaging lane

## Fixture and helper gaps
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# Python Language-Server Pluginization Checklist

Keep this file accurate while the loop runs.

Rules:
- The plan at ${plan_file} is the source of truth for architecture and acceptance criteria.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase. Do not start a later phase early.
- If a later-phase change reopens an earlier-phase issue, change that earlier item back to \`[ ]\` and return to it immediately.
- Mark a phase item \`[x]\` only after a fresh targeted audit or verification proves it is complete.
- Do not delete items.
- Keep ${current_state_audit_file} and ${test_matrix_audit_file} compact and current-state only.

## Phase 1: Core Architecture And Selection Model
- [ ] Update ${current_state_audit_file} on every Phase 1 iteration.
- [ ] Remove built-in Python language-server ownership from the core router/current-process path.
- [ ] Introduce explicit workspace \`languageServer.selectedByLanguage\` semantics for missing vs plugin id vs \`null\`.
- [ ] Allow plugin registrations to target Python and allow same-language registrations to coexist until explicit selection chooses one.
- [ ] Use plugin id as the language-server selection identity and enforce one plugin package == one language-server implementation.
- [ ] Push only the selected registration for each language into the live router.
- [ ] Make unconfigured and unavailable behavior explicit: empty diagnostics, unavailable completions/signature help, explicit restart errors, and clear main-UI warning instead of synthetic diagnostics.
- [ ] Mark Phase 1 complete only after a fresh audit shows the app works correctly with no Python plugin installed and with no Python selection.

## Phase 2: First-Party basedpyright Plugin
- [ ] Update ${current_state_audit_file} on every Phase 2 iteration.
- [ ] Build a first-party plugin that owns the Python language-server registration, command/args, plugin-config-rooted settings key, and carried-over warning-suppression defaults.
- [ ] Remove core ownership of the built-in \`basedpyright\` command bootstrap and built-in \`basedpyright\` settings branch.
- [ ] Keep language-server-specific settings plugin-owned in the existing Plugins UI/plugin-config flow rather than the main settings page.
- [ ] Mark Phase 2 complete only after the first-party plugin can provide Python LSP end to end.

## Phase 3: Defaults Profile And Workspace Bootstrap
- [ ] Update ${current_state_audit_file} on every Phase 3 iteration.
- [ ] Add an explicit curated defaults install/profile that includes the first-party \`basedpyright\` plugin.
- [ ] Bootstrap the default Python selection only on first workspace open when \`languageServer.selectedByLanguage.python\` is missing.
- [ ] Never overwrite an explicit \`null\` selection or an explicit plugin-id selection.
- [ ] Mark Phase 3 complete only after defaults installation, activation, and one-time bootstrap behavior are verified.

## Phase 4: Packaging Boundary And Test Matrix
- [ ] Update ${current_state_audit_file} and ${test_matrix_audit_file} on every Phase 4 iteration.
- [ ] Remove \`basedpyright\` from the core packaged dependency boundary and install it through the plugin/defaults path in the same Python environment as Setta.
- [ ] Split coverage explicitly into core-without-plugin, language-server plugin contract, plugin-isolated, defaults-profile integration, and packaging lanes.
- [ ] Refactor test helpers and fixtures so plugin presence is explicit rather than implicit.
- [ ] Mark Phase 4 complete only after the acceptance criteria and recommended test matrix in ${plan_file} are satisfied or explicitly audited as complete.

## Completion
- [ ] Before every non-stop commit, run focused verification, \`./gcf.sh\`, and \`./check_quality.sh\`.
- [ ] Every non-stop iteration ends with a clean worktree and a commit whose message starts with \`codex-python-lsp-pluginization:\`.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop for this repository.

Mission:
Execute ${plan_file} in strict phase order:
1. core architecture and language-server selection model
2. first-party \`basedpyright\` plugin
3. defaults install profile and one-time workspace bootstrap
4. packaging boundary cleanup and explicit test-matrix completion

Read first, in this order:
- ${ROOT_DIR}/AGENTS.md
- ${plan_file}
- ${ROOT_DIR}/docs/reference/go-backed-python.md
- ${ROOT_DIR}/docs/reference/generation-contracts.md
- ${ROOT_DIR}/docs/guides/dev-scripts.md
- \`git log --oneline --decorate -n 15\`
- ${checklist_file}
- ${current_state_audit_file}
- ${test_matrix_audit_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Current repo surfaces to audit early:
- \`internal/lsp/router.go\`
- \`internal/lsp/current_process.go\`
- \`internal/lsp/current_process_settings.go\`
- \`internal/plugins/backend_probe.go\`
- \`internal/plugins/language_servers.go\`
- \`internal/plugins/runtime.go\`
- \`internal/app/plugin_backend_runtime_refresh.go\`
- \`internal/settingsstate/defaults.json\`
- \`pyproject.toml\`
- \`tests/start/test_packaged_distribution.py\`

Phase-order rules:
- Treat ${checklist_file} as the execution source of truth and keep it current.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase. Do not start a later phase early.
- If a later edit reopens an earlier-phase issue, set that earlier checklist item back to \`[ ]\` and return to it immediately.
- Start each iteration by refreshing the checklist and both audit files so they match the actual repo state before you choose work.
- Treat this session as standalone. Do not rely on follow-up prompts.
- For any ad hoc Python, package, or install command, explicitly activate the repo environment first with \`source activate.sh && ...\`.

Execution rules for every iteration:
- Start with a fresh targeted audit of the active phase against the plan and current repo state.
- Pick one actionable issue or tightly related cluster inside the active phase that you can complete confidently in this session.
- Keep ${current_state_audit_file} and ${test_matrix_audit_file} compact and current-state only. Overwrite stale notes instead of appending a long diary.
- Cap \`## Latest repo state\` in ${current_state_audit_file} to at most 10 bullets.
- Prefer Go-owned logic, settings validation, metadata, and contracts over duplicated Python or TypeScript logic.
- Do not preserve the built-in Python LSP path, old settings formats, ambiguity heuristics, or compatibility shims that the plan explicitly rejects.
- Do not silently auto-pick same-language plugins. Selection must be explicit and deterministic.
- Keep language-server-specific settings plugin-owned in plugin config and the existing Plugins UI/plugin-config flow. The main settings document should only own per-language selection.
- When the selected plugin is absent, disabled, or uninstalled, preserve the stored selection, keep the app running, and make unavailability clear in product UI instead of clearing settings or fabricating diagnostics.
- If the simplest first cut requires an explicit restart or refresh for selection changes to apply, make that action obvious in the UI and cover it with tests.
- When you change Go-owned contracts, backend endpoints, frontend generation inputs, or Go-owned shared types used by frontend/Python surfaces, regenerate the affected outputs before cleanup.
- Do not hand-edit generated files.
- If dependency changes require lockfile updates, use \`./update_dependencies.sh\` instead of rewriting lockfiles ad hoc.
- Run focused verification for the behavior you changed.
- Before every non-stop commit, run \`./gcf.sh\` and then \`./check_quality.sh\`. If either fails, fix the failure or stop without committing.
- When you launch a long-running shell command such as \`./gcf.sh\`, treat partial streamed output as still in progress. Do not inspect diffs, run follow-up commands, or commit until that command has fully exited successfully.
- If browser verification is genuinely required because you changed frontend runtime behavior or the project-page warning/restart UX, use an already-running developer-started CDP session only. Do not start browser MCP processes yourself.
- For any iteration that changes relevant UI runtime behavior, include \`CDP visual check: done (...)\` or \`CDP visual check: not run (reason)\` in the final response.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-python-lsp-pluginization:\`.
- Do not create a commit if you made no repo changes.
- Do not ask for follow-up.

Phase 1 rules:
- Remove built-in Python language-server ownership from core. The router should be able to run with no Python language server selected.
- Introduce explicit workspace settings semantics for \`languageServer.selectedByLanguage\`: missing key means never chosen, string means selected plugin id, \`null\` means explicitly none.
- Allow plugin registrations to target Python.
- Change same-language plugin handling from blanket ambiguity failure to explicit-selection behavior where only the selected plugin becomes active.
- Use plugin id as the language-server selection identity and enforce the one-plugin-package == one-language-server-implementation rule.
- Push only the selected registration per language into the live router.
- Make unconfigured behavior explicit: startup succeeds, diagnostics remain empty, completions/signature help behave as unavailable, restart returns a clear error, and the main project page explains the state through normal UI.
- Mark Phase 1 complete only after a fresh audit shows the app works correctly with no Python plugin installed and with no Python language server selected.

Phase 2 rules:
- Build a first-party plugin that owns the Python language-server registration, command, args, settings key rooted in plugin config, and the carried-over \`basedpyright\` warning-suppression defaults.
- Remove core ownership of the built-in \`basedpyright\` command bootstrap, built-in settings branch, and the assumption that Python LSP always exists.
- Keep plugin-specific settings in plugin config and the existing Plugins UI flow rather than the main settings page.
- Prefer the same runtime path for first-party and third-party plugins whenever practical.
- Mark Phase 2 complete only after the first-party plugin can provide Python LSP end to end.

Phase 3 rules:
- Add an explicit curated defaults install/profile that includes the first-party \`basedpyright\` plugin.
- Defaults installation must target the same Python environment that runs Setta for the relevant packaging flow.
- Bootstrap the default Python selection only once, on first workspace open, and only when \`languageServer.selectedByLanguage.python\` is missing.
- Never overwrite an explicit \`null\` selection or explicit plugin-id selection.
- Keep the defaults lane intentionally narrow. Validate the curated bundle, not every plugin behavior.
- Mark Phase 3 complete only after defaults installation, activation, one-time bootstrap, and explicit clear-to-none behavior are verified.

Phase 4 rules:
- Remove \`basedpyright\` from the core packaged dependency boundary once the plugin owns it.
- Split tests explicitly into:
  - core-without-plugin
  - language-server plugin contract
  - plugin-isolated
  - defaults-profile integration
  - packaging
- Refactor fixtures and helpers so plugin presence is explicit rather than implicit.
- Use ${test_matrix_audit_file} to track what remains in each lane and any fixture/helper gaps.
- Mark Phase 4 complete only after the acceptance criteria and recommended test matrix in ${plan_file} are satisfied or explicitly audited as complete.

Completion criteria:
- A non-stop iteration must either produce a new clean commit or leave the repo unchanged while advancing ${checklist_file}, ${current_state_audit_file}, or ${test_matrix_audit_file} for the next iteration.
- Never end the session with uncommitted, unstaged, or untracked repo changes.

If a fresh audit shows all phases are complete under these rules, make no repo changes, leave the worktree clean, state that the stop reason is complete, and end your final response with this exact line:
  ${stop_sentinel}
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
    --progress-file "${checklist_file}" \
    --progress-file "${current_state_audit_file}" \
    --progress-file "${test_matrix_audit_file}" \
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

echo "Plan: ${plan_file}"
echo "Checklist: ${checklist_file}"
echo "Current-state audit: ${current_state_audit_file}"
echo "Test-matrix audit: ${test_matrix_audit_file}"
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
