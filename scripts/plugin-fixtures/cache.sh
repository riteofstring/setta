#!/usr/bin/env bash
set -euo pipefail

compute_plugin_fixture_signature() {
  local root_dir="$1"
  local fixture_file
  local fixture_files=(
    "${root_dir}/scripts/plugin-fixtures/build.sh"
    "${root_dir}/frontend/package.json"
    "${root_dir}/frontend/pnpm-lock.yaml"
    "${root_dir}/scripts/node_version.txt"
  )
  while IFS= read -r fixture_file; do
    fixture_files+=("${fixture_file}")
  done < <(
    find "${root_dir}/tests/fixtures/plugins" -type f \
      ! -path "*/frontend/dist/*" \
      | sort
  )

  for fixture_file in "${fixture_files[@]}"; do
    if [[ ! -f "${fixture_file}" ]]; then
      continue
    fi
    printf '%s|' "${fixture_file#${root_dir}/}"
    cksum < "${fixture_file}"
  done | cksum | awk '{print $1 ":" $2}'
}

resolve_plugin_fixture_python_bin() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    if [[ -x "${PYTHON_BIN}" ]]; then
      printf '%s\n' "${PYTHON_BIN}"
      return 0
    fi
    if command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
      command -v "${PYTHON_BIN}"
      return 0
    fi
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi
  return 1
}

plugin_fixture_frontend_outputs_complete() {
  local root_dir="$1"
  local manifest_path
  local python_bin
  python_bin="$(resolve_plugin_fixture_python_bin)" || return 1
  local manifests=()
  while IFS= read -r manifest_path; do
    manifests+=("${manifest_path}")
  done < <(
    find "${root_dir}/tests/fixtures/plugins" -name "setta.plugin.json" -type f | sort
  )
  if [[ ${#manifests[@]} -eq 0 ]]; then
    return 0
  fi
  "${python_bin}" - "${manifests[@]}" <<'PY'
import json
import sys
from pathlib import Path

for manifest_arg in sys.argv[1:]:
    manifest_path = Path(manifest_arg)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        raise SystemExit(1)

    frontend = manifest.get("frontend")
    if not isinstance(frontend, dict):
        continue

    fixture_root = manifest_path.parent
    for key in ("entrypoint", "style"):
        raw_output_path = frontend.get(key)
        if not isinstance(raw_output_path, str):
            continue
        output_path = raw_output_path.strip()
        if output_path == "":
            continue
        resolved_output_path = fixture_root / output_path
        if not resolved_output_path.is_file():
            raise SystemExit(1)
PY
}

build_plugin_fixtures_if_needed() {
  local root_dir="$1"
  local cache_file="$2"
  local log_prefix="${3:-build}"
  local current_signature cached_signature
  current_signature="$(compute_plugin_fixture_signature "${root_dir}")"
  mkdir -p "$(dirname "${cache_file}")"

  if [[ "${SETTA_FORCE_PLUGIN_FIXTURE_BUILD:-0}" == "1" ]]; then
    echo "${log_prefix}: plugin fixtures changed; rebuilding"
    "${root_dir}/scripts/plugin-fixtures/build.sh" all
    printf '%s' "${current_signature}" > "${cache_file}"
    return
  fi

  if [[ -f "${cache_file}" ]]; then
    cached_signature="$(<"${cache_file}")"
  else
    cached_signature=""
  fi

  if [[ "${cached_signature}" == "${current_signature}" ]]; then
    if ! plugin_fixture_frontend_outputs_complete "${root_dir}"; then
      echo "${log_prefix}: plugin fixture outputs missing; rebuilding"
    else
      echo "${log_prefix}: plugin fixtures unchanged; skipping rebuild"
      return
    fi
  else
    echo "${log_prefix}: plugin fixtures changed; rebuilding"
  fi

  "${root_dir}/scripts/plugin-fixtures/build.sh" all
  printf '%s' "${current_signature}" > "${cache_file}"
}

_plugin_fixture_path_has_plugin_hint() {
  local target_path="$1"
  local normalized_path="${target_path//\\//}"
  local basename_only="${normalized_path##*/}"
  if [[ "${normalized_path}" == *"/plugins/"* ]]; then
    return 0
  fi
  if [[ "${normalized_path}" == *"/plugin-"* ]]; then
    return 0
  fi
  if [[ "${normalized_path}" == *"/plugin_"* ]]; then
    return 0
  fi
  if [[ "${basename_only}" == test_plugin*.py ]]; then
    return 0
  fi
  if [[ "${basename_only}" == plugin*.spec.ts ]]; then
    return 0
  fi
  if [[ "${basename_only}" == plugin*.spec.tsx ]]; then
    return 0
  fi
  if [[ "${basename_only}" == *plugin*.spec.ts ]]; then
    return 0
  fi
  if [[ "${basename_only}" == *plugin*.spec.tsx ]]; then
    return 0
  fi
  return 1
}

_plugin_fixture_selector_has_plugin_hint() {
  local selector_value="$1"
  local normalized_selector
  normalized_selector="$(printf '%s' "${selector_value}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${normalized_selector}" == *plugin* ]]; then
    return 0
  fi
  return 1
}

_plugin_fixture_resolve_target_path() {
  local root_dir="$1"
  local target_path="$2"
  if [[ "${target_path}" == /* ]]; then
    printf '%s\n' "${target_path}"
    return
  fi
  printf '%s\n' "${root_dir}/${target_path}"
}

_plugin_fixture_directory_has_plugin_tests() {
  local root_dir="$1"
  local target_path="$2"
  local mode="$3"
  local resolved_target
  local find_name_args=()
  local candidate_path

  resolved_target="$(_plugin_fixture_resolve_target_path "${root_dir}" "${target_path}")"
  if [[ ! -d "${resolved_target}" ]]; then
    return 1
  fi

  if [[ "${mode}" == "pytest" ]]; then
    find_name_args=(-name "*.py")
  elif [[ "${mode}" == "playwright" ]]; then
    find_name_args=(
      \( -name "*.spec.ts" -o -name "*.spec.tsx" \)
    )
  else
    return 1
  fi

  while IFS= read -r candidate_path; do
    if _plugin_fixture_path_has_plugin_hint "${candidate_path}"; then
      return 0
    fi
  done < <(
    find "${resolved_target}" -type f "${find_name_args[@]}" 2>/dev/null | sort
  )

  return 1
}

should_build_plugin_fixtures_for_targets() {
  local root_dir="$1"
  local mode="$2"
  shift 2

  local has_positional_target=0
  local has_selector_filter=0
  local selector_filter_has_plugin_hint=0
  local expect_selector_value=0
  local expect_grep_value=0
  local arg
  local target_path
  local resolved_target

  for arg in "$@"; do
    if [[ "${expect_selector_value}" == "1" ]]; then
      expect_selector_value=0
      if _plugin_fixture_selector_has_plugin_hint "${arg}"; then
        selector_filter_has_plugin_hint=1
      fi
      continue
    fi
    if [[ "${expect_grep_value}" == "1" ]]; then
      expect_grep_value=0
      has_selector_filter=1
      if _plugin_fixture_selector_has_plugin_hint "${arg}"; then
        selector_filter_has_plugin_hint=1
      fi
      continue
    fi

    if [[ "${mode}" == "pytest" ]]; then
      case "${arg}" in
        -k|--keyword|-m|--markers)
          has_selector_filter=1
          expect_selector_value=1
          continue
          ;;
        -k=*|--keyword=*|-m=*|--markers=*)
          has_selector_filter=1
          if _plugin_fixture_selector_has_plugin_hint "${arg#*=}"; then
            selector_filter_has_plugin_hint=1
          fi
          continue
          ;;
      esac
    fi

    if [[ "${mode}" == "playwright" ]]; then
      case "${arg}" in
        -g|--grep)
          has_selector_filter=1
          expect_grep_value=1
          continue
          ;;
        -g=*|--grep=*)
          has_selector_filter=1
          if _plugin_fixture_selector_has_plugin_hint "${arg#*=}"; then
            selector_filter_has_plugin_hint=1
            return 0
          fi
          continue
          ;;
      esac
    fi

    if [[ "${arg}" == -* ]]; then
      continue
    fi

    has_positional_target=1
    target_path="${arg%%::*}"
    resolved_target="$(_plugin_fixture_resolve_target_path "${root_dir}" "${target_path}")"

    if _plugin_fixture_path_has_plugin_hint "${target_path}"; then
      return 0
    fi
    if _plugin_fixture_path_has_plugin_hint "${resolved_target}"; then
      return 0
    fi

    if _plugin_fixture_directory_has_plugin_tests "${root_dir}" "${target_path}" "${mode}"; then
      return 0
    fi

    if [[ "${mode}" == "pytest" ]] && [[ ! -d "${resolved_target}" ]] && [[ "${target_path}" != *.py ]]; then
      # Non-file pytest targets can reference test selectors/modules; stay conservative.
      return 0
    fi
  done

  if [[ "${mode}" == "pytest" ]] && [[ "${has_selector_filter}" == "1" ]]; then
    if [[ "${selector_filter_has_plugin_hint}" == "1" ]]; then
      return 0
    fi
    if [[ "${has_positional_target}" == "0" ]]; then
      return 0
    fi
  fi
  if [[ "${mode}" == "playwright" ]] && [[ "${has_selector_filter}" == "1" ]]; then
    if [[ "${selector_filter_has_plugin_hint}" == "1" ]]; then
      return 0
    fi
    # Grep-based runs are hard to classify reliably from paths alone; build fixtures by default.
    return 0
  fi
  if [[ "${has_positional_target}" == "0" ]]; then
    return 0
  fi
  return 1
}
