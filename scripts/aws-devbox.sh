#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "${SCRIPT_DIR}/aws-devbox-common.sh"
setta_aws_devbox_bootstrap "${SCRIPT_DIR}"

if [ "$#" -eq 0 ]; then
    set -- status
fi

exec python "${SCRIPT_DIR}/aws_devbox.py" "$@"
