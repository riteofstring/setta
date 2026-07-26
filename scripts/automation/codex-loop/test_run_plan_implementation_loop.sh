#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/setta-plan-loop-test.XXXXXX")"
trap 'rm -rf "${TEST_TMP_DIR}"' EXIT

TEST_REPO="${TEST_TMP_DIR}/repo"
TEST_BIN="${TEST_TMP_DIR}/bin"
TEST_OUTPUT="${TEST_TMP_DIR}/output"
TEST_REFERENCE_REPO="${TEST_TMP_DIR}/codex-reference"
TEST_AGENT_STATE="${TEST_TMP_DIR}/agent-call-count"

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
if [[ -f "${FAKE_AGENT_STATE}" ]]; then
  read -r call_count <"${FAKE_AGENT_STATE}"
fi
call_count="$((call_count + 1))"
printf '%s\n' "${call_count}" >"${FAKE_AGENT_STATE}"

expected_model=""
case "${call_count}" in
  1|2|4)
    expected_model="claude-opus-5"
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
  4)
    printf 'PLAN_IMPLEMENTATION_READY_FOR_FINAL_AUDIT\n'
    ;;
  *)
    echo "unexpected Claude call ${call_count}" >&2
    exit 1
    ;;
esac
FAKE_CLAUDE
chmod +x "${TEST_BIN}/claude"

cat >"${TEST_BIN}/codex" <<'FAKE_CODEX'
#!/usr/bin/env bash
set -euo pipefail

repo="${PWD}"
prompt=""
model=""
effort_config=""
sandbox=""
approval_policy=""
bypass_permissions="0"
ephemeral="0"
cd_arg=""
last_message_file=""

if [[ "${1:-}" != "exec" ]]; then
  echo "expected codex exec" >&2
  exit 1
fi
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model|-m)
      model="$2"
      shift 2
      ;;
    --config|-c)
      effort_config="$2"
      shift 2
      ;;
    --sandbox|-s)
      sandbox="$2"
      shift 2
      ;;
    --ask-for-approval|-a)
      approval_policy="$2"
      shift 2
      ;;
    --dangerously-bypass-approvals-and-sandbox)
      bypass_permissions="1"
      shift
      ;;
    --ephemeral)
      ephemeral="1"
      shift
      ;;
    --cd|-C)
      cd_arg="$2"
      shift 2
      ;;
    --output-last-message|-o)
      last_message_file="$2"
      shift 2
      ;;
    *)
      prompt="$1"
      shift
      ;;
  esac
done

if [[ "${model}" != "gpt-5.6-sol" ]]; then
  echo "codex model = ${model}, want gpt-5.6-sol" >&2
  exit 1
fi
if [[ "${effort_config}" != 'model_reasoning_effort="max"' ]]; then
  echo "codex effort config = ${effort_config}, want model_reasoning_effort=\"max\"" >&2
  exit 1
fi
if [[ "${sandbox}" != "danger-full-access" ]]; then
  echo "codex sandbox = ${sandbox}, want danger-full-access" >&2
  exit 1
fi
if [[ "${approval_policy}" != "never" ]]; then
  echo "codex approval policy = ${approval_policy}, want never" >&2
  exit 1
fi
if [[ "${bypass_permissions}" != "1" ]]; then
  echo "expected --dangerously-bypass-approvals-and-sandbox" >&2
  exit 1
fi
if [[ "${ephemeral}" != "1" ]]; then
  echo "expected --ephemeral" >&2
  exit 1
fi
if [[ "${cd_arg}" != "${repo}" ]]; then
  echo "codex cd = ${cd_arg}, want ${repo}" >&2
  exit 1
fi
if [[ -z "${last_message_file}" ]]; then
  echo "expected --output-last-message" >&2
  exit 1
fi

call_count=0
if [[ -f "${FAKE_AGENT_STATE}" ]]; then
  read -r call_count <"${FAKE_AGENT_STATE}"
fi
call_count="$((call_count + 1))"
printf '%s\n' "${call_count}" >"${FAKE_AGENT_STATE}"

case "${call_count}" in
  3)
    if [[ "${prompt}" != *"Audit the completed current phase"* ]]; then
      echo "third agent call was not the phase audit" >&2
      exit 1
    fi
    printf 'PLAN_PHASE_AUDIT_COMPLETE\n' >"${last_message_file}"
    printf 'PLAN_PHASE_AUDIT_COMPLETE\n'
    ;;
  5)
    if [[ "${prompt}" != *"final whole-plan audit"* ]]; then
      echo "fifth agent call was not the final audit" >&2
      exit 1
    fi
    printf 'PLAN_IMPLEMENTATION_COMPLETE\n' >"${last_message_file}"
    printf 'PLAN_IMPLEMENTATION_COMPLETE\n'
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
  FAKE_AGENT_STATE="${TEST_AGENT_STATE}" \
  "${TEST_REPO}/scripts/automation/codex-loop/run-plan-implementation-loop.sh" \
  docs/plan.md \
  --codex-reference-repo "${TEST_REFERENCE_REPO}" \
  --output-dir "${TEST_OUTPUT}" \
  --progress-log-interval-seconds 0 \
  >"${TEST_TMP_DIR}/loop.log"

read -r agent_call_count <"${TEST_AGENT_STATE}"
if [[ "${agent_call_count}" -ne 5 ]]; then
  echo "Agent call count = ${agent_call_count}, want 5" >&2
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
