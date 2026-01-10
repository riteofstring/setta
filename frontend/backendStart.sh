cd ..
. ./activate.sh
# SETTA_DEV_MODE="true" setta "$@" # pass in other command line args

PORT_ARGS=(--port 8000)
for arg in "$@"; do
  if [[ "$arg" == "--port" || "$arg" == "--port="* ]]; then
    PORT_ARGS=()
    break
  fi
done

SETTA_DEV_MODE="true" setta "${PORT_ARGS[@]}" "$@" --log-level debug
