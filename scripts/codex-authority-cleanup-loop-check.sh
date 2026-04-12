#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-authority-cleanup-loop-check.sh --root-dir PATH --output-dir PATH --state-dir PATH [options]

Exit 0 while work remains.
Exit the configured completion code only after the latest Codex response emits a
configured stop sentinel, the worktree is clean, and no new commit was created
in that stop iteration.

Any non-stop iteration must either advance HEAD or explicitly advance an
allowed state/progress file while leaving the repo clean.

Options:
  --complete-exit-code N    Exit code used when the stop sentinel is observed.
  --sentinel TEXT           Exact stop sentinel line to detect in last-message.txt.
                            Repeat to allow multiple clean stop conditions.
  --progress-file PATH      File whose content may advance between iterations to
                            represent clean non-commit progress. Repeatable.
  --allow-clean-failures N  Tolerate up to N consecutive clean Codex failures
                            that leave HEAD unchanged and the worktree clean.
EOF
}

root_dir=""
output_dir=""
state_dir=""
complete_exit_code="42"
sentinels=()
progress_files=()
allow_clean_failures="0"

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
      sentinels+=("${2:-}")
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

if [[ "${#sentinels[@]}" -eq 0 ]]; then
  sentinels=("CODEX_LOOP_STOP: NO_ISSUES_FOUND")
fi

mkdir -p "${state_dir}"

status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"
failure_count_file="${state_dir}/transient-clean-failure-count.txt"
failure_run_file="${state_dir}/last-transient-clean-failure-run.txt"
current_head="$(git -C "${root_dir}" rev-parse HEAD)"

reset_failure_state() {
  rm -f "${failure_count_file}" "${failure_run_file}"
}

progress_snapshot_file() {
  local index="$1"
  printf '%s/progress-file-%s.sha256\n' "${state_dir}" "${index}"
}

hash_progress_file() {
  local path="$1"

  if [[ ! -f "${path}" ]]; then
    printf '__missing__\n'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${path}" | awk '{print $1}'
    return
  fi

  sha256sum "${path}" | awk '{print $1}'
}

update_progress_snapshots() {
  local index=""
  local path=""
  local snapshot_path=""
  local hash_value=""

  for index in "${!progress_files[@]}"; do
    path="${progress_files[${index}]}"
    snapshot_path="$(progress_snapshot_file "${index}")"
    hash_value="$(hash_progress_file "${path}")"
    printf '%s\n' "${hash_value}" > "${snapshot_path}"
  done
}

progress_files_advanced() {
  local index=""
  local path=""
  local snapshot_path=""
  local previous_hash=""
  local current_hash=""

  [[ "${#progress_files[@]}" -gt 0 ]] || return 1

  for index in "${!progress_files[@]}"; do
    path="${progress_files[${index}]}"
    snapshot_path="$(progress_snapshot_file "${index}")"
    previous_hash=""
    if [[ -f "${snapshot_path}" ]]; then
      previous_hash="$(<"${snapshot_path}")"
    fi
    current_hash="$(hash_progress_file "${path}")"
    if [[ "${current_hash}" != "${previous_hash}" ]]; then
      return 0
    fi
  done

  return 1
}

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

find_matching_sentinel() {
  local response_file="$1"
  local sentinel=""

  [[ -f "${response_file}" ]] || return 1

  for sentinel in "${sentinels[@]}"; do
    if grep -Fxq "${sentinel}" "${response_file}"; then
      printf '%s\n' "${sentinel}"
      return 0
    fi
  done

  return 1
}

if [[ ! -f "${head_file}" ]]; then
  printf '%s\n' "${current_head}" > "${head_file}"
  printf '%s\n' "pending" > "${status_file}"
  update_progress_snapshots
  reset_failure_state
  echo "Recorded initial HEAD."
  exit 0
fi

previous_head="$(<"${head_file}")"

latest_run_dir="$(
  find "${output_dir}" -maxdepth 1 -type d -name 'run-*' -print 2>/dev/null \
    | while IFS= read -r candidate_dir; do
        if [[ -f "${candidate_dir}/status.txt" ]]; then
          printf '%s\t%s\n' "$(basename "${candidate_dir}" | sed -E 's#^run-([0-9]+)$#\1#')" "${candidate_dir}"
        fi
      done \
    | sort -n -k1,1 \
    | tail -n 1
)"

if [[ -z "${latest_run_dir}" ]]; then
  printf '%s\n' "pending" > "${status_file}"
  reset_failure_state
  echo "No completed loop runs found yet."
  exit 0
fi

latest_run_suffix="$(printf '%s\n' "${latest_run_dir}" | cut -f1)"
latest_run_dir="$(printf '%s\n' "${latest_run_dir}" | cut -f2-)"

response_file="${output_dir}/run-${latest_run_suffix}/last-message.txt"
latest_run_status_file="${output_dir}/run-${latest_run_suffix}/status.txt"
latest_run_status=""
if [[ -f "${latest_run_status_file}" ]]; then
  latest_run_status="$(<"${latest_run_status_file}")"
fi

if matched_sentinel="$(find_matching_sentinel "${response_file}")"; then
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

  printf '%s\n' "complete:${matched_sentinel}" > "${status_file}"
  update_progress_snapshots
  reset_failure_state
  echo "Stop sentinel detected with a clean repo and no new commit: ${matched_sentinel}"
  exit "${complete_exit_code}"
fi

if [[ "${latest_run_status}" == failure:* ]]; then
  if [[ "${current_head}" != "${previous_head}" ]]; then
    printf '%s\n' "error:clean-failure-after-commit" > "${status_file}"
    echo "Latest iteration failed after advancing HEAD." >&2
    exit 1
  fi

  if ! repo_is_clean; then
    printf '%s\n' "error:clean-failure-dirty-worktree" > "${status_file}"
    echo "Latest iteration failed and left the repo dirty." >&2
    exit 1
  fi

  if [[ "${allow_clean_failures}" -gt 0 ]]; then
    tolerated_count="0"
    tolerated_run=""
    if [[ -f "${failure_count_file}" ]]; then
      tolerated_count="$(<"${failure_count_file}")"
    fi
    if [[ -f "${failure_run_file}" ]]; then
      tolerated_run="$(<"${failure_run_file}")"
    fi
    if [[ "${latest_run_suffix}" != "${tolerated_run}" ]]; then
      tolerated_count="$((tolerated_count + 1))"
      printf '%s\n' "${latest_run_suffix}" > "${failure_run_file}"
      printf '%s\n' "${tolerated_count}" > "${failure_count_file}"
    fi

    if [[ "${tolerated_count}" -le "${allow_clean_failures}" ]]; then
      printf '%s\n' "retryable-clean-failure:${tolerated_count}:${latest_run_status}" > "${status_file}"
      echo "Latest iteration failed cleanly without mutating the repo; tolerating transient failure ${tolerated_count}/${allow_clean_failures}."
      exit 0
    fi
  fi

  printf '%s\n' "error:clean-failure-limit-exceeded" > "${status_file}"
  echo "Latest iteration failed cleanly without a commit, and the retry budget was exhausted." >&2
  exit 1
fi

if [[ "${current_head}" == "${previous_head}" ]]; then
  if [[ "${latest_run_status}" == "success" ]] && progress_files_advanced; then
    printf '%s\n' "state-advanced" > "${status_file}"
    update_progress_snapshots
    reset_failure_state
    echo "Detected clean non-commit progress via configured state files."
    exit 0
  fi

  printf '%s\n' "error:no-new-commit" > "${status_file}"
  echo "Latest iteration finished without a new commit, without the stop sentinel, and without recognized state-file progress." >&2
  exit 1
fi

if ! repo_is_clean; then
  printf '%s\n' "error:dirty-worktree" > "${status_file}"
  echo "Latest iteration advanced HEAD but left the repo dirty." >&2
  exit 1
fi

printf '%s\n' "${current_head}" > "${head_file}"
printf '%s\n' "advanced:${current_head}" > "${status_file}"
update_progress_snapshots
reset_failure_state
echo "Detected a new clean commit from the latest iteration."
exit 0
