#!/bin/sh
set -e

# watchfiles==0.24.0 (PyO3 0.22.x) does not support Python 3.14 yet.
SETTA_PYTHON_VERSION="${SETTA_PYTHON_VERSION:-3.13}"

# Repo-local source/dev installs intentionally pull the broader Python surface
# that still backs dev reload/test workflows. The packaged user install path is
# now narrower and does not use these extras.
uv sync \
  --extra source \
  --extra dev \
  --extra gemini \
  --python "${SETTA_PYTHON_VERSION}"

. ./activate.sh
