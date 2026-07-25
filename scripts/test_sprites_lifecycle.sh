#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_id="${SETTA_SPRITES_LIVE_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
temporary_directory="$(mktemp -d)"

cleanup() {
  if [[ ! -d "${temporary_directory}" ]]; then
    return
  fi
  if command -v trash >/dev/null 2>&1; then
    if ! trash "${temporary_directory}"; then
      echo "Leaving temporary directory because trash failed: ${temporary_directory}" >&2
    fi
    return
  fi
  echo "Leaving temporary directory because trash is unavailable: ${temporary_directory}" >&2
}
trap cleanup EXIT

resolve_sprite_token() {
  if [[ -n "${SPRITE_TOKEN:-}" ]]; then
    printf '%s' "${SPRITE_TOKEN}"
    return
  fi

  local config_file="${HOME}/.sprites/sprites.json"
  [[ -f "${config_file}" ]] || {
    echo "SPRITE_TOKEN is unset and ${config_file} does not exist." >&2
    return 1
  }
  command -v jq >/dev/null || {
    echo "jq is required to load the existing Sprites CLI credential." >&2
    return 1
  }
  command -v security >/dev/null || {
    echo "SPRITE_TOKEN is required when the macOS security command is unavailable." >&2
    return 1
  }

  local api_url organization keyring_key wrapped
  api_url="$(jq -r '.current_selection.url // empty' "${config_file}")"
  organization="$(jq -r '.current_selection.org // empty' "${config_file}")"
  [[ -n "${api_url}" && -n "${organization}" ]] || {
    echo "Sprites CLI has no current API URL and organization." >&2
    return 1
  }

  keyring_key="$({
    for user_config in "${HOME}"/.sprites/users/*.json; do
      [[ -f "${user_config}" ]] || continue
      jq -r --arg api_url "${api_url}" --arg organization "${organization}" \
        '.urls[$api_url].orgs[$organization].keyring_key // empty' "${user_config}"
    done
  } | sed -n '1p')"
  [[ -n "${keyring_key}" ]] || {
    echo "No Sprites keyring entry was found for ${organization}." >&2
    return 1
  }

  wrapped="$(security find-generic-password -a "${keyring_key}" -w 2>/dev/null)"
  case "${wrapped}" in
    go-keyring-base64:*)
      printf '%s' "${wrapped#go-keyring-base64:}" | base64 --decode
      ;;
    *)
      echo "Unsupported Sprites keyring credential encoding." >&2
      return 1
      ;;
  esac
}

SPRITE_TOKEN="$(resolve_sprite_token)"
export SPRITE_TOKEN
[[ -n "${SPRITE_TOKEN}" ]] || {
  echo "Resolved Sprites token is empty." >&2
  exit 1
}

lease_probe="${temporary_directory}/setta-sprite-lease-probe"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  "${repo_root}/scripts/go.sh" build -trimpath -o "${lease_probe}" ./cmd/setta-sprite-lease-probe

export SETTA_LIVE_SPRITES=1
export SETTA_SPRITES_LIVE_RUN_ID="${run_id}"
export SETTA_SPRITES_LEASE_PROBE_BINARY="${lease_probe}"

cd "${repo_root}"
"${repo_root}/scripts/go.sh" test ./internal/sprites \
  -run '^TestLiveLifecycle$' \
  -count=1 \
  -v \
  -timeout 35m
