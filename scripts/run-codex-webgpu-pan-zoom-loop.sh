#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-webgpu-pan-zoom-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md
- Completion sentinel: HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE
- Loop name: html-in-canvas-interactive-gpu-surfaces
- Commit prefix: html-gpu-surfaces:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-webgpu-pan-zoom-loop.sh
  ./scripts/run-codex-webgpu-pan-zoom-loop.sh --output-dir /tmp/webgpu-pan-zoom-loop
  ./scripts/run-codex-webgpu-pan-zoom-loop.sh -- --config reasoning_effort=\"high\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-webgpu-pan-zoom-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated Interactive HTML GPU Surfaces Loop Instructions

This loop is specifically for docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md.

Primary target:
- Replace the active-node DOM teleport/snapshot model with always-GPU-rendered HTML surfaces.
- Keep Setta section/node bodies as real layout-subtree HTML sources for capture, hit testing, focus, and accessibility.
- Capture dirty surfaces into GPU textures only when content changes or texture resolution must improve.
- During pan and zoom, update camera uniforms and draw cached textures. Do not request paint, recapture HTML, force React renders, or rewrite per-node DOM transforms.
- Support projection-based interaction for flat and non-affine surfaces, including a cloth-style fixture with interactive controls.

Implementation priorities:
- Start with the API probes in the plan and record exact local browser API support.
- If required native APIs are unavailable, fail loudly and document the blocker. Do not silently ship a fallback renderer.
- Keep the default flat graph path optimized before adding mesh/effect passes.
- Implement source DOM placement, surface/tile texture management, hit projection, and interaction routing as one architecture.
- Sliders, text inputs, CodeMirror, terminals, scrollable node contents, shared comboboxes, and edge handles must remain usable through the GPU-rendered surface.
- Delete active DOM teleport and settling-clone behavior rather than preserving it behind a flag.
- Do not add compatibility layers, dual renderers, old XYFlow preservation paths, or polyfills.

Browser verification:
- Use the plan's relevant example references under /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos, especially html-in-canvas-cracks, compiz-web, water-drop, three-html-render, html-cloth, and html-in-canvas-room.
- For local browser verification, use a Chromium build with WebGPU and html-in-canvas enabled. If required locally, start with:
  CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh
- If the local browser cannot expose the native API, record that blocker and keep moving on testable owner code.

Completion:
- Emit HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE only when the interactive HTML GPU surfaces plan is complete, performance reports and CDP visual verification are checked in where required, and a fresh audit finds no remaining actionable work.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md" \
  --sentinel "HTML_IN_CANVAS_INTERACTIVE_GPU_SURFACES_PLAN_COMPLETE" \
  --name "html-in-canvas-interactive-gpu-surfaces" \
  --commit-prefix "html-gpu-surfaces:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
