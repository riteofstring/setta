#!/usr/bin/env sh
set -eu

SETTA_BIN="${SETTA_BIN:-setta}"

"$SETTA_BIN" version --json >/dev/null
"$SETTA_BIN" commands --json >/dev/null
"$SETTA_BIN" help workspace open --json >/dev/null
"$SETTA_BIN" schema workspace open --json >/dev/null
"$SETTA_BIN" errors --json >/dev/null

printf '%s\n' "setta CLI discovery smoke test passed"
