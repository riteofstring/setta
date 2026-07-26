#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/test_sprites_live_measurement.sh init-manifest --state DIR --prefix PREFIX [--concurrency N]
  ./scripts/test_sprites_live_measurement.sh prepare --state DIR
  ./scripts/test_sprites_live_measurement.sh measure-COHORT --state DIR
  ./scripts/test_sprites_live_measurement.sh observe --state DIR
  ./scripts/test_sprites_live_measurement.sh cleanup --state DIR

Cohorts, run explicitly and in order:
  retained-filesystem, attached-idle, renewable-workload, terminal-build,
  terminal-build-preview, storage-checkpoints, hostile-cutoff, beta-concurrency

init-manifest is offline and creates an editable manifest in an empty absolute
state directory outside this repository. All other phases require
SETTA_LIVE_SPRITES=1 and refuse blank or expired owner authorization fields.
EOF
}

[[ $# -ge 1 ]] || { usage >&2; exit 1; }
phase="$1"
shift
case "${phase}" in
  init-manifest|prepare|observe|cleanup|measure-retained-filesystem|measure-attached-idle|measure-renewable-workload|measure-terminal-build|measure-terminal-build-preview|measure-storage-checkpoints|measure-hostile-cutoff|measure-beta-concurrency) ;;
  -h|--help) usage; exit 0 ;;
  *) echo "Unsupported phase: ${phase}" >&2; usage >&2; exit 1 ;;
esac

state_directory=""
runtime_prefix=""
concurrency="1"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --state)
      shift
      [[ $# -gt 0 ]] || { echo "--state requires a directory" >&2; exit 1; }
      state_directory="$1"
      shift
      ;;
    --prefix)
      shift
      [[ $# -gt 0 ]] || { echo "--prefix requires a value" >&2; exit 1; }
      runtime_prefix="$1"
      shift
      ;;
    --concurrency)
      shift
      [[ $# -gt 0 ]] || { echo "--concurrency requires a value" >&2; exit 1; }
      concurrency="$1"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ -n "${state_directory}" ]] || { echo "--state is required" >&2; exit 1; }
[[ -d "${state_directory}" ]] || { echo "State directory does not exist: ${state_directory}" >&2; exit 1; }
state_directory="$(cd "${state_directory}" && pwd -P)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
case "${state_directory}/" in
  "${repo_root}/"*) echo "State directory must be outside the repository: ${state_directory}" >&2; exit 1 ;;
esac

if [[ "${phase}" == "init-manifest" ]]; then
  [[ -n "${runtime_prefix}" ]] || { echo "--prefix is required for init-manifest" >&2; exit 1; }
  [[ "${concurrency}" =~ ^[1-9][0-9]*$ ]] || { echo "--concurrency must be a positive integer" >&2; exit 1; }
else
  [[ -z "${runtime_prefix}" ]] || { echo "--prefix is valid only for init-manifest" >&2; exit 1; }
  [[ "${concurrency}" == "1" ]] || { echo "--concurrency is valid only for init-manifest" >&2; exit 1; }
  [[ "${SETTA_LIVE_SPRITES:-}" == "1" ]] || {
    echo "Set SETTA_LIVE_SPRITES=1 after recording every manifest authorization prerequisite." >&2
    exit 1
  }
fi

resolve_sprite_token() {
  if [[ -n "${SPRITE_TOKEN:-}" ]]; then
    printf '%s' "${SPRITE_TOKEN}"
    return
  fi
  local config_file="${HOME}/.sprites/sprites.json"
  [[ -f "${config_file}" ]] || { echo "Sprites CLI configuration does not exist: ${config_file}" >&2; return 1; }
  command -v jq >/dev/null || { echo "jq is required." >&2; return 1; }
  command -v security >/dev/null || { echo "SPRITE_TOKEN is required when macOS security is unavailable." >&2; return 1; }
  local api_url organization keyring_key wrapped
  api_url="$(jq -r '.current_selection.url // empty' "${config_file}")"
  organization="$(jq -r '.current_selection.org // empty' "${config_file}")"
  [[ -n "${api_url}" && -n "${organization}" ]] || { echo "Sprites CLI has no current API URL and organization." >&2; return 1; }
  keyring_key="$({
    for user_config in "${HOME}"/.sprites/users/*.json; do
      [[ -f "${user_config}" ]] || continue
      jq -r --arg api_url "${api_url}" --arg organization "${organization}" \
        '.urls[$api_url].orgs[$organization].keyring_key // empty' "${user_config}"
    done
  } | sed -n '1p')"
  [[ -n "${keyring_key}" ]] || { echo "No Sprites keyring entry found for ${organization}." >&2; return 1; }
  wrapped="$(security find-generic-password -a "${keyring_key}" -w 2>/dev/null)"
  case "${wrapped}" in
    go-keyring-base64:*) printf '%s' "${wrapped#go-keyring-base64:}" | base64 --decode ;;
    *) echo "Unsupported Sprites credential encoding." >&2; return 1 ;;
  esac
}

sprite_bin="${HOME}/.local/bin/sprite"
[[ -x "${sprite_bin}" ]] || sprite_bin="$(command -v sprite || true)"
cli_version=""
if [[ -n "${sprite_bin}" ]]; then
  cli_version="$("${sprite_bin}" --version)"
fi
sdk_version="$("${repo_root}/scripts/go.sh" list -m -f '{{.Version}}' github.com/superfly/sprites-go)"
setta_commit="$(git -C "${repo_root}" rev-parse HEAD)"
run_id="${SETTA_SPRITES_PHASE1C_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"

if [[ "${phase}" != "init-manifest" ]]; then
  SPRITE_TOKEN="$(resolve_sprite_token)"
  export SPRITE_TOKEN
  [[ -n "${SPRITE_TOKEN}" ]] || { echo "Resolved Sprites token is empty." >&2; exit 1; }
fi

export SETTA_REPO_ROOT="${repo_root}"
export SETTA_SPRITES_PHASE1C_PHASE="${phase}"
export SETTA_SPRITES_PHASE1C_STATE="${state_directory}"
export SETTA_SPRITES_PHASE1C_RUN_ID="${run_id}"
export SETTA_SPRITES_PHASE1C_PREFIX="${runtime_prefix}"
export SETTA_SPRITES_PHASE1C_CONCURRENCY="${concurrency}"
export SETTA_SPRITES_CLI_VERSION="${cli_version}"
export SETTA_SPRITES_SDK_VERSION="${sdk_version}"
export SETTA_COMMIT="${setta_commit}"

cd "${repo_root}"
"${repo_root}/scripts/go.sh" test ./internal/sprites \
  -run '^TestLivePhase1CMeasurement$' \
  -count=1 \
  -v \
  -timeout 50m

printf 'phase1c phase=%s state=%s\n' "${phase}" "${state_directory}"
printf 'cleanup: SETTA_LIVE_SPRITES=1 %q cleanup --state %q\n' \
  "${repo_root}/scripts/test_sprites_live_measurement.sh" "${state_directory}"
