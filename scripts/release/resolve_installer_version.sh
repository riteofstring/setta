#!/usr/bin/env bash
set -euo pipefail

readonly DEFAULT_VERSION_FILE="backend/setta/__init__.py"

function fail() {
  echo "${1}" >&2
  exit 1
}

function normalize_semver() {
  local raw_version="${1}"
  local normalized="${raw_version#v}"
  if [[ ! "${normalized}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    fail "Installer version must use major.minor.patch format (got '${raw_version}')."
  fi
  echo "${normalized}"
}

function read_project_version() {
  local version_file="${SETTA_VERSION_FILE:-${DEFAULT_VERSION_FILE}}"
  if [[ ! -f "${version_file}" ]]; then
    fail "Cannot resolve installer version: missing version file '${version_file}'."
  fi
  local declared_version
  declared_version="$(
    sed -n "s/^__version__ = \"\\([0-9][0-9]*\\.[0-9][0-9]*\\.[0-9][0-9]*\\)\"$/\\1/p" \
      "${version_file}" \
      | head -n 1
  )"
  if [[ -z "${declared_version}" ]]; then
    fail "Cannot resolve installer version from '${version_file}'."
  fi
  echo "${declared_version}"
}

function main() {
  local input_installer_version="${INPUT_INSTALLER_VERSION:-}"
  local release_tag_name="${RELEASE_TAG_NAME:-}"
  local event_name="${EVENT_NAME:-}"
  local raw_version=""

  if [[ -n "${input_installer_version}" ]]; then
    raw_version="${input_installer_version}"
  elif [[ "${event_name}" == "release" ]]; then
    if [[ -z "${release_tag_name}" ]]; then
      fail "Cannot resolve installer version: release tag is missing."
    fi
    raw_version="${release_tag_name}"
  else
    raw_version="$(read_project_version)"
  fi

  normalize_semver "${raw_version}"
}

main "$@"
