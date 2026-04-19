#!/usr/bin/env bash

set -euo pipefail

. ./init_env.sh

if ! ./scripts/go.sh version >/dev/null 2>&1; then
  ./scripts/install_go_toolchain.sh
  ./scripts/go.sh version >/dev/null 2>&1
fi

./scripts/install_gopls.sh

(
  cd frontend
  pnpm install --frozen-lockfile
)

./scripts/install_sidecars.sh
./cleanup.sh
