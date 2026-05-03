#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-gpuflow-owned-section-resizing-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/gpuflow-owned-section-resizing-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/gpuflow-owned-section-resizing-plan.md
- Completion sentinel: GPUFLOW_OWNED_SECTION_RESIZING_PLAN_COMPLETE
- Loop name: gpuflow-owned-section-resizing
- Commit prefix: gpuflow-resize:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-gpuflow-owned-section-resizing-loop.sh
  ./scripts/run-codex-gpuflow-owned-section-resizing-loop.sh --output-dir /tmp/gpuflow-resize-loop --iterations 80
  ./scripts/run-codex-gpuflow-owned-section-resizing-loop.sh -- --config reasoning_effort=\"xhigh\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-gpuflow-resize-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated GpuFlow-Owned Section Resizing Loop Instructions

Plan-specific scope:
- Execute docs/plans/gpuflow-owned-section-resizing-plan.md as written, following its phases and success criteria.
- Make GpuFlow the owner of top-level GPU section resize gestures, live bounds, dirty scheduling, and graph geometry updates.
- Treat this as a clean break: no backward compatibility, migrations, transitional bridges, dual paths, old/new switches, or silent fallbacks.
- Do not preserve `re-resizable` as a top-level project section resize owner on any GPU or non-GPU surface.
- Use /Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos only as read-only reference material.

Architecture guardrails:
- During manual resize, the single canonical live size is the GpuFlow node layout. HTML renders inside that size and must not resize itself first.
- Do not use ResizeObserver or DOM measurement as the manual resize owner.
- Keep GpuFlow generic. Setta section policy, generated types, and OpenAPI persistence belong in project/state adapters.
- Reuse or extract existing Setta resize policy instead of duplicating it inside GpuFlow.
- Resize moves must be rAF-coalesced, zoom-corrected, and free of backend calls or broad project-state rewrites.
- Preserve the existing resize semantics listed in the plan; characterize unclear behavior with focused tests before changing it.

Performance and verification:
- Resize movement should be O(1) except bounded updates to directly affected edges and overlays.
- Do not measure every node, upload passive node textures, request paint for passive nodes, or send `setSectionSizes` on pointer move.
- Before browser verification, run ./kill.sh. Use the full html-in-canvas/WebGPU flags with ./ai.sh or ./aireset.sh, and run ./kill.sh again before the final response.
- Required final CDP scenario: on `/settings`, resize `settings-section__shortcuts` and verify source host size, section root size, visual footprint, resize handle, edge/selection geometry, and persisted final layout agree. Also verify there are no per-move `setSectionSizes` requests.
- Report browser verification as `CDP visual check: done (...)` with scenario, zoom level, measured dimensions, and whether ./ai.sh or ./aireset.sh was used.

Completion:
- Emit GPUFLOW_OWNED_SECTION_RESIZING_PLAN_COMPLETE only after the plan is complete, required tests and browser evidence are recorded, quality verification is clean or explicitly blocked, and the worktree is clean.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpuflow-owned-section-resizing-plan.md" \
  --sentinel "GPUFLOW_OWNED_SECTION_RESIZING_PLAN_COMPLETE" \
  --name "gpuflow-owned-section-resizing" \
  --commit-prefix "gpuflow-resize:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
