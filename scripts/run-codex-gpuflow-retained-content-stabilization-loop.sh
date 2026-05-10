#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-gpuflow-retained-content-stabilization-loop.sh [run-codex-plan-loop options] [-- <extra codex exec args>]

Run the dedicated Codex loop for docs/plans/gpuflow-retained-content-stabilization-plan.md.

This wrapper uses scripts/run-codex-plan-loop.sh with:
- Plan: docs/plans/gpuflow-retained-content-stabilization-plan.md
- Completion sentinel: GPUFLOW_RETAINED_CONTENT_STABILIZATION_PLAN_COMPLETE
- Loop name: gpuflow-retained-content-stabilization
- Commit prefix: gpuflow-retained-content:

All generic run-codex-plan-loop options are accepted, except this wrapper owns
the plan, sentinel, name, and commit prefix settings.

Examples:
  ./scripts/run-codex-gpuflow-retained-content-stabilization-loop.sh
  ./scripts/run-codex-gpuflow-retained-content-stabilization-loop.sh --output-dir /tmp/gpuflow-retained-content-loop --iterations 80
  ./scripts/run-codex-gpuflow-retained-content-stabilization-loop.sh -- --config reasoning_effort=\"xhigh\"
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
extra_prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-gpuflow-retained-content-extra.XXXXXX")"
cleanup() {
  rm -f "${extra_prompt_file}"
}
trap cleanup EXIT

cat > "${extra_prompt_file}" <<'EOF'
Dedicated GpuFlow Retained Content Stabilization Loop Instructions

This is a stabilization loop, not a broader canvas migration loop. Keep work
focused on the five retained-content regressions in the plan: overflow scroll
performance, retained scrollbars, switch animation, text-field editing handoff,
and long text/textarea preview wrapping.

Guardrails:
- Do not move additional Settings or project param controls to canvas.
- Do not add hidden compatibility paths, old/new render switches, silent DOM
  fallbacks, or broad catch-all event handling.
- Keep active DOM islands narrow and explicit for native text/textarea/IME
  editing, CodeMirror, file/drop targets, and OS pickers when required.
- Use existing retained scene and param renderer metadata paths. Do not add
  parallel TypeScript mirrors of Go-owned contracts.
- Do not call OpenAPI or rebuild the retained scene on pointer move or wheel
  paths unless the plan identifies a specific unavoidable reason.

Verification:
- Use the latest Chrome recording as initial failure evidence:
  `./scripts/latest-chrome-recording.sh --json`.
- For performance-relevant slices, baseline first, re-measure after, and record
  before/after results in `perf/` as append-only reports.
- For ordinary focused iterations, run the relevant Vitest/browser checks for
  the changed behavior. Run `./scripts/quality/check.sh` before declaring
  completion and after broad or shared changes.
- For browser verification, run `./kill.sh` first and again before the final
  response. Prefer:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
- Use Chrome DevTools MCP for visible or performance-sensitive fixes; record
  the blocker if CDP cannot run.

Do not emit `GPUFLOW_RETAINED_CONTENT_STABILIZATION_PLAN_COMPLETE` until a
fresh Settings repro has no retained-content scroll page errors, overflow
sections scroll smoothly with visible usable scrollbars, switches animate, text
fields edit on first activation, long text wraps without distortion, and
before/after performance evidence is recorded in `perf/`.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpuflow-retained-content-stabilization-plan.md" \
  --sentinel "GPUFLOW_RETAINED_CONTENT_STABILIZATION_PLAN_COMPLETE" \
  --name "gpuflow-retained-content-stabilization" \
  --commit-prefix "gpuflow-retained-content:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
