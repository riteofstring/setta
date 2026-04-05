#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-authority-cleanup-loop-check.sh --root-dir PATH --output-dir PATH --state-dir PATH [options]

Exit 0 while work remains.
Exit the configured completion code only after the latest Codex response emits the
explicit stop sentinel, the worktree is clean, and no new commit was created in
that stop iteration.

Any non-stop iteration must advance HEAD and leave the repo clean.
EOF
}

root_dir=""
output_dir=""
state_dir=""
complete_exit_code="42"
sentinel="CODEX_LOOP_STOP: NO_ISSUES_FOUND"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root-dir)
      root_dir="${2:-}"
      shift 2
      ;;
    --output-dir)
      output_dir="${2:-}"
      shift 2
      ;;
    --state-dir)
      state_dir="${2:-}"
      shift 2
      ;;
    --complete-exit-code)
      complete_exit_code="${2:-}"
      shift 2
      ;;
    --sentinel)
      sentinel="${2:-}"
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

if [[ -z "${root_dir}" ]] || [[ -z "${output_dir}" ]] || [[ -z "${state_dir}" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -d "${root_dir}" ]]; then
  echo "Root directory not found: ${root_dir}" >&2
  exit 1
fi

if [[ ! -d "${output_dir}" ]]; then
  echo "Output directory not found: ${output_dir}" >&2
  exit 1
fi

if [[ ! "${complete_exit_code}" =~ ^[0-9]+$ ]] || [[ "${complete_exit_code}" -lt 0 ]] || [[ "${complete_exit_code}" -gt 255 ]]; then
  echo "--complete-exit-code must be an integer between 0 and 255" >&2
  exit 1
fi

mkdir -p "${state_dir}"

status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"
current_head="$(git -C "${root_dir}" rev-parse HEAD)"

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

if [[ ! -f "${head_file}" ]]; then
  printf '%s\n' "${current_head}" > "${head_file}"
  printf '%s\n' "pending" > "${status_file}"
  echo "Recorded initial HEAD."
  exit 0
fi

previous_head="$(<"${head_file}")"

latest_run_suffix="$(
  find "${output_dir}" -maxdepth 2 -type f -path "${output_dir}/run-*/last-message.txt" -print 2>/dev/null \
    | sed -E 's#^.*/run-([0-9]+)/last-message\.txt$#\1#' \
    | sort -n \
    | tail -n 1
)"

if [[ -z "${latest_run_suffix}" ]]; then
  printf '%s\n' "pending" > "${status_file}"
  echo "No previous loop runs found yet."
  exit 0
fi

response_file="${output_dir}/run-${latest_run_suffix}/last-message.txt"

if grep -Fxq "${sentinel}" "${response_file}"; then
  if [[ "${current_head}" != "${previous_head}" ]]; then
    printf '%s\n' "error:stop-sentinel-after-commit" > "${status_file}"
    echo "Latest iteration emitted the stop sentinel after advancing HEAD." >&2
    exit 1
  fi

  if ! repo_is_clean; then
    printf '%s\n' "error:stop-sentinel-dirty-worktree" > "${status_file}"
    echo "Latest iteration emitted the stop sentinel but left the repo dirty." >&2
    exit 1
  fi

  printf '%s\n' "complete" > "${status_file}"
  echo "Stop sentinel detected with a clean repo and no new commit."
  exit "${complete_exit_code}"
fi

if [[ "${current_head}" == "${previous_head}" ]]; then
  printf '%s\n' "error:no-new-commit" > "${status_file}"
  echo "Latest iteration finished without a new commit and without the stop sentinel." >&2
  exit 1
fi

if ! repo_is_clean; then
  printf '%s\n' "error:dirty-worktree" > "${status_file}"
  echo "Latest iteration advanced HEAD but left the repo dirty." >&2
  exit 1
fi

printf '%s\n' "${current_head}" > "${head_file}"
printf '%s\n' "advanced:${current_head}" > "${status_file}"
echo "Detected a new clean commit from the latest iteration."
exit 0
