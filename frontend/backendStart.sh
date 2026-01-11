cd ..
. ./activate.sh
# SETTA_DEV_MODE="true" setta "$@" # pass in other command line args

HOST_ARGS=(--host "${SETTA_HOST:-127.0.0.1}")
PORT_ARGS=(--port "${SETTA_PORT:-8000}")
for arg in "$@"; do
  if [[ "$arg" == "--host" || "$arg" == "--host="* ]]; then
    HOST_ARGS=()
  fi
  if [[ "$arg" == "--port" || "$arg" == "--port="* ]]; then
    PORT_ARGS=()
  fi
done

SETTA_DEV_MODE="true" setta "${HOST_ARGS[@]}" "${PORT_ARGS[@]}" "$@" --log-level debug
