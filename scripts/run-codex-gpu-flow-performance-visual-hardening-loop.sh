#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-gpu-flow-performance-visual-hardening-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/gpu-flow-performance-visual-hardening-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/gpu-flow-performance-visual-hardening-plan.md
- Completion sentinel: GPU_FLOW_PERFORMANCE_VISUAL_HARDENING_PLAN_COMPLETE
- Loop name: gpu-flow-performance-visual-hardening
- Commit prefix: gpu-flow-perf:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-gpu-flow-performance-visual-hardening-loop.sh
  ./scripts/run-codex-gpu-flow-performance-visual-hardening-loop.sh --output-dir /tmp/gpu-flow-perf-loop --iterations 80
  ./scripts/run-codex-gpu-flow-performance-visual-hardening-loop.sh -- --config reasoning_effort=\"xhigh\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-gpu-flow-perf-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated GPU Flow Performance and Visual Hardening Loop Instructions

Scope and references:
- Execute docs/plans/gpu-flow-performance-visual-hardening-plan.md to completion.
- Keep the prerequisite architecture from these plans intact:
  - docs/plans/webgpu-html-texture-pan-zoom-plan.md
  - docs/plans/gpu-flow-live-active-node-dom-plan.md
  - docs/plans/gpu-flow-pan-resize-move-dnd-plan.md
- Use the current GPU flow implementation as the source of truth for runtime shape:
  - frontend/src/gpuFlow/GpuFlow.tsx
  - frontend/src/gpuFlow/GpuNodeLayer.tsx
  - frontend/src/gpuFlow/GpuActiveNodeTeleport.ts
  - frontend/src/gpuFlow/nodeTextures.ts
  - frontend/src/gpuFlow/gpuPipelines.ts
  - frontend/src/gpuFlow/nodeInteractionDirty.ts
  - frontend/src/components/Pages/Project/GpuProjectSurface.tsx
- The old go-rewrite xyflow code and /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos are read-only references. Do not reintroduce xyflow, d3-zoom, dual renderers, fallback renderers, compatibility shims, or broad legacy adapters.

Phase order:
1. Baseline instrumentation.
2. Viewport-only GPU hot path.
3. DOM hit-test transform scaling.
4. Paint dirty ownership.
5. Texture memory accounting and eviction.
6. Large graph stress fixture.
7. Texture/live-DOM visual parity, especially activation and deactivation pop.
8. Active interaction latency.
9. Cleanup and authority audit.
10. Final verification.

Work on the earliest incomplete phase unless a later change exposes an earlier blocker. Start every iteration with a fresh targeted audit of the active phase and update the loop audit state.

Performance guardrails:
- Baseline before performance changes and record before/after evidence in perf/reports/frontend/.
- Pan, zoom, minimap navigation, viewport animation, node movement, and selection movement must not recapture node textures merely because the viewport or node position changed.
- Viewport-only frames should avoid unchanged node vertex buffer writes, unchanged edge buffer writes, passive texture uploads, and high-frequency React overlay work.
- DOM transform work should scale with visible/previous-visible/forced/active nodes rather than total mounted nodes.
- Paint dirty ownership should resolve normal child changed-elements without scanning every node.
- Texture memory work must account for active, settling, pending-paint, focused, visible, and dirty interactive protection before any eviction.

Texture/live-DOM fidelity priority:
- Treat the activation visual pop as a first-class defect. The exact sequence to optimize is:
  passive GPU texture before interaction -> live teleported DOM during interaction -> restored passive GPU texture after final upload.
- Measure and reduce visible differences when clicking a text field, toggle, slider, editor, or other node control.
- Audit likely root causes before masking the symptom: device-pixel alignment, GPU-vs-CSS transform math, zoom bucket and texture resolution, sampler blur, clipping/border radius/shadow/opacity/theme inheritance, active teleport classes, width/height/overflow/containment/font smoothing, scroll offsets, focus state, CSS transition timing, and final restore/upload ordering.
- Use a short transition or crossfade only if measured browser text antialiasing differences remain after root-cause parity fixes, and document why.

Testing standards:
- Add or extend focused owner tests for measurable behavior, operation counts, visual parity helpers, texture memory accounting, and interaction outcomes.
- Prefer tests that assert externally meaningful invariants: no texture uploads during viewport-only movement, no unchanged buffer rewrites, bounded DOM writes, correct owner resolution for changed paint elements, protected texture eviction behavior, first-click control effect, before/live/after rect or style consistency.
- Do not add tautological tests that restate implementation logic, selector inventories without behavior, or generator drift tests.
- Do not hand-edit generated files or handwritten mirrors of generated/backend-owned contracts.

Browser and performance verification:
- Use Chrome DevTools MCP for visible or performance-sensitive work.
- This dedicated loop owns its app/browser sessions. This instruction intentionally overrides the generic plan-loop guidance about preserving pre-existing developer-started sessions for `ai.sh` and `aireset.sh`. Before starting browser verification, stop any lingering Setta app/browser session from `ai.sh` or `aireset.sh` with `./kill.sh`, even if it appears to have been started before the current iteration.
- After cleanup, start a fresh local session for the iteration. For html-in-canvas/WebGPU-sensitive checks, use:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
  Use the same environment with `./aireset.sh` only when a clean disposable state is needed.
- Instrument browser probes with page-injected wrappers around `GPUQueue.prototype.copyElementImageToTexture`, `GPUQueue.prototype.writeBuffer`, long tasks, and animation frames where useful. Keep instrumentation out of production paths unless it is a general-purpose debug surface justified by the plan.
- Record each visible or performance-sensitive iteration response as `CDP visual check: done (...)`, including scenario, zoom level, upload/write counts where measured, and which `ai.sh`/`aireset.sh` command was used. If CDP cannot run, record the concrete blocker.
- Before the final response, run `./kill.sh` again to stop the app/browser session used by this loop iteration, plus any lingering `ai.sh` or `aireset.sh` descendants it finds. Also stop every MCP helper, watcher, recorder, or dev server started by the iteration.

Quality and completion:
- Run focused verification for each implementation slice.
- Run ./check_quality.sh before declaring completion unless a concrete environment blocker is documented.
- If a fresh audit shows all phases complete, required reports and browser evidence are recorded, and the worktree is clean, emit GPU_FLOW_PERFORMANCE_VISUAL_HARDENING_PLAN_COMPLETE.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpu-flow-performance-visual-hardening-plan.md" \
  --sentinel "GPU_FLOW_PERFORMANCE_VISUAL_HARDENING_PLAN_COMPLETE" \
  --name "gpu-flow-performance-visual-hardening" \
  --commit-prefix "gpu-flow-perf:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
