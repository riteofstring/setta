#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 >/dev/null 2>&1; then
  python_bin="python3"
elif command -v python >/dev/null 2>&1; then
  python_bin="python"
else
  echo "Python is required to run configure_supply_chain.sh." >&2
  exit 1
fi

exec "${python_bin}" "${repo_root}/scripts/configure_supply_chain.py" "$@"
