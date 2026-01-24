#!/bin/sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
BASE_DIR=$(cd "${ROOT_DIR}/.." && pwd)

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <branch-name ...>" >&2
  echo "Example: $0 feature-auth-1 fix-realtime-2" >&2
  exit 1
fi

case "$1" in
  -h|--help)
    echo "Usage: $0 <branch-name ...>" >&2
    echo "Example: $0 feature-auth-1 fix-realtime-2" >&2
    exit 0
    ;;
esac

NAMES="$@"

for name in ${NAMES}; do
  case "${name}" in
    *[!A-Za-z0-9._-]*)
      echo "Branch name must use letters, digits, '.', '_' or '-': ${name}" >&2
      exit 1
      ;;
  esac

  WORKTREE_PATH="${BASE_DIR}/setta.${name}"
  BRANCH_NAME="${name}"

  if [ -e "${WORKTREE_PATH}" ]; then
    echo "Path already exists: ${WORKTREE_PATH}" >&2
    exit 1
  fi

  if git -C "${ROOT_DIR}" show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
    echo "Branch already exists: ${BRANCH_NAME}" >&2
    exit 1
  fi

  git -C "${ROOT_DIR}" worktree add -b "${BRANCH_NAME}" "${WORKTREE_PATH}" HEAD

  for env_file in .env .env.local .env.development.local .env.test.local .env.production.local; do
    if [ -f "${ROOT_DIR}/${env_file}" ] && [ ! -f "${WORKTREE_PATH}/${env_file}" ]; then
      cp "${ROOT_DIR}/${env_file}" "${WORKTREE_PATH}/${env_file}"
    fi
  done

  echo "Running dev install in ${WORKTREE_PATH}..."
  (
    cd "${WORKTREE_PATH}"
    . ./dev_install.sh
  )
done
