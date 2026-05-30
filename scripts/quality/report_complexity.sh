#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/quality/report_complexity.sh [--top N] [--go-min N]

Report Go complexity hotspots for the current repository.

Options:
  --top N      Show up to N hotspots (default: 20).
  --go-min N   Only show Go hotspots with complexity >= N (default: 12).
  -h, --help   Show this help text.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly GO_CYCLO_VERSION="v0.6.0"
top_n="20"
go_min="12"

require_positive_integer() {
  local value="$1"
  local label="$2"
  if ! [[ "${value}" =~ ^[0-9]+$ ]] || [[ "${value}" -lt 1 ]]; then
    echo "${label} must be a positive integer: ${value}" >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --top)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --top" >&2; exit 1; }
      top_n="$1"
      shift
      ;;
    --go-min)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --go-min" >&2; exit 1; }
      go_min="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_positive_integer "${top_n}" "--top"
require_positive_integer "${go_min}" "--go-min"

cd "${repo_root}"
if [[ ! -f "${repo_root}/go.mod" ]]; then
  echo "No go.mod found; no Go complexity report is available yet."
  exit 0
fi

declare -a go_files=()
while IFS= read -r file_path; do
  [[ -n "${file_path}" ]] && go_files+=("${file_path}")
done < <(
  git ls-files '*.go' \
    | grep -Ev '(^|/)(vendor|generated)/|(_test|_gen)\.go$|\.gen\.go$' \
    | LC_ALL=C sort
)

if [[ ${#go_files[@]} -eq 0 ]]; then
  echo "No Go files matched the report filters."
  exit 0
fi

tmp_file="$(mktemp "${TMPDIR:-/tmp}/setta-go-complexity.XXXXXX")"
trap 'rm -f "${tmp_file}"' EXIT

"${repo_root}/scripts/go.sh" run "github.com/fzipp/gocyclo/cmd/gocyclo@${GO_CYCLO_VERSION}" \
  -top "${top_n}" "${go_files[@]}" >"${tmp_file}"

python3 - "${tmp_file}" "${go_min}" <<'PY'
import sys

report_path = sys.argv[1]
minimum = int(sys.argv[2])
rows = []

with open(report_path, "r", encoding="utf-8") as handle:
    for raw_line in handle:
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        score = int(parts[0])
        if score >= minimum:
            rows.append(line)

if not rows:
    print(f"No Go hotspots found with complexity >= {minimum}.")
else:
    print("Go complexity hotspots:")
    for row in rows:
        print(row)
PY
