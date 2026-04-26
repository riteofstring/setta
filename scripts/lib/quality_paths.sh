#!/usr/bin/env bash

readonly QUALITY_DEFAULT_PYTHON_COMPLEXITY_THRESHOLD="10"
readonly QUALITY_DEFAULT_FRONTEND_COMPLEXITY_THRESHOLD="10"
readonly QUALITY_DEFAULT_GO_COMPLEXITY_THRESHOLD="12"

quality_default_python_complexity_threshold() {
  printf '%s\n' "${QUALITY_DEFAULT_PYTHON_COMPLEXITY_THRESHOLD}"
}

quality_default_frontend_complexity_threshold() {
  printf '%s\n' "${QUALITY_DEFAULT_FRONTEND_COMPLEXITY_THRESHOLD}"
}

quality_default_go_complexity_threshold() {
  printf '%s\n' "${QUALITY_DEFAULT_GO_COMPLEXITY_THRESHOLD}"
}

quality_validate_positive_integer() {
  local value="$1"
  local label="$2"
  if ! [[ "${value}" =~ ^[0-9]+$ ]] || [[ "${value}" -lt 1 ]]; then
    echo "${label} must be a positive integer: ${value}" >&2
    return 1
  fi
}

quality_effective_exceeds_threshold() {
  local threshold="$1"
  quality_validate_positive_integer "${threshold}" "threshold" >/dev/null
  printf '%s\n' "$((threshold - 1))"
}

quality_filter_files() {
  local category="$1"
  python ./scripts/quality/list_files.py --category "${category}" --source stdin
}

quality_collect_python_files() {
  python ./scripts/quality/list_files.py --category python --source tracked
}

quality_collect_frontend_files() {
  python ./scripts/quality/list_files.py --category frontend-eslint --source tracked
}

quality_collect_go_files() {
  python ./scripts/quality/list_files.py --category go --source tracked
}

quality_frontend_cli_path() {
  local path="${1#./}"
  case "${path}" in
    frontend/*)
      printf '%s\n' "${path#frontend/}"
      ;;
    plugins/*)
      printf '../%s\n' "${path}"
      ;;
    *)
      printf '%s\n' "${path}"
      ;;
  esac
}

quality_collect_frontend_source_dir_args() {
  local repo_root="${1:-.}"

  printf '%s\n' "src"
  printf '%s\n' "plugin-sdk/app-subsystem/src"
  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue
    printf '../%s\n' "${path}"
  done < <(
    cd "${repo_root}"
    find plugins -path '*/frontend/src' -type d 2>/dev/null | LC_ALL=C sort
  )
}
