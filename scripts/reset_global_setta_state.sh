#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/reset_global_setta_state.sh [--yes] [--dry-run]

Deletes the contents of Setta's default global state directories:
  ~/.setta

On macOS this also includes Setta Electron user-data directories under:
  ~/Library/Application Support/setta
  ~/Library/Application Support/setta-desktop

The script does not delete workspace-local .setta directories.

Options:
  --yes, -y   Delete the files. Without this flag the script only prints a dry run.
  --dry-run   Print what would be deleted and exit.
  --help, -h  Show this help.
USAGE
}

confirmed=0
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)
      confirmed=1
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --help|-h)
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

fail() {
  echo "reset_global_setta_state.sh: $1" >&2
  exit 1
}

home_dir="${HOME:-}"
[[ -n "${home_dir}" ]] || fail "HOME is not set"
[[ "${home_dir}" = /* ]] || fail "HOME must be absolute: ${home_dir}"
home_dir="${home_dir%/}"

target_dirs=("${home_dir}/.setta")
case "$(uname -s)" in
  Darwin)
    target_dirs+=(
      "${home_dir}/Library/Application Support/setta"
      "${home_dir}/Library/Application Support/setta-desktop"
    )
    ;;
  Linux)
    config_home="${XDG_CONFIG_HOME:-${home_dir}/.config}"
    if [[ "${config_home}" = /* ]]; then
      target_dirs+=(
        "${config_home}/setta"
        "${config_home}/setta-desktop"
      )
    fi
    ;;
esac

setta_backend_pattern='[s]etta-backend|go run \./cmd/[s]etta-backend|go\.sh run \./cmd/[s]etta-backend'
if command -v pgrep >/dev/null 2>&1; then
  if pgrep -f "${setta_backend_pattern}" >/dev/null; then
    echo "A Setta backend process appears to be running:" >&2
    pgrep -fl "${setta_backend_pattern}" >&2 || true
    fail "stop Setta before resetting global state"
  fi
fi

selected_entries=()
for target_dir in "${target_dirs[@]}"; do
  [[ "${target_dir}" = /* ]] || fail "target directory must be absolute: ${target_dir}"
  [[ "${target_dir}" != "/" ]] || fail "refusing to reset /"
  [[ "${target_dir}" != "${home_dir}" ]] || fail "refusing to reset HOME"

  case "${target_dir}" in
    "${home_dir}/.setta" | \
    "${home_dir}/Library/Application Support/setta" | \
    "${home_dir}/Library/Application Support/setta-desktop" | \
    "${XDG_CONFIG_HOME:-${home_dir}/.config}/setta" | \
    "${XDG_CONFIG_HOME:-${home_dir}/.config}/setta-desktop")
      ;;
    *)
      fail "unexpected reset target: ${target_dir}"
      ;;
  esac

  if [[ -L "${target_dir}" ]]; then
    fail "refusing to reset symlinked state directory: ${target_dir}"
  fi

  if [[ ! -e "${target_dir}" ]]; then
    continue
  fi
  [[ -d "${target_dir}" ]] || fail "target exists but is not a directory: ${target_dir}"

  shopt -s dotglob nullglob
  entries=("${target_dir}/"*)
  shopt -u dotglob nullglob
  if [[ ${#entries[@]} -eq 0 ]]; then
    continue
  fi
  selected_entries+=("${entries[@]}")
done

if [[ ${#selected_entries[@]} -eq 0 ]]; then
  echo "No global Setta state entries found; nothing to reset."
  echo "Checked:"
  printf '  %s\n' "${target_dirs[@]}"
  exit 0
fi

echo "Global Setta state directories checked:"
printf '  %s\n' "${target_dirs[@]}"
echo "Entries selected for deletion:"
printf '  %s\n' "${selected_entries[@]}"

if [[ "${dry_run}" -eq 1 || "${confirmed}" -ne 1 ]]; then
  echo
  echo "Dry run only. Re-run with --yes to delete these entries."
  exit 0
fi

rm -rf -- "${selected_entries[@]}"
echo "Reset global Setta state: deleted ${#selected_entries[@]} entries."
