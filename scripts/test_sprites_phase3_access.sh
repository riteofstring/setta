#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${SETTA_SPRITES_LIVE_RUN_ID:?SETTA_SPRITES_LIVE_RUN_ID is required}"
: "${SETTA_SPRITES_ORGANIZATION:?SETTA_SPRITES_ORGANIZATION is required}"
: "${SETTA_SPRITES_MAX_SPEND_USD:?SETTA_SPRITES_MAX_SPEND_USD is required}"
: "${SETTA_SPRITES_CLEANUP_DEADLINE:?SETTA_SPRITES_CLEANUP_DEADLINE is required}"

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
  [[ "${organization}" == "${SETTA_SPRITES_ORGANIZATION}" ]] || {
    echo "Selected Sprites organization ${organization} does not match ${SETTA_SPRITES_ORGANIZATION}." >&2
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

export SETTA_LIVE_SPRITES=1
export SETTA_LIVE_PHASE3_ACCESS=1

cd "${repo_root}"
"${repo_root}/scripts/go.sh" test ./internal/sprites \
  -run '^TestLivePhase3AccessComparison$' \
  -count=1 \
  -v \
  -timeout 35m
