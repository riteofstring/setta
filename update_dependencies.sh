#!/usr/bin/env bash
set -euo pipefail

SETTA_PYTHON_VERSION="${SETTA_PYTHON_VERSION:-3.13}"
SETTA_INIT_ENV_UPDATE_LOCK=1 . ./init_env.sh
SETTA_MIN_RELEASE_AGE_DAYS="${SETTA_MIN_RELEASE_AGE_DAYS:-7}"

if ! [[ "${SETTA_MIN_RELEASE_AGE_DAYS}" =~ ^[0-9]+$ ]]; then
  echo "Minimum release age must be a non-negative integer: ${SETTA_MIN_RELEASE_AGE_DAYS}" >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  python_bin="python3"
elif command -v python >/dev/null 2>&1; then
  python_bin="python"
else
  echo "Python is required to verify pnpm lockfile release ages." >&2
  exit 1
fi

pnpm -C frontend install --lockfile-only
"${python_bin}" ./scripts/check_pnpm_lock_release_age.py --days "${SETTA_MIN_RELEASE_AGE_DAYS}" --lockfile ./frontend/pnpm-lock.yaml
pnpm -C frontend install --frozen-lockfile

pnpm -C backend/setta/agentic/external_adapters/sidecars install --lockfile-only
"${python_bin}" ./scripts/check_pnpm_lock_release_age.py --days "${SETTA_MIN_RELEASE_AGE_DAYS}" --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml
pnpm -C backend/setta/agentic/external_adapters/sidecars install --frozen-lockfile --prefer-offline
