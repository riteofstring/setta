#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-html-in-canvas-interactive-gpu-surfaces-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md
- Completion sentinel: HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE
- Loop name: html-in-canvas-interactive-gpu-surfaces
- Commit prefix: html-gpu-surfaces:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-html-in-canvas-interactive-gpu-surfaces-loop.sh
  ./scripts/run-codex-html-in-canvas-interactive-gpu-surfaces-loop.sh --output-dir /tmp/html-gpu-surfaces-loop --iterations 80
  ./scripts/run-codex-html-in-canvas-interactive-gpu-surfaces-loop.sh -- --config reasoning_effort=\"xhigh\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-html-gpu-surfaces-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated Interactive HTML GPU Surfaces Loop Instructions

Scope and references:
- Execute docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md to completion.
- Treat that plan as the active source for HTML-in-canvas interaction work. The older WebGPU texture, active DOM teleport, pan/resize/move/DnD, and GPU flow performance-hardening plans were intentionally removed.
- Use the current GPU flow implementation as the source of truth for runtime shape until replacement code lands:
  - frontend/src/gpuFlow/GpuFlow.tsx
  - frontend/src/gpuFlow/GpuSurface.tsx
  - frontend/src/gpuFlow/GpuNodeLayer.tsx
  - frontend/src/gpuFlow/nodeTextures.ts
  - frontend/src/gpuFlow/gpuPipelines.ts
  - frontend/src/gpuFlow/nodeInteractionDirty.ts
  - frontend/src/components/Pages/Project/GpuProjectSurface.tsx
- Use /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos as read-only implementation references, especially:
  - html-in-canvas/plugins/html-cloth.mjs for mesh UV-to-DOM interaction, input wiring, and texture refresh discipline.
  - html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts for requestPaint/onpaint/copyElementImageToTexture sequencing.
  - three-html-render/src/raycastInteractionManager.ts for raycast-to-UV source alignment.
  - three-html-render/src/interactionManager.ts for affine matrix alignment.
  - html-in-canvas-room/extension/entrypoints/content.ts for transform-aligned native interaction and dirty texture upload sequencing.
  - html-in-canvas-official/README.md for layoutsubtree, paint, capture, transform, and API constraints.
- The old go-rewrite xyflow code is a read-only behavioral reference. Do not reintroduce xyflow, d3-zoom, dual renderers, fallback renderers, compatibility shims, or broad legacy adapters.

Phase order:
1. API probes and browser capability evidence.
2. Source DOM layer replacement.
3. Surface/tile texture manager.
4. Default flat renderer parity and hot-path preservation.
5. Hit scene and interaction projector for flat surfaces.
6. Delete active DOM teleport, settling clones, and texture/DOM switching.
7. Mesh and shader-effect surface contracts.
8. Cloth-style complex-surface fixture with interactive controls.
9. Large-node tiling and byte-budgeted upload scheduling.
10. Performance baseline, browser verification, and cleanup audit.

Work on the earliest incomplete phase unless a later change exposes an earlier blocker. Start every iteration with a fresh targeted audit of the active phase and update the loop audit state.

Performance guardrails:
- Baseline before performance-relevant changes and record before/after evidence in perf/reports/frontend/.
- Pure pan/zoom must not call requestPaint, copyElementImageToTexture, React renders, or per-node DOM transform sync.
- Pan/zoom average and p95 frame time must be no worse than the baseline by more than 5%.
- Viewport-only frames should avoid unchanged node vertex buffer writes, unchanged edge buffer writes, passive texture uploads, and high-frequency React overlay work.
- Pointer move over a surface may write at most one source transform.
- Dirty uploads must obey count, duration, byte, and priority budgets.
- Texture memory work must account for interactive, focused, visible, dirty, pending-paint, and tiled-surface protection before any eviction.
- Complex mesh/effect surfaces must not slow the default flat graph path when no such surfaces are visible.

Interaction and visual fidelity priority:
- Treat texture/DOM switching as the defect to remove, not as a behavior to preserve.
- The visible output for passive and active nodes must remain GPU-rendered.
- Resolve pointer interaction by mapping rendered hits back to source HTML coordinates, aligning the source for browser hit testing, and uploading dirty textures only when content or resolution changes.
- Effects without deterministic hit projection are not interactive.
- Sliders, text inputs, CodeMirror, terminals, scrollable node contents, shared comboboxes, and edge handles must remain usable through the GPU-rendered surface.
- Do not keep active DOM teleport behind a flag. Delete the old behavior when the replacement path owns interaction.

Testing standards:
- Add or extend focused owner tests for measurable behavior, operation counts, hit projection, source alignment, upload budgeting, texture memory accounting, and interaction outcomes.
- Prefer tests that assert externally meaningful invariants: no texture uploads during viewport-only movement, no unchanged buffer rewrites, bounded DOM writes, exact flat hit projection, mesh UV interpolation, pointer capture routing, and protected texture eviction behavior.
- Browser tests must cover pan/zoom performance, button hover/click, text input caret/typing, slider drag on a warped surface, CodeMirror editing, terminal input, shared comboboxes, and the cloth-style complex fixture.
- Do not add tautological tests that restate implementation logic, selector inventories without behavior, or generator drift tests.
- Do not hand-edit generated files or handwritten mirrors of generated/backend-owned contracts.

Browser and performance verification:
- Use Chrome DevTools MCP for visible or performance-sensitive work.
- This dedicated loop owns its app/browser sessions. This instruction intentionally overrides the generic plan-loop guidance about preserving pre-existing developer-started sessions for ai.sh and aireset.sh. Before starting browser verification, stop any lingering Setta app/browser session from ai.sh or aireset.sh with ./kill.sh, even if it appears to have been started before the current iteration.
- After cleanup, start a fresh local session for the iteration. For html-in-canvas/WebGPU-sensitive checks, use:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
  Use the same environment with ./aireset.sh only when a clean disposable state is needed.
- Instrument browser probes with page-injected wrappers around GPUQueue.prototype.copyElementImageToTexture, GPUQueue.prototype.writeBuffer, long tasks, animation frames, and DOM transform writes where useful. Keep instrumentation out of production paths unless it is a general-purpose debug surface justified by the plan.
- Record each visible or performance-sensitive iteration response as `CDP visual check: done (...)`, including scenario, zoom level, upload/write counts where measured, and which ai.sh/aireset.sh command was used. If CDP cannot run, record the concrete blocker.
- Before the final response, run ./kill.sh again to stop the app/browser session used by this loop iteration, plus any lingering ai.sh or aireset.sh descendants it finds. Also stop every MCP helper, watcher, recorder, or dev server started by the iteration.

Quality and completion:
- Run focused verification for each implementation slice.
- Run ./scripts/quality/check.sh before declaring completion unless a concrete environment blocker is documented.
- If a fresh audit shows all phases complete, required reports and browser evidence are recorded, and the worktree is clean, emit HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md" \
  --sentinel "HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE" \
  --name "html-in-canvas-interactive-gpu-surfaces" \
  --commit-prefix "html-gpu-surfaces:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
