#!/usr/bin/env bash

# This script is meant to be sourced. Do not enable shell-wide strict flags here
# (set -e/-u/-o pipefail), because they would leak into the caller's shell.

usage() {
  cat <<'EOF'
Usage: source ./activate_built_setta.sh [--install-root PATH]

Activates the independent uv environment created for a built Setta install.

Options:
  --install-root PATH   Target venv path.
                        Default: .venv_for_built_setta
  -h, --help            Show this help message.
EOF
}

install_root=".venv_for_built_setta"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-root)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --install-root" >&2
        usage
        return 1 2>/dev/null || exit 1
      fi
      install_root="$2"
      shift 2
      ;;
    --install-root=*)
      install_root="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      return 0 2>/dev/null || exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      return 1 2>/dev/null || exit 1
      ;;
  esac
done

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

if [[ "$is_sourced" -eq 0 ]]; then
  echo "This script must be sourced to activate your current shell." >&2
  echo "Run: source ./activate_built_setta.sh --install-root \"$install_root\"" >&2
  exit 1
fi

if [[ ! -f "$install_root/bin/activate" ]]; then
  echo "Environment not found at: $install_root" >&2
  echo "Create it first with: ./install_built_setta.sh --install-root \"$install_root\"" >&2
  return 1
fi

# shellcheck disable=SC1090
source "$install_root/bin/activate"

if [[ -n "${HOME:-}" ]]; then
  export SETTA_HOME="${HOME}/.setta"
fi
export SETTA_FILES_LOCATION="local"
unset SETTA_PROFILE
unset SETTA_FILES_ROOT
unset SETTA_RUNTIME_ROOT

echo "Built Setta environment activated."
echo "Built defaults configured:"
echo "  SETTA_HOME=${SETTA_HOME:-<unchanged>}"
echo "  SETTA_FILES_LOCATION=local (workspace ./setta_files)"
