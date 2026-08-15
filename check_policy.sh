#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
policy_dir="${repo_root}/.code-policy"

if [[ ! -x "${policy_dir}/bin/code-policy" ]]; then
  echo "Pinned code-policy checkout is missing at ${policy_dir}." >&2
  echo "Run: git submodule update --init --recursive" >&2
  exit 1
fi

export CODE_POLICY_REPO_ROOT="${repo_root}"
exec "${policy_dir}/bin/code-policy" "$@"
