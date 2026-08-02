#!/usr/bin/env bash

setta_cli_command_init() {
  local root_dir="$1"

  SETTA_CLI_CMD=()
  if [[ -n "${SETTA_BIN:-}" ]]; then
    SETTA_CLI_CMD=("${SETTA_BIN}")
    return 0
  fi
  if [[ -n "${SETTA_GO_CLI_BIN:-}" ]]; then
    SETTA_CLI_CMD=("${SETTA_GO_CLI_BIN}")
    return 0
  fi
  if [[ -x "${root_dir}/scripts/go.sh" && -f "${root_dir}/go.mod" && -f "${root_dir}/cmd/setta/main.go" ]]; then
    SETTA_CLI_CMD=("${root_dir}/scripts/go.sh" "run" "./cmd/setta")
    return 0
  fi
  if command -v setta >/dev/null 2>&1; then
    SETTA_CLI_CMD=("setta")
    return 0
  fi

  return 1
}
