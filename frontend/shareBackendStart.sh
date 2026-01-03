cd ..
. ./activate.sh

if [[ -z "${SETTA_SHARE_DEPLOYMENT_ROOT:-}" && -z "${SETTA_SHARE_DEPLOYMENT_ID:-}" ]]; then
  deployments_root="setta_files/share_deployments"
  if [[ -d "$deployments_root" ]]; then
    latest_deployment=$(ls -td "$deployments_root"/* 2>/dev/null | head -n 1)
    if [[ -n "${latest_deployment:-}" ]]; then
      export SETTA_SHARE_DEPLOYMENT_ROOT="$latest_deployment"
    else
      echo "No share deployments found under $deployments_root. Share backend will be idle." >&2
    fi
  else
    echo "No share deployments found under $deployments_root. Share backend will be idle." >&2
  fi
fi

PORT_ARGS=(--port 8001)
for arg in "$@"; do
  if [[ "$arg" == "--port" || "$arg" == "--port="* ]]; then
    PORT_ARGS=()
    break
  fi
done

SETTA_DEV_MODE="true" SETTA_SHARE_MODE="true" setta "${PORT_ARGS[@]}" "$@" --log-level debug
