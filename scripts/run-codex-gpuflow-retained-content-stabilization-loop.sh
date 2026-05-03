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

Use docs/plans/gpuflow-retained-content-stabilization-plan.md as the active
execution scope. This is a stabilization loop, not a broader canvas migration
loop.

Loop-specific guardrails:
- Start with the earliest incomplete phase in the retained-content
  stabilization plan unless a later issue is blocking verification of that
  phase.
- Do not move additional Settings or project param controls to canvas while
  this loop is active.
- Keep fixes focused on the five recorded regressions: slow overflow scrolling,
  missing retained scrollbars, non-animated switches, text-field editing
  handoff, and long text/textarea wrapping.
- Do not add hidden compatibility paths, old/new render switches, silent DOM
  fallbacks, or broad catch-all event handling. If a control must stay DOM-owned
  for native editing, picker, file, accessibility, or CodeMirror behavior, make
  that ownership explicit.
- Prefer deterministic renderer state, explicit hit records, typed descriptors,
  and measured geometry over pointer or text heuristics.
- Keep active DOM islands narrow: native text/textarea/IME editing, CodeMirror,
  native file/drop targets, and native OS picker controls when required.
- Use existing retained scene and param renderer metadata paths. Do not add
  parallel TypeScript mirrors of Go-owned contracts.
- Each non-completion iteration should produce one coherent fix or tightly
  related set of fixes, relevant focused tests, and a clean commit using the
  configured commit prefix.

Recording and performance requirements:
- Treat the latest Chrome recording as the initial failure evidence. Use
  `./scripts/latest-chrome-recording.sh --json` when you need to inspect the
  captured repro bundle.
- For performance-relevant slices, baseline first, re-measure after, and record
  before/after results in `perf/` as append-only reports.
- Scrolling fixes are not complete just because draw time is low. Verify frame
  cadence, upload churn, scroll offset updates, and active DOM island movement.
- Do not call OpenAPI or rebuild the retained scene on pointer move or wheel
  paths unless the plan identifies a specific unavoidable reason.

Expected implementation order:
- First stop retained-content scroll exceptions while preserving fail-loud
  behavior for non-finite values and invalid dimensions.
- Then move hot retained scroll state out of React scene rebuild paths and make
  wheel handling renderer-owned and requestAnimationFrame-coalesced.
- Then implement retained scrollbars, including draw commands, hit records,
  thumb drag, track click, hover, and active state.
- Then make text-field activation reliable: first click creates/focuses the
  native editor, preserves caret/selection expectations, and prevents the
  canvas event layer from stealing editing input.
- Then replace one-line text squeezing with measured wrapping, clipping, and
  inactive previews that match retained control geometry.
- Then add renderer-owned switch transition state so switches animate on toggle
  without triggering unrelated texture uploads.

Verification gates:
- Add or update focused Vitest coverage for each affected retained-content
  module and interaction path.
- Use Chrome DevTools MCP for visible or performance-sensitive fixes. If CDP
  cannot run, record the blocker in the final response and in any relevant
  perf note.
- Before browser verification, run `./kill.sh`; run it again before the final
  response.
- For html-in-canvas/WebGPU checks, prefer:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
- Run a Settings route repro that covers retained overflow sections, text
  fields, long text/textarea previews, switches, and scrollbars.
- Before declaring completion, run `./scripts/quality/check.sh` unless a
  concrete environment blocker prevents it.

Completion gate:
- Do not emit `GPUFLOW_RETAINED_CONTENT_STABILIZATION_PLAN_COMPLETE` until a
  fresh Settings repro has no retained-content scroll page errors, overflow
  sections scroll smoothly with visible usable scrollbars, switches animate,
  text fields can be edited on first activation, long text wraps without
  distortion, and the before/after performance evidence is recorded in `perf/`.
- If these fixes require broad special cases or unstable fallback behavior, do
  not emit the sentinel. Instead, document the blocker and recommend narrowing
  canvas ownership to graph layout, edges, culling, and dense read-mostly
  content as described in the plan.
EOF

"${SCRIPT_DIR}/run-codex-plan-loop.sh" \
  --plan "docs/plans/gpuflow-retained-content-stabilization-plan.md" \
  --sentinel "GPUFLOW_RETAINED_CONTENT_STABILIZATION_PLAN_COMPLETE" \
  --name "gpuflow-retained-content-stabilization" \
  --commit-prefix "gpuflow-retained-content:" \
  --extra-prompt-file "${extra_prompt_file}" \
  "$@"
