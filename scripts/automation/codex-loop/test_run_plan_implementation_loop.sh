#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/setta-plan-loop-test.XXXXXX")"
trap 'rm -rf "${TEST_TMP_DIR}"' EXIT

TEST_REPO="${TEST_TMP_DIR}/repo"
TEST_BIN="${TEST_TMP_DIR}/bin"
TEST_OUTPUT="${TEST_TMP_DIR}/output"
TEST_REFERENCE_REPO="${TEST_TMP_DIR}/codex-reference"
TEST_CLAUDE_STATE="${TEST_TMP_DIR}/claude-call-count"

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

cat >"${TEST_BIN}/claude" <<'FAKE_CLAUDE'
#!/usr/bin/env bash
set -euo pipefail

repo="${PWD}"
prompt=""
print_mode="0"
output_format=""
model=""
effort=""
skip_permissions="0"
no_session_persistence="0"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--print)
      print_mode="1"
      shift
      ;;
    --output-format)
      output_format="$2"
      shift 2
      ;;
    --model)
      model="$2"
      shift 2
      ;;
    --effort)
      effort="$2"
      shift 2
      ;;
    --dangerously-skip-permissions)
      skip_permissions="1"
      shift
      ;;
    --no-session-persistence)
      no_session_persistence="1"
      shift
      ;;
    *)
      prompt="$1"
      shift
      ;;
  esac
done

if [[ "${print_mode}" != "1" ]]; then
  echo "expected claude --print" >&2
  exit 1
fi
if [[ "${output_format}" != "text" ]]; then
  echo "expected text output format" >&2
  exit 1
fi
if [[ "${effort}" != "xhigh" ]]; then
  echo "effort = ${effort}, want xhigh" >&2
  exit 1
fi
if [[ "${skip_permissions}" != "1" ]]; then
  echo "expected --dangerously-skip-permissions" >&2
  exit 1
fi
if [[ "${no_session_persistence}" != "1" ]]; then
  echo "expected --no-session-persistence" >&2
  exit 1
fi

call_count=0
if [[ -f "${FAKE_CLAUDE_STATE}" ]]; then
  read -r call_count <"${FAKE_CLAUDE_STATE}"
fi
call_count="$((call_count + 1))"
printf '%s\n' "${call_count}" >"${FAKE_CLAUDE_STATE}"

expected_model=""
case "${call_count}" in
  1|2|4)
    expected_model="opus"
    ;;
  3|5)
    expected_model="fable"
    ;;
  *)
    echo "unexpected Claude call ${call_count}" >&2
    exit 1
    ;;
esac
if [[ "${model}" != "${expected_model}" ]]; then
  echo "model = ${model}, want ${expected_model}" >&2
  exit 1
fi

case "${call_count}" in
  1)
    git -C "${repo}" commit --allow-empty --quiet -m "test: coherent implementation batch"
    printf 'Committed a coherent implementation batch.\n'
    ;;
  2)
    printf 'PLAN_PHASE_READY_FOR_AUDIT\n'
    ;;
  3)
    if [[ "${prompt}" != *"Audit the completed current phase"* ]]; then
      echo "third Claude call was not the phase audit" >&2
      exit 1
    fi
    printf 'PLAN_PHASE_AUDIT_COMPLETE\n'
    ;;
  4)
    printf 'PLAN_IMPLEMENTATION_READY_FOR_FINAL_AUDIT\n'
    ;;
  5)
    if [[ "${prompt}" != *"final whole-plan audit"* ]]; then
      echo "fifth Claude call was not the final audit" >&2
      exit 1
    fi
    printf 'PLAN_IMPLEMENTATION_COMPLETE\n'
    ;;
  *)
    echo "unexpected Claude call ${call_count}" >&2
    exit 1
    ;;
esac
FAKE_CLAUDE
chmod +x "${TEST_BIN}/claude"

git -C "${TEST_REPO}" init --quiet
git -C "${TEST_REPO}" config user.name "Setta Loop Test"
git -C "${TEST_REPO}" config user.email "setta-loop-test@example.invalid"
git -C "${TEST_REPO}" add .
git -C "${TEST_REPO}" commit --quiet -m "test: initialize repository"

PATH="${TEST_BIN}:${PATH}" \
  FAKE_CLAUDE_STATE="${TEST_CLAUDE_STATE}" \
  "${TEST_REPO}/scripts/automation/codex-loop/run-plan-implementation-loop.sh" \
  docs/plan.md \
  --codex-reference-repo "${TEST_REFERENCE_REPO}" \
  --output-dir "${TEST_OUTPUT}" \
  --progress-log-interval-seconds 0 \
  >"${TEST_TMP_DIR}/loop.log"

read -r claude_call_count <"${TEST_CLAUDE_STATE}"
if [[ "${claude_call_count}" -ne 5 ]]; then
  echo "Claude call count = ${claude_call_count}, want 5" >&2
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
