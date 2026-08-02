#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/quality/check.sh [--staged | --git-changes | --all | --files <path>...] [options]

Run lightweight repository quality checks for the current Setta 3 baseline.

Modes:
  --git-changes      Check tracked files changed from HEAD plus untracked files (default).
  --staged           Check staged files only.
  --all              Check all tracked and untracked files covered by this tool.
  --files <path>...  Check only the provided files.

Options:
  --go-max N         Fail Go cyclomatic complexity at >= N (default: 12).
  --go-test-max N    Fail Go test cyclomatic complexity at >= N (default: 20).
  --ts-max N         Fail TypeScript/JavaScript cyclomatic complexity at >= N (default: 10).
  --ts-test-max N    Fail TypeScript/JavaScript test complexity at >= N (default: 10).
  --max-lines N      Fail normal files above N lines (default: 1000).
  --test-max-lines N Fail test files above N lines (default: 1500).
  -h, --help         Show this help text.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly GO_CYCLO_VERSION="v0.6.0"
readonly STATICCHECK_VERSION="v0.7.0"
mode="git-changes"
go_max="12"
go_test_max="20"
ts_max="10"
ts_test_max="10"
max_lines="1000"
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
          --staged|--git-changes|--all|--files|--go-max|--go-test-max|--ts-max|--ts-test-max|--max-lines|--test-max-lines|-h|--help)
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
    --max-lines)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --max-lines" >&2; exit 1; }
      max_lines="$1"
      shift
      ;;
    --test-max-lines)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --test-max-lines" >&2; exit 1; }
      test_max_lines="$1"
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
require_positive_integer "${max_lines}" "--max-lines"
require_positive_integer "${test_max_lines}" "--test-max-lines"

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
      {
        git ls-files
        git ls-files --others --exclude-standard
      }
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
    */node_modules/*|node_modules/*|*/dist/*|dist/*|*/build/*|build/*|*/out/*|out/*|*/coverage/*|coverage/*|*/test-results/*|test-results/*|*/playwright-report/*|playwright-report/*|*/generated/*|generated/*|*.generated.*|*_gen.go|*.gen.go)
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

is_node_tool_path() {
  case "$1" in
    scripts/check_electron_test_template_literals.mjs)
      return 0
      ;;
  esac
  return 1
}

is_eval_fixture_path() {
  case "$1" in
    evals/fixtures/typescript-service/*)
      return 0
      ;;
  esac
  return 1
}

is_prettier_path() {
  case "$1" in
    *.css|*.html|*.js|*.jsx|*.json|*.jsonc|*.md|*.mjs|*.cjs|*.mts|*.cts|*.ts|*.tsx|*.yaml|*.yml)
      case "$1" in
        desktop/pnpm-lock.yaml|pnpm-lock.yaml|*.d.ts) return 1 ;;
      esac
      return 0
      ;;
  esac
  return 1
}

is_length_excluded_path() {
  case "$1" in
    docs/mockups/*)
      return 0
      ;;
    internal/codexapp/protocolschema/json/*|internal/codexapp/protocolschema/json_experimental/*|internal/speech/openaischema/openapi.yaml)
      return 0
      ;;
    LICENSE|desktop/pnpm-lock.yaml|pnpm-lock.yaml|*.lock|go.sum)
      return 0
      ;;
  esac
  return 1
}

has_shell_shebang() {
  local path="$1"
  local first_line=""
  IFS= read -r first_line <"${repo_root}/${path}" || return 1
  case "${first_line}" in
    '#!'*'/sh'|'#!'*'/sh '*|'#!'*'/bash'|'#!'*'/bash '*|'#!'*' bash'|'#!'*' bash '*|'#!'*' sh'|'#!'*' sh '*)
      return 0
      ;;
  esac
  return 1
}

is_shell_path() {
  case "$1" in
    *.sh|*.bash)
      return 0
      ;;
  esac
  has_shell_shebang "$1"
}

is_length_checked_path() {
  if is_length_excluded_path "$1"; then
    return 1
  fi
  if is_shell_path "$1" || is_ts_path "$1"; then
    return 0
  fi
  case "$1" in
    *.css|*.cjs|*.go|*.html|*.js|*.jsx|*.json|*.jsonc|*.mjs|*.mts|*.cts|*.py|*.toml|*.yaml|*.yml)
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
  local count=""
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
  local file_path="$1"
  local dir
  dir="$(dirname "${file_path}")"
  while true; do
    if [[ -f "${repo_root}/${dir}/package.json" ]]; then
      printf '%s\n' "${dir}"
      return 0
    fi
    if [[ "${dir}" == "." ]]; then
      break
    fi
    dir="$(dirname "${dir}")"
  done
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

has_ts_project() {
  local candidate="$1"
  local existing
  for existing in "${ts_projects[@]+"${ts_projects[@]}"}"; do
    if [[ "${existing}" == "${candidate}" ]]; then
      return 0
    fi
  done
  return 1
}

has_format_project() {
  local candidate="$1"
  local existing
  for existing in "${format_projects[@]+"${format_projects[@]}"}"; do
    if [[ "${existing}" == "${candidate}" ]]; then
      return 0
    fi
  done
  return 1
}

has_eval_fixture_project() {
  local candidate="$1"
  local existing
  for existing in "${eval_fixture_projects[@]+"${eval_fixture_projects[@]}"}"; do
    if [[ "${existing}" == "${candidate}" ]]; then
      return 0
    fi
  done
  return 1
}

cd "${repo_root}"

declare -a go_files=()
declare -a go_test_files=()
declare -a ts_files=()
declare -a ts_test_files=()
declare -a python_files=()
declare -a shell_files=()
declare -a node_tool_files=()
declare -a all_supported_files=()
declare -a electron_test_template_files=()
declare -a length_files=()
declare -a format_projects=()
declare -a eval_fixture_projects=()
collection_status=0

while IFS= read -r raw_path; do
  file_path="$(normalize_path "${raw_path}")"
  [[ -n "${file_path}" ]] || continue
  [[ -f "${repo_root}/${file_path}" ]] || continue
  if is_generated_or_vendor_path "${file_path}"; then
    continue
  fi

  if is_length_checked_path "${file_path}"; then
    length_files+=("${file_path}")
    all_supported_files+=("${file_path}")
  fi

  case "${file_path}" in
    desktop/tests/electron/*.js|desktop/tests/electron/*.mjs)
      electron_test_template_files+=("${file_path}")
      ;;
  esac

  if is_eval_fixture_path "${file_path}"; then
    if eval_fixture_project="$(find_ts_project "${file_path}")"; then
      if ! has_eval_fixture_project "${eval_fixture_project}"; then
        eval_fixture_projects+=("${eval_fixture_project}")
      fi
    else
      echo "Evaluation fixture has no owning package.json: ${file_path}" >&2
      collection_status=1
    fi
    continue
  fi

  if is_prettier_path "${file_path}" && format_project="$(find_ts_project "${file_path}")"; then
    if ! has_format_project "${format_project}"; then
      format_projects+=("${format_project}")
    fi
    all_supported_files+=("${file_path}")
  fi

  case "${file_path}" in
    *.go)
      if is_test_path "${file_path}"; then
        go_test_files+=("${file_path}")
      else
        go_files+=("${file_path}")
      fi
      ;;
    *.py)
      python_files+=("${file_path}")
      ;;
    *)
      if is_shell_path "${file_path}"; then
        shell_files+=("${file_path}")
        all_supported_files+=("${file_path}")
      elif is_node_tool_path "${file_path}"; then
        node_tool_files+=("${file_path}")
        all_supported_files+=("${file_path}")
      elif is_ts_path "${file_path}"; then
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

if [[ ${#all_supported_files[@]} -eq 0 && ${#eval_fixture_projects[@]} -eq 0 ]]; then
  echo "No supported files to check."
  exit 0
fi

status="${collection_status}"

echo "File length checks..."
if [[ ${#length_files[@]} -gt 0 ]]; then
  check_file_lengths "${length_files[@]}" || status=1
fi

if [[ ${#electron_test_template_files[@]} -gt 0 ]]; then
  echo "Electron test browser-program template checks (${#electron_test_template_files[@]} files)..."
  node "${repo_root}/scripts/check_electron_test_template_literals.mjs" \
    "${electron_test_template_files[@]}" || status=1
fi

if [[ ${#shell_files[@]} -gt 0 ]]; then
  echo "Shell syntax checks (${#shell_files[@]} files)..."
  for file_path in "${shell_files[@]}"; do
    bash -n "${file_path}" || status=1
  done
  echo "Shell lint checks (${#shell_files[@]} files)..."
  "${repo_root}/scripts/shellcheck.sh" "${shell_files[@]}" || status=1
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

if [[ ${#node_tool_files[@]} -gt 0 ]]; then
  echo "Node tooling syntax checks (${#node_tool_files[@]} files)..."
  for file_path in "${node_tool_files[@]}"; do
    node --check "${file_path}" || status=1
  done
fi

if [[ ${#go_files[@]} -gt 0 || ${#go_test_files[@]} -gt 0 ]]; then
  if [[ ! -f "${repo_root}/go.mod" ]]; then
    echo "Go files are present, but go.mod is missing." >&2
    status=1
  else
    declare -a go_check_files=()
    if [[ ${#go_files[@]} -gt 0 ]]; then
      go_check_files+=("${go_files[@]}")
    fi
    if [[ ${#go_test_files[@]} -gt 0 ]]; then
      go_check_files+=("${go_test_files[@]}")
    fi

    gofmt_bin="$("${repo_root}/scripts/go.sh" env GOROOT)/bin/gofmt"
    gofmt_output="$("${gofmt_bin}" -l "${go_check_files[@]}")"
    if [[ -n "${gofmt_output}" ]]; then
      echo "Go files need gofmt:" >&2
      printf '%s\n' "${gofmt_output}" >&2
      status=1
    fi

    declare -a go_packages=()
    for file_path in "${go_check_files[@]}"; do
      go_packages+=("./$(dirname "${file_path}")")
    done
    declare -a sorted_go_packages=()
    while IFS= read -r package_path; do
      [[ -n "${package_path}" ]] && sorted_go_packages+=("${package_path}")
    done < <(printf '%s\n' "${go_packages[@]}" | LC_ALL=C sort -u)
    go_packages=("${sorted_go_packages[@]}")

    echo "Go vet checks (${#go_packages[@]} packages)..."
    "${repo_root}/scripts/go.sh" vet "${go_packages[@]}" || status=1
    echo "Go test checks (${#go_packages[@]} packages)..."
    "${repo_root}/scripts/run_go_tests.sh" "${go_packages[@]}" || status=1
    echo "Go dead-code checks (${#go_packages[@]} packages)..."
    "${repo_root}/scripts/go.sh" run "honnef.co/go/tools/cmd/staticcheck@${STATICCHECK_VERSION}" \
      -checks=U1000 "${go_packages[@]}" || status=1
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

if [[ ${#format_projects[@]} -gt 0 ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required for project formatting checks." >&2
    status=1
  else
    for format_project in "${format_projects[@]}"; do
      if pnpm -C "${repo_root}/${format_project}" run | grep -q '^  format$'; then
        echo "Project formatting checks (${format_project})..."
        pnpm -C "${repo_root}/${format_project}" run format || status=1
      fi
    done
  fi
fi

if [[ ${#eval_fixture_projects[@]} -gt 0 ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required for evaluation fixture quality checks." >&2
    status=1
  else
    for eval_fixture_project in "${eval_fixture_projects[@]}"; do
      echo "Evaluation fixture quality checks (${eval_fixture_project})..."
      pnpm -C "${repo_root}/${eval_fixture_project}" run quality || status=1
    done
  fi
fi

if [[ ${#ts_files[@]} -gt 0 || ${#ts_test_files[@]} -gt 0 ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required for TypeScript/JavaScript quality checks." >&2
    status=1
  else
    declare -a ts_projects=()
    if [[ ${#ts_files[@]} -gt 0 ]]; then
      for file_path in "${ts_files[@]}"; do
        if ts_project="$(find_ts_project "${file_path}")"; then
          if ! has_ts_project "${ts_project}"; then
            ts_projects+=("${ts_project}")
          fi
        else
          echo "TypeScript/JavaScript file has no owning package.json: ${file_path}" >&2
          status=1
        fi
      done
    fi
    if [[ ${#ts_test_files[@]} -gt 0 ]]; then
      for file_path in "${ts_test_files[@]}"; do
        if ts_project="$(find_ts_project "${file_path}")"; then
          if ! has_ts_project "${ts_project}"; then
            ts_projects+=("${ts_project}")
          fi
        else
          echo "TypeScript/JavaScript file has no owning package.json: ${file_path}" >&2
          status=1
        fi
      done
    fi

    if [[ ${#ts_projects[@]} -gt 0 ]]; then
      for ts_project in "${ts_projects[@]}"; do
        declare -a project_ts_files=()
        declare -a project_ts_test_files=()
        if [[ ${#ts_files[@]} -gt 0 ]]; then
          for file_path in "${ts_files[@]}"; do
            if project_path="$(project_relative_ts_path "${ts_project}" "${file_path}")"; then
              project_ts_files+=("${project_path}")
            fi
          done
        fi
        if [[ ${#ts_test_files[@]} -gt 0 ]]; then
          for file_path in "${ts_test_files[@]}"; do
            if project_path="$(project_relative_ts_path "${ts_project}" "${file_path}")"; then
              project_ts_test_files+=("${project_path}")
            fi
          done
        fi

        if [[ ${#project_ts_files[@]} -gt 0 ]]; then
          echo "TypeScript/JavaScript quality checks (${ts_project}, ${#project_ts_files[@]} files)..."
          pnpm -C "${repo_root}/${ts_project}" exec eslint \
            --no-warn-ignored \
            --rule "complexity:[\"error\",$(effective_max "${ts_max}")]" \
            --rule 'max-depth:["error",4]' \
            --rule 'max-params:["error",5]' \
            -- "${project_ts_files[@]}" || status=1
        fi
        if [[ ${#project_ts_test_files[@]} -gt 0 ]]; then
          echo "TypeScript/JavaScript test complexity checks (${ts_project}, ${#project_ts_test_files[@]} files)..."
          pnpm -C "${repo_root}/${ts_project}" exec eslint \
            --no-warn-ignored \
            --rule "complexity:[\"error\",$(effective_max "${ts_test_max}")]" \
            -- "${project_ts_test_files[@]}" || status=1
        fi
        echo "TypeScript/JavaScript typecheck (${ts_project})..."
        pnpm -C "${repo_root}/${ts_project}" run typecheck || status=1
        echo "TypeScript/JavaScript tests (${ts_project})..."
        pnpm -C "${repo_root}/${ts_project}" run test || status=1
        echo "TypeScript/JavaScript build (${ts_project})..."
        pnpm -C "${repo_root}/${ts_project}" run build || status=1
        if pnpm -C "${repo_root}/${ts_project}" run | grep -q '^  deadcode$'; then
          echo "TypeScript/JavaScript dead-code checks (${ts_project})..."
          pnpm -C "${repo_root}/${ts_project}" run deadcode || status=1
        fi
        if [[ "${mode}" == "all" && "${ts_project}" == "desktop" ]]; then
          echo "Electron workflow integration checks (${ts_project})..."
          pnpm -C "${repo_root}/${ts_project}" run test:electron:built || status=1
        fi
      done
    fi
  fi
fi

exit "${status}"
