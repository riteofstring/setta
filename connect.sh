#!/bin/sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

if [ -z "${SETTA_AWS_DEVBOX_ATTACH_REMOTE_SESSION+x}" ]; then
  SETTA_AWS_DEVBOX_ATTACH_REMOTE_SESSION=0
  export SETTA_AWS_DEVBOX_ATTACH_REMOTE_SESSION
fi

exec "${SCRIPT_DIR}/remote.sh" "$@"
