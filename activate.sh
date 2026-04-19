#!/usr/bin/env bash

# This script is meant to be sourced so it can activate the current shell.
# Do not enable shell-wide strict flags here; they would leak into the caller.

usage() {
  cat <<'EOF'
Usage: source ./activate.sh

Activates the repo-local Python environment in ./.venv.

If the environment does not exist yet, create it first with one of:
  . ./init_env.sh
  . ./dev_install_python.sh
EOF
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
venv_activate_path="${script_dir}/.venv/bin/activate"

is_sourced=0
if [[ -n "${ZSH_EVAL_CONTEXT-}" ]]; then
  case "${ZSH_EVAL_CONTEXT}" in
    *:file) is_sourced=1 ;;
  esac
elif [[ -n "${BASH_VERSION-}" ]]; then
  if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    is_sourced=1
  fi
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  return 0 2>/dev/null || exit 0
fi

if [[ "${is_sourced}" -eq 0 ]]; then
  echo "This script must be sourced to activate your current shell." >&2
  echo "Run: source ./activate.sh" >&2
  exit 1
fi

if [[ ! -f "${venv_activate_path}" ]]; then
  echo "Python environment not found at: ${venv_activate_path}" >&2
  echo "Create it first with: . ./init_env.sh" >&2
  echo "Or, for the full Python-enabled dev setup: . ./dev_install_python.sh" >&2
  return 1
fi

# shellcheck disable=SC1090
source "${venv_activate_path}"
