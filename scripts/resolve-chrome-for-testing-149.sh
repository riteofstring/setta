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

chrome_bin_for_install_dir() {
  local install_dir="$1"

  case "${PLATFORM}" in
    mac-*)
      printf '%s\n' "${install_dir}/chrome-${PLATFORM}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
      ;;
    linux64)
      printf '%s\n' "${install_dir}/chrome-linux64/chrome"
      ;;
  esac
}

version_major() {
  local version="$1"
  printf '%s\n' "${version%%.*}"
}

version_is_supported() {
  local version="$1"
  local major=""

  major="$(version_major "${version}")"
  [[ "${major}" =~ ^[0-9]+$ ]] || return 1
  [[ "${major}" -ge "${MIN_MAJOR}" ]]
}

version_is_greater() {
  local candidate="$1"
  local current="$2"
  local index=0
  local candidate_part=""
  local current_part=""
  local candidate_parts=()
  local current_parts=()

  if [[ -z "${current}" ]]; then
    return 0
  fi

  IFS=. read -r -a candidate_parts <<< "${candidate}"
  IFS=. read -r -a current_parts <<< "${current}"
  for ((index = 0; index < 4; index += 1)); do
    candidate_part="${candidate_parts[${index}]:-0}"
    current_part="${current_parts[${index}]:-0}"
    [[ "${candidate_part}" =~ ^[0-9]+$ ]] || candidate_part="0"
    [[ "${current_part}" =~ ^[0-9]+$ ]] || current_part="0"
    if [[ "${candidate_part}" -gt "${current_part}" ]]; then
      return 0
    fi
    if [[ "${candidate_part}" -lt "${current_part}" ]]; then
      return 1
    fi
  done

  return 1
}

find_cached_chrome_bin() {
  local channel_dir="${CACHE_ROOT}/${CHANNEL}"
  local candidate_dir=""
  local candidate_version=""
  local candidate_bin=""
  local selected_bin=""
  local selected_version=""

  [[ -d "${channel_dir}" ]] || return 1
  for candidate_dir in "${channel_dir}"/*/"${PLATFORM}"; do
    [[ -d "${candidate_dir}" ]] || continue
    candidate_version="$(basename "$(dirname "${candidate_dir}")")"
    if ! version_is_supported "${candidate_version}"; then
      continue
    fi
    candidate_bin="$(chrome_bin_for_install_dir "${candidate_dir}")"
    if [[ ! -x "${candidate_bin}" ]]; then
      continue
    fi
    if version_is_greater "${candidate_version}" "${selected_version}"; then
      selected_version="${candidate_version}"
      selected_bin="${candidate_bin}"
    fi
  done

  [[ -n "${selected_bin}" ]] || return 1
  printf '%s\n' "${selected_bin}"
}

if CACHED_CHROME_BIN="$(find_cached_chrome_bin)"; then
  printf '%s\n' "${CACHED_CHROME_BIN}"
  exit 0
fi

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
try:
    data = json.load(urllib.request.urlopen(url, timeout=20))
except Exception as exc:
    raise SystemExit(f"Failed to resolve Chrome for Testing metadata from {url}: {exc}") from exc
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
CHROME_BIN="$(chrome_bin_for_install_dir "${INSTALL_DIR}")"

if [[ ! -x "${CHROME_BIN}" ]]; then
  mkdir -p "${INSTALL_DIR}"
  if [[ ! -f "${ZIP_PATH}" ]]; then
    curl -L --fail --connect-timeout 20 --max-time 300 --progress-bar -o "${ZIP_PATH}" "${DOWNLOAD_URL}"
  fi
  rm -rf "${INSTALL_DIR}/chrome-${PLATFORM}"
  unzip -q "${ZIP_PATH}" -d "${INSTALL_DIR}"
fi

if [[ ! -x "${CHROME_BIN}" ]]; then
  echo "Chrome for Testing download did not produce an executable at ${CHROME_BIN}." >&2
  exit 1
fi

printf '%s\n' "${CHROME_BIN}"
