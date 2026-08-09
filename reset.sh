#!/bin/sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
exec "${SCRIPT_DIR}/scripts/run-dev-instance.sh" "$@" --mode reset
