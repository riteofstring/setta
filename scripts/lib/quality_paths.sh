#!/usr/bin/env bash

quality_is_python_candidate() {
  local path="${1#./}"
  case "${path}" in
    tests/*|*/tests/*|backend/setta/types/generated/*|backend/setta/sdk_contracts/generated.py|backend/setta/api/listener_endpoint_client.py)
      return 1
      ;;
    *.py)
      return 0
      ;;
  esac
  return 1
}

quality_is_frontend_candidate() {
  local path="${1#./}"
  case "${path}" in
    frontend/src/*|plugins/*/frontend/src/*)
      ;;
    *)
      return 1
      ;;
  esac

  case "${path}" in
    *.test.*|*.spec.*|*.stories.*|*.d.ts|frontend/src/utils/generatedEndpoints.ts|frontend/src/utils/generatedRoutes.ts|frontend/src/utils/generatedTypes.ts|frontend/src/openapi/*/generated/*)
      return 1
      ;;
    *.js|*.jsx|*.ts|*.tsx)
      return 0
      ;;
  esac
  return 1
}

quality_is_go_candidate() {
  local path="${1#./}"
  case "${path}" in
    cmd/*|internal/*|plugins/*)
      ;;
    *)
      return 1
      ;;
  esac

  case "${path}" in
    *_test.go|*_gen.go)
      return 1
      ;;
    *.go)
      return 0
      ;;
  esac
  return 1
}

quality_collect_python_files() {
  while IFS= read -r path; do
    local normalized="${path#./}"
    [[ -n "${normalized}" ]] || continue
    quality_is_python_candidate "${normalized}" && printf '%s\n' "${normalized}"
  done < <(rg --files . -g '*.py' | LC_ALL=C sort)
}

quality_collect_frontend_files() {
  while IFS= read -r path; do
    local normalized="${path#./}"
    [[ -n "${normalized}" ]] || continue
    quality_is_frontend_candidate "${normalized}" && printf '%s\n' "${normalized}"
  done < <(rg --files . | LC_ALL=C sort)
}

quality_collect_go_files() {
  while IFS= read -r path; do
    local normalized="${path#./}"
    [[ -n "${normalized}" ]] || continue
    quality_is_go_candidate "${normalized}" && printf '%s\n' "${normalized}"
  done < <(rg --files . -g '*.go' | LC_ALL=C sort)
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
  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue
    printf '../%s\n' "${path}"
  done < <(
    cd "${repo_root}"
    find plugins -path '*/frontend/src' -type d 2>/dev/null | LC_ALL=C sort
  )
}
