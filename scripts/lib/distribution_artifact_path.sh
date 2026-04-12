#!/usr/bin/env bash

setta_resolve_single_dist_artifact() {
  local artifact_dir="${1-}"
  local filename_pattern="${2-}"
  local artifact_label="${3-}"
  local path_python_bin=""

  if [[ -z "${artifact_dir}" ]]; then
    echo "Missing artifact directory." >&2
    return 1
  fi
  if [[ -z "${filename_pattern}" ]]; then
    echo "Missing artifact filename pattern." >&2
    return 1
  fi
  if [[ -z "${artifact_label}" ]]; then
    artifact_label="artifact"
  fi

  if command -v python3 >/dev/null 2>&1; then
    path_python_bin="python3"
  elif command -v python >/dev/null 2>&1; then
    path_python_bin="python"
  else
    echo "Could not resolve ${artifact_label} because no Python interpreter is available." >&2
    return 1
  fi

  "${path_python_bin}" - "${artifact_dir}" "${filename_pattern}" "${artifact_label}" <<'PY'
from pathlib import Path
import sys

artifact_dir = Path(sys.argv[1])
filename_pattern = sys.argv[2]
artifact_label = sys.argv[3]

if not artifact_dir.exists():
    print(f"Artifact directory not found: {artifact_dir}", file=sys.stderr)
    raise SystemExit(1)
if not artifact_dir.is_dir():
    print(f"Artifact directory is not a directory: {artifact_dir}", file=sys.stderr)
    raise SystemExit(1)

matches = sorted(
    path.resolve(strict=False)
    for path in artifact_dir.glob(filename_pattern)
    if path.is_file()
)

if not matches:
    print(
        f"No {artifact_label} found in {artifact_dir} matching {filename_pattern}.",
        file=sys.stderr,
    )
    raise SystemExit(1)

if len(matches) != 1:
    print(
        f"Expected exactly one {artifact_label} in {artifact_dir} matching {filename_pattern}, "
        f"found {len(matches)}.",
        file=sys.stderr,
    )
    for match in matches:
        print(f"  - {match}", file=sys.stderr)
    raise SystemExit(1)

print(matches[0])
PY
}
