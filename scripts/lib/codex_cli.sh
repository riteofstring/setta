#!/usr/bin/env bash

setta_codex_resolve_bin() {
  local root_dir="$1"
  local nvm_dir="${NVM_DIR:-${HOME}/.nvm}"
  local version_file="${root_dir}/scripts/node_version.txt"
  local required_node_version=""
  local default_alias=""
  local candidate=""

  if command -v codex >/dev/null 2>&1; then
    command -v codex
    return 0
  fi

  if [[ -f "${version_file}" ]]; then
    required_node_version="$(tr -d '[:space:]' < "${version_file}")"
  fi

  if [[ -n "${required_node_version}" ]]; then
    candidate="${nvm_dir}/versions/node/v${required_node_version}/bin/codex"
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  fi

  if [[ -f "${nvm_dir}/alias/default" ]]; then
    default_alias="$(tr -d '[:space:]' < "${nvm_dir}/alias/default")"
    default_alias="${default_alias#v}"
    if [[ -n "${default_alias}" ]]; then
      candidate="${nvm_dir}/versions/node/v${default_alias}/bin/codex"
      if [[ -x "${candidate}" ]]; then
        printf '%s\n' "${candidate}"
        return 0
      fi
    fi
  fi

  if [[ -s "${nvm_dir}/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "${nvm_dir}/nvm.sh"
    if [[ -n "${required_node_version}" ]]; then
      nvm use "${required_node_version}" >/dev/null 2>&1 || true
      if command -v codex >/dev/null 2>&1; then
        command -v codex
        return 0
      fi
    fi
    nvm use default >/dev/null 2>&1 || true
    if command -v codex >/dev/null 2>&1; then
      command -v codex
      return 0
    fi
  fi

  candidate="$(
    python3 - "${nvm_dir}" <<'PY'
import sys
from pathlib import Path

nvm_dir = Path(sys.argv[1])
versions_dir = nvm_dir / "versions" / "node"
candidates: list[tuple[tuple[int, ...], Path]] = []

for path in versions_dir.glob("v*/bin/codex"):
    version_text = path.parts[-3].lstrip("v")
    try:
        version = tuple(int(part) for part in version_text.split("."))
    except ValueError:
        continue
    candidates.append((version, path))

if not candidates:
    raise SystemExit(1)

candidates.sort()
print(candidates[-1][1])
PY
  )" || true

  if [[ -n "${candidate}" ]] && [[ -x "${candidate}" ]]; then
    printf '%s\n' "${candidate}"
    return 0
  fi

  return 1
}

setta_ensure_codex_cli() {
  local root_dir="$1"
  local codex_bin="${SETTA_CODEX_BIN:-}"
  local codex_dir=""

  if [[ -z "${codex_bin}" ]] || [[ ! -x "${codex_bin}" ]]; then
    codex_bin="$(setta_codex_resolve_bin "${root_dir}" || true)"
  fi

  if [[ -z "${codex_bin}" ]] || [[ ! -x "${codex_bin}" ]]; then
    return 1
  fi

  codex_dir="$(dirname "${codex_bin}")"
  case ":${PATH}:" in
    *":${codex_dir}:"*) ;;
    *)
      export PATH="${codex_dir}:${PATH}"
      ;;
  esac

  export SETTA_CODEX_BIN="${codex_bin}"
  return 0
}
