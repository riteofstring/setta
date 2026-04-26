#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-gpu-flow-pan-resize-move-dnd-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/gpu-flow-pan-resize-move-dnd-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/gpu-flow-pan-resize-move-dnd-plan.md
- Completion sentinel: GPU_FLOW_PAN_RESIZE_MOVE_DND_PLAN_COMPLETE
- Loop name: gpu-flow-pan-resize-move-dnd
- Commit prefix: gpu-flow-ux:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-gpu-flow-pan-resize-move-dnd-loop.sh
  ./scripts/run-codex-gpu-flow-pan-resize-move-dnd-loop.sh --output-dir /tmp/gpu-flow-ux-loop
  ./scripts/run-codex-gpu-flow-pan-resize-move-dnd-loop.sh -- --config reasoning_effort=\"high\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-gpu-flow-ux-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated GPU Flow Pan/Resize/Move/DnD Loop Instructions

This loop is specifically for docs/plans/gpu-flow-pan-resize-move-dnd-plan.md.

Primary target:
- Execute the plan to bring the WebGPU/html-in-canvas canvas close to the old xyflow UX from the go-rewrite branch.
- Keep the WebGPU/html-in-canvas architecture intact: GPU owns high-frequency visuals, real DOM owns active interaction, and texture uploads happen only on dirty/settle points.
- Do not reintroduce xyflow, d3-zoom, dual renderers, compatibility shims, legacy adapters, polyfills, or silent fallbacks.

Required starting point:
- Read docs/plans/gpu-flow-pan-resize-move-dnd-plan.md before making changes.
- Also read docs/plans/webgpu-html-texture-pan-zoom-plan.md and docs/plans/gpu-flow-live-active-node-dom-plan.md so implementation remains aligned with the renderer and active DOM teleport architecture.
- Read current GPU flow implementation before making changes, especially:
  - frontend/src/gpuFlow/GpuFlow.tsx
  - frontend/src/gpuFlow/GpuSurface.tsx
  - frontend/src/gpuFlow/GpuNodeLayer.tsx
  - frontend/src/gpuFlow/GpuActiveNodeTeleport.ts
  - frontend/src/gpuFlow/interactions/panZoom.ts
  - frontend/src/gpuFlow/interactions/nodeDrag.ts
  - frontend/src/gpuFlow/interactions/selection.ts
  - frontend/src/gpuFlow/interactions/edges.ts
  - frontend/src/gpuFlow/viewportActions.ts
  - frontend/src/gpuFlow/viewportMath.ts
  - frontend/src/gpuFlow/viewportStore.ts
  - frontend/src/gpuFlow/gpuPipelines.ts
  - frontend/src/gpuFlow/Handle/
  - frontend/src/gpuFlow/edges/
  - frontend/src/components/Pages/Project/GpuProjectSurface.tsx
  - frontend/src/components/Utils/Resizable/CustomResizable.tsx
  - frontend/src/forks/dnd-kit/

Use go-rewrite as read-only reference:
- Use git show go-rewrite:<path> for old xyflow behavior. Do not copy xyflow back into runtime code.
- Key references include:
  - frontend/src/forks/xyflow/core/container/ZoomPane.tsx
  - frontend/src/forks/xyflow/core/hooks/useDrag.ts
  - frontend/src/forks/xyflow/core/components/wrapNode.tsx
  - frontend/src/forks/xyflow/core/container/Pane.tsx
  - frontend/src/forks/xyflow/core/components/UserSelection.tsx
  - frontend/src/forks/xyflow/core/components/NodesSelection.tsx
  - frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts
  - frontend/src/forks/xyflow/minimap/MiniMap.tsx
  - frontend/src/forks/xyflow/background/Background.tsx
  - frontend/src/forks/xyflow/background/Patterns.tsx
  - frontend/src/forks/xyflow/core/components/ConnectionLine.tsx
  - frontend/src/forks/xyflow/core/components/Handle/
  - frontend/src/forks/xyflow/core/components/Edges/
  - frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx
  - frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx
  - frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx

Use html-in-canvas examples as architecture references:
- Inspect the relevant files under /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos when touching related behavior.
- Most relevant examples:
  - html-in-canvas-official/README.md
  - html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts
  - html-in-canvas-official/Examples/webgpu-jelly-slider/src/events.ts
  - html-in-canvas-cracks/src/main.js
  - compiz-web/src/transitions/TransitionEngine.ts
  - three-html-render/src/htmlTexture.ts
  - three-html-render/src/interactionManager.ts
  - three-html-render/src/raycastInteractionManager.ts
  - html-in-canvas/plugins/html-cloth.mjs
  - html-in-canvas-room/extension/entrypoints/content.ts
  - hot-tips/html-in-canvas/demos/wicg/ripple-buttons.html
  - hot-tips/html-in-canvas/demos/wicg/text-input.html

Implementation priorities:
- Phase 1: Optional scroll panning. Ensure panOnScroll wins over plain zoomOnScroll, while pinch zoom and explicit zoom activation still zoom.
- Phase 2: Direct node movement. Normal-mode top-level node dragging, multi-selection movement, snap-to-grid on stop, auto-pan, z-index, and final persistence must work.
- Phase 3: Node resizability. Use CustomResizable as the owner, keep resize zoom-aware, use active DOM teleport for live feedback, and do not add a parallel resize system.
- Phase 4: dnd-kit parity. dnd-kit owns sortable and moving-free structural drag/drop; direct GPU node drag and viewport gestures must not race it.
- Phase 5: Edge parity. Restore edge rendering, handle hit testing/alignment, live connection preview, valid/invalid drops, cancel, selection, context menus, and coordinate updates.
- Phase 6: Viewport, pane, and selection parity. Restore viewport helpers, animated viewport behavior, minimap navigation, pane background behavior, file drops, marquee selection, selection-box movement, and keyboard nudging.
- Phase 7: Full section and param UI compatibility. Verify every generated section type and param UI/input family displays and remains interactive.
- Phase 8: Background grid settings parity. Support off/on, dots/lines, custom colors, pattern size, spacing, and viewport anchoring. Do not spend time on the cross variant.
- Phase 9: Browser verification.

Architecture guardrails:
- GPU pan/zoom/move must not recapture node textures merely because the viewport or node position changed.
- Active DOM teleport should use the same React-owned DOM instance. Do not render duplicate active node trees unless a documented component-owner issue proves it is required.
- During active resize/control/editing/dnd interactions, prefer real DOM for user feedback and one final texture upload after settle.
- Keep event ownership explicit. Use typed state, existing data attributes, and owner-owned metadata; do not add broad keyword or visible-text heuristics.
- Generated files under backend/setta/types/generated, frontend/generation, and frontend/src/openapi/*/generated must not be edited manually.
- Keep Go-owned/backend contracts authoritative. For frontend work, reuse generated/OpenAPI surfaces instead of handwritten mirrors.

Testing expectations:
- Add or extend focused tests with each implementation slice. Prefer existing test owners:
  - frontend/src/gpuFlow/interactions/panZoom.test.ts
  - frontend/src/gpuFlow/interactions/nodeDrag.test.ts
  - frontend/src/gpuFlow/interactions/selection.test.ts
  - frontend/src/gpuFlow/interactions/edges.test.ts
  - frontend/src/gpuFlow/viewportActions.test.ts
  - frontend/src/gpuFlow/viewportMath.test.ts
  - frontend/src/gpuFlow/gpuPipelines.test.ts
  - frontend/src/gpuFlow/edges/*.test.ts
  - frontend/src/gpuFlow/Handle/*.test.ts
  - frontend/src/components/Pages/Project/GpuProjectSurface tests if needed
  - frontend/src/components/Utils/Resizable/CustomResizable tests if needed
  - frontend/src/forks/dnd-kit/*.test.ts and integration tests when dnd behavior changes
- Do not add tautological tests or generator drift tests.
- Run focused Vitest suites during iterations. Finish with ./check_quality.sh unless a concrete environment blocker is recorded.

Browser verification:
- Use Chrome DevTools MCP for UI verification when relevant.
- Verify all scenarios listed in the plan's Browser Verification phase, including scroll pan, node move, resize, dnd-kit sort/free-move, edge connection, animated viewport helpers, pane behavior, selection parity, section/param compatibility, and grid settings.
- Use a Chromium build with WebGPU and html-in-canvas enabled. If required locally, start with ./aireset.sh:
  CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./aireset.sh
- If local browser APIs are blocked, record the blocker in perf/reports/frontend/ and keep moving on testable owner code.
- Record performance or visual evidence in perf/reports/frontend/ when the plan calls for it, especially for pan/zoom, live DOM teleport, resize, and dnd.

Completion:
- Emit GPU_FLOW_PAN_RESIZE_MOVE_DND_PLAN_COMPLETE only when docs/plans/gpu-flow-pan-resize-move-dnd-plan.md is complete, the old xyflow parity audit finds no remaining actionable work in scope, focused tests and ./check_quality.sh have passed or blockers are documented, and CDP visual verification is recorded.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpu-flow-pan-resize-move-dnd-plan.md" \
  --sentinel "GPU_FLOW_PAN_RESIZE_MOVE_DND_PLAN_COMPLETE" \
  --name "gpu-flow-pan-resize-move-dnd" \
  --commit-prefix "gpu-flow-ux:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
