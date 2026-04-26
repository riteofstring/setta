#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-gpu-flow-live-active-node-dom-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/gpu-flow-live-active-node-dom-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/gpu-flow-live-active-node-dom-plan.md
- Completion sentinel: GPU_FLOW_LIVE_ACTIVE_NODE_DOM_PLAN_COMPLETE
- Loop name: gpu-flow-live-active-node-dom
- Commit prefix: gpu-live-dom:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-gpu-flow-live-active-node-dom-loop.sh
  ./scripts/run-codex-gpu-flow-live-active-node-dom-loop.sh --output-dir /tmp/gpu-live-dom-loop
  ./scripts/run-codex-gpu-flow-live-active-node-dom-loop.sh -- --config reasoning_effort=\"high\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-gpu-live-dom-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated GPU Flow Live Active Node DOM Loop Instructions

This loop is specifically for docs/plans/gpu-flow-live-active-node-dom-plan.md.

Primary target:
- Keep high-performance WebGPU pan and zoom on cached node textures.
- Restore native-feeling node controls by using real browser-rendered DOM for the single active node or active control.
- Stop relying on repeated full-node texture uploads for switches, sliders, text carets, CodeMirror, terminals, CSS transitions, and other live controls.
- Upload one final active-node texture snapshot after interaction settles, then return that node to the normal passive GPU texture path.

Required starting point:
- Read docs/plans/gpu-flow-live-active-node-dom-plan.md before making changes.
- Read the current gpuFlow implementation before making changes, especially GpuFlow, GpuSurface, GpuNodeLayer, GpuActiveNodeOverlay, nodeInteractionDirty, nodeTextures, and GpuProjectSurface.
- Read the plan's Relevant Example References section, then inspect the exact files under /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos before choosing a strategy:
  - html-in-canvas/plugins/html-cloth.mjs for one fixed source DOM texture, input wiring, slider bridging, UV-to-DOM event discipline, and one-shot paint/upload scheduling. Do not copy its every-frame texture refresh cadence as the Setta node architecture.
  - html-in-canvas-room/extension/entrypoints/content.ts for transform-aligned native interaction, especially applyScreenTransform(), dirty tracking, and uploadPageTexture().
  - three-html-render/src/interactionManager.ts for CSS matrix alignment of real DOM with a rendered surface.
  - three-html-render/src/raycastInteractionManager.ts for pointer/UV fallback handoff when a direct screen transform is not enough.
  - three-html-render/src/threeHTMLRenderer.ts and three-html-render/src/htmlTexture.ts for paint/upload sequencing, event isolation, and keeping the source element separate from the uploaded texture image.
  - html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts for the WebGPU copyElementImageToTexture API on a small purpose-built element.
  - hot-tips/html-in-canvas/demos/wicg/ripple-buttons.html for control-level drawElementImage() plus returned-transform behavior.
  - Treat html-in-canvas-cracks and compiz-web as secondary references only if the plan work needs more DOM-as-texture pipeline tradeoff context.

Phase discipline:
- Do Phase 1 first. Record baseline/probe results in perf/reports/frontend/ before broad implementation.
- Probe whether a <canvas layoutsubtree> child can be visually promoted above the WebGPU canvas with CSS alone.
- Probe whether GPUQueue.copyElementImageToTexture can capture an element outside the canvas layout subtree.
- Measure representative whole-node capture costs for small settings, large settings, CodeMirror, terminal, and chat nodes when those fixtures are locally available.
- Use the probe results to choose Strategy A or Strategy B from the plan. Do not guess.

Implementation priorities:
- Prefer Strategy A, promotion of the existing source DOM, only when probes prove it works. This avoids duplicate React trees and is best for CodeMirror, terminals, focus, and local state.
- If Strategy A does not work, implement Strategy B with a separate live active DOM layer outside the canvas while keeping the canvas-child node DOM as the texture source.
- The active DOM layer must receive real pointer and keyboard interaction. A cloned inert mirror is not sufficient.
- Handle first-click handoff: activation must happen before the user's first actionable control event is lost.
- Use stable target descriptors based on existing data attributes where possible; do not identify controls by visible text.
- While live DOM is active, suppress the matching GPU node quad once the live layer has mounted.
- During active interaction, do not upload the active node texture every frame. Keep passive uploads budgeted.
- On settle, mark the active node dirty, request one paint, upload the final texture snapshot, restore the GPU quad, then unmount or deactivate live DOM.
- Audit duplicate-mount safety before enabling a separate overlay for sections like params, switches, comboboxes, CodeMirror, terminals, chat, spreadsheet, browser/iframe, image, and media sections.

Non-goals and guardrails:
- Do not re-optimize the 240ms active-node texture-upload feedback loop as the final architecture.
- Do not add polyfills, legacy adapters, dual renderers, old XYFlow preservation paths, compatibility shims, or silent fallbacks.
- Do not add generator drift tests that only rerun generators or formatters.
- Do not manually edit generated OpenAPI/frontend artifacts.
- Keep frontend callers on standard generated OpenAPI clients for HTTP surfaces.

Verification:
- Add focused tests for the concrete lifecycle behavior being changed: active DOM positioning, GPU quad suppression, deferred active texture upload, final upload before unmount, target descriptor resolution, first-click handoff, slider drag, and text focus preservation.
- Use Chrome DevTools MCP for UI verification when relevant.
- Verify Settings -> All Settings at normal zoom and after zoom in/out.
- Verify switch transition duration, text input latency/caret behavior, slider drag smoothness, CodeMirror editing if available, and terminal input if available.
- Record before/after performance evidence in perf/reports/frontend/.
- Run the appropriate focused tests during iterations. Unless explicitly narrowed by the plan work, finish with ./check_quality.sh before declaring completion.

Browser setup:
- Use a Chromium build with WebGPU and html-in-canvas enabled. If required locally, start with:
  CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh
- If the local browser cannot expose the native APIs, record that blocker in perf/reports/frontend/ and keep moving on testable owner code.

Completion:
- Emit GPU_FLOW_LIVE_ACTIVE_NODE_DOM_PLAN_COMPLETE only when docs/plans/gpu-flow-live-active-node-dom-plan.md is complete, before/after performance reports are checked in, CDP visual verification is recorded, and a fresh audit finds no remaining actionable work.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpu-flow-live-active-node-dom-plan.md" \
  --sentinel "GPU_FLOW_LIVE_ACTIVE_NODE_DOM_PLAN_COMPLETE" \
  --name "gpu-flow-live-active-node-dom" \
  --commit-prefix "gpu-live-dom:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
