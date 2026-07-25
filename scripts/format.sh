#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${repo_root}/go.mod" ]]; then
  gofmt_bin="$("${repo_root}/scripts/go.sh" env GOROOT)/bin/gofmt"
  go_files=()
  while IFS= read -r file_path; do
    go_files+=("${file_path}")
  done < <(
    find "${repo_root}" \
      \( -path "${repo_root}/.git" -o -path "${repo_root}/.tools" -o -path "*/.build" -o -path "*/node_modules" -o -path "*/dist" -o -path "*/build" -o -path "*/out" -o -path "*/coverage" -o -path "*/test-results" -o -path "*/playwright-report" \) -prune \
      -o -name '*.go' -type f -print \
      | LC_ALL=C sort
  )
  if [[ ${#go_files[@]} -gt 0 ]]; then
    "${gofmt_bin}" -w "${go_files[@]}"
  fi
fi

while IFS= read -r package_json; do
  project_dir="$(dirname "${package_json}")"
  echo "Formatting ${project_dir#"${repo_root}"/}..."
  pnpm -C "${project_dir}" run format:write
done < <(
  find "${repo_root}" \
    \( -path "${repo_root}/.git" -o -path "${repo_root}/.tools" -o -path "*/.build" -o -path "*/node_modules" -o -path "*/dist" -o -path "*/build" -o -path "*/out" -o -path "*/coverage" -o -path "*/test-results" -o -path "*/playwright-report" \) -prune \
    -o -name package.json -type f -print \
    | LC_ALL=C sort
)
