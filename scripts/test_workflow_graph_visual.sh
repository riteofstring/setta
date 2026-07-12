#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skip_build=0
declare -a node_args=()

usage() {
  cat <<'EOF'
Usage: ./scripts/test_workflow_graph_visual.sh [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]

Build and run the workflow graph visual smoke workflow through the production
Electron main/preload/renderer path with temporary app data.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      skip_build=1
      node_args+=("$1")
      shift
      ;;
    --visible|--keep-artifacts)
      node_args+=("$1")
      shift
      ;;
    --artifact-dir)
      if [[ $# -lt 2 ]]; then
        echo "--artifact-dir requires a value" >&2
        usage >&2
        exit 1
      fi
      node_args+=("$1" "$2")
      shift 2
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

if [[ "${skip_build}" -eq 0 ]]; then
  pnpm -C "${repo_root}/desktop" build
fi

node "${repo_root}/desktop/tests/electron/run-workflows.mjs" \
  --workflow workflow-graph-smoke \
  "${node_args[@]}"
