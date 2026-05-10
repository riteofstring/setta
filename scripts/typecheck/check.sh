#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/typecheck/check.sh [--staged | --git-changes | --files <path>...] [--go] [--python] [--frontend]

Run changed-scope type checks suitable for a pre-commit pass.

Modes:
  --git-changes      Check tracked files changed from HEAD plus untracked files (default).
  --staged           Check staged files only.
  --files <path>...  Check only the provided files.

Options:
  --go        Run Go type checks for changed Go packages.
  --python    Run ty for changed Python files.
  --frontend  Run package type checks for changed frontend packages.
  -h, --help  Show this help text.

If no language flags are provided, all changed-language checks run.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="git-changes"
run_go=1
run_python=1
run_frontend=1
selected_any=0
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
    --files)
      mode="files"
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing file list after --files" >&2
        exit 1
      fi
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --staged|--git-changes|--files|--go|--python|--frontend|-h|--help)
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
    --go)
      if [[ "${selected_any}" -eq 0 ]]; then
        run_go=0
        run_python=0
        run_frontend=0
        selected_any=1
      fi
      run_go=1
      shift
      ;;
    --python)
      if [[ "${selected_any}" -eq 0 ]]; then
        run_go=0
        run_python=0
        run_frontend=0
        selected_any=1
      fi
      run_python=1
      shift
      ;;
    --frontend)
      if [[ "${selected_any}" -eq 0 ]]; then
        run_go=0
        run_python=0
        run_frontend=0
        selected_any=1
      fi
      run_frontend=1
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
    files)
      printf '%s\n' "${explicit_files[@]}"
      ;;
  esac
}

frontend_typecheck_dir_for_path() {
  local path="$1"
  case "${path}" in
    frontend/plugin-sdk/app-subsystem/*)
      if [[ -f "frontend/plugin-sdk/app-subsystem/package.json" ]]; then
        printf '%s\n' "frontend/plugin-sdk/app-subsystem"
      fi
      ;;
    frontend/*)
      if [[ -f "frontend/package.json" ]]; then
        printf '%s\n' "frontend"
      fi
      ;;
    plugins/*/frontend/*)
      local plugin_root
      plugin_root="$(printf '%s\n' "${path}" | awk -F/ '{print $1"/"$2"/"$3}')"
      if [[ -f "${plugin_root}/package.json" ]]; then
        printf '%s\n' "${plugin_root}"
      fi
      ;;
  esac
}

cd "${repo_root}"

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-typecheck-changed.XXXXXX")"
trap 'rm -rf "${tmp_dir}"' EXIT
selected_files_path="${tmp_dir}/selected-files.txt"
collect_files | LC_ALL=C sort -u >"${selected_files_path}"

declare -a go_packages=()
declare -a python_files=()
declare -a frontend_typecheck_dirs=()

while IFS= read -r raw_path; do
  [[ -n "${raw_path}" ]] || continue
  path="${raw_path#./}"
  [[ -f "${path}" ]] || continue
  case "${path}" in
    *.go)
      if [[ "${run_go}" -eq 1 ]]; then
        go_packages+=("./$(dirname "${path}")")
      fi
      ;;
    *.py)
      if [[ "${run_python}" -eq 1 ]]; then
        python_files+=("${path}")
      fi
      ;;
    *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.mts|*.cts|*.json)
      if [[ "${run_frontend}" -eq 1 ]]; then
        while IFS= read -r typecheck_dir; do
          [[ -n "${typecheck_dir}" ]] && frontend_typecheck_dirs+=("${typecheck_dir}")
        done < <(frontend_typecheck_dir_for_path "${path}")
      fi
      ;;
  esac
done <"${selected_files_path}"

if [[ ${#go_packages[@]} -gt 0 ]]; then
  IFS=$'\n' go_packages=($(printf '%s\n' "${go_packages[@]}" | LC_ALL=C sort -u))
  unset IFS
fi
if [[ ${#python_files[@]} -gt 0 ]]; then
  IFS=$'\n' python_files=($(printf '%s\n' "${python_files[@]}" | LC_ALL=C sort -u))
  unset IFS
fi
if [[ ${#frontend_typecheck_dirs[@]} -gt 0 ]]; then
  IFS=$'\n' frontend_typecheck_dirs=($(printf '%s\n' "${frontend_typecheck_dirs[@]}" | LC_ALL=C sort -u))
  unset IFS
fi

if [[ ${#go_packages[@]} -eq 0 && ${#python_files[@]} -eq 0 && ${#frontend_typecheck_dirs[@]} -eq 0 ]]; then
  echo "No changed files require type checks."
  exit 0
fi

status=0

if [[ ${#go_packages[@]} -gt 0 ]]; then
  echo "Go type checks (${#go_packages[@]} packages)..."
  ./scripts/go.sh test -run '^$' -count=1 "${go_packages[@]}" || status=1
fi

if [[ ${#python_files[@]} -gt 0 ]]; then
  echo "Python type checks (${#python_files[@]} files)..."
  (
    set -euo pipefail
    . ./activate.sh
    if ! command -v ty >/dev/null 2>&1; then
      echo "ty is required after activating ./activate.sh." >&2
      exit 1
    fi
    ty check --output-format concise "${python_files[@]}"
  ) || status=1
fi

if [[ ${#frontend_typecheck_dirs[@]} -gt 0 ]]; then
  for frontend_typecheck_dir in "${frontend_typecheck_dirs[@]}"; do
    echo "Frontend type checks (${frontend_typecheck_dir})..."
    pnpm -C "${frontend_typecheck_dir}" typecheck || status=1
  done
fi

exit "${status}"
