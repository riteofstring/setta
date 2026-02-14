ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
. ./activate.sh

# Default dev log file is backend.log, but allow wrappers (ai.sh) to isolate logs.
LOG_FILE="${SETTA_BACKEND_LOG_FILE:-${ROOT_DIR}/backend.log}"
mkdir -p "$(dirname "${LOG_FILE}")"
: > "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1
# SETTA_DEV_MODE="true" setta "$@" # pass in other command line args
SETTA_BIN="${SETTA_BIN:-setta}"

HOST_ARGS=(--host "${SETTA_HOST:-127.0.0.1}")
PORT_ARGS=(--port "${SETTA_PORT:-8000}")
NO_OPEN_ARGS=()
PROFILE_ARGS=()
SETTA_HOME_ARGS=()
SETTA_FILES_ROOT_ARGS=()
SETTA_FILES_LOCATION_ARGS=()
RUNTIME_ROOT_ARGS=()

if [[ -n "${SETTA_PROFILE:-}" ]]; then
  PROFILE_ARGS=(--profile "${SETTA_PROFILE}")
fi
if [[ -n "${SETTA_HOME:-}" ]]; then
  SETTA_HOME_ARGS=(--setta-home "${SETTA_HOME}")
fi
if [[ -n "${SETTA_FILES_ROOT:-}" ]]; then
  SETTA_FILES_ROOT_ARGS=(--setta-files-root "${SETTA_FILES_ROOT}")
fi
if [[ -n "${SETTA_FILES_LOCATION:-}" ]]; then
  SETTA_FILES_LOCATION_ARGS=(--setta-files-location "${SETTA_FILES_LOCATION}")
fi
if [[ -n "${SETTA_RUNTIME_ROOT:-}" ]]; then
  RUNTIME_ROOT_ARGS=(--runtime-root "${SETTA_RUNTIME_ROOT}")
fi
for arg in "$@"; do
  if [[ "$arg" == "--host" || "$arg" == "--host="* ]]; then
    HOST_ARGS=()
  fi
  if [[ "$arg" == "--port" || "$arg" == "--port="* ]]; then
    PORT_ARGS=()
  fi
  if [[ "$arg" == "--profile" || "$arg" == "--profile="* ]]; then
    PROFILE_ARGS=()
  fi
  if [[ "$arg" == "--setta-home" || "$arg" == "--setta-home="* ]]; then
    SETTA_HOME_ARGS=()
  fi
  if [[ "$arg" == "--setta-files-root" || "$arg" == "--setta-files-root="* ]]; then
    SETTA_FILES_ROOT_ARGS=()
  fi
  if [[ "$arg" == "--setta-files-location" || "$arg" == "--setta-files-location="* ]]; then
    SETTA_FILES_LOCATION_ARGS=()
  fi
  if [[ "$arg" == "--runtime-root" || "$arg" == "--runtime-root="* ]]; then
    RUNTIME_ROOT_ARGS=()
  fi
done
if [[ "${SETTA_NO_OPEN:-}" == "1" || "${SETTA_NO_OPEN:-}" == "true" ]]; then
  NO_OPEN_ARGS=(--no-open)
fi
if [[ "${#SETTA_FILES_ROOT_ARGS[@]}" -gt 0 && "${#SETTA_FILES_LOCATION_ARGS[@]}" -gt 0 ]]; then
  # Explicit root is authoritative.
  SETTA_FILES_LOCATION_ARGS=()
fi

SETTA_DEV_MODE="true" "${SETTA_BIN}" \
  "${HOST_ARGS[@]}" \
  "${PORT_ARGS[@]}" \
  "${NO_OPEN_ARGS[@]}" \
  "${PROFILE_ARGS[@]}" \
  "${SETTA_HOME_ARGS[@]}" \
  "${SETTA_FILES_ROOT_ARGS[@]}" \
  "${SETTA_FILES_LOCATION_ARGS[@]}" \
  "${RUNTIME_ROOT_ARGS[@]}" \
  "$@" \
  --log-level debug
