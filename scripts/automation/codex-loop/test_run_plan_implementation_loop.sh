#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/setta-plan-loop-test.XXXXXX")"
trap 'rm -rf "${TEST_TMP_DIR}"' EXIT

TEST_REPO="${TEST_TMP_DIR}/repo"
TEST_BIN="${TEST_TMP_DIR}/bin"
TEST_OUTPUT="${TEST_TMP_DIR}/output"
TEST_REFERENCE_REPO="${TEST_TMP_DIR}/codex-reference"
TEST_STATE="${TEST_TMP_DIR}/codex-call-count"

mkdir -p \
  "${TEST_REPO}/scripts/automation/codex-loop" \
  "${TEST_REPO}/docs" \
  "${TEST_BIN}" \
  "${TEST_OUTPUT}" \
  "${TEST_REFERENCE_REPO}"
cp \
  "${SCRIPT_DIR}/run-plan-implementation-loop.sh" \
  "${TEST_REPO}/scripts/automation/codex-loop/run-plan-implementation-loop.sh"
printf '# Test plan\n' >"${TEST_REPO}/docs/plan.md"

cat >"${TEST_BIN}/codex" <<'FAKE_CODEX'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "exec" ]]; then
  echo "expected codex exec" >&2
  exit 1
fi
shift

repo=""
last_message=""
prompt=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cd|--output-last-message)
      if [[ "$1" == "--cd" ]]; then
        repo="$2"
      else
        last_message="$2"
      fi
      shift 2
      ;;
    --color|--model|--config)
      shift 2
      ;;
    --ephemeral|--dangerously-bypass-approvals-and-sandbox)
      shift
      ;;
    *)
      prompt="$1"
      shift
      ;;
  esac
done

call_count=0
if [[ -f "${FAKE_CODEX_STATE}" ]]; then
  read -r call_count <"${FAKE_CODEX_STATE}"
fi
call_count="$((call_count + 1))"
printf '%s\n' "${call_count}" >"${FAKE_CODEX_STATE}"

case "${call_count}" in
  1)
    git -C "${repo}" commit --allow-empty --quiet -m "test: coherent implementation batch"
    printf 'Committed a coherent implementation batch.\n' >"${last_message}"
    ;;
  2)
    printf 'PLAN_PHASE_READY_FOR_AUDIT\n' >"${last_message}"
    ;;
  3)
    if [[ "${prompt}" != *"Audit the completed current phase"* ]]; then
      echo "third call was not the phase audit" >&2
      exit 1
    fi
    printf 'PLAN_PHASE_AUDIT_COMPLETE\n' >"${last_message}"
    ;;
  4)
    printf 'PLAN_IMPLEMENTATION_READY_FOR_FINAL_AUDIT\n' >"${last_message}"
    ;;
  5)
    if [[ "${prompt}" != *"final whole-plan audit"* ]]; then
      echo "fifth call was not the final audit" >&2
      exit 1
    fi
    printf 'PLAN_IMPLEMENTATION_COMPLETE\n' >"${last_message}"
    ;;
  *)
    echo "unexpected Codex call ${call_count}" >&2
    exit 1
    ;;
esac
FAKE_CODEX
chmod +x "${TEST_BIN}/codex"

git -C "${TEST_REPO}" init --quiet
git -C "${TEST_REPO}" config user.name "Setta Loop Test"
git -C "${TEST_REPO}" config user.email "setta-loop-test@example.invalid"
git -C "${TEST_REPO}" add .
git -C "${TEST_REPO}" commit --quiet -m "test: initialize repository"

PATH="${TEST_BIN}:${PATH}" \
  FAKE_CODEX_STATE="${TEST_STATE}" \
  "${TEST_REPO}/scripts/automation/codex-loop/run-plan-implementation-loop.sh" \
  docs/plan.md \
  --codex-reference-repo "${TEST_REFERENCE_REPO}" \
  --output-dir "${TEST_OUTPUT}" \
  --progress-log-interval-seconds 0 \
  >"${TEST_TMP_DIR}/loop.log"

read -r codex_call_count <"${TEST_STATE}"
if [[ "${codex_call_count}" -ne 5 ]]; then
  echo "Codex call count = ${codex_call_count}, want 5" >&2
  exit 1
fi
if [[ -e "${TEST_OUTPUT}/iteration-0001/agent-2.status.txt" ]]; then
  echo "routine implementation batch unexpectedly ran a reviewer" >&2
  exit 1
fi
if [[ ! -s "${TEST_OUTPUT}/iteration-0002/agent-2.status.txt" ]]; then
  echo "phase audit reviewer did not run" >&2
  exit 1
fi
if [[ ! -s "${TEST_OUTPUT}/iteration-0003/agent-2.status.txt" ]]; then
  echo "final audit reviewer did not run" >&2
  exit 1
fi

printf 'Plan loop cadence test passed.\n'
