#!/usr/bin/env bash

progress_interval_seconds() {
  local interval="${GCF_PROGRESS_INTERVAL_SECONDS:-10}"
  if ! [[ "${interval}" =~ ^[0-9]+$ ]] || (( interval < 1 )); then
    interval=10
  fi
  printf '%s' "${interval}"
}

progress_log() {
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

progress_run() {
  local heartbeat_enabled=1
  if [[ "${1:-}" == "--no-heartbeat" ]]; then
    heartbeat_enabled=0
    shift
  fi

  if (( $# < 2 )); then
    echo "progress_run requires a label and command." >&2
    return 2
  fi

  local label="$1"
  shift

  local interval
  interval="$(progress_interval_seconds)"

  local started_at
  started_at="$(date +%s)"

  progress_log "Starting ${label}."
  "$@" &
  local command_pid=$!

  local heartbeat_pid=""
  if (( heartbeat_enabled == 1 )); then
    (
      while kill -0 "${command_pid}" 2>/dev/null; do
        sleep "${interval}"
        if kill -0 "${command_pid}" 2>/dev/null; then
          local elapsed_now elapsed
          elapsed_now=$(date +%s)
          elapsed=$((elapsed_now - started_at))
          progress_log "Still running ${label} (${elapsed}s elapsed)."
        fi
      done
    ) &
    heartbeat_pid=$!
  fi

  local status
  set +e
  wait "${command_pid}"
  status=$?
  set -e

  if [[ -n "${heartbeat_pid}" ]]; then
    kill "${heartbeat_pid}" 2>/dev/null || true
    wait "${heartbeat_pid}" 2>/dev/null || true
  fi

  local finished_at elapsed
  finished_at="$(date +%s)"
  elapsed=$((finished_at - started_at))

  if (( status != 0 )); then
    progress_log "Failed ${label} after ${elapsed}s."
    return "${status}"
  fi

  progress_log "Completed ${label} in ${elapsed}s."
}
