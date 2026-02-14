#!/bin/sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
rm -rf "${SCRIPT_DIR}/setta_files"
exec "${SCRIPT_DIR}/ai.sh" "$@"
