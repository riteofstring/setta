#!/usr/bin/env bash
set -euo pipefail

SETTA_PYTHON_VERSION="${SETTA_PYTHON_VERSION:-3.13}"
SETTA_INIT_ENV_UPDATE_LOCK=1 . ./init_env.sh
SETTA_MIN_RELEASE_AGE_DAYS="${SETTA_MIN_RELEASE_AGE_DAYS:-7}"

if ! [[ "${SETTA_MIN_RELEASE_AGE_DAYS}" =~ ^[0-9]+$ ]]; then
  echo "Minimum release age must be a non-negative integer: ${SETTA_MIN_RELEASE_AGE_DAYS}" >&2
  exit 1
fi

repo_dev_python() {
  uv run \
    --frozen \
    --python "${SETTA_PYTHON_VERSION:-3.13}" \
    --extra dev \
    python \
    "$@"
}

pnpm -C frontend install --lockfile-only
repo_dev_python ./scripts/check_pnpm_lock_release_age.py --days "${SETTA_MIN_RELEASE_AGE_DAYS}" --lockfile ./frontend/pnpm-lock.yaml
pnpm -C frontend install --frozen-lockfile

pnpm -C backend/setta/agentic/external_adapters/sidecars install --lockfile-only
repo_dev_python ./scripts/check_pnpm_lock_release_age.py --days "${SETTA_MIN_RELEASE_AGE_DAYS}" --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml
pnpm -C backend/setta/agentic/external_adapters/sidecars install --frozen-lockfile --prefer-offline
