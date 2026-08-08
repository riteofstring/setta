#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup_on_exit() {
  (cd "${repo_root}" && ./cleanup.sh) || true
}

trap cleanup_on_exit EXIT

cd "${repo_root}"
. ./init_env.sh
./build.sh
python -m twine upload dist/*
