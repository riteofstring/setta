#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/quality/check.sh [--staged | --git-changes | --all | --files <path>...] [options]

Run lightweight repository quality checks for the current Setta 3 baseline.

Modes:
  --git-changes      Check tracked files changed from HEAD plus untracked files (default).
  --staged           Check staged files only.
  --all              Check all tracked files covered by this tool.
  --files <path>...  Check only the provided files.

Options:
  --go-max N         Fail Go cyclomatic complexity at >= N (default: 12).
  --go-test-max N    Fail Go test cyclomatic complexity at >= N (default: 20).
  --ts-max N         Fail TypeScript/JavaScript cyclomatic complexity at >= N (default: 10).
  --ts-test-max N    Fail TypeScript/JavaScript test complexity at >= N (default: 10).
  -h, --help         Show this help text.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly GO_CYCLO_VERSION="v0.6.0"
mode="git-changes"
go_max="12"
go_test_max="20"
ts_max="10"
ts_test_max="10"
max_lines="1200"
test_max_lines="1500"
declare -a explicit_files=()

require_positive_integer() {
  local value="$1"
  local label="$2"
  if ! [[ "${value}" =~ ^[0-9]+$ ]] || [[ "${value}" -lt 1 ]]; then
    echo "${label} must be a positive integer: ${value}" >&2
    exit 1
  fi
}

effective_max() {
  local value="$1"
  echo "$((value - 1))"
}

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
          --staged|--git-changes|--all|--files|--go-max|--go-test-max|--ts-max|--ts-test-max|-h|--help)
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
    --go-max)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --go-max" >&2; exit 1; }
      go_max="$1"
      shift
      ;;
    --go-test-max)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --go-test-max" >&2; exit 1; }
      go_test_max="$1"
      shift
      ;;
    --ts-max)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --ts-max" >&2; exit 1; }
      ts_max="$1"
      shift
      ;;
    --ts-test-max)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --ts-test-max" >&2; exit 1; }
      ts_test_max="$1"
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

require_positive_integer "${go_max}" "--go-max"
require_positive_integer "${go_test_max}" "--go-test-max"
require_positive_integer "${ts_max}" "--ts-max"
require_positive_integer "${ts_test_max}" "--ts-test-max"

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

normalize_path() {
  local path="$1"
  path="${path#./}"
  printf '%s\n' "${path}"
}

is_generated_or_vendor_path() {
  case "$1" in
    */node_modules/*|node_modules/*|*/dist/*|dist/*|*/build/*|build/*|*/generated/*|generated/*|*.generated.*|*_gen.go|*.gen.go)
      return 0
      ;;
  esac
  return 1
}

is_test_path() {
  case "$1" in
    *_test.go|*.test.*|*.spec.*|tests/*|*/tests/*|__tests__/*|*/__tests__/*)
      return 0
      ;;
  esac
  return 1
}

is_ts_path() {
  case "$1" in
    *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.mts|*.cts)
      case "$1" in
        *.d.ts) return 1 ;;
      esac
      return 0
      ;;
  esac
  return 1
}

line_count() {
  wc -l <"$1" | tr -d '[:space:]'
}

check_file_lengths() {
  local status=0
  local file_path=""
  local limit=""
  for file_path in "$@"; do
    if is_test_path "${file_path}"; then
      limit="${test_max_lines}"
    else
      limit="${max_lines}"
    fi
    count="$(line_count "${repo_root}/${file_path}")"
    if [[ "${count}" -gt "${limit}" ]]; then
      echo "File too long: ${file_path} has ${count} lines, max ${limit}." >&2
      status=1
    fi
  done
  return "${status}"
}

find_ts_project() {
  if [[ -f "${repo_root}/package.json" ]]; then
    printf '.\n'
    return 0
  fi
  return 1
}

project_relative_ts_path() {
  local project="$1"
  local file_path="$2"
  if [[ "${project}" == "." ]]; then
    printf '%s\n' "${file_path}"
    return 0
  fi
  case "${file_path}" in
    "${project}"/*)
      printf '%s\n' "${file_path#"${project}/"}"
      return 0
      ;;
  esac
  return 1
}

cd "${repo_root}"

declare -a go_files=()
declare -a go_test_files=()
declare -a ts_files=()
declare -a ts_test_files=()
declare -a python_files=()
declare -a shell_files=()
declare -a all_supported_files=()

while IFS= read -r raw_path; do
  file_path="$(normalize_path "${raw_path}")"
  [[ -n "${file_path}" ]] || continue
  [[ -f "${repo_root}/${file_path}" ]] || continue
  if is_generated_or_vendor_path "${file_path}"; then
    continue
  fi

  case "${file_path}" in
    *.go)
      if is_test_path "${file_path}"; then
        go_test_files+=("${file_path}")
      else
        go_files+=("${file_path}")
      fi
      all_supported_files+=("${file_path}")
      ;;
    *.py)
      python_files+=("${file_path}")
      all_supported_files+=("${file_path}")
      ;;
    *.sh)
      shell_files+=("${file_path}")
      all_supported_files+=("${file_path}")
      ;;
    *)
      if is_ts_path "${file_path}"; then
        if is_test_path "${file_path}"; then
          ts_test_files+=("${file_path}")
        else
          ts_files+=("${file_path}")
        fi
        all_supported_files+=("${file_path}")
      fi
      ;;
  esac
done < <(collect_files | LC_ALL=C sort -u)

if [[ ${#all_supported_files[@]} -eq 0 ]]; then
  echo "No supported files to check."
  exit 0
fi

status=0

echo "File length checks..."
check_file_lengths "${all_supported_files[@]}" || status=1

if [[ ${#shell_files[@]} -gt 0 ]]; then
  echo "Shell syntax checks (${#shell_files[@]} files)..."
  for file_path in "${shell_files[@]}"; do
    bash -n "${file_path}" || status=1
  done
fi

if [[ ${#python_files[@]} -gt 0 ]]; then
  echo "Python tooling syntax checks (${#python_files[@]} files)..."
  python3 - "${python_files[@]}" <<'PY' || status=1
import ast
import sys
from pathlib import Path

for path in sys.argv[1:]:
    ast.parse(Path(path).read_text(encoding="utf-8"), filename=path)
PY
fi

if [[ ${#go_files[@]} -gt 0 || ${#go_test_files[@]} -gt 0 ]]; then
  if [[ ! -f "${repo_root}/go.mod" ]]; then
    echo "Go files are present, but go.mod is missing." >&2
    status=1
  else
    gofmt_bin="$("${repo_root}/scripts/go.sh" env GOROOT)/bin/gofmt"
    gofmt_output="$("${gofmt_bin}" -l "${go_files[@]}" "${go_test_files[@]}")"
    if [[ -n "${gofmt_output}" ]]; then
      echo "Go files need gofmt:" >&2
      printf '%s\n' "${gofmt_output}" >&2
      status=1
    fi

    declare -a go_packages=()
    for file_path in "${go_files[@]}" "${go_test_files[@]}"; do
      go_packages+=("./$(dirname "${file_path}")")
    done
    IFS=$'\n' go_packages=($(printf '%s\n' "${go_packages[@]}" | LC_ALL=C sort -u))
    unset IFS

    echo "Go vet checks (${#go_packages[@]} packages)..."
    "${repo_root}/scripts/go.sh" vet "${go_packages[@]}" || status=1
    if [[ ${#go_files[@]} -gt 0 ]]; then
      "${repo_root}/scripts/go.sh" run "github.com/fzipp/gocyclo/cmd/gocyclo@${GO_CYCLO_VERSION}" \
        -over "$(effective_max "${go_max}")" "${go_files[@]}" || status=1
    fi
    if [[ ${#go_test_files[@]} -gt 0 ]]; then
      "${repo_root}/scripts/go.sh" run "github.com/fzipp/gocyclo/cmd/gocyclo@${GO_CYCLO_VERSION}" \
        -over "$(effective_max "${go_test_max}")" "${go_test_files[@]}" || status=1
    fi
  fi
fi

if [[ ${#ts_files[@]} -gt 0 || ${#ts_test_files[@]} -gt 0 ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required for TypeScript/JavaScript quality checks." >&2
    status=1
  elif ! ts_project="$(find_ts_project)"; then
    echo "TypeScript/JavaScript files are present, but no package.json was found." >&2
    status=1
  else
    declare -a project_ts_files=()
    declare -a project_ts_test_files=()
    for file_path in "${ts_files[@]}"; do
      if project_path="$(project_relative_ts_path "${ts_project}" "${file_path}")"; then
        project_ts_files+=("${project_path}")
      else
        echo "Cannot map ${file_path} into TypeScript project ${ts_project}." >&2
        status=1
      fi
    done
    for file_path in "${ts_test_files[@]}"; do
      if project_path="$(project_relative_ts_path "${ts_project}" "${file_path}")"; then
        project_ts_test_files+=("${project_path}")
      else
        echo "Cannot map ${file_path} into TypeScript project ${ts_project}." >&2
        status=1
      fi
    done
    if [[ ${#project_ts_files[@]} -gt 0 ]]; then
      echo "TypeScript/JavaScript quality checks (${#project_ts_files[@]} files)..."
      pnpm -C "${repo_root}/${ts_project}" exec eslint \
        --no-warn-ignored \
        --rule "complexity:[\"error\",$(effective_max "${ts_max}")]" \
        --rule 'max-depth:["error",4]' \
        --rule 'max-params:["error",5]' \
        -- "${project_ts_files[@]}" || status=1
    fi
    if [[ ${#project_ts_test_files[@]} -gt 0 ]]; then
      echo "TypeScript/JavaScript test complexity checks (${#project_ts_test_files[@]} files)..."
      pnpm -C "${repo_root}/${ts_project}" exec eslint \
        --no-warn-ignored \
        --rule "complexity:[\"error\",$(effective_max "${ts_test_max}")]" \
        -- "${project_ts_test_files[@]}" || status=1
    fi
  fi
fi

exit "${status}"
