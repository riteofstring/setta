ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
. ./activate.sh

SETTA_PATH_FLAGS_HELPER="${ROOT_DIR}/scripts/lib/setta_path_flags.sh"
if [[ ! -f "${SETTA_PATH_FLAGS_HELPER}" ]]; then
  echo "Missing Setta path flags helper: ${SETTA_PATH_FLAGS_HELPER}" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "${SETTA_PATH_FLAGS_HELPER}"

# Default dev log file is backend.log, but allow wrappers (ai.sh) to isolate logs.
LOG_FILE="${SETTA_BACKEND_LOG_FILE:-${ROOT_DIR}/backend.log}"
mkdir -p "$(dirname "${LOG_FILE}")"
: > "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1
SETTA_PYTHON_BIN="${SETTA_PYTHON_BIN:-python}"
SETTA_CMD=()

HOST_ARGS=(--host "${SETTA_HOST:-127.0.0.1}")
PORT_ARGS=(--port "${SETTA_PORT:-8000}")
NO_OPEN_ARGS=()
PROFILE_ARGS=()
SETTA_HOME_ARGS=()
SETTA_FILES_ROOT_ARGS=()
SETTA_FILES_LOCATION_ARGS=()
RUNTIME_ROOT_ARGS=()
CLI_PROFILE=0
CLI_SETTA_HOME=0
CLI_SETTA_FILES_ROOT=0
CLI_SETTA_FILES_LOCATION=0
CLI_RUNTIME_ROOT=0
CLI_RELOAD=0

setta_path_flags_init "${SETTA_HOME:-}" "${SETTA_FILES_ROOT:-}"
setta_path_flags_seed_from_env

remaining=("$@")
while [[ "${#remaining[@]}" -gt 0 ]]; do
  arg="${remaining[0]}"
  if setta_path_flags_try_parse "${remaining[@]}"; then
    case "${arg}" in
      --profile|--profile=*)
        CLI_PROFILE=1
        ;;
      --setta-home|--setta-home=*)
        CLI_SETTA_HOME=1
        ;;
      --setta-files-root|--setta-files-root=*)
        CLI_SETTA_FILES_ROOT=1
        ;;
      --setta-files-location|--setta-files-location=*)
        CLI_SETTA_FILES_LOCATION=1
        ;;
      --runtime-root|--runtime-root=*)
        CLI_RUNTIME_ROOT=1
        ;;
    esac
    consumed="${SETTA_PATH_FLAGS_CONSUMED}"
    remaining=("${remaining[@]:${consumed}}")
    continue
  fi
  if [[ "$arg" == "--host" || "$arg" == "--host="* ]]; then
    HOST_ARGS=()
  fi
  if [[ "$arg" == "--port" || "$arg" == "--port="* ]]; then
    PORT_ARGS=()
  fi
  if [[ "$arg" == "--reload" ]]; then
    CLI_RELOAD=1
  fi
  remaining=("${remaining[@]:1}")
done

setta_path_flags_validate
setta_path_flags_apply_env

if [[ "${SETTA_NO_OPEN:-}" == "1" || "${SETTA_NO_OPEN:-}" == "true" ]]; then
  NO_OPEN_ARGS=(--no-open)
fi

if [[ "${CLI_PROFILE}" -eq 0 && -n "${SETTA_PROFILE:-}" ]]; then
  PROFILE_ARGS=(--profile "${SETTA_PROFILE}")
fi
if [[ "${CLI_SETTA_HOME}" -eq 0 && -n "${SETTA_HOME:-}" ]]; then
  SETTA_HOME_ARGS=(--setta-home "${SETTA_HOME}")
fi
if [[ "${CLI_SETTA_FILES_ROOT}" -eq 0 && "${CLI_SETTA_FILES_LOCATION}" -eq 0 ]]; then
  if [[ -n "${SETTA_FILES_ROOT:-}" ]]; then
    SETTA_FILES_ROOT_ARGS=(--setta-files-root "${SETTA_FILES_ROOT}")
  elif [[ -n "${SETTA_FILES_LOCATION:-}" ]]; then
    SETTA_FILES_LOCATION_ARGS=(--setta-files-location "${SETTA_FILES_LOCATION}")
  fi
fi
if [[ "${CLI_RUNTIME_ROOT}" -eq 0 && -n "${SETTA_RUNTIME_ROOT:-}" ]]; then
  RUNTIME_ROOT_ARGS=(--runtime-root "${SETTA_RUNTIME_ROOT}")
fi

if [[ -n "${SETTA_BIN:-}" ]]; then
  SETTA_CMD=("${SETTA_BIN}")
elif [[ "${CLI_RELOAD}" -eq 1 ]]; then
  # Reload is still a deliberate dev-only legacy path until the Go CLI owns it.
  SETTA_CMD=("${SETTA_PYTHON_BIN}" "-m" "setta.legacy_start_entrypoint")
else
  # Avoid the stale venv `setta` shim and route through the current entrypoint.
  SETTA_CMD=("${SETTA_PYTHON_BIN}" "-m" "setta")
fi

SETTA_DEV_MODE="true" "${SETTA_CMD[@]}" \
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
