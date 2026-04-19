#!/usr/bin/env bash

setta_prepend_path_once() {
  local dir="$1"
  local path_part=""
  local filtered_path=""
  if [[ -z "${dir}" ]] || [[ ! -d "${dir}" ]]; then
    return
  fi

  IFS=':'
  for path_part in ${PATH}; do
    if [[ -z "${path_part}" ]] || [[ "${path_part}" == "${dir}" ]]; then
      continue
    fi
    if [[ -z "${filtered_path}" ]]; then
      filtered_path="${path_part}"
    else
      filtered_path="${filtered_path}:${path_part}"
    fi
  done
  unset IFS

  if [[ -n "${filtered_path}" ]]; then
    export PATH="${dir}:${filtered_path}"
  else
    export PATH="${dir}"
  fi
}

setta_read_required_node_version() {
  local root_dir="$1"
  local version_file="${root_dir}/scripts/node_version.txt"
  if [[ ! -f "${version_file}" ]]; then
    return
  fi

  tr -d '[:space:]' < "${version_file}"
}

setta_current_node_version() {
  if ! command -v node >/dev/null 2>&1; then
    return
  fi

  node -p 'process.versions.node' 2>/dev/null || true
}

setta_ensure_required_node_on_path() {
  local root_dir="$1"
  local required_node_version=""
  local installed_node_version=""
  local nvm_dir=""
  local pinned_bin_dir=""

  required_node_version="$(setta_read_required_node_version "${root_dir}")"
  if [[ -z "${required_node_version}" ]]; then
    return 0
  fi

  installed_node_version="$(setta_current_node_version)"
  if [[ "${installed_node_version}" == "${required_node_version}" ]]; then
    return 0
  fi

  if [[ -n "${NVM_DIR:-}" ]]; then
    nvm_dir="${NVM_DIR}"
  elif [[ -n "${HOME:-}" ]]; then
    nvm_dir="${HOME}/.nvm"
  fi

  if [[ -n "${nvm_dir}" ]]; then
    pinned_bin_dir="${nvm_dir}/versions/node/v${required_node_version}/bin"
    if [[ -d "${pinned_bin_dir}" ]]; then
      setta_prepend_path_once "${pinned_bin_dir}"
      installed_node_version="$(setta_current_node_version)"
      if [[ "${installed_node_version}" == "${required_node_version}" ]]; then
        return 0
      fi
    fi

    if [[ -s "${nvm_dir}/nvm.sh" ]]; then
      # shellcheck disable=SC1090
      . "${nvm_dir}/nvm.sh"
      nvm use "${required_node_version}" >/dev/null 2>&1 || nvm install "${required_node_version}" >/dev/null 2>&1
      if [[ -d "${pinned_bin_dir}" ]]; then
        setta_prepend_path_once "${pinned_bin_dir}"
      fi
      installed_node_version="$(setta_current_node_version)"
      if [[ "${installed_node_version}" == "${required_node_version}" ]]; then
        return 0
      fi
    fi
  fi

  echo "Node ${required_node_version} is required by ${root_dir}/scripts/node_version.txt but is not available on PATH." >&2
  return 1
}

setta_ensure_node_tooling_on_path() {
  local root_dir="$1"
  local nvm_dir=""
  local nvm_bin_dir=""

  setta_ensure_required_node_on_path "${root_dir}"
  if command -v corepack >/dev/null 2>&1 || command -v pnpm >/dev/null 2>&1; then
    return 0
  fi

  if [[ -n "${HOME:-}" ]] && [[ -d "${HOME}/.local/share/pnpm" ]]; then
    setta_prepend_path_once "${HOME}/.local/share/pnpm"
    if command -v corepack >/dev/null 2>&1 || command -v pnpm >/dev/null 2>&1; then
      return 0
    fi
  fi

  if [[ -n "${NVM_DIR:-}" ]]; then
    nvm_dir="${NVM_DIR}"
  elif [[ -n "${HOME:-}" ]]; then
    nvm_dir="${HOME}/.nvm"
  fi

  if [[ -n "${nvm_dir}" ]] && [[ -d "${nvm_dir}/versions/node" ]]; then
    while IFS= read -r nvm_bin_dir; do
      setta_prepend_path_once "${nvm_bin_dir}"
      if command -v corepack >/dev/null 2>&1 || command -v pnpm >/dev/null 2>&1; then
        return 0
      fi
    done < <(find "${nvm_dir}/versions/node" -mindepth 2 -maxdepth 2 -type d -name bin 2>/dev/null | sort -V)
  fi

  echo "Could not find pnpm or corepack on PATH." >&2
  return 1
}

setta_run_pnpm() {
  local root_dir="$1"
  shift

  export COREPACK_ENABLE_AUTO_PIN=0
  setta_ensure_node_tooling_on_path "${root_dir}"

  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
    return
  fi

  pnpm "$@"
}
