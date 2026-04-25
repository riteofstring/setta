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
    frontend/src/*|frontend/plugin-sdk/app-subsystem/src/*|plugins/*/frontend/src/*)
      ;;
    *)
      return 1
      ;;
  esac

  case "${path}" in
    *.test.*|*.spec.*|*.stories.*|*.d.ts|frontend/src/utils/generatedEndpoints.ts|frontend/src/utils/generatedRoutes.ts|frontend/src/utils/generatedTypes.ts|frontend/src/openapi/*/generated/*|frontend/plugin-sdk/app-subsystem/src/generatedTypes.ts|frontend/plugin-sdk/app-subsystem/src/generated/*|frontend/plugin-sdk/app-subsystem/src/openapi/*/generated/*)
      return 1
      ;;
    *.js|*.jsx|*.ts|*.tsx)
      return 0
      ;;
  esac
  return 1
}

quality_is_frontend_boundary_candidate() {
  local path="${1#./}"
  case "${path}" in
    frontend/src/*|frontend/plugin-sdk/app-subsystem/src/*|frontend/plugin-sdk/app-subsystem/types/*.d.ts|plugins/*/frontend/src/*|plugins/*/frontend/tests/*|plugins/*/frontend/vendor/*/types/*.d.ts)
      ;;
    *)
      return 1
      ;;
  esac

  case "${path}" in
    frontend/src/utils/generatedEndpoints.ts|frontend/src/utils/generatedRoutes.ts|frontend/src/utils/generatedTypes.ts|frontend/src/openapi/*/generated/*|frontend/plugin-sdk/app-subsystem/src/generatedTypes.ts|frontend/plugin-sdk/app-subsystem/src/generated/*|frontend/plugin-sdk/app-subsystem/src/openapi/*/generated/*)
      return 1
      ;;
    *.js|*.jsx|*.ts|*.tsx|*.d.ts)
      return 0
      ;;
  esac
  return 1
}

quality_is_frontend_guardrail_candidate() {
  local path="${1#./}"
  case "${path}" in
    frontend/plugin-sdk/app-subsystem/package.json|frontend/plugin-sdk/app-subsystem/vite.config.mjs|frontend/plugin-sdk/app-subsystem/types/*.d.ts|plugins/*/frontend/package.json|plugins/*/frontend/vite.config.mjs|plugins/*/frontend/vitest.config.mjs|plugins/*/frontend/vendor/*/package.json|plugins/*/frontend/vendor/*/types/*.d.ts)
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
  printf '%s\n' "plugin-sdk/app-subsystem/src"
  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue
    printf '../%s\n' "${path}"
  done < <(
    cd "${repo_root}"
    find plugins -path '*/frontend/src' -type d 2>/dev/null | LC_ALL=C sort
  )
}
