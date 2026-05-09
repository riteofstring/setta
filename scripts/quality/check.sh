#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/quality/check.sh [--staged | --git-changes | --all | --files <path>...] [--python-max N] [--frontend-max N] [--frontend-test-max N] [--go-max N] [--go-test-max N]

Runs maintainability-oriented quality checks for supported production and test source, with an emphasis on cyclomatic complexity.
Also enforces file-length limits configured in quality.paths.yaml.

Modes:
  --git-changes      Check tracked files changed from HEAD plus untracked files (default).
  --staged           Check staged files only.
  --all              Check all tracked files covered by this tool.
  --files <path>...  Check only the provided files.

Thresholds:
  --python-max N     Fail Python cyclomatic complexity at >= N (default: 10).
  --frontend-max N   Fail frontend JS/TS cyclomatic complexity at >= N (default: 10).
  --frontend-test-max N
                     Fail frontend JS/TS test cyclomatic complexity at >= N (default: 10).
  --go-max N         Fail Go cyclomatic complexity at >= N (default: 12).
  --go-test-max N    Fail Go test cyclomatic complexity at >= N (default: 20).
  -h, --help         Show this help text.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly GO_CYCLO_VERSION="v0.6.0"
mode="git-changes"
# shellcheck source=../lib/quality_paths.sh
. "${repo_root}/scripts/lib/quality_paths.sh"

python_max="$(quality_default_python_complexity_threshold)"
frontend_max="$(quality_default_frontend_complexity_threshold)"
frontend_test_max="$(quality_default_frontend_test_complexity_threshold)"
go_max="$(quality_default_go_complexity_threshold)"
go_test_max="$(quality_default_go_test_complexity_threshold)"
declare -a explicit_files=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged)
      mode="staged"
      shift
      ;;
    --git-changes)
      mode="git-changes"
      shift
      ;;
    --all)
      mode="all"
      shift
      ;;
    --files)
      mode="files"
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing file list after --files" >&2
        exit 1
      fi
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --staged|--git-changes|--all|--files|--python-max|--frontend-max|--frontend-test-max|--go-max|--go-test-max|-h|--help)
            break
            ;;
          *)
            explicit_files+=("$1")
            shift
            ;;
        esac
      done
      if [[ ${#explicit_files[@]} -eq 0 ]]; then
        echo "Missing file list after --files" >&2
        exit 1
      fi
      ;;
    --python-max)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --python-max" >&2
        exit 1
      fi
      python_max="$1"
      shift
      ;;
    --frontend-max)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --frontend-max" >&2
        exit 1
      fi
      frontend_max="$1"
      shift
      ;;
    --frontend-test-max)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --frontend-test-max" >&2
        exit 1
      fi
      frontend_test_max="$1"
      shift
      ;;
    --go-max)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --go-max" >&2
        exit 1
      fi
      go_max="$1"
      shift
      ;;
    --go-test-max)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --go-test-max" >&2
        exit 1
      fi
      go_test_max="$1"
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

collect_files() {
  case "${mode}" in
    staged)
      git diff --cached --name-only --diff-filter=ACMR
      ;;
    git-changes)
      {
        git diff --name-only --diff-filter=ACMR HEAD --
        git ls-files --others --exclude-standard
      }
      ;;
    all)
      git ls-files
      ;;
    files)
      printf '%s\n' "${explicit_files[@]}"
      ;;
  esac
}

quality_validate_positive_integer "${python_max}" "--python-max"
quality_validate_positive_integer "${frontend_max}" "--frontend-max"
quality_validate_positive_integer "${frontend_test_max}" "--frontend-test-max"
quality_validate_positive_integer "${go_max}" "--go-max"
quality_validate_positive_integer "${go_test_max}" "--go-test-max"

cd "${repo_root}"
# shellcheck source=/dev/null
. ./activate.sh
if ! command -v python >/dev/null 2>&1; then
  echo "python is required after activating ./activate.sh." >&2
  exit 1
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-check-quality.XXXXXX")"
trap 'rm -rf "${tmp_dir}"' EXIT
selected_files_path="${tmp_dir}/selected-files.txt"
collect_files | LC_ALL=C sort -u >"${selected_files_path}"

declare -a python_files=()
declare -a python_test_files=()
declare -a frontend_eslint_files=()
declare -a frontend_test_complexity_files=()
declare -a frontend_test_file_length_files=()
declare -a frontend_boundary_files=()
declare -a frontend_guardrail_files=()
declare -a go_files=()
declare -a go_test_files=()
declare -a go_packages=()

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  python_files+=("${file_path}")
done < <(quality_filter_files python <"${selected_files_path}")

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  python_test_files+=("${file_path}")
done < <(quality_filter_files python-test <"${selected_files_path}")

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  frontend_eslint_files+=("$(quality_frontend_cli_path "${file_path}")")
done < <(quality_filter_files frontend-eslint <"${selected_files_path}")

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  frontend_test_complexity_files+=("$(quality_frontend_cli_path "${file_path}")")
done < <(quality_filter_files frontend-test-complexity <"${selected_files_path}")

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  frontend_test_file_length_files+=("${file_path}")
done < <(quality_filter_files frontend-test-file-length <"${selected_files_path}")

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  frontend_boundary_files+=("${file_path}")
done < <(quality_filter_files frontend-boundary <"${selected_files_path}")

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  frontend_guardrail_files+=("${file_path}")
done < <(quality_filter_files frontend-guardrail <"${selected_files_path}")

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  go_files+=("${file_path}")
  go_packages+=("./$(dirname "${file_path}")")
done < <(quality_filter_files go <"${selected_files_path}")

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  go_test_files+=("${file_path}")
done < <(quality_filter_files go-test <"${selected_files_path}")

if [[ ${#go_packages[@]} -gt 0 ]]; then
  IFS=$'\n' go_packages=($(printf '%s\n' "${go_packages[@]}" | LC_ALL=C sort -u))
  unset IFS
fi

if [[ ${#python_files[@]} -eq 0 && ${#python_test_files[@]} -eq 0 && ${#frontend_eslint_files[@]} -eq 0 && ${#frontend_test_complexity_files[@]} -eq 0 && ${#frontend_test_file_length_files[@]} -eq 0 && ${#frontend_boundary_files[@]} -eq 0 && ${#frontend_guardrail_files[@]} -eq 0 && ${#go_files[@]} -eq 0 && ${#go_test_files[@]} -eq 0 ]]; then
  echo "No supported files to check."
  exit 0
fi

status=0

run_frontend_test_complexity_check() {
  local output_path="$1"
  local max_complexity="$2"
  shift 2
  local eslint_status=0

  set +e
  pnpm -C frontend exec eslint \
    --format json \
    --no-warn-ignored \
    --rule "complexity:[\"error\",$(quality_effective_exceeds_threshold "${max_complexity}")]" \
    -- "$@" >"${output_path}"
  eslint_status=$?
  set -e

  if [[ "${eslint_status}" -gt 1 ]]; then
    return "${eslint_status}"
  fi

  python - "${output_path}" "${repo_root}" <<'PY'
import json
import os
import sys

report_path = sys.argv[1]
repo_root = sys.argv[2]

with open(report_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

complexity_rows = []
fatal_rows = []
for file_report in data:
    file_path = os.path.relpath(file_report["filePath"], repo_root)
    for message in file_report.get("messages", []):
        if message.get("fatal"):
            fatal_rows.append(
                (
                    file_path,
                    int(message.get("line") or 0),
                    int(message.get("column") or 0),
                    message.get("message", ""),
                )
            )
            continue
        if message.get("ruleId") != "complexity":
            continue
        complexity_rows.append(
            (
                file_path,
                int(message.get("line") or 0),
                int(message.get("column") or 0),
                message.get("message", ""),
            )
        )

if fatal_rows:
    print("Frontend test complexity check could not parse some files:")
    for path, line, column, message in fatal_rows:
        print(f"  {path}:{line}:{column}: {message}")
    raise SystemExit(1)

if complexity_rows:
    print("Frontend test complexity violations:")
    for path, line, column, message in complexity_rows:
        print(f"  {path}:{line}:{column}: {message}")
    raise SystemExit(1)
PY
}

declare -a python_quality_files=()
if [[ ${#python_files[@]} -gt 0 ]]; then
  python_quality_files+=("${python_files[@]}")
fi
if [[ ${#python_test_files[@]} -gt 0 ]]; then
  python_quality_files+=("${python_test_files[@]}")
fi
if [[ ${#python_quality_files[@]} -gt 0 ]]; then
  echo "Python quality checks (${#python_quality_files[@]} files)..."
  (
    set -euo pipefail
    ruff check "${python_quality_files[@]}"
    ruff check --select C901 --output-format=concise --config "lint.mccabe.max-complexity = $(quality_effective_exceeds_threshold "${python_max}")" "${python_quality_files[@]}"
  ) || status=1
fi

if [[ ${#python_files[@]} -gt 0 || ${#python_test_files[@]} -gt 0 || ${#frontend_eslint_files[@]} -gt 0 || ${#frontend_test_complexity_files[@]} -gt 0 || ${#frontend_test_file_length_files[@]} -gt 0 || ${#go_files[@]} -gt 0 || ${#go_test_files[@]} -gt 0 ]]; then
  echo "File length checks..."
  python ./scripts/quality/check_file_lengths.py --paths-file "${selected_files_path}" || status=1
fi

if [[ ${#frontend_eslint_files[@]} -gt 0 ]]; then
  echo "Frontend quality checks (${#frontend_eslint_files[@]} files)..."
  pnpm -C frontend exec eslint \
    --no-warn-ignored \
    --rule "complexity:[\"error\",$(quality_effective_exceeds_threshold "${frontend_max}")]" \
    --rule 'max-depth:["error",4]' \
    --rule 'max-params:["error",5]' \
    -- "${frontend_eslint_files[@]}" || status=1
fi

if [[ ${#frontend_test_complexity_files[@]} -gt 0 ]]; then
  echo "Frontend test complexity checks (${#frontend_test_complexity_files[@]} files)..."
  run_frontend_test_complexity_check "${tmp_dir}/frontend-test-complexity.json" "${frontend_test_max}" "${frontend_test_complexity_files[@]}" || status=1
fi

if [[ ${#frontend_boundary_files[@]} -gt 0 ]]; then
  echo "Frontend boundary checks (${#frontend_boundary_files[@]} files)..."
  node ./frontend/scripts/check_import_boundaries.mjs -- "${frontend_boundary_files[@]}" || status=1
fi

if [[ ${#frontend_guardrail_files[@]} -gt 0 ]]; then
  echo "Frontend standalone guardrail checks..."
  pnpm -C frontend exec vitest run src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts || status=1
fi

if [[ ${#go_files[@]} -gt 0 ]]; then
  echo "Go quality checks (${#go_files[@]} files)..."
  ./scripts/go.sh vet "${go_packages[@]}" || status=1
  ./scripts/go.sh run github.com/fzipp/gocyclo/cmd/gocyclo@"${GO_CYCLO_VERSION}" -over "$(quality_effective_exceeds_threshold "${go_max}")" "${go_files[@]}" || status=1
fi

if [[ ${#go_test_files[@]} -gt 0 ]]; then
  echo "Go test complexity checks (${#go_test_files[@]} files)..."
  ./scripts/go.sh run github.com/fzipp/gocyclo/cmd/gocyclo@"${GO_CYCLO_VERSION}" -over "$(quality_effective_exceeds_threshold "${go_test_max}")" "${go_test_files[@]}" || status=1
fi

exit "${status}"
