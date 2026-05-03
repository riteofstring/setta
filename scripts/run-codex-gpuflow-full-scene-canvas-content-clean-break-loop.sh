#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-gpuflow-full-scene-canvas-content-clean-break-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/gpuflow-full-scene-canvas-content-clean-break-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/gpuflow-full-scene-canvas-content-clean-break-plan.md
- Completion sentinel: GPUFLOW_FULL_SCENE_CANVAS_CONTENT_CLEAN_BREAK_PLAN_COMPLETE
- Loop name: gpuflow-full-scene-canvas-content-clean-break
- Commit prefix: gpuflow-full-scene:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-gpuflow-full-scene-canvas-content-clean-break-loop.sh
  ./scripts/run-codex-gpuflow-full-scene-canvas-content-clean-break-loop.sh --output-dir /tmp/gpuflow-full-scene-loop --iterations 120
  ./scripts/run-codex-gpuflow-full-scene-canvas-content-clean-break-loop.sh -- --config reasoning_effort=\"xhigh\"
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

reject_owned_options() {
  local arg=""

  for arg in "$@"; do
    if [[ "${arg}" == "--" ]]; then
      break
    fi
    case "${arg}" in
      --plan|--plan=*|--sentinel|--sentinel=*|--name|--name=*|--commit-prefix|--commit-prefix=*)
        echo "This dedicated wrapper owns ${arg%%=*}; use scripts/run-codex-plan-loop.sh directly to override it." >&2
        exit 1
        ;;
    esac
  done
}

reject_owned_options "$@"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-gpuflow-full-scene-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated GpuFlow Full Scene And Canvas Content Clean-Break Loop Instructions

Use the full-scene/canvas-content plan as the active execution scope. The older
GpuFlow scene-ownership architecture plan is useful background, but its
exclusions for nested section layout and section content rendering are not
active constraints for this loop.

Loop-specific guardrails:
- This is a clean break. Do not preserve old owners just to keep old and new
  paths working at the same time.
- Committed loop steps should be coherent owner moves or tightly related fixes
  with relevant verification complete.
- Start with the earliest incomplete implementation slice in the plan unless a
  required visual-fidelity blocker must be resolved first. Prefer vertical
  slices that establish one new owner and delete or sharply narrow the previous
  owner.
- Keep `frontend/src/gpuFlow/*` generic. Setta policy, persistence, and missing
  section/param contract surfaces belong in project adapters or Go-owned
  generation paths.
- Treat the plan's canvas-first param control boundary as an active guardrail.
  Do not spend iterations broadening generic retained-param DOM island,
  viewport-portal, or activation-replay parity for dropdowns, configured color
  pickers, date calendars, switches, sliders, rotary controls, validation/status
  bubbles, or simple command controls. Move those to retained canvas descriptors
  and interaction handlers, and narrow DOM islands to true native
  editor/picker/file/accessibility cases.
- Treat the visual-fidelity checkpoint as active implementation work, not as a
  manual pre-loop gate. Required command:
  `node scripts/gpuflow-visual-fidelity-checkpoint.mjs`
- The checkpoint compares the current checkout against the primary baseline:
  `37bdaa5efed8fb8d86425ecfa43fc85f61d0d08d` from
  `go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan`. The candidate is
  the current checkout. Do not maintain a separate `gpuflow-candidate` worktree
  for checkpoint decisions.
- The checkpoint script owns baseline worktree preparation under
  `../setta-visual-fidelity-worktrees/` by default. If a baseline worktree is
  missing it should be created by the script; if it is dirty, treat that as a
  real blocker rather than overwriting it. Use
  `node scripts/gpuflow-visual-fidelity-checkpoint.mjs --prepare-only` when you
  need to validate this setup without launching the app or capturing screenshots.
- Treat the real Settings project `All Settings` fixtures as first-priority
  visual blockers. The full Settings pane and every `settings-all-settings-*`
  section fixture must match the primary baseline, including typography, row
  spacing, label/control geometry, dropdowns, color pickers, switches, sliders,
  text-input bounds/shells, and section chrome. Inactive CodeMirror-like text
  previews are renderer-aware canvas previews: do not attempt to pixel-match
  CodeMirror token spans or syntax colors until the control is activated and
  the real DOM editor is mounted.
- Synthetic param-control fixtures are still required, but they are not enough
  to declare parity. When a visible renderer/control change needs broader
  coverage, expand `scripts/gpuflow-visual-fidelity-checkpoint.mjs` instead of
  adding one-off screenshots. Use `controlSections`, `createFixtureSections`,
  and `captureViewportFixtures` for synthetic states; use
  `captureSettingsAllSettingsRun` for real Settings coverage.
- For each visual blocker, inspect the baseline/candidate/diff images, decide
  whether it is fixture instability or real rendering drift, fix the fixture or
  product code accordingly, rerun the checkpoint, and update
  `perf/visual-fidelity/2026-05-05-gpuflow-full-scene/review.md`.
- Do not loosen checkpoint thresholds, delete fixtures, add broad screenshot
  masks, or mark a blocker as `accepted-difference` unless the diff has been
  inspected and the reason is documented in `review.md`. The only default
  renderer-aware mask is inactive CodeMirror preview glyph/token pixels; active
  CodeMirror DOM and surrounding text-field layout remain strict visual
  targets.
- Do not emit `GPUFLOW_FULL_SCENE_CANVAS_CONTENT_CLEAN_BREAK_PLAN_COMPLETE`
  while required checkpoint fixtures have unexplained `blocking-regression`,
  `capture-blocked`, or runtime page-error groups.
- Use `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` only
  as read-only reference material.
- For performance-relevant slices, baseline first and record before/after
  results in `perf/` as append-only reports.
- Do not call OpenAPI on pointer move.

Browser checks:
- Before browser verification, run `./kill.sh`; run it again before the final
  response.
- For html-in-canvas/WebGPU checks, prefer:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
- For the visual-fidelity checkpoint, use:
  `node scripts/gpuflow-visual-fidelity-checkpoint.mjs`
  The script must resolve and use Chrome for Testing 149 for both `ai.sh` and
  Playwright capture. Do not use Playwright's bundled Chromium for checkpoint
  decisions.
- Use Chrome DevTools MCP for visible or performance-sensitive work. If CDP
  cannot run, record the blocker.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpuflow-full-scene-canvas-content-clean-break-plan.md" \
  --sentinel "GPUFLOW_FULL_SCENE_CANVAS_CONTENT_CLEAN_BREAK_PLAN_COMPLETE" \
  --name "gpuflow-full-scene-canvas-content-clean-break" \
  --commit-prefix "gpuflow-full-scene:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
