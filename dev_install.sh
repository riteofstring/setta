#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/scripts/lib/node_tooling.sh"

run_pnpm() {
  setta_run_pnpm "${SCRIPT_DIR}" "$@"
}

. ./init_env.sh
cd frontend
run_pnpm install --frozen-lockfile
cd ..
./scripts/install_sidecars.sh
./cleanup.sh
