#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
snapshot_dir="${repo_root}/internal/codexapp/protocolschema"
codex_repo="${CODEX_REPO:-${1:-/Users/kevin/Documents/AppDevelopment/reference_repos/codex}}"
expected_commit="$(awk -F': ' '$1 == "commit" { print $2 }' "${snapshot_dir}/UPSTREAM")"

if [[ -z "${expected_commit}" ]]; then
  echo "internal/codexapp/protocolschema/UPSTREAM is missing commit metadata" >&2
  exit 1
fi
if [[ ! -d "${codex_repo}/.git" ]]; then
  echo "Codex repo not found: ${codex_repo}" >&2
  exit 1
fi

actual_commit="$(git -C "${codex_repo}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${expected_commit}" ]]; then
  echo "Codex repo is at ${actual_commit}, expected ${expected_commit}" >&2
  exit 1
fi

schema_source="${codex_repo}/codex-rs/app-server-protocol/schema/json"
common_source="${codex_repo}/codex-rs/app-server-protocol/src/protocol/common.rs"
thread_source="${codex_repo}/codex-rs/app-server-protocol/src/protocol/v2/thread.rs"

for path in "${schema_source}" "${common_source}" "${thread_source}"; do
  if [[ ! -e "${path}" ]]; then
    echo "Required Codex protocol source is missing: ${path}" >&2
    exit 1
  fi
done

rm -rf "${snapshot_dir}/json" "${snapshot_dir}/rust"
mkdir -p "${snapshot_dir}/json" "${snapshot_dir}/rust/protocol/v2"
cp -R "${schema_source}/." "${snapshot_dir}/json/"
cp "${common_source}" "${snapshot_dir}/rust/protocol/common.rs"
cp "${thread_source}" "${snapshot_dir}/rust/protocol/v2/thread.rs"

"${repo_root}/scripts/go.sh" run ./cmd/generate-codex-protocol
