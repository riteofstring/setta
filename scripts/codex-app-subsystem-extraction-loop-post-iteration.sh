#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-app-subsystem-extraction-loop-post-iteration.sh --root-dir PATH --state-dir PATH [options]

Run the standard post-iteration settle check for the app-subsystem extraction
loop. If the completed iteration leaves the repo in an invalid state, try to
reset the repo to the last known clean HEAD and allow the loop to continue.
Runtime validation and recovery failures are treated as warnings so the next
Codex iteration is not blocked.

Options:
  --settle-seconds N  Seconds to wait before the final clean-worktree recheck.
                      Default: 20
  --recovery-file PATH
                      File updated whenever automatic recovery resets the repo.
                      Default: <state-dir>/recovery-state.txt
EOF
}

root_dir=""
state_dir=""
settle_seconds="20"
recovery_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root-dir)
      root_dir="${2:-}"
      shift 2
      ;;
    --state-dir)
      state_dir="${2:-}"
      shift 2
      ;;
    --settle-seconds)
      settle_seconds="${2:-}"
      shift 2
      ;;
    --recovery-file)
      recovery_file="${2:-}"
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

if [[ -z "${root_dir}" ]] || [[ -z "${state_dir}" ]]; then
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

mkdir -p "${state_dir}"

if [[ -z "${recovery_file}" ]]; then
  recovery_file="${state_dir}/recovery-state.txt"
fi

status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

timestamp_now() {
  date '+%Y-%m-%d %H:%M:%S'
}

resolve_reset_ref() {
  if [[ -s "${head_file}" ]]; then
    printf '%s\n' "$(<"${head_file}")"
    return
  fi

  git -C "${root_dir}" rev-parse HEAD
}

reset_repo_to_ref_state() {
  local target_ref="$1"

  git -C "${root_dir}" reset --hard "${target_ref}" >/dev/null || return 1
  git -C "${root_dir}" clean -fd >/dev/null || return 1
}

update_recovery_file() {
  local failure_status="$1"
  local reset_ref="$2"
  local outcome="$3"
  local count="0"

  if [[ -f "${recovery_file}" ]]; then
    count="$(
      sed -n 's/^count=//p' "${recovery_file}" | head -n 1
    )"
  fi

  if [[ ! "${count}" =~ ^[0-9]+$ ]]; then
    count="0"
  fi

  count="$((count + 1))"

  cat > "${recovery_file}" <<EOF
count=${count}
last_phase=post-iteration
last_failure=${failure_status}
last_reset_ref=${reset_ref}
last_outcome=${outcome}
last_recovered_at=$(timestamp_now)
EOF
}

latest_run_dir="$(
  find "${state_dir}/.." -maxdepth 1 -type d -name 'run-*' -print 2>/dev/null \
    | while IFS= read -r candidate_dir; do
        printf '%s\t%s\n' "$(basename "${candidate_dir}" | sed -E 's#^run-([0-9]+)$#\1#')" "${candidate_dir}"
      done \
    | sort -n -k1,1 \
    | tail -n 1
)"

sanitize_current_run_message() {
  local run_dir=""
  local response_file=""
  local archived_file=""

  if [[ -z "${latest_run_dir}" ]]; then
    return
  fi

  run_dir="$(printf '%s\n' "${latest_run_dir}" | cut -f2-)"
  response_file="${run_dir}/last-message.txt"
  archived_file="${run_dir}/last-message.recovered.txt"

  if [[ ! -f "${response_file}" ]]; then
    return
  fi

  mv "${response_file}" "${archived_file}"
  cat > "${response_file}" <<EOF
Recovered after a post-iteration validation failure.
Original response saved to ${archived_file}.
EOF
}

set +e
"${SCRIPT_DIR}/codex-authority-post-iteration-clean-check.sh" \
  --root-dir "${root_dir}" \
  --settle-seconds "${settle_seconds}"
checker_exit_code="$?"
set -e

if [[ "${checker_exit_code}" -eq 0 ]]; then
  exit 0
fi

failure_status="post-iteration-check-failed:${checker_exit_code}"
reset_ref="$(resolve_reset_ref)"

echo "Recovering from ${failure_status}; resetting repo to ${reset_ref}."

if ! reset_repo_to_ref_state "${reset_ref}"; then
  update_recovery_file "${failure_status}" "${reset_ref}" "recovery_failed"
  printf 'warning:%s\n' "${failure_status}" > "${status_file}"
  echo "Automatic recovery failed; continuing anyway so the next Codex iteration can attempt to repair the repo." >&2
  exit 0
fi

sanitize_current_run_message
update_recovery_file "${failure_status}" "${reset_ref}" "recovered"
printf 'recovered:%s\n' "${failure_status}" > "${status_file}"
echo "Recovered cleanly after post-iteration validation failure."
