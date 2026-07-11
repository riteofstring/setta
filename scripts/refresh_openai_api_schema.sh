#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
snapshot_dir="${repo_root}/internal/speech/openaischema"
openai_repo="${OPENAI_OPENAPI_REPO:-${1:-}}"
expected_commit="$(awk -F': ' '$1 == "commit" { print $2 }' "${snapshot_dir}/UPSTREAM")"

if [[ -z "${openai_repo}" ]]; then
  echo "Usage: OPENAI_OPENAPI_REPO=/path/to/openai-openapi $0" >&2
  echo "   or: $0 /path/to/openai-openapi" >&2
  exit 1
fi
if [[ -z "${expected_commit}" ]]; then
  echo "internal/speech/openaischema/UPSTREAM is missing commit metadata" >&2
  exit 1
fi
if [[ ! -d "${openai_repo}/.git" ]]; then
  echo "OpenAI OpenAPI repo not found: ${openai_repo}" >&2
  exit 1
fi

actual_commit="$(git -C "${openai_repo}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${expected_commit}" ]]; then
  echo "OpenAI OpenAPI repo is at ${actual_commit}, expected ${expected_commit}" >&2
  exit 1
fi

schema_source="${openai_repo}/openapi.yaml"
if [[ ! -f "${schema_source}" ]]; then
  echo "Required OpenAI OpenAPI source is missing: ${schema_source}" >&2
  exit 1
fi

cp "${schema_source}" "${snapshot_dir}/openapi.yaml"
"${repo_root}/scripts/go.sh" run ./cmd/generate-openai-contracts
