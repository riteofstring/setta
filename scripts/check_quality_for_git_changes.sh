#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/check_quality_for_git_changes.sh

Run ./check_quality.sh against the current repo changes instead of the default
staged-file set.

This helper collects:
- tracked files changed relative to HEAD
- untracked files in the worktree

Then it forwards that file list to:
  ./check_quality.sh --files <changed paths...>
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${1-}" == "-h" || "${1-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 1
fi

cd "${ROOT_DIR}"

declare -a changed_files=()

while IFS= read -r path; do
  [[ -n "${path}" ]] || continue
  changed_files+=("${path}")
done < <(
  {
    git diff --name-only --diff-filter=ACMR HEAD --
    git ls-files --others --exclude-standard
  } | LC_ALL=C sort -u
)

if [[ ${#changed_files[@]} -eq 0 ]]; then
  echo "No repo changes to check."
  exit 0
fi

exec "${ROOT_DIR}/check_quality.sh" --files "${changed_files[@]}"
