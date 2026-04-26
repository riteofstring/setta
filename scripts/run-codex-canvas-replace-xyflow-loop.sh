#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-canvas-replace-xyflow-loop.sh [options] [-- <extra codex exec args>]

Run a resilient Codex loop for the HTML-in-Canvas xyflow replacement plan.

Defaults:
- Plan: docs/plans/html-in-canvas-pan-zoom-plan.md
- Completion sentinel: HTML_IN_CANVAS_PAN_ZOOM_PLAN_COMPLETE
- Maximum iterations: 1000
- Model: gpt-5.5
- Reasoning effort: xhigh
- Yolo mode: on
- Quiet terminal output with periodic progress logs
- Continue after Codex failures and inactivity timeouts
- Do not enforce clean worktree or per-iteration commits

Options:
  --plan PATH            Plan file path relative to the repository root.
                         Default: docs/plans/html-in-canvas-pan-zoom-plan.md
  --sentinel TEXT        Exact completion sentinel expected from Codex.
                         Default: HTML_IN_CANVAS_PAN_ZOOM_PLAN_COMPLETE
  --name NAME            Short loop name used for artifact paths.
                         Default: canvas-replace-xyflow
  --commit-prefix TEXT   Commit prefix Codex should use for commits it makes.
                         Default: canvas-xyflow:
  --iterations N         Maximum loop iterations. Default: 1000
  --root-dir PATH        Repository root to operate on.
                         Default: parent of this script's directory
  --output-dir PATH      Directory for prompts, state, logs, and loop runs.
                         Default: mktemp dir under TMPDIR
  --state-dir PATH       Directory for persistent checklist/audit files.
                         Default: <output-dir>/state
  --model NAME           Model override passed to codex exec.
                         Default: gpt-5.5
  --inactivity-timeout-seconds N
                         Retry an iteration if Codex produces no transcript
                         output for N seconds. Default: 1800
  --retry-sleep-seconds N
                         Sleep N seconds before retrying after a failure.
                         Default: 15
  --progress-log-interval-seconds N
                         Print at most one quiet progress line every N seconds.
                         Default: 120
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --keep-dev-running     Do not run ./kill.sh after each iteration.
  --extra-prompt TEXT    Additional instructions appended to the loop prompt.
  --extra-prompt-file PATH
                         File containing additional instructions appended to
                         the loop prompt.
  --help                 Show this help text

Examples:
  ./scripts/run-codex-canvas-replace-xyflow-loop.sh
  ./scripts/run-codex-canvas-replace-xyflow-loop.sh --output-dir /tmp/canvas-loop
  ./scripts/run-codex-canvas-replace-xyflow-loop.sh -- --config reasoning_effort=\"high\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

plan_relpath="docs/plans/html-in-canvas-pan-zoom-plan.md"
stop_sentinel="HTML_IN_CANVAS_PAN_ZOOM_PLAN_COMPLETE"
loop_name="canvas-replace-xyflow"
commit_prefix="canvas-xyflow:"
iterations="1000"
root_dir="${DEFAULT_ROOT_DIR}"
output_dir=""
state_dir=""
model="gpt-5.5"
yolo_mode="1"
inactivity_timeout_seconds="1800"
retry_sleep_seconds="15"
progress_log_interval_seconds="120"
complete_exit_code="42"
kill_dev_after_iteration="1"
extra_prompt=""
extra_prompt_file=""
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
  local existing_path=""
  local suffix=""

  if [[ "${candidate}" != /* ]]; then
    candidate="${PWD}/${candidate}"
  fi

  while [[ ! -e "${candidate}" ]]; do
    suffix="/$(basename "${candidate}")${suffix}"
    candidate="$(dirname "${candidate}")"
  done

  if [[ -d "${candidate}" ]]; then
    existing_path="$(cd "${candidate}" && pwd)"
  else
    existing_path="$(cd "$(dirname "${candidate}")" && pwd)/$(basename "${candidate}")"
  fi
  printf '%s%s\n' "${existing_path}" "${suffix}"
}

timestamp_now() {
  date '+%Y-%m-%d %H:%M:%S'
}

append_extra_prompt_section() {
  local prompt_path="$1"

  if [[ -z "${extra_prompt}" && -z "${extra_prompt_file}" ]]; then
    return
  fi

  {
    printf '\nAdditional Instructions\n'
    printf 'These instructions were supplied to this loop run. Apply them with the base prompt; if they conflict, prefer the instruction that gets the canvas replacement done with less process overhead.\n\n'
    if [[ -n "${extra_prompt}" ]]; then
      printf '%s\n' "${extra_prompt}"
    fi
    if [[ -n "${extra_prompt_file}" ]]; then
      if [[ -n "${extra_prompt}" ]]; then
        printf '\n'
      fi
      cat "${extra_prompt_file}"
      printf '\n'
    fi
  } >> "${prompt_path}"
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
    --root-dir)
      require_value "$1" "${2:-}"
      root_dir="$(resolve_path_without_creating "$2")"
      shift 2
      ;;
    --output-dir)
      require_value "$1" "${2:-}"
      output_dir="$(resolve_path_without_creating "$2")"
      shift 2
      ;;
    --state-dir)
      require_value "$1" "${2:-}"
      state_dir="$(resolve_path_without_creating "$2")"
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
    --keep-dev-running)
      kill_dev_after_iteration="0"
      shift
      ;;
    --extra-prompt)
      require_value "$1" "${2:-}"
      extra_prompt="$2"
      shift 2
      ;;
    --extra-prompt-file)
      require_value "$1" "${2:-}"
      extra_prompt_file="$(resolve_path_without_creating "$2")"
      shift 2
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
if [[ ! "${retry_sleep_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--retry-sleep-seconds must be a non-negative integer" >&2
  exit 1
fi
if [[ ! "${progress_log_interval_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--progress-log-interval-seconds must be a non-negative integer" >&2
  exit 1
fi
if [[ ! -d "${root_dir}" ]]; then
  echo "Root directory not found: ${root_dir}" >&2
  exit 1
fi
if [[ ! -f "${root_dir}/${plan_relpath}" ]]; then
  echo "Plan file not found: ${root_dir}/${plan_relpath}" >&2
  exit 1
fi
if [[ -n "${extra_prompt_file}" && ! -f "${extra_prompt_file}" ]]; then
  echo "Extra prompt file not found: ${extra_prompt_file}" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-${loop_name}.${timestamp}.XXXXXX")"
else
  mkdir -p "${output_dir}"
fi
if [[ -z "${state_dir}" ]]; then
  state_dir="${output_dir}/state"
else
  mkdir -p "${state_dir}"
fi
mkdir -p "${output_dir}" "${state_dir}"

plan_file="${root_dir}/${plan_relpath}"
checklist_file="${state_dir}/checklist.md"
audit_file="${state_dir}/canvas-replace-xyflow-audit.md"
prompt_file="${state_dir}/prompt.md"
completion_check_script="${state_dir}/check-complete.sh"
post_iteration_script="${state_dir}/post-iteration.sh"
status_file="${output_dir}/current-status.txt"
launch_log_file="${output_dir}/loop-launch.log"

if [[ ! -f "${audit_file}" ]]; then
  cat > "${audit_file}" <<'EOF'
# Canvas Replace Xyflow Audit

Keep this file compact. Rewrite stale notes instead of appending a diary.

## Current phase

## Current target

## What changed recently

## Verification

## Known broken or intentionally deferred behavior

## Next useful step
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# Canvas Replace Xyflow Checklist

Keep this checklist useful, not ceremonial. Mark items complete when they are
implemented and have at least focused verification or a recorded reason why
verification is currently blocked by the experimental browser/runtime.

## Setup
- [ ] Audit ${plan_file} and current graph renderer shape.
- [ ] Establish or update baseline notes under perf/ when practical.

## CanvasFlow
- [ ] Add CanvasFlow skeleton and HTML-in-Canvas support assertion.
- [ ] Replace the active project graph entry point with CanvasFlow.
- [ ] Draw real SectionContainer nodes through drawElementImage().
- [ ] Implement ref-first pan/zoom without React node rerenders.
- [ ] Render core edges on canvas.
- [ ] Rebuild node dragging and selection against canvas/world coordinates.
- [ ] Add visible-node culling and overscan.
- [ ] Validate heavy node contents, portals, CodeMirror, terminals, and menus.
- [ ] Remove old active xyflow viewport/SVG renderer assumptions.

## Verification
- [ ] Add focused unit/component tests for new pure canvasflow helpers.
- [ ] Run browser/CDP checks with CanvasDrawElement enabled.
- [ ] Record before/after performance notes under perf/.

## Completion
- [ ] Fresh audit finds no remaining actionable work in ${plan_file}.
- [ ] Final response emits ${stop_sentinel}.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside a resilient automated Codex loop for this repository.

Mission:
Execute ${plan_file} to completion. The priority is to get the HTML-in-Canvas
CanvasFlow replacement working with extremely high performance pan/zoom without
rewriting all existing node bodies.

Read first, in this order:
- ${root_dir}/AGENTS.md
- ${plan_file}
- ${root_dir}/docs/notes/chatgpt-html-in-canvas-notes.md if it exists
- ${root_dir}/docs/guides/browser-mcp-quickstart.md
- ${root_dir}/docs/guides/verification-checklist.md
- \`git status --short\`
- \`git log --oneline --decorate -n 20\`
- ${checklist_file}
- ${audit_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Operating posture:
- There are no users. This branch does not need backward compatibility, legacy support, migrations, transitional adapters, dual paths, old-field aliases, or fallback renderers.
- Prefer direct hard replacement work over compatibility layers.
- Do not preserve xyflow architecture for its own sake.
- If the worktree is dirty from a prior loop iteration, inspect it and continue from that state. Do not reset useful progress just because it is not committed yet.
- Make meaningful progress each iteration. One cohesive implementation slice is enough.
- Commit coherent stable chunks when useful. Use commit messages starting with \`${commit_prefix}\`.
- If a broad quality check fails for unrelated existing issues, experimental browser setup, or a temporary in-progress state, record that in ${audit_file} and keep moving. Do not let unrelated noise stop the loop.
- Keep ${checklist_file} and ${audit_file} current enough that a fresh Codex session can continue without guessing.
- Do not ask for follow-up.

Verification posture:
- Run focused tests/checks for code you touch.
- Run broader cleanup/quality checks at useful milestones and before large commits when feasible, but this loop is explicitly scoped to prioritize implementation momentum over process-perfect gates.
- UI/runtime/browser/performance verification may start the repo-root dev/CDP helper with \`./ai.sh\`; use \`./aireset.sh\` only when clean app state is actually needed. Do not use pnpm ai/aireset wrappers.
- For HTML-in-Canvas verification, use a Chromium build that exposes the API and pass the experimental flag when needed, for example:
  \`CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh\`
  or set \`CHROME_BIN\` to Chrome Canary/compatible Chromium plus that \`CHROME_EXTRA_ARGS\`.
- If you start \`./ai.sh\` or \`./aireset.sh\`, stop it before finishing the iteration unless you have a concrete reason to leave it running. \`./kill.sh\` is the repo-scoped fallback.
- If browser verification is blocked by missing local Chrome/flag support, record the blocker and continue with code/test work that does not require the browser.

Implementation rules:
- Keep existing React section/node bodies wherever possible.
- Pan/zoom must be canvas/ref-owned and must not rerender every node per frame.
- Favor simple explicit code over abstraction.
- Add tests around pure viewport, culling, geometry, and edge helpers as they appear.
- Generated files should not be hand-edited.

Completion rule:
If a fresh audit shows ${plan_file} is complete, leave a useful final summary
and end your final response with this exact line:
${stop_sentinel}
EOF
append_extra_prompt_section "${prompt_file}"

cat > "${completion_check_script}" <<EOF
#!/usr/bin/env bash
set -uo pipefail

root_dir=$(printf '%q' "${root_dir}")
output_dir=$(printf '%q' "${output_dir}")
sentinel=$(printf '%q' "${stop_sentinel}")
status_file=$(printf '%q' "${status_file}")
kill_dev_after_iteration=$(printf '%q' "${kill_dev_after_iteration}")
latest=""

if [[ "\${kill_dev_after_iteration}" == "1" ]] && [[ -x "\${root_dir}/kill.sh" ]]; then
  "\${root_dir}/kill.sh" >/dev/null 2>&1 || true
fi

latest="\$(find "\${output_dir}" -path '*/last-message.txt' -type f -print 2>/dev/null | sort | tail -n 1 || true)"
if [[ -n "\${latest}" ]] && grep -Fxq "\${sentinel}" "\${latest}"; then
  printf 'complete: sentinel observed in %s\n' "\${latest}" > "\${status_file}"
  echo "Completion sentinel observed in \${latest}."
  exit ${complete_exit_code}
fi

printf 'running: %s\n' "\$(date '+%Y-%m-%d %H:%M:%S')" > "\${status_file}"
exit 0
EOF
chmod +x "${completion_check_script}"

cat > "${post_iteration_script}" <<EOF
#!/usr/bin/env bash
set -uo pipefail

root_dir=$(printf '%q' "${root_dir}")
status_file=$(printf '%q' "${status_file}")
kill_dev_after_iteration=$(printf '%q' "${kill_dev_after_iteration}")

{
  printf 'last-post-iteration: %s\n' "\$(date '+%Y-%m-%d %H:%M:%S')"
  printf 'branch: '
  git -C "\${root_dir}" branch --show-current || true
  printf 'head: '
  git -C "\${root_dir}" rev-parse --short HEAD || true
  printf 'status-lines: '
  git -C "\${root_dir}" status --short | wc -l | tr -d ' '
  printf '\n'
} >> "\${status_file}" 2>/dev/null || true

if [[ "\${kill_dev_after_iteration}" == "1" ]] && [[ -x "\${root_dir}/kill.sh" ]]; then
  "\${root_dir}/kill.sh" >/dev/null 2>&1 || true
fi

exit 0
EOF
chmod +x "${post_iteration_script}"

combined_codex_extra_args=("${default_codex_extra_args[@]}")
if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
  combined_codex_extra_args+=("${codex_extra_args[@]}")
fi

loop_args=(
  "${SCRIPT_DIR}/run-codex-loop.sh"
  --prompt-file "${prompt_file}"
  --followup-prompt-file "${prompt_file}"
  --iterations "${iterations}"
  --new-session-every "1"
  --output-dir "${output_dir}"
  --workdir "${root_dir}"
  --quiet
  --progress-log-interval-seconds "${progress_log_interval_seconds}"
  --inactivity-timeout-seconds "${inactivity_timeout_seconds}"
  --watchdog-interval-seconds "30"
  --continue-on-inactivity-timeout
  --continue-on-codex-failure
  --retry-sleep-seconds "${retry_sleep_seconds}"
  --pre-iteration-command "$(shell_join "${completion_check_script}")"
  --post-iteration-command "$(shell_join "${post_iteration_script}")"
  --stop-on-pre-iteration-exit-code "${complete_exit_code}"
)

if [[ -n "${model}" ]]; then
  loop_args+=(--model "${model}")
fi
if [[ "${yolo_mode}" == "1" ]]; then
  loop_args+=(--yolo)
fi
if [[ ${#combined_codex_extra_args[@]} -gt 0 ]]; then
  loop_args+=(-- "${combined_codex_extra_args[@]}")
fi

{
  printf '[%s] Plan: %s\n' "$(timestamp_now)" "${plan_file}"
  printf '[%s] Prompt: %s\n' "$(timestamp_now)" "${prompt_file}"
  printf '[%s] Checklist: %s\n' "$(timestamp_now)" "${checklist_file}"
  printf '[%s] Audit: %s\n' "$(timestamp_now)" "${audit_file}"
  printf '[%s] Output directory: %s\n' "$(timestamp_now)" "${output_dir}"
  printf '[%s] State directory: %s\n' "$(timestamp_now)" "${state_dir}"
  printf '[%s] Completion sentinel: %s\n' "$(timestamp_now)" "${stop_sentinel}"
  printf '[%s] Model: %s\n' "$(timestamp_now)" "${model}"
  printf '[%s] Reasoning effort: xhigh\n' "$(timestamp_now)"
  printf '[%s] Resilience: continue on Codex failure and inactivity timeout\n' "$(timestamp_now)"
  if [[ "${kill_dev_after_iteration}" == "1" ]]; then
    printf '[%s] Dev cleanup: ./kill.sh after each successful iteration\n' "$(timestamp_now)"
  else
    printf '[%s] Dev cleanup: disabled by --keep-dev-running\n' "$(timestamp_now)"
  fi
} | tee "${launch_log_file}"

exec "${loop_args[@]}"
