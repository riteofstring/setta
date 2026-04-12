#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-test-fix-loop-init.sh OUTPUT_PATH

Generate the checklist used by scripts/run-codex-test-fix-loop.sh.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${1-}" == "-h" || "${1-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 1
fi

OUTPUT_PATH="$1"
mkdir -p "$(dirname "${OUTPUT_PATH}")"

go_packages_file="$(mktemp "${TMPDIR:-/tmp}/codex-test-fix-go.XXXXXX")"
python_targets_file="$(mktemp "${TMPDIR:-/tmp}/codex-test-fix-py.XXXXXX")"
vitest_paths_file="$(mktemp "${TMPDIR:-/tmp}/codex-test-fix-vitest-paths.XXXXXX")"
vitest_dirs_file="$(mktemp "${TMPDIR:-/tmp}/codex-test-fix-vitest-dirs.XXXXXX")"
vitest_root_files_file="$(mktemp "${TMPDIR:-/tmp}/codex-test-fix-vitest-root.XXXXXX")"
playwright_paths_file="$(mktemp "${TMPDIR:-/tmp}/codex-test-fix-pw-paths.XXXXXX")"
playwright_dirs_file="$(mktemp "${TMPDIR:-/tmp}/codex-test-fix-pw-dirs.XXXXXX")"
playwright_root_files_file="$(mktemp "${TMPDIR:-/tmp}/codex-test-fix-pw-root.XXXXXX")"

cleanup() {
  rm -f \
    "${go_packages_file}" \
    "${python_targets_file}" \
    "${vitest_paths_file}" \
    "${vitest_dirs_file}" \
    "${vitest_root_files_file}" \
    "${playwright_paths_file}" \
    "${playwright_dirs_file}" \
    "${playwright_root_files_file}"
}
trap cleanup EXIT

cd "${ROOT_DIR}"

find cmd internal -name '*_test.go' -print | xargs -n1 dirname | sort -u > "${go_packages_file}"
find tests \( -name 'test_*.py' -o -name '*_test.py' \) -print | xargs -n1 dirname | sort -u > "${python_targets_file}"
find frontend/src -type f \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' -o -name '*.spec.tsx' \) -print | sort > "${vitest_paths_file}"
find frontend/tests/e2e -type f \( -name '*.spec.ts' -o -name '*.spec.tsx' \) -print | sort > "${playwright_paths_file}"

while IFS= read -r path; do
  [[ -n "${path}" ]] || continue
  rel_path="${path#frontend/}"
  rel_dir="$(dirname "${rel_path}")"
  if [[ "${rel_dir}" == "src" ]]; then
    printf '%s\n' "${rel_path}" >> "${vitest_root_files_file}"
    continue
  fi
  printf '%s\n' "${rel_dir}" >> "${vitest_dirs_file}"
done < "${vitest_paths_file}"

while IFS= read -r path; do
  [[ -n "${path}" ]] || continue
  rel_path="${path#frontend/}"
  rel_dir="$(dirname "${rel_path}")"
  if [[ "${rel_dir}" == "tests/e2e" ]]; then
    printf '%s\n' "${rel_path}" >> "${playwright_root_files_file}"
    continue
  fi
  printf '%s\n' "${rel_dir}" >> "${playwright_dirs_file}"
done < "${playwright_paths_file}"

if [[ -s "${vitest_dirs_file}" ]]; then
  sort -u -o "${vitest_dirs_file}" "${vitest_dirs_file}"
fi

if [[ -s "${playwright_dirs_file}" ]]; then
  sort -u -o "${playwright_dirs_file}" "${playwright_dirs_file}"
fi

{
  cat <<'EOF'
# Codex Test Fix Loop Checklist

Keep this file accurate while the loop runs.

Rules:
- Mark `[x]` only after the listed scope passes.
- If later edits could affect a checked scope, change it back to `[ ]` until rerun.
- Do not delete items.
- Do not mark completion based on optimism; use passing test results only.
- External full-suite verification is handled outside this checklist.

## Go
EOF

  while IFS= read -r package_dir; do
    [[ -n "${package_dir}" ]] || continue
    printf -- '- [ ] GO ./%s :: ./scripts/run_go_tests.sh ./%s\n' "${package_dir}" "${package_dir}"
  done < "${go_packages_file}"

  cat <<'EOF'

## Python
EOF

  while IFS= read -r target_dir; do
    [[ -n "${target_dir}" ]] || continue
    printf -- '- [ ] PY %s :: ./scripts/run_backend_tests.sh %s\n' "${target_dir}" "${target_dir}"
  done < "${python_targets_file}"

  cat <<'EOF'

## TypeScript Vitest
EOF

  if [[ -s "${vitest_root_files_file}" ]]; then
    root_vitest_files="$(paste -sd ' ' "${vitest_root_files_file}")"
    printf -- '- [ ] TS-VITEST src/root-files :: pnpm -C frontend exec vitest run %s\n' "${root_vitest_files}"
  fi

  while IFS= read -r vitest_dir; do
    [[ -n "${vitest_dir}" ]] || continue
    printf -- '- [ ] TS-VITEST %s :: pnpm -C frontend exec vitest run %s\n' "${vitest_dir}" "${vitest_dir}"
  done < "${vitest_dirs_file}"

  cat <<'EOF'

## TypeScript Playwright
EOF

  if [[ -s "${playwright_root_files_file}" ]]; then
    root_playwright_files="$(paste -sd ' ' "${playwright_root_files_file}")"
    printf -- '- [ ] TS-PLAYWRIGHT tests/e2e/root-files :: ./scripts/run-playwright-e2e.sh %s\n' "${root_playwright_files}"
  fi

  while IFS= read -r playwright_dir; do
    [[ -n "${playwright_dir}" ]] || continue
    printf -- '- [ ] TS-PLAYWRIGHT %s :: ./scripts/run-playwright-e2e.sh %s\n' "${playwright_dir}" "${playwright_dir}"
  done < "${playwright_dirs_file}"

  cat <<'EOF'

## Notes
- When every item is `[x]`, the outer loop will run full verification:
  - `./scripts/run_go_tests.sh`
  - `./scripts/run_backend_tests.sh`
  - `pnpm -C frontend exec vitest run`
  - `./scripts/run-playwright-e2e.sh`
EOF
} > "${OUTPUT_PATH}"

echo "Wrote checklist to ${OUTPUT_PATH}"
