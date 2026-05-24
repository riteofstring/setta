#!/bin/sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

if [ "${1:-}" = "--nochrome" ]; then
  shift
  exec "${SCRIPT_DIR}/scripts/aws-devbox-remote.sh" "$@"
fi

attach_flag_present=0
for arg in "$@"; do
  case "${arg}" in
    --attach|--no-attach)
      attach_flag_present=1
      ;;
  esac
done

if [ "${attach_flag_present}" -ne 1 ] && [ -z "${SETTA_AWS_DEVBOX_ATTACH_REMOTE_SESSION+x}" ]; then
  set -- "$@" "--attach"
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
