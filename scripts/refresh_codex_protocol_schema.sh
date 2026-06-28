#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
snapshot_dir="${repo_root}/internal/codexapp/protocolschema"
codex_repo="${CODEX_REPO:-${1:-}}"
expected_commit="$(awk -F': ' '$1 == "commit" { print $2 }' "${snapshot_dir}/UPSTREAM")"

if [[ -z "${codex_repo}" ]]; then
  echo "Usage: CODEX_REPO=/path/to/codex $0" >&2
  echo "   or: $0 /path/to/codex" >&2
  exit 1
fi
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

experimental_schema_root="$(mktemp -d)"
cleanup() {
  rm -rf "${experimental_schema_root}"
}
trap cleanup EXIT

cargo run \
  --manifest-path "${codex_repo}/codex-rs/Cargo.toml" \
  -p codex-app-server-protocol \
  --bin write_schema_fixtures \
  -- \
  --schema-root "${experimental_schema_root}" \
  --experimental

rm -rf "${snapshot_dir}/json" "${snapshot_dir}/json_experimental" "${snapshot_dir}/rust"
mkdir -p "${snapshot_dir}/json" "${snapshot_dir}/json_experimental/v2" "${snapshot_dir}/rust/protocol/v2"
cp -R "${schema_source}/." "${snapshot_dir}/json/"
cp "${experimental_schema_root}/json/v2/ThreadBackgroundTerminalsTerminateParams.json" "${snapshot_dir}/json_experimental/v2/ThreadBackgroundTerminalsTerminateParams.json"
cp "${experimental_schema_root}/json/v2/ThreadBackgroundTerminalsTerminateResponse.json" "${snapshot_dir}/json_experimental/v2/ThreadBackgroundTerminalsTerminateResponse.json"
cp "${experimental_schema_root}/json/v2/ThreadSettingsUpdateParams.json" "${snapshot_dir}/json_experimental/v2/ThreadSettingsUpdateParams.json"
cp "${common_source}" "${snapshot_dir}/rust/protocol/common.rs"
cp "${thread_source}" "${snapshot_dir}/rust/protocol/v2/thread.rs"

"${repo_root}/scripts/go.sh" run ./cmd/generate-codex-protocol
