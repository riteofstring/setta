#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./report_quality_hotspots.sh [--top N] [--python-min N] [--frontend-min N] [--go-min N]

Report the highest-complexity code hotspots across the repo.

Options:
  --top N            Show up to N hotspots per language section (default: 20).
  --python-min N     Only show Python hotspots with complexity >= N (default: 1).
  --frontend-min N   Only show frontend hotspots with complexity >= N (default: 1).
  --go-min N         Only show Go hotspots with complexity >= N (default: 1).
  -h, --help         Show this help text.

Notes:
  - Scores are per-tool and are not directly comparable across languages.
  - The report mirrors the same test/generated-file exclusions used by ./check_quality.sh.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly GO_CYCLO_VERSION="v0.6.0"
top_n="20"
python_min="1"
frontend_min="1"
go_min="1"

# shellcheck source=scripts/lib/quality_paths.sh
. "${repo_root}/scripts/lib/quality_paths.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --top)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --top" >&2
        exit 1
      fi
      top_n="$1"
      shift
      ;;
    --python-min)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --python-min" >&2
        exit 1
      fi
      python_min="$1"
      shift
      ;;
    --frontend-min)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --frontend-min" >&2
        exit 1
      fi
      frontend_min="$1"
      shift
      ;;
    --go-min)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --go-min" >&2
        exit 1
      fi
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

validate_positive_integer() {
  local value="$1"
  local label="$2"
  if ! [[ "${value}" =~ ^[0-9]+$ ]] || [[ "${value}" -lt 1 ]]; then
    echo "${label} must be a positive integer: ${value}" >&2
    exit 1
  fi
}

run_ruff_complexity_report() {
  local output_path="$1"
  shift
  local status=0

  set +e
  ruff check \
    --select C901 \
    --output-format=json \
    --config 'lint.mccabe.max-complexity = 1' \
    "$@" >"${output_path}"
  status=$?
  set -e

  if [[ "${status}" -gt 1 ]]; then
    return "${status}"
  fi
  return 0
}

run_eslint_complexity_report() {
  local output_path="$1"
  shift
  local status=0

  set +e
  pnpm -C frontend exec eslint \
    --format json \
    --rule 'complexity:["error",1]' \
    -- "$@" >"${output_path}"
  status=$?
  set -e

  if [[ "${status}" -gt 1 ]]; then
    return "${status}"
  fi
  return 0
}

validate_positive_integer "${top_n}" "--top"
validate_positive_integer "${python_min}" "--python-min"
validate_positive_integer "${frontend_min}" "--frontend-min"
validate_positive_integer "${go_min}" "--go-min"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to build the hotspot report." >&2
  exit 1
fi

cd "${repo_root}"
# shellcheck source=/dev/null
. ./activate.sh
if ! command -v python >/dev/null 2>&1; then
  echo "python is required after activating ./activate.sh." >&2
  exit 1
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-quality-hotspots.XXXXXX")"
trap 'rm -rf "${tmp_dir}"' EXIT

declare -a python_files=()
declare -a frontend_relative_files=()
declare -a go_files=()

while IFS= read -r path; do
  [[ -n "${path}" ]] && python_files+=("${path}")
done < <(quality_collect_python_files)

while IFS= read -r path; do
  [[ -n "${path}" ]] && frontend_relative_files+=("$(quality_frontend_cli_path "${path}")")
done < <(quality_collect_frontend_files)

while IFS= read -r path; do
  [[ -n "${path}" ]] && go_files+=("${path}")
done < <(quality_collect_go_files)

echo "Quality hotspots (top ${top_n} per language)"
echo "Scores are language-specific and should not be compared across sections."

echo
echo "Go"
if [[ ${#go_files[@]} -eq 0 ]]; then
  echo "No Go files matched the report filters."
else
  echo "Top ${top_n}, minimum complexity ${go_min}"
  ./scripts/go.sh run github.com/fzipp/gocyclo/cmd/gocyclo@"${GO_CYCLO_VERSION}" -top "${top_n}" "${go_files[@]}" >"${tmp_dir}/go.txt"
  python - "${tmp_dir}/go.txt" "${go_min}" <<'PY'
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
        if score < minimum:
            continue
        package = parts[1]
        function = " ".join(parts[2:-1])
        location = parts[-1]
        rows.append((score, package, function, location))

if not rows:
    print(f"No Go hotspots found with complexity >= {minimum}.")
    raise SystemExit(0)

for score, package, function, location in rows:
    print(f"{score:>4}  {package}.{function}  {location}")
PY
fi

echo
echo "Python"
if [[ ${#python_files[@]} -eq 0 ]]; then
  echo "No Python files matched the report filters."
else
  echo "Top ${top_n}, minimum complexity ${python_min}"
  run_ruff_complexity_report "${tmp_dir}/python.json" "${python_files[@]}"
  python - "${tmp_dir}/python.json" "${top_n}" "${python_min}" "${repo_root}" <<'PY'
import json
import os
import re
import sys

report_path = sys.argv[1]
top_n = int(sys.argv[2])
minimum = int(sys.argv[3])
repo_root = sys.argv[4]
pattern = re.compile(r"`(?P<name>.+?)` is too complex \((?P<score>\d+) > \d+\)")

with open(report_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

rows = []
for item in data:
    if item.get("code") != "C901":
        continue
    match = pattern.search(item.get("message", ""))
    if not match:
        continue
    score = int(match.group("score"))
    if score < minimum:
        continue
    rows.append(
        (
            score,
            os.path.relpath(item["filename"], repo_root),
            int(item["location"]["row"]),
            match.group("name"),
        )
    )

rows.sort(key=lambda row: (-row[0], row[1], row[2], row[3]))
rows = rows[:top_n]

if not rows:
    print(f"No Python hotspots found with complexity >= {minimum}.")
    raise SystemExit(0)

for score, path, line, name in rows:
    print(f"{score:>4}  {name}  {path}:{line}")
PY
fi

echo
echo "Frontend"
if [[ ${#frontend_relative_files[@]} -eq 0 ]]; then
  echo "No frontend files matched the report filters."
else
  echo "Top ${top_n}, minimum complexity ${frontend_min}"
  run_eslint_complexity_report "${tmp_dir}/frontend.json" "${frontend_relative_files[@]}"
  python - "${tmp_dir}/frontend.json" "${top_n}" "${frontend_min}" "${repo_root}" <<'PY'
import json
import os
import re
import sys

report_path = sys.argv[1]
top_n = int(sys.argv[2])
minimum = int(sys.argv[3])
repo_root = sys.argv[4]
pattern = re.compile(r"(?P<label>.+?) has a complexity of (?P<score>\d+)\.")

with open(report_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

rows = []
for file_report in data:
    for message in file_report.get("messages", []):
        if message.get("ruleId") != "complexity":
            continue
        match = pattern.search(message.get("message", ""))
        if not match:
            continue
        score = int(match.group("score"))
        if score < minimum:
            continue
        label = match.group("label")
        if label.startswith("Function '") and label.endswith("'"):
          label = label[len("Function '"):-1]
        rows.append(
            (
                score,
                os.path.relpath(file_report["filePath"], repo_root),
                int(message["line"]),
                label,
            )
        )

rows.sort(key=lambda row: (-row[0], row[1], row[2], row[3]))
rows = rows[:top_n]

if not rows:
    print(f"No frontend hotspots found with complexity >= {minimum}.")
    raise SystemExit(0)

for score, path, line, label in rows:
    print(f"{score:>4}  {label}  {path}:{line}")
PY
fi
