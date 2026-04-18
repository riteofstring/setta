#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT="$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")"
OPEN_URL="0"
if [[ -n "${HOME:-}" ]]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"
SETTA_CLI_HELPER="${ROOT_DIR}/scripts/lib/setta_cli_command.sh"
if [[ ! -f "${SETTA_CLI_HELPER}" ]]; then
  echo "Missing Setta CLI helper: ${SETTA_CLI_HELPER}" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "${SETTA_CLI_HELPER}"

usage() {
  cat <<'EOF'
Usage: bootstrap-url.sh [--open]

Print the Setta bootstrap URL (with token) for the latest session.
Use --open to open the URL in the default browser.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --open)
      OPEN_URL="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -f "${ROOT_DIR}/activate.sh" ]]; then
  # shellcheck disable=SC1090
  source "${ROOT_DIR}/activate.sh"
fi

if [[ -z "${SETTA_HOME:-}" ]]; then
  export SETTA_HOME="${DEFAULT_SETTA_HOME}"
fi
if [[ -z "${SETTA_FILES_ROOT:-}" && -z "${SETTA_FILES_LOCATION:-}" ]]; then
  export SETTA_FILES_ROOT="${DEFAULT_SETTA_FILES_ROOT}"
fi

if ! setta_cli_command_init "${ROOT_DIR}"; then
  echo "Failed to resolve Setta CLI." >&2
  exit 1
fi

status_payload="$("${SETTA_CLI_CMD[@]}" status --connect-info --latest --json --workspace "${WORKTREE_ROOT}" 2>/dev/null || true)"
if [[ "$status_payload" != __SETTA_JSON_B64__* ]]; then
  echo "Failed to read bootstrap info from setta status." >&2
  exit 1
fi

b64_payload="${status_payload#__SETTA_JSON_B64__}"
bootstrap_url="$(
  SETTA_STATUS_B64="$b64_payload" python - <<'PY'
import base64
import json
import os
import sys

payload = os.environ.get("SETTA_STATUS_B64", "")
if not payload:
    sys.exit(1)
data = json.loads(base64.b64decode(payload).decode("utf-8"))
url = data.get("bootstrapUrlFragment", "") or data.get("bootstrapUrlPlain", "")
if url:
    print(url)
PY
)"

if [[ -z "$bootstrap_url" ]]; then
  echo "Bootstrap URL not found in setta status payload." >&2
  exit 1
fi

echo "$bootstrap_url"

if [[ "$OPEN_URL" == "1" ]]; then
  if command -v open >/dev/null 2>&1; then
    open "$bootstrap_url"
  else
    echo "open command not found; copy/paste the URL instead." >&2
    exit 1
  fi
fi
