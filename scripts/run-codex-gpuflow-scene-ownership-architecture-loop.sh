#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-gpuflow-scene-ownership-architecture-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/gpuflow-scene-ownership-architecture-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/gpuflow-scene-ownership-architecture-plan.md
- Completion sentinel: GPUFLOW_SCENE_OWNERSHIP_ARCHITECTURE_PLAN_COMPLETE
- Loop name: gpuflow-scene-ownership-architecture
- Commit prefix: gpuflow-scene:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-gpuflow-scene-ownership-architecture-loop.sh
  ./scripts/run-codex-gpuflow-scene-ownership-architecture-loop.sh --output-dir /tmp/gpuflow-scene-loop --iterations 120
  ./scripts/run-codex-gpuflow-scene-ownership-architecture-loop.sh -- --config reasoning_effort=\"xhigh\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-gpuflow-scene-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated GpuFlow Scene Ownership Architecture Loop Instructions

Use the scene-ownership plan as the active execution scope. The deleted
canvas-pan-zoom, interactive HTML GPU surfaces, and GpuFlow-owned section
resizing plans are obsolete as active plans; do not recreate them or their
dedicated loops.

Plan-specific guardrails:
- Treat each ownership move as a clean break: no compatibility paths, legacy
  support, migrations, old/new switches, fallback renderers, or silent
  transitional behavior.
- Keep `gpuFlow/*` generic. Setta policy, permissions, optimistic project
  updates, OpenAPI calls, and durable persistence belong in project adapters.
- When a responsibility moves to GpuFlow, remove or narrow the previous owner in
  the same implementation slice.
- Prefer small vertical slices in the plan's order: layout store, port
  geometry, selection/group movement, edge overlays/reconnect, intrinsic
  auto-size scheduling, focus/reveal queries, then portals/overlays.
- Use `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` only
  as read-only reference material.

Performance-specific reminders:
- For performance-relevant slices, baseline first and record before/after
  results in `perf/` as append-only reports.
- Do not use screen-DOM geometry, `ResizeObserver`, or `getBoundingClientRect()`
  as the live source of truth for top-level graph geometry. Intrinsic content
  measurement is allowed only through the explicit auto-size path.
- Do not call OpenAPI on pointer move.

Browser checks:
- Before browser verification, run `./kill.sh`; run it again before the final
  response.
- For html-in-canvas/WebGPU checks, prefer:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
- Use Chrome DevTools MCP for visible or performance-sensitive work. If CDP
  cannot run, record the blocker.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpuflow-scene-ownership-architecture-plan.md" \
  --sentinel "GPUFLOW_SCENE_OWNERSHIP_ARCHITECTURE_PLAN_COMPLETE" \
  --name "gpuflow-scene-ownership-architecture" \
  --commit-prefix "gpuflow-scene:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
