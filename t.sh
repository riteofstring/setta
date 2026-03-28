#!/usr/bin/env bash
set -uo pipefail

run_backend=1
run_frontend=1
run_playwright=1

usage() {
  cat <<'EOF'
Usage: ./t.sh [--b | --f] [--all]

Options:
  --b              Run backend pytest only.
  --f              Run frontend Vitest + Playwright only.
  --all            Enable opt-in external agent integration tests.
  -h, --help       Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --b)
      run_backend=1
      run_frontend=0
      run_playwright=0
      shift
      ;;
    --f)
      run_backend=0
      run_frontend=1
      run_playwright=1
      shift
      ;;
    --all)
      export SETTA_RUN_EXTERNAL_AGENT_INTEGRATION_TESTS=1
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

discover_playwright_suites() {
  local python_bin="python3"
  if ! command -v "${python_bin}" >/dev/null 2>&1; then
    if command -v python >/dev/null 2>&1; then
      python_bin="python"
    else
      echo "python3 or python is required to discover Playwright suites." >&2
      return 1
    fi
  fi
  "${python_bin}" - <<'PY'
import pathlib

root = pathlib.Path("frontend/tests/e2e")
excluded = {"__pycache__", "fixtures"}
suites = set()

if root.exists():
    if any(root.glob("*.spec.*")):
        suites.add("root")
    for spec in root.rglob("*.spec.*"):
        rel = spec.relative_to(root)
        if any(part in excluded for part in rel.parts):
            continue
        if len(rel.parts) <= 1:
            continue
        suites.add(rel.parent.as_posix())

for suite in sorted(suites):
    print(suite)
PY
}

run_playwright_ci_suites() {
  local suites_output
  if ! suites_output="$(discover_playwright_suites)"; then
    return 1
  fi
  local suites=()
  local suite_line
  while IFS= read -r suite_line; do
    [[ -z "${suite_line}" ]] && continue
    suites+=("${suite_line}")
  done <<< "${suites_output}"
  if [[ ${#suites[@]} -eq 0 ]]; then
    echo "No Playwright suites discovered."
    return 0
  fi

  local suite_status=0
  local suite
  for suite in "${suites[@]}"; do
    echo "Running Playwright suite: ${suite}"
    if [[ "${suite}" == "root" ]]; then
      shopt -s nullglob
      local root_files=(frontend/tests/e2e/*.spec.*)
      local args=()
      local file
      for file in "${root_files[@]}"; do
        args+=("${file#frontend/}")
      done
      if [[ ${#args[@]} -eq 0 ]]; then
        echo "Skipping root suite (no root-level Playwright specs)."
        continue
      fi
      ./scripts/run-playwright-e2e.sh "${args[@]}" || suite_status=1
      continue
    fi
    ./scripts/run-playwright-e2e.sh "tests/e2e/${suite}" || suite_status=1
  done

  return "${suite_status}"
}

if [[ "${run_backend}" -eq 1 ]] && [[ "${run_frontend}" -eq 0 ]]; then
  LOG_FILE="tests-backend.log"
elif [[ "${run_backend}" -eq 0 ]] && [[ "${run_frontend}" -eq 1 ]]; then
  LOG_FILE="tests-frontend.log"
else
  LOG_FILE="tests.log"
fi

log_dir="$(dirname "${LOG_FILE}")"
if [[ -n "${log_dir}" ]] && [[ "${log_dir}" != "." ]]; then
  mkdir -p "${log_dir}"
fi
: > "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

status=0

if [[ "${run_backend}" -eq 1 ]]; then
  ./scripts/run_backend_tests.sh || status=1
fi
if [[ "${run_frontend}" -eq 1 ]]; then
  CI=1 pnpm -C frontend test -- --run || status=1
fi
if [[ "${run_playwright}" -eq 1 ]]; then
  run_playwright_ci_suites || status=1
fi

exit "${status}"
