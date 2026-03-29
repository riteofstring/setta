#!/usr/bin/env bash
set -euo pipefail

SETTA_PYTHON_VERSION="${SETTA_PYTHON_VERSION:-3.13}"
SETTA_INIT_ENV_UPDATE_LOCK=1 . ./init_env.sh

pnpm -C frontend install --lockfile-only
pnpm -C frontend install --frozen-lockfile

pnpm -C backend/setta/agentic/external_adapters/sidecars install --lockfile-only
pnpm -C backend/setta/agentic/external_adapters/sidecars install --frozen-lockfile --prefer-offline
