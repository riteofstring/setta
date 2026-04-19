#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-app-subsystem-extraction-loop-pre-iteration.sh --root-dir PATH --output-dir PATH --state-dir PATH [options]

Run the standard cleanup-loop validation before an app-subsystem extraction
iteration. If the previous iteration left the loop in an invalid state, try to
reset the repo to the last known clean HEAD and continue instead of stopping the
loop. Runtime validation and recovery failures are treated as warnings so Codex
still gets a chance to run.

Options:
  --complete-exit-code N    Exit code used when the stop sentinel is observed.
  --sentinel TEXT           Exact stop sentinel line to detect in last-message.txt.
  --progress-file PATH      State/progress file passed through to the cleanup
                            checker. Repeatable.
  --allow-clean-failures N  Passed through to codex-authority-cleanup-loop-check.sh.
  --recovery-file PATH      File updated whenever automatic recovery resets the
                            repo. Default: <state-dir>/recovery-state.txt
EOF
}

root_dir=""
output_dir=""
state_dir=""
complete_exit_code="42"
sentinel=""
allow_clean_failures="0"
recovery_file=""
progress_files=()

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
    --progress-file)
      progress_files+=("${2:-}")
      shift 2
      ;;
    --allow-clean-failures)
      allow_clean_failures="${2:-}"
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

if [[ ! "${allow_clean_failures}" =~ ^[0-9]+$ ]] || [[ "${allow_clean_failures}" -lt 0 ]]; then
  echo "--allow-clean-failures must be a non-negative integer" >&2
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
  local phase="$1"
  local failure_status="$2"
  local reset_ref="$3"
  local outcome="$4"
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
last_phase=${phase}
last_failure=${failure_status}
last_reset_ref=${reset_ref}
last_outcome=${outcome}
last_recovered_at=$(timestamp_now)
EOF
}

checker_args=(
  "${SCRIPT_DIR}/codex-authority-cleanup-loop-check.sh"
  --root-dir "${root_dir}"
  --output-dir "${output_dir}"
  --state-dir "${state_dir}"
  --complete-exit-code "${complete_exit_code}"
  --allow-clean-failures "${allow_clean_failures}"
)

if [[ -n "${sentinel}" ]]; then
  checker_args+=(--sentinel "${sentinel}")
fi

if [[ "${#progress_files[@]}" -gt 0 ]]; then
  for progress_file in "${progress_files[@]}"; do
    checker_args+=(--progress-file "${progress_file}")
  done
fi
checker_args+=(--progress-file "${recovery_file}")

set +e
"${checker_args[@]}"
checker_exit_code="$?"
set -e

if [[ "${checker_exit_code}" -eq 0 ]] || [[ "${checker_exit_code}" -eq "${complete_exit_code}" ]]; then
  exit "${checker_exit_code}"
fi

failure_status="error:pre-iteration-check:${checker_exit_code}"
if [[ -f "${status_file}" ]]; then
  failure_status="$(<"${status_file}")"
fi
reset_ref="$(resolve_reset_ref)"

echo "Recovering from ${failure_status}; resetting repo to ${reset_ref}."

if ! reset_repo_to_ref_state "${reset_ref}"; then
  update_recovery_file "pre-iteration" "${failure_status}" "${reset_ref}" "recovery_failed"
  printf 'warning:%s\n' "${failure_status}" > "${status_file}"
  echo "Automatic recovery failed; continuing anyway so the next Codex iteration can attempt to repair the repo." >&2
  exit 0
fi

update_recovery_file "pre-iteration" "${failure_status}" "${reset_ref}" "recovered"
printf 'recovered:%s\n' "${failure_status}" > "${status_file}"
echo "Recovered cleanly after retry gate failure."
