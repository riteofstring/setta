#!/bin/sh
set -e

# watchfiles==0.24.0 (PyO3 0.22.x) does not support Python 3.14 yet.
SETTA_PYTHON_VERSION="${SETTA_PYTHON_VERSION:-3.13}"

uv sync --all-extras --python "${SETTA_PYTHON_VERSION}"

. ./activate.sh
