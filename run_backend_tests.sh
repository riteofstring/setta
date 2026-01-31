#!/usr/bin/env bash
set -euo pipefail

. ./activate.sh && pytest -vv -s -ra --durations=20 -o faulthandler_timeout=120
