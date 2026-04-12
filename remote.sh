#!/bin/sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

if [ "${1:-}" = "--nochrome" ]; then
  shift
  exec "${SCRIPT_DIR}/scripts/aws-devbox-remote.sh" "$@"
fi

lifecycle=ai
if [ "${1:-}" = "reset" ]; then
  lifecycle=aireset
  shift
fi

case "${1:-}" in
  "")
    exec "${SCRIPT_DIR}/scripts/aws-devbox-remote-runtime.sh" "${lifecycle}" select
    ;;
  select|worktree|local)
    exec "${SCRIPT_DIR}/scripts/aws-devbox-remote-runtime.sh" "${lifecycle}" "$@"
    ;;
  *)
    exec "${SCRIPT_DIR}/scripts/aws-devbox-remote-runtime.sh" "${lifecycle}" select "$@"
    ;;
esac
