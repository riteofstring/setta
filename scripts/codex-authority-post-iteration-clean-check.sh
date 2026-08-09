#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-authority-post-iteration-clean-check.sh --root-dir PATH [options]

Verify that a completed Codex iteration leaves the repo clean and that no
delayed cleanup or generation drift appears during a short settle window.

Options:
  --settle-seconds N  Seconds to wait before the final clean-worktree recheck.
                      Default: 20
EOF
}

root_dir=""
settle_seconds="20"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root-dir)
      root_dir="${2:-}"
      shift 2
      ;;
    --settle-seconds)
      settle_seconds="${2:-}"
      shift 2
      ;;
    --help|-h)
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

if [[ -z "${root_dir}" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -d "${root_dir}" ]]; then
  echo "Root directory not found: ${root_dir}" >&2
  exit 1
fi

if [[ ! "${settle_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--settle-seconds must be a non-negative integer" >&2
  exit 1
fi

repo_is_clean() {
  if ! git -C "${root_dir}" diff --quiet --no-ext-diff --exit-code --; then
    return 1
  fi

  if ! git -C "${root_dir}" diff --cached --quiet --no-ext-diff --exit-code --; then
    return 1
  fi

  if git -C "${root_dir}" ls-files --others --exclude-standard | grep -q .; then
    return 1
  fi

  return 0
}

list_active_generation_processes() {
  local candidate_regex=""
  local line=""
  local pid=""
  local command=""
  local cwd=""
  local matches=()

  candidate_regex='pnpm gcf|pnpm generate|pnpm full-cleanup|runKnip\.mjs|openapi-ts|prettier/bin/prettier\.cjs|prune_generated_types\.py|fix_http_openapi_exact_optional\.mjs|setta-gen-(frontend-bindings|go-route-registries|go-shared-schema|go-type-registries|http-openapi|python-listener-endpoint-client|python-sdk-contracts|python-shared-constants|python-shared-types)|frontend/scripts/gcf\.sh|frontend/generation/generate(_go_frontend_bindings|_go_python_types|_http_openapi_bindings|_non_http_openapi_bindings)?\.sh'

  while IFS= read -r line; do
    [[ -n "${line}" ]] || continue
    pid="${line%% *}"
    command="${line#${pid}}"
    command="${command#"${command%%[![:space:]]*}"}"

    if [[ ! "${command}" =~ ${candidate_regex} ]]; then
      continue
    fi

    cwd=""
    if command -v lsof >/dev/null 2>&1; then
      cwd="$(
        lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null \
          | sed -n 's/^n//p' \
          | head -n 1
      )"
    fi

    if [[ -n "${cwd}" ]]; then
      if [[ "${cwd}" != "${root_dir}" ]] && [[ "${cwd}" != "${root_dir}/"* ]]; then
        continue
      fi
    elif [[ "${command}" != *"${root_dir}"* ]]; then
      continue
    fi

    matches+=("${line}")
  done < <(ps -axo pid=,command=)

  if [[ "${#matches[@]}" -eq 0 ]]; then
    return 1
  fi

  printf '%s\n' "${matches[@]}"
}

print_repo_state() {
  echo "git status --short:"
  git -C "${root_dir}" status --short
  echo
  echo "git diff --stat:"
  git -C "${root_dir}" diff --stat --no-ext-diff --
  echo
  echo "git diff --cached --stat:"
  git -C "${root_dir}" diff --cached --stat --no-ext-diff --
  echo
  echo "untracked files:"
  git -C "${root_dir}" ls-files --others --exclude-standard
}

if active_processes="$(list_active_generation_processes)"; then
  echo "Repo generation or cleanup processes are still running after the Codex iteration." >&2
  printf '%s\n' "${active_processes}" >&2
  exit 1
fi

initial_head="$(git -C "${root_dir}" rev-parse HEAD)"

if ! repo_is_clean; then
  echo "Repository was already dirty immediately after the Codex iteration." >&2
  print_repo_state >&2
  exit 1
fi

if [[ "${settle_seconds}" -gt 0 ]]; then
  sleep "${settle_seconds}"
fi

if active_processes="$(list_active_generation_processes)"; then
  echo "Repo generation or cleanup processes were still running after the settle window." >&2
  printf '%s\n' "${active_processes}" >&2
  exit 1
fi

settled_head="$(git -C "${root_dir}" rev-parse HEAD)"
if [[ "${settled_head}" != "${initial_head}" ]]; then
  echo "HEAD changed during the post-iteration settle window." >&2
  echo "initial HEAD: ${initial_head}" >&2
  echo "settled HEAD: ${settled_head}" >&2
  exit 1
fi

if ! repo_is_clean; then
  echo "Repository became dirty during the post-iteration settle window." >&2
  print_repo_state >&2
  exit 1
fi

echo "Post-iteration settle check passed."
