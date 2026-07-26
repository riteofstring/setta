#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${repo_root}/scripts/build_local_macos_voice_helper.sh"
node "${repo_root}/desktop/tests/native/local-macos-voice-helper-integration.test.mjs"
