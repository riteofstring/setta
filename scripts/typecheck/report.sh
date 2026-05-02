#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/typecheck/report.sh [--go] [--python] [--frontend]

Run full-repo type checks across Go, Python, and frontend TypeScript packages.

Options:
  --go        Run Go compile/type checks only.
  --python    Run Python type checks only.
  --frontend  Run frontend TypeScript checks only.
  -h, --help  Show this help text.

If no language flags are provided, all checks run.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
run_go=1
run_python=1
run_frontend=1
selected_any=0

while [[ $# -gt 0 ]]; do
  case "$1" in
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

cd "${repo_root}"

status=0

if [[ "${run_go}" -eq 1 ]]; then
  echo "Go type checks..."
  ./scripts/go.sh test -run '^$' -count=1 ./... || status=1
fi

if [[ "${run_python}" -eq 1 ]]; then
  echo "Python type checks..."
  python_files=()
  while IFS= read -r python_file; do
    [[ -n "${python_file}" ]] && python_files+=("${python_file}")
  done < <(git ls-files '*.py')
  if [[ ${#python_files[@]} -eq 0 ]]; then
    echo "No tracked Python files to check."
  else
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
fi

if [[ "${run_frontend}" -eq 1 ]]; then
  echo "Frontend type checks..."
  declare -a frontend_typecheck_dirs=("frontend")
  if [[ -f "frontend/plugin-sdk/app-subsystem/package.json" ]]; then
    frontend_typecheck_dirs+=("frontend/plugin-sdk/app-subsystem")
  fi
  if [[ -d "plugins" ]]; then
    while IFS= read -r plugin_frontend_package; do
      [[ -n "${plugin_frontend_package}" ]] || continue
      frontend_typecheck_dirs+=("$(dirname "${plugin_frontend_package}")")
    done < <(find plugins -mindepth 3 -maxdepth 3 -path 'plugins/*/frontend/package.json' -type f | LC_ALL=C sort)
  fi

  for frontend_typecheck_dir in "${frontend_typecheck_dirs[@]}"; do
    echo "Frontend type checks (${frontend_typecheck_dir})..."
    pnpm -C "${frontend_typecheck_dir}" typecheck || status=1
  done
fi

exit "${status}"
