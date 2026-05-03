#!/usr/bin/env bash
set -euo pipefail

MIN_MAJOR="${SETTA_CHROME_FOR_TESTING_MIN_MAJOR:-149}"
CHANNEL="${SETTA_CHROME_FOR_TESTING_CHANNEL:-Canary}"

if [[ -n "${SETTA_CHROME_FOR_TESTING_CACHE:-}" ]]; then
  CACHE_ROOT="${SETTA_CHROME_FOR_TESTING_CACHE}"
elif [[ -n "${XDG_CACHE_HOME:-}" ]]; then
  CACHE_ROOT="${XDG_CACHE_HOME}/setta/chrome-for-testing"
elif [[ "${OSTYPE:-}" == "darwin"* && -n "${HOME:-}" ]]; then
  CACHE_ROOT="${HOME}/Library/Caches/setta/chrome-for-testing"
else
  CACHE_ROOT="${HOME:-/tmp}/.cache/setta/chrome-for-testing"
fi

case "$(uname -s)" in
  Darwin)
    case "$(uname -m)" in
      arm64) PLATFORM="mac-arm64" ;;
      x86_64) PLATFORM="mac-x64" ;;
      *)
        echo "Unsupported macOS architecture: $(uname -m)" >&2
        exit 1
        ;;
    esac
    ;;
  Linux)
    PLATFORM="linux64"
    ;;
  *)
    echo "Unsupported OS for Chrome for Testing resolver: $(uname -s)" >&2
    exit 1
    ;;
esac

resolve_python() {
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s\n' "python"
    return 0
  fi
  return 1
}

PYTHON_BIN="$(resolve_python || true)"
if [[ -z "${PYTHON_BIN}" ]]; then
  echo "Could not find Python for Chrome for Testing resolution." >&2
  exit 1
fi

read -r VERSION DOWNLOAD_URL < <(
  "${PYTHON_BIN}" - "${CHANNEL}" "${PLATFORM}" "${MIN_MAJOR}" <<'PY'
import json
import sys
import urllib.request

channel, platform, min_major = sys.argv[1], sys.argv[2], int(sys.argv[3])
url = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
data = json.load(urllib.request.urlopen(url, timeout=20))
try:
    info = data["channels"][channel]
except KeyError as exc:
    raise SystemExit(f"Unknown Chrome for Testing channel: {channel}") from exc
version = info["version"]
major = int(version.split(".", 1)[0])
if major < min_major:
    raise SystemExit(
        f"Chrome for Testing {channel} is {version}; need {min_major}+ for scaled html-in-canvas subrect uploads."
    )
for download in info["downloads"]["chrome"]:
    if download["platform"] == platform:
        print(version, download["url"])
        break
else:
    raise SystemExit(f"No Chrome for Testing download for {platform} on {channel}.")
PY
)

INSTALL_DIR="${CACHE_ROOT}/${CHANNEL}/${VERSION}/${PLATFORM}"
ZIP_PATH="${INSTALL_DIR}/chrome.zip"

case "${PLATFORM}" in
  mac-*)
    CHROME_BIN="${INSTALL_DIR}/chrome-${PLATFORM}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    ;;
  linux64)
    CHROME_BIN="${INSTALL_DIR}/chrome-linux64/chrome"
    ;;
esac

if [[ ! -x "${CHROME_BIN}" ]]; then
  mkdir -p "${INSTALL_DIR}"
  if [[ ! -f "${ZIP_PATH}" ]]; then
    curl -L --fail --progress-bar -o "${ZIP_PATH}" "${DOWNLOAD_URL}"
  fi
  rm -rf "${INSTALL_DIR}/chrome-${PLATFORM}"
  unzip -q "${ZIP_PATH}" -d "${INSTALL_DIR}"
fi

if [[ ! -x "${CHROME_BIN}" ]]; then
  echo "Chrome for Testing download did not produce an executable at ${CHROME_BIN}." >&2
  exit 1
fi

printf '%s\n' "${CHROME_BIN}"
