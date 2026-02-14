#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install_built_setta.sh [--install-root PATH]

Builds the Setta package from this repo and installs it into an independent uv
virtual environment.

Options:
  --install-root PATH   Target venv path.
                        Default: .venv_for_built_setta
  -h, --help            Show this help message.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install_root_helper="${repo_root}/scripts/lib/install_root_path.sh"

if [[ ! -f "${install_root_helper}" ]]; then
  echo "Missing install root helper: ${install_root_helper}" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "${install_root_helper}"

cleanup_on_exit() {
  (cd "$repo_root" && ./cleanup.sh) || true
}

trap cleanup_on_exit EXIT

install_root=".venv_for_built_setta"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-root)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --install-root" >&2
        usage
        exit 1
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
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

install_root_abs="$(setta_resolve_install_root "${install_root}")"
mkdir -p "$(dirname "${install_root_abs}")"

cd "$repo_root"
./build.sh

shopt -s nullglob
wheels=(dist/*.whl)
shopt -u nullglob
if (( ${#wheels[@]} == 0 )); then
  echo "No wheel found in dist/ after build." >&2
  exit 1
fi
wheel_path="$(ls -t "${wheels[@]}" | head -n 1)"

uv venv --clear --python 3.12 "$install_root_abs"
uv pip install --python "$install_root_abs/bin/python" --force-reinstall "$wheel_path"

echo "Installed built Setta into: $install_root_abs"
echo "Activate with: source ./activate_built_setta.sh --install-root \"$install_root_abs\""
echo "After activation, built Setta defaults to:"
echo "  SETTA_HOME=~/.setta"
echo "  SETTA_FILES_LOCATION=local (workspace ./setta_files)"
