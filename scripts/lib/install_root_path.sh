#!/usr/bin/env bash

setta_resolve_install_root() {
  local raw_install_root="${1-}"
  local path_python_bin=""

  if [[ -z "${raw_install_root}" ]]; then
    echo "Missing value for --install-root" >&2
    return 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    path_python_bin="python3"
  elif command -v python >/dev/null 2>&1; then
    path_python_bin="python"
  else
    echo "Could not resolve install root because no Python interpreter is available." >&2
    return 1
  fi

  "${path_python_bin}" - "${raw_install_root}" <<'PY'
import os
import sys

raw = sys.argv[1].strip()
if not raw:
    print("Missing value for --install-root", file=sys.stderr)
    raise SystemExit(1)

expanded = os.path.expandvars(os.path.expanduser(raw))
if expanded.startswith("~"):
    print(f"Could not expand install root path: {raw}", file=sys.stderr)
    raise SystemExit(1)

print(os.path.abspath(expanded))
PY
}
