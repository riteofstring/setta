#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/test_sprites_cold_soak.sh <prepare|observe|verify-due|cleanup> --state <temporary-directory>

The state directory must already exist, be outside the repository, and be empty
for prepare. Set SETTA_LIVE_SPRITES=1 to authorize live Sprites operations.

Example:
  state="$(mktemp -d "${TMPDIR:-/tmp}/setta-sprites-cold-soak.XXXXXX")"
  SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh prepare --state "${state}"
EOF
}

[[ $# -ge 1 ]] || { usage >&2; exit 1; }
phase="$1"
shift
case "${phase}" in
  prepare|observe|verify-due|cleanup) ;;
  -h|--help) usage; exit 0 ;;
  *) echo "Unsupported phase: ${phase}" >&2; usage >&2; exit 1 ;;
esac

state_directory=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --state)
      shift
      [[ $# -gt 0 ]] || { echo "--state requires a directory" >&2; exit 1; }
      state_directory="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

[[ "${SETTA_LIVE_SPRITES:-}" == "1" ]] || {
  echo "Set SETTA_LIVE_SPRITES=1 to authorize live, billable, destructive Sprites operations." >&2
  exit 1
}
[[ -n "${state_directory}" ]] || { echo "--state is required" >&2; exit 1; }
[[ -d "${state_directory}" ]] || { echo "State directory does not exist: ${state_directory}" >&2; exit 1; }
state_directory="$(cd "${state_directory}" && pwd -P)"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
case "${state_directory}/" in
  "${repo_root}/"*)
    echo "State directory must be outside the repository: ${state_directory}" >&2
    exit 1
    ;;
esac

config_file="${HOME}/.sprites/sprites.json"
[[ -f "${config_file}" ]] || {
  echo "Sprites CLI configuration does not exist: ${config_file}" >&2
  exit 1
}
command -v jq >/dev/null || { echo "jq is required." >&2; exit 1; }

api_url="$(jq -r '.current_selection.url // empty' "${config_file}")"
organization="$(jq -r '.current_selection.org // empty' "${config_file}")"
[[ -n "${api_url}" && -n "${organization}" ]] || {
  echo "Sprites CLI has no current API URL and organization." >&2
  exit 1
}
[[ "${organization}" == "setta-100" ]] || {
  echo "Refusing Sprites organization ${organization}; select the dedicated setta-100 organization." >&2
  exit 1
}

resolve_sprite_token() {
  if [[ -n "${SPRITE_TOKEN:-}" ]]; then
    printf '%s' "${SPRITE_TOKEN}"
    return
  fi
  command -v security >/dev/null || {
    echo "SPRITE_TOKEN is required when the macOS security command is unavailable." >&2
    return 1
  }

  local keyring_key wrapped
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

sprite_bin="${HOME}/.local/bin/sprite"
[[ -x "${sprite_bin}" ]] || sprite_bin="$(command -v sprite || true)"
[[ -n "${sprite_bin}" ]] || { echo "sprite CLI not found." >&2; exit 1; }
cli_version="$("${sprite_bin}" --version)"
sdk_version="$("${repo_root}/scripts/go.sh" list -m -f '{{.Version}}' github.com/superfly/sprites-go)"
[[ -n "${sdk_version}" ]] || { echo "Pinned Sprites SDK version is unavailable." >&2; exit 1; }

SPRITE_TOKEN="$(resolve_sprite_token)"
export SPRITE_TOKEN
[[ -n "${SPRITE_TOKEN}" ]] || { echo "Resolved Sprites token is empty." >&2; exit 1; }

run_id=""
if [[ "${phase}" == "prepare" ]]; then
  run_id="${SETTA_SPRITES_COLD_SOAK_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
fi

export SETTA_LIVE_SPRITES=1
export SETTA_REPO_ROOT="${repo_root}"
export SETTA_SPRITES_EXPECTED_ORG="${organization}"
export SETTA_SPRITES_CLI_VERSION="${cli_version}"
export SETTA_SPRITES_SDK_VERSION="${sdk_version}"
export SETTA_SPRITES_COLD_SOAK_PHASE="${phase}"
export SETTA_SPRITES_COLD_SOAK_STATE="${state_directory}"
export SETTA_SPRITES_COLD_SOAK_RUN_ID="${run_id}"

cd "${repo_root}"
"${repo_root}/scripts/go.sh" test ./internal/sprites \
  -run '^TestLiveConfirmedColdSoak$' \
  -count=1 \
  -v \
  -timeout 40m

printf 'cold-soak phase=%s state=%s\n' "${phase}" "${state_directory}"
printf 'emergency cleanup: SETTA_LIVE_SPRITES=1 %q cleanup --state %q\n' \
  "${repo_root}/scripts/test_sprites_cold_soak.sh" "${state_directory}"
