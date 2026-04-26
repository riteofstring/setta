#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-canvas-pan-zoom-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/canvas-pan-zoom-html-in-canvas-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/canvas-pan-zoom-html-in-canvas-plan.md
- Completion sentinel: CANVAS_PAN_ZOOM_PLAN_COMPLETE
- Loop name: canvas-pan-zoom
- Commit prefix: canvas-pan-zoom:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-canvas-pan-zoom-loop.sh
  ./scripts/run-codex-canvas-pan-zoom-loop.sh --output-dir /tmp/canvas-pan-zoom-loop
  ./scripts/run-codex-canvas-pan-zoom-loop.sh -- --config reasoning_effort=\"high\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-canvas-pan-zoom-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated Canvas 2D Pan/Zoom Loop Instructions

This loop is specifically for docs/plans/canvas-pan-zoom-html-in-canvas-plan.md.

Primary target:
- Replace the transformed XYFlow DOM/SVG viewport with the native Canvas 2D html-in-canvas plan.
- Use <canvas layoutsubtree> plus CanvasRenderingContext2D.drawElementImage for node visuals.
- Keep Setta section/node bodies as real HTML.
- Keep the real node DOM synchronized for native hit testing, focus, inputs, hover, and accessibility.
- Do not pivot to the WebGPU texture plan in this loop. If Canvas 2D proves insufficient, record the evidence in the audit and stop at a clean decision point.

Implementation priorities:
- Start by validating the browser contract with a minimal probe.
- Do not add polyfills, compatibility fallbacks, legacy adapters, dual renderers, or old XYFlow preservation paths.
- Do not call drawElementImage for hidden/culled nodes.
- Pan and zoom must update viewport state and redraw imperatively without React-rendering every node per frame.
- Keep existing SectionContainer internals wherever possible.
- Move callers from forks/xyflow helpers to the new canvas-flow owner as the implementation advances.

Browser verification:
- Use the plan's relevant example references under /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos.
- For local browser verification, use a Chromium build with the html-in-canvas flag enabled, for example:
  CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh
- If the local browser cannot expose the native API, record that blocker and keep moving on testable owner code.

Completion:
- Emit CANVAS_PAN_ZOOM_PLAN_COMPLETE only when the Canvas 2D plan is complete and a fresh audit finds no remaining actionable work.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/canvas-pan-zoom-html-in-canvas-plan.md" \
  --sentinel "CANVAS_PAN_ZOOM_PLAN_COMPLETE" \
  --name "canvas-pan-zoom" \
  --commit-prefix "canvas-pan-zoom:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
