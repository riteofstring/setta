#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skip_build=0
run_focused=1
run_electron=1
run_live=1
visible=0
keep_artifacts=0

usage() {
  cat <<'EOF'
Usage: ./scripts/test_workspace_graph_phase8.sh [options]

Run the workspace graph retained-scene Phase 8 verification gate:
  - focused renderer and parser tests for camera, dirty-work, activity, and incident contracts
  - production Electron workflows in the workspace-graph-phase8 manifest tier
  - live Codex Electron/backend workflows when local Codex ChatGPT auth is available

Options:
  --skip-build          Reuse the existing desktop production build.
  --visible             Show Electron windows for workflows that support it.
  --keep-artifacts      Keep timestamped workflow artifacts where supported.
  --deterministic-only  Skip live Codex workflows.
  --focused-only        Run only focused renderer and parser tests.
  --electron-only       Run only the production Electron workspace graph tier.
  --live-only           Run only live Codex workflows when auth is available.
  -h, --help            Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      skip_build=1
      shift
      ;;
    --visible)
      visible=1
      shift
      ;;
    --keep-artifacts)
      keep_artifacts=1
      shift
      ;;
    --deterministic-only)
      run_live=0
      shift
      ;;
    --focused-only)
      run_focused=1
      run_electron=0
      run_live=0
      shift
      ;;
    --electron-only)
      run_focused=0
      run_electron=1
      run_live=0
      shift
      ;;
    --live-only)
      run_focused=0
      run_electron=0
      run_live=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${skip_build}" -eq 0 && ( "${run_electron}" -eq 1 || "${run_live}" -eq 1 ) ]]; then
  pnpm -C "${repo_root}/desktop" build
fi

if [[ "${run_focused}" -eq 1 ]]; then
  pnpm -C "${repo_root}/desktop" exec vitest run \
    src/renderer/src/features/workspace-graph/pixi-renderer-input-handlers.test.js \
    src/renderer/src/features/workspace-graph/pixi-renderer-camera-sync.test.js \
    src/renderer/src/features/workspace-graph/pixi-renderer-camera-scene-sync.test.js \
    src/renderer/src/features/workspace-graph/pixi-renderer-scene-graph.test.js \
    src/renderer/src/features/workspace-graph/pixi-renderer-visible-scene-window.test.js \
    src/renderer/src/features/workspace-graph/pixi-renderer-labels.test.js \
    src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.test.js \
    src/renderer/src/features/workspace-graph/workspace-graph-scene-store.test.ts \
    src/renderer/src/features/workspace-graph/workflow-graph-layout-persistence.test.ts \
    src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts \
    src/renderer/src/components/chat-panel.test.tsx

  node --test \
    "${repo_root}/desktop/tests/electron/workflow-graph-recording-incident-report.test.mjs" \
    "${repo_root}/desktop/tests/electron/workflow-graph-pan-zoom-performance-report.test.mjs"
fi

if [[ "${run_electron}" -eq 1 ]]; then
  workflow_args=("--tier" "workspace-graph-phase8")
  if [[ "${visible}" -eq 1 ]]; then
    workflow_args+=("--visible")
  fi
  if [[ "${keep_artifacts}" -eq 1 ]]; then
    workflow_args+=("--keep-artifacts")
  fi
  node "${repo_root}/desktop/tests/electron/run-workflows.mjs" "${workflow_args[@]}"
fi

if [[ "${run_live}" -eq 1 ]]; then
  if live_skip_reason="$(node "${repo_root}/desktop/tests/electron/chat-live-auth.mjs" 2>&1)"; then
    live_args=("--skip-build" "--live-only")
    if [[ "${visible}" -eq 1 ]]; then
      live_args+=("--visible")
    fi
    if [[ "${keep_artifacts}" -eq 1 ]]; then
      live_args+=("--keep-artifacts")
    fi
    env -u OPENAI_API_KEY "${repo_root}/scripts/test_chat_workflows.sh" \
      "${live_args[@]}"
  else
    live_skip_reason="${live_skip_reason:-Codex ChatGPT auth is unavailable}"
    echo "Live Codex workspace graph Phase 8 workflows skipped: ${live_skip_reason}"
  fi
fi
