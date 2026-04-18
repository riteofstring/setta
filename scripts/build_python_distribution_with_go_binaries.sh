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

resolve_build_request_metadata() {
  build_request_has_wheel=0
  build_request_has_sdist=0
  build_outdir="dist"

  local index=0
  while [[ "${index}" -lt "${#build_args[@]}" ]]; do
    local argument="${build_args[${index}]}"

    case "${argument}" in
      --outdir)
        index="$((index + 1))"
        if [[ "${index}" -ge "${#build_args[@]}" ]]; then
          echo "missing value for --outdir" >&2
          exit 1
        fi
        build_outdir="${build_args[${index}]}"
        ;;
      --outdir=*)
        build_outdir="${argument#--outdir=}"
        ;;
      -o)
        index="$((index + 1))"
        if [[ "${index}" -ge "${#build_args[@]}" ]]; then
          echo "missing value for -o" >&2
          exit 1
        fi
        build_outdir="${build_args[${index}]}"
        ;;
      -o?*)
        build_outdir="${argument#-o}"
        ;;
      --wheel)
        build_request_has_wheel=1
        ;;
      --sdist)
        build_request_has_sdist=1
        ;;
      -[!-]*)
        local flag_cluster="${argument#-}"
        local cluster_index=0
        while [[ "${cluster_index}" -lt "${#flag_cluster}" ]]; do
          case "${flag_cluster:${cluster_index}:1}" in
            w)
              build_request_has_wheel=1
              ;;
            s)
              build_request_has_sdist=1
              ;;
          esac
          cluster_index="$((cluster_index + 1))"
        done
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
    *)
      build_args+=("$1")
      shift
      ;;
  esac
done

resolve_build_request_metadata

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
