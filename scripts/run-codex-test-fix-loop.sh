#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-test-fix-loop.sh [options] [-- <extra codex exec args>]

Start a Codex loop that works through Go, Python, Vitest, and Playwright test
scopes in bite-sized chunks and stops only after external full-suite
verification passes.

Defaults keep a single Codex session alive for the whole run unless you
override `--new-session-every`.

Options:
  --iterations N         Maximum loop iterations. Default: 1000000
  --new-session-every N  Start a fresh Codex session every N iterations.
                         Default: 1000000
  --output-dir PATH      Directory for prompts, checklist, logs, and loop runs.
                         Default: tmp/codex-test-fix-loop/<timestamp>
  --state-dir PATH       Directory for checklist and verification state.
                         Default: <output-dir>/state
  --model NAME           Optional model override passed to codex exec
  --yolo                 Pass --dangerously-bypass-approvals-and-sandbox.
                         Default: on
  --help                 Show this help text

Examples:
  ./scripts/run-codex-test-fix-loop.sh
  ./scripts/run-codex-test-fix-loop.sh --model gpt-5.4 -- --config reasoning_effort=\"high\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000000"
new_session_every="1000000"
output_dir=""
state_dir=""
model=""
yolo_mode="1"
complete_exit_code="42"
codex_extra_args=()

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

shell_join() {
  local result=""
  local quoted=""
  for argument in "$@"; do
    printf -v quoted '%q' "${argument}"
    if [[ -n "${result}" ]]; then
      result+=" "
    fi
    result+="${quoted}"
  done
  printf '%s\n' "${result}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iterations)
      require_value "$1" "${2:-}"
      iterations="$2"
      shift 2
      ;;
    --new-session-every)
      require_value "$1" "${2:-}"
      new_session_every="$2"
      shift 2
      ;;
    --output-dir)
      require_value "$1" "${2:-}"
      output_dir="$2"
      shift 2
      ;;
    --state-dir)
      require_value "$1" "${2:-}"
      state_dir="$2"
      shift 2
      ;;
    --model)
      require_value "$1" "${2:-}"
      model="$2"
      shift 2
      ;;
    --yolo)
      yolo_mode="1"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      codex_extra_args=("$@")
      break
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! "${iterations}" =~ ^[0-9]+$ ]] || [[ "${iterations}" -lt 1 ]]; then
  echo "--iterations must be a positive integer" >&2
  exit 1
fi

if [[ ! "${new_session_every}" =~ ^[0-9]+$ ]] || [[ "${new_session_every}" -lt 1 ]]; then
  echo "--new-session-every must be a positive integer" >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="${ROOT_DIR}/tmp/codex-test-fix-loop/${timestamp}"
fi

if [[ -z "${state_dir}" ]]; then
  state_dir="${output_dir}/state"
fi

mkdir -p "${output_dir}" "${state_dir}"

checklist_file="${state_dir}/checklist.md"
start_prompt_file="${state_dir}/start-prompt.md"
followup_prompt_file="${state_dir}/followup-prompt.md"
verification_status_file="${state_dir}/final-verification-status.txt"
verification_summary_file="${state_dir}/final-verification-summary.md"
failed_flag_file="${state_dir}/final-verification-failed.flag"

"${ROOT_DIR}/scripts/codex-test-fix-loop-init.sh" "${checklist_file}"
printf 'pending\n' > "${verification_status_file}"
rm -f "${verification_summary_file}" "${failed_flag_file}"

cat > "${start_prompt_file}" <<EOF
You are running inside an automated Codex loop for this repository.

Goal:
Run the Go, Python, and TypeScript tests in this project, fix any failures, and keep going until every listed scope passes.

Required workflow:
- Work in bite-sized chunks for fast feedback. Pick a folder/package-sized scope, run it, fix failures, rerun it, then move on.
- Favor robust, principled fixes. Do not apply hacky bandages.
- Use this checklist as the source of truth: ${checklist_file}
- Keep the checklist accurate after every meaningful step.
- Mark an item \`[x]\` only after that scope passes.
- If later edits could affect a checked scope, change it back to \`[ ]\` until rerun.
- Do not delete checklist items.
- External final verification status lives at: ${verification_status_file}
- External final verification summary lives at: ${verification_summary_file}
- If external final verification failed, read the summary and failed logs, set the affected checklist items back to \`[ ]\`, fix them, rerun those scopes, and re-check them.
- You do not need to stop when the checklist reaches all \`[x]\`; the outer loop will stop automatically after external full-suite verification passes.
- If work remains at the end of this iteration, leave the repo and checklist in a resumable state.

Preferred commands:
- Go scope: \`./scripts/run_go_tests.sh ./internal/...\`
- Python scope: \`./scripts/run_backend_tests.sh tests/...\`
- Vitest scope: \`pnpm -C frontend exec vitest run src/...\`
- Playwright scope: \`./scripts/run-playwright-e2e.sh tests/e2e/...\`

Start by reading the checklist and working through the first unchecked scope.
EOF

cat > "${followup_prompt_file}" <<EOF
Continue the automated test-fix loop.

Before doing anything else:
- Read the checklist at ${checklist_file}
- Read ${verification_status_file}
- If ${verification_summary_file} exists and the status indicates failure, read the summary and failed logs, then set affected checklist items back to \`[ ]\`

Then continue the same workflow:
- pick the next unchecked scope
- run it
- fix failures robustly
- rerun it
- update the checklist

Do not stop early. The loop ends only after every checklist item is \`[x]\` and the external full-suite verification passes.
EOF

pre_iteration_command="$(
  shell_join \
    "${ROOT_DIR}/scripts/codex-test-fix-loop-check.sh" \
    --checklist "${checklist_file}" \
    --state-dir "${state_dir}" \
    --complete-exit-code "${complete_exit_code}"
)"

loop_args=(
  "${ROOT_DIR}/scripts/run-codex-loop.sh"
  --prompt-file "${start_prompt_file}"
  --followup-prompt-file "${followup_prompt_file}"
  --iterations "${iterations}"
  --new-session-every "${new_session_every}"
  --output-dir "${output_dir}"
  --workdir "${ROOT_DIR}"
  --pre-iteration-command "${pre_iteration_command}"
  --stop-on-pre-iteration-exit-code "${complete_exit_code}"
)

if [[ -n "${model}" ]]; then
  loop_args+=(--model "${model}")
fi

if [[ "${yolo_mode}" == "1" ]]; then
  loop_args+=(--yolo)
fi

if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
  loop_args+=(-- "${codex_extra_args[@]}")
fi

echo "Checklist: ${checklist_file}"
echo "Verification status: ${verification_status_file}"
echo "Loop output directory: ${output_dir}"
echo "Iterations: ${iterations}"
echo "New session every: ${new_session_every}"

exec "${loop_args[@]}"
