#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./check_quality.sh [--staged | --git-changes | --all | --files <path>...] [--python-max N] [--frontend-max N] [--go-max N]

Runs maintainability-oriented quality checks with an emphasis on cyclomatic complexity.

Modes:
  --git-changes      Check tracked files changed from HEAD plus untracked files (default).
  --staged           Check staged files only.
  --all              Check all tracked files covered by this tool.
  --files <path>...  Check only the provided files.

Thresholds:
  --python-max N     Maximum allowed Python cyclomatic complexity (default: 10).
  --frontend-max N   Maximum allowed frontend JS/TS cyclomatic complexity (default: 10).
  --go-max N         Maximum allowed Go cyclomatic complexity (default: 12).
  -h, --help         Show this help text.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly GO_CYCLO_VERSION="v0.6.0"
mode="git-changes"
python_max="10"
frontend_max="10"
go_max="12"
declare -a explicit_files=()

# shellcheck source=scripts/lib/quality_paths.sh
. "${repo_root}/scripts/lib/quality_paths.sh"

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
          --staged|--git-changes|--all|--files|--python-max|--frontend-max|--go-max|-h|--help)
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
    --go-max)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --go-max" >&2
        exit 1
      fi
      go_max="$1"
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

validate_integer() {
  local value="$1"
  local label="$2"
  if ! [[ "${value}" =~ ^[0-9]+$ ]]; then
    echo "${label} must be a non-negative integer: ${value}" >&2
    exit 1
  fi
}

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

validate_integer "${python_max}" "--python-max"
validate_integer "${frontend_max}" "--frontend-max"
validate_integer "${go_max}" "--go-max"

cd "${repo_root}"

declare -a python_files=()
declare -a frontend_eslint_files=()
declare -a go_files=()
declare -a go_packages=()

while IFS= read -r file_path; do
  [[ -z "${file_path}" ]] && continue
  [[ -f "${file_path}" ]] || continue

  if quality_is_python_candidate "${file_path}"; then
    python_files+=("${file_path}")
  fi
  if quality_is_frontend_candidate "${file_path}"; then
    frontend_eslint_files+=("$(quality_frontend_cli_path "${file_path}")")
  fi
  if quality_is_go_candidate "${file_path}"; then
    go_files+=("${file_path}")
    go_packages+=("./$(dirname "${file_path}")")
  fi
done < <(collect_files | LC_ALL=C sort -u)

if [[ ${#go_packages[@]} -gt 0 ]]; then
  IFS=$'\n' go_packages=($(printf '%s\n' "${go_packages[@]}" | LC_ALL=C sort -u))
  unset IFS
fi

if [[ ${#python_files[@]} -eq 0 && ${#frontend_eslint_files[@]} -eq 0 && ${#go_files[@]} -eq 0 ]]; then
  echo "No supported files to check."
  exit 0
fi

status=0

if [[ ${#python_files[@]} -gt 0 ]]; then
  echo "Python quality checks (${#python_files[@]} files)..."
  (
    set -euo pipefail
    . ./activate.sh
    ruff check "${python_files[@]}"
    ruff check --select C901 --output-format=concise --config "lint.mccabe.max-complexity = ${python_max}" "${python_files[@]}"
  ) || status=1
fi

if [[ ${#frontend_eslint_files[@]} -gt 0 ]]; then
  echo "Frontend quality checks (${#frontend_eslint_files[@]} files)..."
  pnpm -C frontend exec eslint \
    --rule "complexity:[\"error\",${frontend_max}]" \
    --rule 'max-depth:["error",4]' \
    --rule 'max-params:["error",5]' \
    -- "${frontend_eslint_files[@]}" || status=1
fi

if [[ ${#go_files[@]} -gt 0 ]]; then
  echo "Go quality checks (${#go_files[@]} files)..."
  ./scripts/go.sh vet "${go_packages[@]}" || status=1
  ./scripts/go.sh run github.com/fzipp/gocyclo/cmd/gocyclo@"${GO_CYCLO_VERSION}" -over "${go_max}" "${go_files[@]}" || status=1
fi

exit "${status}"
