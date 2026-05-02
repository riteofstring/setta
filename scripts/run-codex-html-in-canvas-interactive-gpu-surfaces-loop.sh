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

Scope:
- Execute docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md to completion. Do not restate or dilute it; read it and follow its phase order, success criteria, tests, and performance gates.
- The deleted WebGPU texture, active DOM teleport, pan/resize/move/DnD, and GPU flow performance-hardening plans are obsolete. Do not preserve old teleport/switching behavior behind flags or compatibility paths.
- Use /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos only as read-only reference material when the plan calls for example behavior.

Loop discipline:
- Start each iteration by auditing the earliest incomplete plan phase, then work that phase unless a later blocker proves it must be handled first.
- Keep changes scoped to the plan. Do not reintroduce xyflow, d3-zoom, fallback renderers, dual renderers, compatibility shims, or handwritten mirrors of generated/backend-owned contracts.
- For performance-relevant work, baseline first and store before/after evidence in perf/reports/frontend/.
- Run focused verification for each implementation slice, and run ./scripts/quality/check.sh before declaring completion unless a concrete blocker is documented.

Known incomplete prior run:
- Previous completion was overclaimed. Treat existing html-gpu-surfaces commits and checked-in final reports as partial evidence, not completion.
- Do not emit HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE until all of these are implemented or explicitly documented as impossible with plan updates:
  - tiled texture layout plus tiled-flat renderer pass for large surfaces;
  - shader-effect render pass with explicit hit projector support;
  - interaction-triggered HTML transitions/animations, including an animated toggle or switch, visible through GPU texture recapture without DOM overlay switching;
  - browser verification for CodeMirror edit, terminal input, and shared combobox/dropdown through the GPU-rendered surface;
  - updated perf/CDP reports covering the completed gaps.
- Pan/zoom performance is not complete if it only measures direct viewport store updates. Required evidence must include both:
  - isolated renderer hot-path measurement from direct viewport store updates;
  - end-to-end browser workflow measurement that drives real wheel, trackpad-equivalent, pointer-pan, and zoom gestures through the production surface over a dense Settings -> All Settings-style project or checked-in large-graph fixture with visible edges and representative node content.
- The end-to-end pan/zoom report must include the same upload/requestPaint/source-mutation/GPU-write/frame counters as the isolated hot-path report, plus event-handler duration, long tasks, dropped or coalesced frames, store updates, and visual smoothness notes. A two-node smoke route is not enough to satisfy the pan/zoom gate.
- If one of these items is intentionally narrowed or deferred, update docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md to make that scope change explicit before considering completion.

Completion blockers:
- Before reworking already-landed pieces, audit the latest checked-in code and reports:
  `perf/reports/frontend/2026-05-02_html-gpu-surfaces-completion-verification.md`,
  `perf/reports/frontend/2026-05-02_html-gpu-dense-panzoom-cdp.md`,
  `perf/reports/frontend/2026-05-02_html-gpu-controls-cdp.md`,
  `perf/reports/frontend/2026-05-02_html-gpu-animation-paint-aligned-after.md`,
  `perf/reports/frontend/2026-05-02_html-gpu-warped-mesh-fixture.md`, and
  `perf/reports/frontend/2026-05-02_html-gpu-settings-zoom-tiling-artifact-after.md`.
- Do not redo tiled rendering, shader-effect rendering, warped mesh fixture
  interaction, animated switch recapture, CodeMirror/terminal/combobox
  interaction, or dense large-graph pan/zoom evidence unless the audit finds
  regressions.
- Resolve these gaps before completion:
  - separate active pan/zoom gesture-window counters from deferred post-gesture
    resolution upgrades, so the "pure pan/zoom zero uploads/requestPaint" gate
    is measured unambiguously;
  - promote or verify generic `HtmlSurfaceVisualScene` hit projection in the
    production interaction path, because current project node targeting may still
    be flat-node-layout based while mesh/effect projection is mainly fixture-backed;
  - add or explicitly justify tile-level dirty/upload ownership for large
    interactive surfaces instead of whole tiled-surface uploads on every content
    dirty mark;
  - profile and improve real Settings-node animated switch recapture, because
    the latest report showed a 78.70 ms sampled frame even though the warped
    fixture path was clean;
  - update stale docs that still describe `GpuNodeLayer`, `NodeTextureManager`,
    `GpuNodeQuadRenderer`, or active-node teleport as current architecture.

Browser verification:
- This dedicated loop owns its app/browser sessions. Before browser verification, run ./kill.sh to stop any lingering ai.sh or aireset.sh session. Run ./kill.sh again before the final response.
- For html-in-canvas/WebGPU checks, use the full required Chrome flag set. Prefer ./ai.sh:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
  Browser helpers and Playwright must use the shared Chrome for Testing 149+ binary resolved by
  `scripts/resolve-chrome-for-testing-149.sh`; do not use Playwright's bundled Chromium or local
  Chrome 147/148 for tiled html-in-canvas verification because those builds lack
  the scaled `copyElementImageToTexture(source, sx, sy, sw, sh, width, height, destination)` overload.
- On macOS, every Chrome/Chromium launch must include `--use-mock-keychain`.
  The repo helpers already add it. If you write a direct Playwright fallback
  with `chromium.launch`, include it explicitly in `args` alongside the
  html-in-canvas/WebGPU flags, for example:
  `...(process.platform === "darwin" ? ["--use-mock-keychain"] : [])`.
  Do not run ad hoc headed Playwright/Chromium probes without this flag, because
  Chromium may otherwise request access to the user's Keychain credentials.
- Use ./aireset.sh only when the iteration needs a clean disposable state, with the same full flag set:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./aireset.sh`
- Use Chrome DevTools MCP for visible or performance-sensitive work. If CDP cannot run, record the concrete blocker.
- When reporting browser verification, include `CDP visual check: done (...)` with scenario, zoom level, measured upload/write counts where relevant, and whether ./ai.sh or ./aireset.sh was used.

Completion:
- Emit HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE only after a fresh audit finds the plan complete, required reports and browser evidence are recorded, quality verification has passed or has a documented blocker, and the worktree is clean.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md" \
  --sentinel "HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE" \
  --name "html-in-canvas-interactive-gpu-surfaces" \
  --commit-prefix "html-gpu-surfaces:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
