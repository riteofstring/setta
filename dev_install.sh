#!/usr/bin/env bash

if ! ./scripts/go.sh version >/dev/null 2>&1; then
  ./scripts/install_go_toolchain.sh && ./scripts/go.sh version >/dev/null 2>&1
fi && \
cd frontend && \
pnpm install && \
cd .. && \
./scripts/install_sidecars.sh && \
./cleanup.sh
