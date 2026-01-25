cd ..
. ./activate.sh
# SETTA_DEV_MODE="true" setta "$@" # pass in other command line args

HOST_ARGS=(--host "${SETTA_HOST:-127.0.0.1}")
PORT_ARGS=(--port "${SETTA_PORT:-8000}")
NO_OPEN_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--host" || "$arg" == "--host="* ]]; then
    HOST_ARGS=()
  fi
  if [[ "$arg" == "--port" || "$arg" == "--port="* ]]; then
    PORT_ARGS=()
  fi
done
if [[ "${SETTA_NO_OPEN:-}" == "1" || "${SETTA_NO_OPEN:-}" == "true" ]]; then
  NO_OPEN_ARGS=(--no-open)
fi

SETTA_DEV_MODE="true" setta "${HOST_ARGS[@]}" "${PORT_ARGS[@]}" "${NO_OPEN_ARGS[@]}" "$@" --log-level debug
