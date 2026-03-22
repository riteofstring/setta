#!/bin/sh
set -e

# watchfiles==0.24.0 (PyO3 0.22.x) does not support Python 3.14 yet.
SETTA_PYTHON_VERSION="${SETTA_PYTHON_VERSION:-3.13}"

# Repo-local source/dev installs intentionally pull the retained Python SDK,
# source-only helpers, and repo test/release tooling. The packaged user install
# path is narrower and does not use these extras.
uv sync \
  --extra source \
  --extra dev \
  --python "${SETTA_PYTHON_VERSION}"

. ./activate.sh
