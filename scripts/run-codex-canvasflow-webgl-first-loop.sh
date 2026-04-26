#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-canvasflow-webgl-first-loop.sh [options] [-- <extra codex exec args>]

Run a resilient Codex loop for the CanvasFlow WebGL-first renderer plan.

Defaults:
- Plan: docs/plans/canvasflow-webgl-first-execution-plan.md
- Completion sentinel: CANVASFLOW_WEBGL_FIRST_PLAN_COMPLETE
- Maximum iterations: 1000; the loop is expected to stop earlier on the
  completion sentinel or manual interruption
- Model: gpt-5.5
- Reasoning effort: xhigh
- Yolo mode: on
- Quiet terminal output with periodic progress logs
- Continue after Codex failures and inactivity timeouts
- Each successful Codex session is instructed to commit its work and stop
  long-running scripts before responding

Options:
  --plan PATH            Plan file path relative to the repository root.
                         Default: docs/plans/canvasflow-webgl-first-execution-plan.md
  --sentinel TEXT        Exact completion sentinel expected from Codex.
                         Default: CANVASFLOW_WEBGL_FIRST_PLAN_COMPLETE
  --name NAME            Short loop name used for artifact paths.
                         Default: canvasflow-webgl-first
  --commit-prefix TEXT   Commit prefix Codex should use for commits it makes.
                         Default: canvasflow-webgl:
  --iterations N         Iteration budget passed to run-codex-loop.
                         Default: 1000
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
  ./scripts/run-codex-canvasflow-webgl-first-loop.sh
  ./scripts/run-codex-canvasflow-webgl-first-loop.sh --output-dir /tmp/webgl-loop
  ./scripts/run-codex-canvasflow-webgl-first-loop.sh -- --config reasoning_effort=\"high\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

plan_relpath="docs/plans/canvasflow-webgl-first-execution-plan.md"
stop_sentinel="CANVASFLOW_WEBGL_FIRST_PLAN_COMPLETE"
loop_name="canvasflow-webgl-first"
commit_prefix="canvasflow-webgl:"
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
    printf 'These instructions were supplied to this loop run. Apply them with the base prompt; if they conflict, prefer the instruction that gets the WebGL-first renderer done with less process overhead.\n\n'
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
audit_file="${state_dir}/canvasflow-webgl-first-audit.md"
prompt_file="${state_dir}/prompt.md"
completion_check_script="${state_dir}/check-complete.sh"
post_iteration_script="${state_dir}/post-iteration.sh"
status_file="${output_dir}/current-status.txt"
launch_log_file="${output_dir}/loop-launch.log"

if [[ ! -f "${audit_file}" ]]; then
  cat > "${audit_file}" <<'EOF'
# CanvasFlow WebGL-First Audit

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
# CanvasFlow WebGL-First Checklist

Keep this checklist useful, not ceremonial. Mark items complete when they are
implemented and have at least focused verification or a recorded reason why
verification is currently blocked by the experimental browser/runtime.

## Setup
- [ ] Audit ${plan_file}, the corrected WebGL texture probe, and current CanvasFlow renderer shape.
- [ ] Establish or update baseline notes under perf/ when practical.

## Renderer Boundary
- [ ] Add a CanvasFlow renderer interface.
- [ ] Move the current 2D paint path behind a 2D renderer module with no behavior change.
- [ ] Select renderer mode before any context API is called.
- [ ] Keep the current 2D renderer as default while WebGL remains opt-in.
- [ ] Split texture-paint scheduling from viewport rAF scheduling.

## WebGL Skeleton
- [ ] Add an opt-in WebGL renderer mode named webgl-texture-nodes.
- [ ] Assert texElementImage2D support and avoid getContext("2d") in WebGL mode.
- [ ] Draw background and grid in WebGL.
- [ ] Draw placeholder node quads through WebGL.
- [ ] Compute and assign DOM transforms directly for hit testing.
- [ ] Verify nonblank and aligned output with CDP at multiple zoom levels.

## HTML Texture Cache
- [ ] Add deterministic texture entry creation and destruction.
- [ ] Upload dirty visible node wrappers with texElementImage2D during paint/upload scheduling.
- [ ] Preserve a frame boundary before WebGL consumes uploaded textures.
- [ ] Avoid texture uploads during viewport-only pan/zoom after warm-up.
- [ ] Track upload counts, upload time, cache hits/misses, evictions, and estimated texture memory.
- [ ] Handle mount, unmount, resize, PaintEvent changedElements, theme/style, focus/editing state, and context loss invalidation.

## Edges And Feature Parity
- [ ] Draw existing edge families in WebGL mode.
- [ ] Draw connection preview in WebGL mode.
- [ ] Preserve z order between edges, nodes, and selection affordances.
- [ ] Keep edge hit testing, reconnect, selection, and dragging working.

## Interaction Verification
- [ ] Verify real Settings All Settings nodes, not synthetic empty nodes.
- [ ] Verify buttons, text inputs, checkboxes/toggles, comboboxes/popovers/tooltips, node body scroll, drag, box select, edge create/reconnect, and keyboard focus.
- [ ] Add focused E2E coverage for representative interactions in WebGL mode.
- [ ] Assert diagnostics show texture reuse during viewport-only gestures.

## Performance
- [ ] Extend the CanvasFlow perf harness to compare 2d, webgl-texture-nodes, and rect-nodes.
- [ ] Record before/after reports under perf/reports/frontend/.
- [ ] Validate screenshots or pixel checks and meaningful source text counts.
- [ ] Confirm zoomed-out pan/zoom materially improves over 2D and moves toward the rect-nodes ceiling without visual degradation.
- [ ] Confirm texture memory remains bounded.

## Promotion
- [ ] Fresh audit finds no remaining actionable work in ${plan_file}.
- [ ] Final response emits ${stop_sentinel}.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside a resilient automated Codex loop for this repository.

Mission:
Execute ${plan_file} to completion. Build the CanvasFlow WebGL-first renderer
so zoomed-out pan/zoom moves cached HTML node textures through WebGL instead of
redrawing rich DOM with drawElementImage on every viewport frame.

Read first, in this order:
- ${root_dir}/AGENTS.md
- ${plan_file}
- ${root_dir}/docs/plans/html-in-canvas-webgl-texture-canvasflow-plan.md
- ${root_dir}/perf/reports/frontend/2026-04-28_html-in-canvas-webgl-texture-probe.md
- ${root_dir}/docs/notes/chatgpt-html-in-canvas-example-projects.md if it exists
- ${root_dir}/docs/guides/browser-mcp-quickstart.md
- ${root_dir}/docs/guides/verification-checklist.md
- \`git status --short\`
- \`git log --oneline --decorate -n 20\`
- ${checklist_file}
- ${audit_file}
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Operating posture:
- There are no users waiting for phase checkpoints. Continue through the plan without pausing for manual approval.
- Make meaningful progress each iteration. One cohesive implementation slice is enough, but do not stop at planning.
- If the worktree is dirty from a prior loop iteration, inspect it and continue from that state. Do not reset useful progress just because it is not committed yet.
- Keep the existing 2D renderer as the default until WebGL mode has evidence from interaction and performance verification.
- Do not create compatibility shims, legacy aliases, or transitional adapters unless the plan specifically requires them.
- Do not hide node contents, replace rich nodes with fake rectangles, or reduce visual fidelity as the performance fix.
- Preserve the HTML-in-Canvas scheduling rule from the probe: direct upload before a cached paint record fails, upload/capture belongs at the paint boundary, and WebGL consumption must happen on a later rAF/render-loop turn.
- Before your final response in every iteration, stop any long-running scripts/processes you started, including dev servers, \`./ai.sh\`, \`./aireset.sh\`, Playwright watch-like processes, profiling runs, or browser/CDP helpers. Use \`./kill.sh\` as the repo-scoped fallback when appropriate.
- Before your final response in every iteration, if you changed repository files, stage and commit the work. Use commit messages starting with \`${commit_prefix}\`.
- If a broad quality check fails for unrelated existing issues, experimental browser setup, or a temporary in-progress state, record that in ${audit_file} and keep moving. Do not let unrelated noise stop the loop.
- Keep ${checklist_file} and ${audit_file} current enough that a fresh Codex session can continue without guessing.
- Do not ask for follow-up.

Implementation rules:
- Select the renderer before any canvas context API is called.
- WebGL mode must never call getContext("2d") on the layoutsubtree canvas.
- Keep React/DOM node wrappers as direct children of <canvas layoutsubtree>.
- Separate texture-paint scheduling from viewport rAF scheduling.
- Viewport-only pan/zoom should not call canvas.requestPaint() after the WebGL renderer is warmed up and should not upload node textures.
- Upload dirty visible node wrappers with texElementImage2D only at the HTML paint/capture boundary.
- Draw background, grid, edges, connection preview, node textures, and canvas-owned affordances in WebGL mode.
- Compute source DOM transforms directly and assign them only when they change.
- Keep real Settings All Settings node contents interactive and aligned.
- Add tests around pure renderer, cache, geometry, invalidation, and diagnostics helpers as they appear.
- Generated files should not be hand-edited.

Verification posture:
- Run focused tests/checks for code you touch.
- Run broader cleanup/quality checks at useful milestones and before large commits when feasible, but this loop is explicitly scoped to prioritize implementation momentum over process-perfect gates.
- For browser verification, use Chrome/Chromium with \`--enable-blink-features=CanvasDrawElement\`.
- UI/runtime/browser/performance verification may start the repo-root dev/CDP helper with \`./ai.sh\`; use \`./aireset.sh\` only when clean app state is actually needed. Do not use pnpm ai/aireset wrappers.
- If you start \`./ai.sh\` or \`./aireset.sh\`, stop it before finishing the iteration unless you have a concrete reason to leave it running. \`./kill.sh\` is the repo-scoped fallback.
- If browser verification is blocked by missing local Chrome/flag support, record the blocker and continue with code/test work that does not require the browser.
- For performance-relevant changes, baseline first when practical, re-measure after, and record append-only reports under \`perf/reports/frontend/\`.
- Final responses for UI work must include \`CDP visual check: done (...)\` or \`CDP visual check: not run (reason)\`.

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
  printf '[%s] Iterations: %s\n' "$(timestamp_now)" "${iterations}"
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
