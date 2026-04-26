#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-webgpu-pan-zoom-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/webgpu-html-texture-pan-zoom-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/webgpu-html-texture-pan-zoom-plan.md
- Completion sentinel: WEBGPU_HTML_TEXTURE_PAN_ZOOM_PLAN_COMPLETE
- Loop name: webgpu-html-texture-pan-zoom
- Commit prefix: webgpu-pan-zoom:

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
Dedicated WebGPU HTML Texture Pan/Zoom Loop Instructions

This loop is specifically for docs/plans/webgpu-html-texture-pan-zoom-plan.md.

Primary target:
- Build the highest-performance renderer described in the WebGPU plan.
- Keep Setta section/node bodies as real interactive HTML through <canvas layoutsubtree>.
- Capture visible dirty nodes into GPU textures only when content changes or texture resolution must improve.
- During pan and zoom, update camera uniforms and draw cached textures. Do not recapture node HTML on viewport-only movement.
- Do not implement the Canvas 2D plan in this loop except as a temporary probe if the WebGPU plan explicitly calls for validating API behavior.

Implementation priorities:
- Start with the WebGPU/html-in-canvas upload probe and record exact local browser API support.
- If WebGPU element upload is unavailable but WebGL2 texElementImage2D is available, pause at a clean decision point and document the evidence. Do not silently ship a fallback renderer.
- Prioritize crisp texture resolution buckets, max texture limits, dirty-node upload scheduling, and active DOM teleport for real-time interactive updates.
- Sliders, text inputs, CodeMirror, terminals, scrollable node contents, and edge handles must remain native HTML interactions.
- Use same-instance active DOM teleport for the node currently being manipulated. Do not rely on repeated full-node texture uploads for live control feedback.
- Do not add compatibility layers, dual renderers, old XYFlow preservation paths, or polyfills.

Browser verification:
- Use the plan's relevant example references under /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos, especially html-in-canvas-cracks, compiz-web, water-drop, three-html-render, html-cloth, and html-in-canvas-room.
- For local browser verification, use a Chromium build with WebGPU and html-in-canvas enabled. If required locally, start with:
  CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh
- If the local browser cannot expose the native API, record that blocker and keep moving on testable owner code.

Completion:
- Emit WEBGPU_HTML_TEXTURE_PAN_ZOOM_PLAN_COMPLETE only when the WebGPU texture plan is complete and a fresh audit finds no remaining actionable work.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/webgpu-html-texture-pan-zoom-plan.md" \
  --sentinel "WEBGPU_HTML_TEXTURE_PAN_ZOOM_PLAN_COMPLETE" \
  --name "webgpu-html-texture-pan-zoom" \
  --commit-prefix "webgpu-pan-zoom:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
