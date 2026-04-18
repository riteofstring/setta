#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/build_python_distribution_with_go_binaries.sh [--skip-cleanup] [python -m build args...]

Build the current-platform packaged Go binaries under backend/setta/go_bin and
run python -m build for this repo. When the build request includes a wheel,
also build the first-party basedpyright plugin wheel into the same output
directory.

Options:
  --skip-cleanup  Preserve existing build inputs/artifacts and skip ./cleanup.sh.
  -h, --help      Show this help message.
USAGE
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cleanup_before_build=1
build_args=()
build_outdir="dist"
build_request_has_wheel=0
build_request_has_sdist=0

record_short_build_flags() {
  local flag_cluster="$1"
  local index=0

  while [[ "${index}" -lt "${#flag_cluster}" ]]; do
    case "${flag_cluster:${index}:1}" in
      w)
        build_request_has_wheel=1
        ;;
      s)
        build_request_has_sdist=1
        ;;
    esac
    index="$((index + 1))"
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-cleanup)
      cleanup_before_build=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      build_args+=("$@")
      break
      ;;
    --outdir)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --outdir" >&2
        exit 1
      fi
      build_outdir="$2"
      build_args+=("$1" "$2")
      shift 2
      ;;
    --outdir=*)
      build_outdir="${1#--outdir=}"
      build_args+=("$1")
      shift
      ;;
    -o)
      if [[ $# -lt 2 ]]; then
        echo "missing value for -o" >&2
        exit 1
      fi
      build_outdir="$2"
      build_args+=("$1" "$2")
      shift 2
      ;;
    -o?*)
      build_outdir="${1#-o}"
      build_args+=("$1")
      shift
      ;;
    --wheel)
      build_request_has_wheel=1
      build_args+=("$1")
      shift
      ;;
    --sdist)
      build_request_has_sdist=1
      build_args+=("$1")
      shift
      ;;
    -[!-]*)
      record_short_build_flags "${1#-}"
      build_args+=("$1")
      shift
      ;;
    *)
      build_args+=("$1")
      shift
      ;;
  esac
done

build_request_includes_wheel() {
  if (( ${#build_args[@]} == 0 )); then
    return 0
  fi
  if [[ "${build_request_has_wheel}" == "1" ]]; then
    return 0
  fi
  if [[ "${build_request_has_sdist}" == "1" ]]; then
    return 1
  fi
  return 0
}

resolve_build_outdir() {
  local outdir="$1"
  if [[ "${outdir}" = /* ]]; then
    printf '%s\n' "${outdir}"
    return
  fi
  printf '%s/%s\n' "${ROOT_DIR}" "${outdir}"
}

cd "${ROOT_DIR}"
if [[ "${cleanup_before_build}" == "1" ]]; then
  ./cleanup.sh
fi
./scripts/build_packaged_go_binaries.sh
if (( ${#build_args[@]} == 0 )); then
  python -m build
else
  python -m build "${build_args[@]}"
fi

if build_request_includes_wheel; then
  plugin_outdir="$(resolve_build_outdir "${build_outdir}")"
  mkdir -p "${plugin_outdir}"
  (
    cd "${ROOT_DIR}/plugins/setta-basedpyright"
    python -m build --wheel --outdir "${plugin_outdir}"
  )
fi
