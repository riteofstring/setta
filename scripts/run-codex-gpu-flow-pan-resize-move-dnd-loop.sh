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

Scope and references:
- Keep work limited to the GPU flow html-in-canvas parity described in
  docs/plans/gpu-flow-pan-resize-move-dnd-plan.md.
- Use the plan's detailed file inventories, go-rewrite xyflow references, and html-in-canvas example
  repository references when choosing what to inspect for each phase.
- Also keep the prerequisite architecture from docs/plans/webgpu-html-texture-pan-zoom-plan.md and
  docs/plans/gpu-flow-live-active-node-dom-plan.md intact.
- The go-rewrite branch and /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos are
  read-only references for behavior and architecture. Do not copy xyflow back into runtime code.

Phase order:
1. Optional scroll panning.
2. Direct node movement.
3. Node resizability.
4. dnd-kit sortable and moving-free parity.
5. Edge parity.
6. Viewport, pane, and selection parity.
7. Full section and param UI compatibility.
8. Background grid settings parity.
9. Browser verification.

Work on the earliest incomplete phase unless a later change exposes an earlier blocker. The cross
background-grid variant is intentionally out of scope.

Architecture guardrails:
- Preserve the WebGPU/html-in-canvas model: GPU owns high-frequency visual transforms, real DOM owns
  active interaction, and texture uploads happen only on dirty or settled content changes.
- Pan, zoom, node movement, resize previews, and animated viewport changes must not recapture node
  textures merely because the viewport or a node position changed.
- Active node editing/resizing/control interaction should use the existing React-owned DOM instance
  via the active DOM teleport path, then upload the final texture after settle.
- Keep event ownership explicit across viewport gestures, node movement, resize handles, handles/edges,
  pane events, and dnd-kit. Use typed state and owner-owned metadata instead of keyword or visible-text
  heuristics.
- dnd-kit remains the owner for sortable and moving-free structural drag/drop. GPU direct node drag and
  viewport gestures must cooperate with it rather than racing it.
- Do not add xyflow, d3-zoom, dual renderers, compatibility shims, legacy adapters, broad fallbacks, or
  hand-maintained mirrors of generated/backend-owned contracts.

Verification:
- Add or extend focused owner tests for each implementation slice using the relevant test targets named
  in the plan rather than creating broad or tautological coverage.
- Use Chrome DevTools MCP for UI verification whenever behavior is visible or interactive. Cover the
  scenarios in the plan's Browser Verification phase, including scroll pan, movement, resize, dnd-kit
  modes, edges, animated viewport helpers, pane behavior, selection, section/param controls, and grid
  settings.
- Regularly check browser-visible work during the loop instead of saving all browser verification for
  Phase 9. After any slice that changes user-visible GPU flow interaction behavior, start or reuse the
  local app/browser session with `./ai.sh` and run a narrow Chrome DevTools MCP check for the changed
  flow before committing when practical.
- Use `./aireset.sh` instead of `./ai.sh` when a clean disposable app state is needed to make the
  browser check reliable. Prefer `./ai.sh` for non-reset checks so a focused iteration does not wipe
  state unnecessarily. If a session is already running, reuse it rather than starting a duplicate.
- For html-in-canvas/WebGPU-sensitive checks, start the session with:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
  or the same environment with `./aireset.sh` when a reset is required.
- Record each browser check in the iteration response as `CDP visual check: done (...)`, including
  which `ai.sh`/`aireset.sh` command was used and which interaction was exercised. If the check cannot
  run, record the concrete blocker instead of silently deferring it.
- Finish with ./check_quality.sh unless a concrete environment blocker is recorded. Record visual,
  performance, or browser-API blockers in the locations called out by the plan.

Completion:
- Emit GPU_FLOW_PAN_RESIZE_MOVE_DND_PLAN_COMPLETE only after the plan's success criteria are complete,
  a fresh xyflow-parity audit finds no remaining actionable in-scope work, focused verification and
  required quality checks have passed or blockers are documented, and CDP visual verification is recorded.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpu-flow-pan-resize-move-dnd-plan.md" \
  --sentinel "GPU_FLOW_PAN_RESIZE_MOVE_DND_PLAN_COMPLETE" \
  --name "gpu-flow-pan-resize-move-dnd" \
  --commit-prefix "gpu-flow-ux:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
