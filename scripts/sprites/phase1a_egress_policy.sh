#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/sprites/phase1a_egress_policy.sh --sprite <name> --out <file>

Apply a reversible Sprites network egress policy, verify containment and bypass
resistance, restore the original policy, and write a structured Markdown report.
EOF
}

sprite_name=""
out_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sprite)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --sprite" >&2; exit 1; }
      sprite_name="$1"
      shift
      ;;
    --out)
      shift
      [[ $# -gt 0 ]] || { echo "Missing value for --out" >&2; exit 1; }
      out_file="$1"
      shift
      ;;
    -h|--help)
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

[[ -n "${sprite_name}" ]] || { echo "--sprite is required" >&2; usage >&2; exit 1; }
[[ -n "${out_file}" ]] || { echo "--out is required" >&2; usage >&2; exit 1; }

real_home="${HOME}"
if [[ -x "${real_home}/.local/bin/sprite" ]]; then
  sprite_bin="${real_home}/.local/bin/sprite"
else
  sprite_bin="$(command -v sprite || true)"
fi
[[ -n "${sprite_bin}" ]] || { echo "sprite CLI not found" >&2; exit 1; }

case "$(basename "${sprite_bin}")" in
  sprite) ;;
  *) echo "Refusing unexpected sprite CLI path: ${sprite_bin}" >&2; exit 1 ;;
esac

mkdir -p "$(dirname "${out_file}")"
tmp_report="$(mktemp "${out_file}.tmp.XXXXXX")"
commands_file="$(mktemp)"
summary_file="$(mktemp)"
original_policy_file="$(mktemp)"
applied_policy_file="$(mktemp)"
run_id="phase1a-egress-$(date -u +%Y%m%dT%H%M%SZ)-$$"
probe_root="/tmp/setta-phase1a-egress-${run_id}"
preconnect_pid_file="/home/sprite/.setta-phase1a-egress-preconnect-${run_id}.pid"
policy_restored=0

append() {
  printf '%s\n' "$*" >>"${tmp_report}"
}

section() {
  append
  append "## $*"
}

refuse_forbidden_lifecycle() {
  local previous=""
  local arg
  for arg in "$@"; do
    if [[ "${previous}" == "${sprite_bin}" || "${previous}" == "sprite" ]]; then
      case "${arg}" in
        create|destroy)
          echo "Refusing forbidden lifecycle command: ${previous} ${arg}" >&2
          exit 1
          ;;
      esac
    fi
    previous="${arg}"
  done
}

cleanup() {
  set +e
  if [[ "${policy_restored}" -eq 0 && -s "${original_policy_file}" ]]; then
    "${sprite_bin}" api "/v1/sprites/${sprite_name}/policy/network" -- -X POST -H "Content-Type: application/json" --data-binary "@${original_policy_file}" >/dev/null 2>&1
  fi
  "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "if [[ -f '${preconnect_pid_file}' ]]; then pid=\$(cat '${preconnect_pid_file}' 2>/dev/null || true); [[ -n \"\${pid}\" ]] && kill \"\${pid}\" 2>/dev/null || true; fi; rm -f '${preconnect_pid_file}'; rm -rf '${probe_root}' /tmp/setta-phase1a-policy-socket-*.json" >/dev/null 2>&1
  rm -f "${summary_file}" "${commands_file}" "${tmp_report}" "${original_policy_file}" "${applied_policy_file}"
}
trap cleanup EXIT

record_command() {
  local label="$1"
  shift
  refuse_forbidden_lifecycle "$@"
  # shellcheck disable=SC2016 # Backticks and %s are literal report formatting for printf.
  printf -- '- `%s`\n' "$*" >>"${commands_file}"
  append
  append "### ${label}"
  append
  append '```text'
  append "$ $*"
  set +e
  "$@" >>"${tmp_report}" 2>&1
  local status=$?
  set -e
  append "exit status: ${status}"
  append '```'
  return 0
}

run_capture() {
  local label="$1"
  shift
  local output
  refuse_forbidden_lifecycle "$@"
  # shellcheck disable=SC2016 # Backticks and %s are literal report formatting for printf.
  printf -- '- `%s`\n' "$*" >>"${commands_file}"
  append
  append "### ${label}"
  append
  append '```text'
  append "$ $*"
  set +e
  output="$("$@" 2>&1)"
  local status=$?
  set -e
  printf '%s\n' "${output}" >>"${tmp_report}"
  append "exit status: ${status}"
  append '```'
  printf '%s\n' "${output}"
  return 0
}

record_sprite_exec() {
  local label="$1"
  local script="$2"
  record_command "${label}" "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "${script}"
}

extract_json_object() {
  sed -n '/^{/,$p' | tr -d '\r'
}

append "# Phase 1a Sprites Egress Policy Validation"
append
append "- Sprite: \`${sprite_name}\`"
append "- Started: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`"
append "- Sprite CLI: \`${sprite_bin}\`"
append "- Run ID: \`${run_id}\`"
append
append "This harness refuses \`sprite create\` and \`sprite destroy\`, applies only a reversible network policy, and restores the original policy in an EXIT trap."

section "Step 1: Discover Policy API"
append
append "Official docs inspected: https://docs.sprites.dev/api/dev-latest/policy/"
append
append "Documented network endpoint/schema: \`GET/POST /v1/sprites/{name}/policy/network\` with body \`{\"rules\":[{\"domain\":\"...\",\"action\":\"allow|deny\"}]}\`. Policies are DNS-based domain filters; docs state changes apply immediately and failed DNS lookups return REFUSED."
original_policy_raw="$(run_capture "Get original external network policy" "${sprite_bin}" api "/v1/sprites/${sprite_name}/policy/network")"
printf '%s\n' "${original_policy_raw}" | extract_json_object >"${original_policy_file}"
record_command "Probe policy-related in-Sprite files" "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "ls -la /.sprite/policy; find /.sprite/policy -maxdepth 3 -ls 2>&1 || true"
record_command "Probe local socket policy route" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env curl /v1/policy/network
printf '%s\n' "Step 1: discovered external network policy endpoint /v1/sprites/{name}/policy/network and saved the original policy." >>"${summary_file}"

section "Pre-policy Existing Connection"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Start pre-policy connection to soon-blocked TCP flow" "
set -u
mkdir -p '${probe_root}'
nohup timeout 90 bash -lc 'exec 3<>/dev/tcp/142.250.102.26/25; sleep 90' >/tmp/setta-phase1a-preconnect-${run_id}.log 2>&1 </dev/null &
echo \$! > '${preconnect_pid_file}'
cat '${preconnect_pid_file}'
sleep 1
ps -fp \$(cat '${preconnect_pid_file}') || true
sed -n '1,20p' /tmp/setta-phase1a-preconnect-${run_id}.log || true
"

section "Step 2: Apply Restrictive Policy"
cat >"${applied_policy_file}" <<'JSON'
{
  "rules": [
    {"action": "allow", "domain": "api.sprites.dev"},
    {"action": "allow", "domain": "sprites.dev"},
    {"action": "allow", "domain": "*.sprites.dev"},
    {"action": "allow", "domain": "github.com"},
    {"action": "allow", "domain": "*.github.com"},
    {"action": "allow", "domain": "githubusercontent.com"},
    {"action": "allow", "domain": "*.githubusercontent.com"},
    {"action": "allow", "domain": "pypi.org"},
    {"action": "allow", "domain": "*.pypi.org"},
    {"action": "allow", "domain": "pythonhosted.org"},
    {"action": "allow", "domain": "*.pythonhosted.org"},
    {"action": "deny", "domain": "*"}
  ]
}
JSON
record_command "Applied policy JSON" cat "${applied_policy_file}"
record_command "Apply restrictive network policy" "${sprite_bin}" api "/v1/sprites/${sprite_name}/policy/network" -- -X POST -H "Content-Type: application/json" --data-binary "@${applied_policy_file}"
record_command "Get policy after apply" "${sprite_bin}" api "/v1/sprites/${sprite_name}/policy/network"
printf '%s\n' "Step 2: applied allowlist for Sprites control, GitHub, PyPI/pythonhosted, then final deny *." >>"${summary_file}"

section "Step 3: Containment and Dev Egress Under Policy"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Ordinary dev egress under policy" '
set -u
rm -rf /tmp/setta-phase1a-policy-dev
mkdir -p /tmp/setta-phase1a-policy-dev
cd /tmp/setta-phase1a-policy-dev
echo "git clone github.com:"
git clone --depth 1 https://github.com/octocat/Hello-World.git hello-world 2>&1 | sed -n "1,40p" || true
test -d hello-world/.git && echo "git-ok" || echo "git-failed"
echo
echo "pip download idna:"
python3 -m pip download --no-deps -d pip-download idna==3.7 2>&1 | sed -n "1,80p" || true
test -f pip-download/idna-3.7-py3-none-any.whl && echo "pip-ok" || echo "pip-failed"
echo
echo "HTTPS GET allowed API host:"
curl -fsS --max-time 15 https://api.github.com/rate_limit | sed -n "1,20p" || true
rm -rf /tmp/setta-phase1a-policy-dev
'
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Blocked-vector checks under policy" "
set -u
echo 'raw public IP HTTPS 1.1.1.1:'
curl -sSIL --connect-timeout 5 --max-time 8 https://1.1.1.1 2>&1 | sed -n '1,14p' || true
echo
echo 'private RFC1918 HTTPS 10.0.0.1:'
curl -sSIL --connect-timeout 5 --max-time 8 https://10.0.0.1 2>&1 | sed -n '1,14p' || true
echo
echo 'direct DoH by IP 8.8.8.8:'
curl -sSI --connect-timeout 5 --max-time 8 -H 'accept: application/dns-json' 'https://8.8.8.8/dns-query?name=example.com&type=A' 2>&1 | sed -n '1,14p' || true
echo
echo 'TCP connect only to known mail IP port 25:'
timeout 8 bash -lc ':</dev/tcp/142.250.102.26/25' 2>&1 && echo 'port25-connect-ok' || echo 'port25-connect-failed'
echo
echo 'raw ICMP ping by IP:'
ping -c 1 -W 4 1.1.1.1 2>&1 | sed -n '1,14p' || true
echo
echo 'pre-existing TCP/25 connection after policy:'
if [[ -f '${preconnect_pid_file}' ]]; then
  pid=\$(cat '${preconnect_pid_file}' 2>/dev/null || true)
  if [[ -n \"\${pid}\" ]] && kill -0 \"\${pid}\" 2>/dev/null; then
    echo \"pre-existing-still-running pid=\${pid}\"
  else
    echo 'pre-existing-not-running'
  fi
else
  echo 'pre-existing-pid-file-missing'
fi
"
printf '%s\n' "Step 3: tested ordinary GitHub/PyPI/API egress plus baseline abuse vectors under the applied policy." >>"${summary_file}"

section "Step 4: Guest Bypass Attempts"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Bypass attempts from capability-root guest" "
set -u
echo 'identity and caps:'
id
grep '^Cap' /proc/self/status
echo
echo '/.sprite/policy before guest writes:'
ls -la /.sprite/policy
find /.sprite/policy -maxdepth 2 -ls 2>&1 || true
echo
echo 'try write/remove local policy files:'
printf 'guest-write' > /.sprite/policy/setta-phase1a-guest-write 2>&1 && echo 'policy-file-write-ok' || echo 'policy-file-write-failed'
rm -f /.sprite/policy/setta-phase1a-guest-write 2>&1 && echo 'policy-file-remove-ok' || echo 'policy-file-remove-failed'
ls -la /.sprite/policy
echo
echo 'try socket GET/POST policy routes:'
cat > /tmp/setta-phase1a-policy-socket-open.json <<'JSON'
{\"rules\":[]}
JSON
for path in /v1/policy/network /v1/sprites/${sprite_name}/policy/network; do
  echo \"GET \${path}\"
  curl --silent --show-error --max-time 8 --unix-socket /.sprite/api.sock \"http://sprite\${path}\" 2>&1 || true
  echo
  echo \"POST \${path} rules=[]\"
  curl --silent --show-error --max-time 8 --unix-socket /.sprite/api.sock -X POST -H 'Content-Type: application/json' --data-binary @/tmp/setta-phase1a-policy-socket-open.json \"http://sprite\${path}\" 2>&1 || true
  echo
done
echo 'policy-sensitive request after socket attempts:'
curl -sSIL --connect-timeout 5 --max-time 8 https://example.com 2>&1 | sed -n '1,14p' || true
echo
echo 'alternate resolver commands:'
if command -v dig >/dev/null 2>&1; then dig @8.8.8.8 example.com A +time=4 +tries=1 2>&1 | sed -n '1,20p'; else echo 'dig missing'; fi
if command -v nslookup >/dev/null 2>&1; then nslookup example.com 8.8.8.8 2>&1 | sed -n '1,20p'; else echo 'nslookup missing'; fi
echo
echo 'raw socket / privilege attempts after local changes:'
sudo -n bash -lc 'id; ping -c 1 -W 4 1.1.1.1' 2>&1 | sed -n '1,18p' || true
capsh --print | sed -n '1,24p' || true
"
record_command "External policy after guest bypass attempts" "${sprite_bin}" api "/v1/sprites/${sprite_name}/policy/network"
printf '%s\n' "Step 4: attempted local policy file writes, socket policy changes, alternate resolvers/DoH, raw sockets, and sudo/capability use from inside the Sprite." >>"${summary_file}"

section "Step 5: Revert Policy"
record_command "Restore original network policy" "${sprite_bin}" api "/v1/sprites/${sprite_name}/policy/network" -- -X POST -H "Content-Type: application/json" --data-binary "@${original_policy_file}"
policy_restored=1
record_command "Policy after restore" "${sprite_bin}" api "/v1/sprites/${sprite_name}/policy/network"
record_sprite_exec "Cleanup pre-policy connection and files" "if [[ -f '${preconnect_pid_file}' ]]; then pid=\$(cat '${preconnect_pid_file}' 2>/dev/null || true); [[ -n \"\${pid}\" ]] && kill \"\${pid}\" 2>/dev/null || true; fi; rm -f '${preconnect_pid_file}'; rm -rf '${probe_root}' /tmp/setta-phase1a-policy-socket-*.json"
printf '%s\n' "Step 5: restored original network policy and cleaned temporary files/processes." >>"${summary_file}"

section "Final Cleanup Verification"
record_command "Final policy" "${sprite_bin}" api "/v1/sprites/${sprite_name}/policy/network"
record_command "Final services list" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services list
record_command "Final checkpoints list" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list
record_sprite_exec "Final process check" "ps -ef"

append
append "## Commands Actually Run"
append
cat "${commands_file}" >>"${tmp_report}"

append
append "## Summary"
cat "${summary_file}" >>"${tmp_report}"
append
append "- Finished: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`"

mv "${tmp_report}" "${out_file}"
trap - EXIT
rm -f "${summary_file}" "${commands_file}" "${tmp_report}" "${original_policy_file}" "${applied_policy_file}"

echo "Phase 1a egress policy validation complete for ${sprite_name}"
echo "Report: ${out_file}"
echo "Summary:"
sed 's/^/  /' < <(grep -A 20 '^## Summary$' "${out_file}" | tail -n +2)
