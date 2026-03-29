#!/bin/sh
set -e

# watchfiles==0.24.0 (PyO3 0.22.x) does not support Python 3.14 yet.
SETTA_PYTHON_VERSION="${SETTA_PYTHON_VERSION:-3.13}"
SETTA_INIT_ENV_UPDATE_LOCK="${SETTA_INIT_ENV_UPDATE_LOCK:-0}"

if [ -f "./supply_chain_policy.env" ]; then
  # shellcheck source=/dev/null
  . "./supply_chain_policy.env"
fi

if [ -n "${SETTA_MIN_RELEASE_AGE_DAYS:-}" ]; then
  case "${SETTA_MIN_RELEASE_AGE_DAYS}" in
    *[!0-9]*)
      echo "Minimum release age must be a non-negative integer: ${SETTA_MIN_RELEASE_AGE_DAYS}" >&2
      exit 1
      ;;
  esac
fi

SETTA_EXCLUDE_NEWER=""
if [ -n "${SETTA_MIN_RELEASE_AGE_DAYS:-}" ] && [ "${SETTA_MIN_RELEASE_AGE_DAYS}" -gt 0 ]; then
  if command -v python3 >/dev/null 2>&1; then
    SETTA_POLICY_PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    SETTA_POLICY_PYTHON_BIN="python"
  else
    echo "Python is required to compute the supply-chain release-age cutoff." >&2
    exit 1
  fi
fi

if [ "${SETTA_INIT_ENV_UPDATE_LOCK}" = "1" ]; then
  if [ -n "${SETTA_MIN_RELEASE_AGE_DAYS:-}" ] && [ "${SETTA_MIN_RELEASE_AGE_DAYS}" -gt 0 ]; then
    SETTA_EXCLUDE_NEWER="$("${SETTA_POLICY_PYTHON_BIN}" ./scripts/compute_release_age_cutoff.py "${SETTA_MIN_RELEASE_AGE_DAYS}")"
    uv lock --upgrade --exclude-newer "${SETTA_EXCLUDE_NEWER}"
    "${SETTA_POLICY_PYTHON_BIN}" ./scripts/normalize_uv_lock.py ./uv.lock
  else
    uv lock --upgrade
  fi
fi

uv lock --check

if [ -n "${SETTA_MIN_RELEASE_AGE_DAYS:-}" ] && [ "${SETTA_MIN_RELEASE_AGE_DAYS}" -gt 0 ]; then
  "${SETTA_POLICY_PYTHON_BIN}" ./scripts/check_uv_lock_release_age.py \
    --days "${SETTA_MIN_RELEASE_AGE_DAYS}" \
    --lockfile ./uv.lock
fi

uv sync --frozen --all-extras --python "${SETTA_PYTHON_VERSION}"

. ./activate.sh
