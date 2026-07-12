#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/sprites/phase1a_adversarial.sh --sprite <name> --out <file>

Run authorized Phase 1a adversarial and constructive-boundary Sprite probes and
write a structured Markdown report.
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
run_id="phase1a-adv-$(date -u +%Y%m%dT%H%M%SZ)-$$"
commands_file="$(mktemp)"
summary_file="$(mktemp)"
checkpoint_ids_before=""
checkpoint_id=""
keepalive_pid_file="/home/sprite/.setta-phase1a-adv-keepalive-${run_id}.pid"
probe_root="/tmp/setta-phase1a-adv-${run_id}"
service_name="setta-phase1a-adv-${run_id}"

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
  "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "if [[ -f '${keepalive_pid_file}' ]]; then pid=\$(cat '${keepalive_pid_file}' 2>/dev/null || true); if [[ -n \"\${pid}\" ]]; then kill \"\${pid}\" 2>/dev/null || true; fi; fi; for pid in \$(pgrep -f '^tail -f /dev/null$' 2>/dev/null || true); do if [[ \"\${pid}\" != '2' ]]; then kill \"\${pid}\" 2>/dev/null || true; fi; done; pkill -f '^catatonit -P$' 2>/dev/null || true; rm -f '${keepalive_pid_file}'; rm -rf '${probe_root}'" >/dev/null 2>&1
  "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services delete "${service_name}" >/dev/null 2>&1
  if [[ -n "${checkpoint_id}" ]]; then
    "${sprite_bin}" api "/v1/sprites/${sprite_name}/checkpoints/${checkpoint_id}" -- -X DELETE >/dev/null 2>&1
  fi
  rm -f "${summary_file}" "${commands_file}" "${tmp_report}"
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

delete_new_checkpoints() {
  local ids_after cleanup_checkpoint_id
  ids_after="$(run_capture "Checkpoint list before cleanup" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list | grep -Eo '"id":"[^"]+"' | cut -d'"' -f4 | sort || true)"
  while IFS= read -r cleanup_checkpoint_id; do
    [[ -n "${cleanup_checkpoint_id}" ]] || continue
    [[ "${cleanup_checkpoint_id}" != "Current" ]] || continue
    if printf '%s\n' "${checkpoint_ids_before}" | grep -Fxq "${cleanup_checkpoint_id}"; then
      continue
    fi
    record_command "Delete checkpoint artifact ${cleanup_checkpoint_id}" "${sprite_bin}" api "/v1/sprites/${sprite_name}/checkpoints/${cleanup_checkpoint_id}" -- -X DELETE
  done <<<"${ids_after}"
  checkpoint_id=""
}

append "# Phase 1a Sprite Adversarial and Boundary Battery"
append
append "- Sprite: \`${sprite_name}\`"
append "- Started: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`"
append "- Sprite CLI: \`${sprite_bin}\`"
append "- Run ID: \`${run_id}\`"
append
append "This harness is authorized for bounded adversarial probes on the named disposable Sprite. It refuses \`sprite create\` and \`sprite destroy\`."

section "Probe 1: Local Management Socket Actionability"
checkpoint_ids_before="$(run_capture "Baseline checkpoints" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list | grep -Eo '"id":"[^"]+"' | cut -d'"' -f4 | sort || true)"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Socket read probes from default guest" '
set -u
printf "identity: "; id
printf "\nsocket stat:\n"
stat -c "mode=%A numeric=%a owner=%U group=%G type=%F path=%n" /.sprite/api.sock 2>&1 || true
paths=(/v1/services /v1/checkpoints /v1/sprite /v1/policy /v1/sprites)
for path in "${paths[@]}"; do
  printf "\nGET %s\n" "${path}"
  curl --silent --show-error --max-time 8 --unix-socket /.sprite/api.sock "http://sprite${path}" 2>&1 || true
  printf "\n"
done
'
socket_checkpoint_output="$(run_capture "Socket create checkpoint" "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "curl --silent --show-error --max-time 20 --unix-socket /.sprite/api.sock -X POST -H 'Content-Type: application/json' -d '{\"comment\":\"setta phase1a adversarial ${run_id}\"}' http://sprite/v1/checkpoint")"
checkpoint_id="$(printf '%s\n' "${socket_checkpoint_output}" | grep -Eo 'v[0-9]+' | tail -1 || true)"
append
append "Parsed socket-created checkpoint id: \`${checkpoint_id:-unparsed}\`"
record_command "List checkpoints after socket create" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list
if [[ -n "${checkpoint_id}" ]]; then
  record_command "Delete socket-created checkpoint through socket" "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "curl --silent --show-error --max-time 20 --unix-socket /.sprite/api.sock -X DELETE http://sprite/v1/checkpoints/${checkpoint_id}"
  checkpoint_id=""
fi
delete_new_checkpoints
record_command "Checkpoint list after socket cleanup" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list
printf '%s\n' "Probe 1: local socket reads and one reversible checkpoint create/delete were attempted directly from the guest." >>"${summary_file}"

section "Probe 2: Constructive Boundary Models"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Install boundary helper packages if available" '
set -u
missing=()
for cmd in capsh setpriv; do
  command -v "${cmd}" >/dev/null 2>&1 || missing+=("${cmd}")
done
if command -v podman >/dev/null 2>&1; then
  printf "podman already present: %s\n" "$(command -v podman)"
else
  missing+=(podman)
fi
printf "missing before install: %s\n" "${missing[*]:-none}"
if [[ ${#missing[@]} -gt 0 ]] && command -v apt-get >/dev/null 2>&1; then
  sudo -n apt-get update
  sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y libcap2-bin util-linux podman
fi
for cmd in capsh setpriv podman unshare sudo curl git cc python3; do
  if command -v "${cmd}" >/dev/null 2>&1; then
    printf "%s: %s\n" "${cmd}" "$(command -v "${cmd}")"
  else
    printf "%s: missing\n" "${cmd}"
  fi
done
'
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Model A: setpriv no_new_privs with dropped caps" '
set -u
if ! command -v setpriv >/dev/null 2>&1; then
  echo "setpriv missing"
  exit 0
fi
mkdir -p /tmp/setta-phase1a-model-a
setpriv --reuid 65534 --regid 65534 --clear-groups --no-new-privs --inh-caps=-all --ambient-caps=-all --bounding-set=-all bash -lc '"'"'
set -u
echo "identity:"; id
echo "no_new_privs:"; grep "^NoNewPrivs:" /proc/self/status || true
echo "capability status:"; grep "^Cap" /proc/self/status || true
echo "capsh:"; if command -v capsh >/dev/null 2>&1; then capsh --print | sed -n "1,20p"; else echo missing; fi
echo "socket endpoint:"
curl --silent --show-error --max-time 8 --unix-socket /.sprite/api.sock http://sprite/v1/services 2>&1 || true
echo
echo "sudo escalation:"
sudo -n id 2>&1 || true
echo "write /root:"
printf model-a > /root/setta-phase1a-model-a 2>&1 || true
rm -f /root/setta-phase1a-model-a 2>/dev/null || true
echo "ordinary dev:"
python3 - <<PY
print("python-ok")
PY
curl -fsSIL --max-time 12 https://example.com | sed -n "1,5p"
tmp=$(mktemp -d /tmp/setta-phase1a-model-a.XXXXXX)
printf "int main(void){return 0;}\\n" > "${tmp}/main.c"
if command -v cc >/dev/null 2>&1; then cc "${tmp}/main.c" -o "${tmp}/a.out" && "${tmp}/a.out" && echo "cc-ok"; else echo "cc-missing"; fi
rm -rf "${tmp}"
'"'"'
'
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Model B: podman rootless container if available" '
set -u
if ! command -v podman >/dev/null 2>&1; then
  echo "podman missing after install attempt"
  exit 0
fi
podman info 2>&1 | sed -n "1,120p" || true
podman run --rm docker.io/library/alpine sh -lc '"'"'
set -u
echo "identity:"; id
echo "status caps:"; grep "^Cap\|^NoNewPrivs" /proc/self/status || true
echo "socket path:"; ls -l /.sprite/api.sock 2>&1 || true
echo "socket endpoint:"
if command -v curl >/dev/null 2>&1; then curl --silent --show-error --max-time 8 --unix-socket /.sprite/api.sock http://sprite/v1/services 2>&1 || true; else echo "curl missing"; fi
echo
echo "sudo escalation:"; if command -v sudo >/dev/null 2>&1; then sudo -n id 2>&1 || true; else echo "sudo missing"; fi
echo "write /root:"; printf model-b > /root/setta-phase1a-model-b 2>&1 && echo "root-write-ok" || echo "root-write-failed"
rm -f /root/setta-phase1a-model-b 2>/dev/null || true
echo "ordinary dev:"; wget -qO- --spider https://example.com 2>&1 | sed -n "1,8p" || true
echo "container-ok"
'"'"' 2>&1 || true
'
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Model B fallback: unshare namespace with hidden socket" '
set -u
if ! command -v unshare >/dev/null 2>&1; then
  echo "unshare missing"
  exit 0
fi
unshare --map-root-user --mount --pid --fork bash -lc '"'"'
set -u
mount -t tmpfs tmpfs /.sprite
echo "identity:"; id
echo "status caps:"; grep "^Cap\|^NoNewPrivs" /proc/self/status || true
echo "capsh:"; if command -v capsh >/dev/null 2>&1; then capsh --print | sed -n "1,20p"; else echo missing; fi
echo "socket path:"; ls -l /.sprite/api.sock 2>&1 || true
echo "socket endpoint:"; curl --silent --show-error --max-time 8 --unix-socket /.sprite/api.sock http://sprite/v1/services 2>&1 || true
echo
echo "sudo escalation:"; sudo -n id 2>&1 || true
echo "write /root:"; printf unshare > /root/setta-phase1a-unshare 2>&1 && echo "root-write-ok" || echo "root-write-failed"
rm -f /root/setta-phase1a-unshare 2>/dev/null || true
echo "ordinary dev:"; python3 - <<PY
print("python-ok")
PY
curl -fsSIL --max-time 12 https://example.com | sed -n "1,5p"
'"'"' 2>&1 || true
'
printf '%s\n' "Probe 2: tested setpriv cap-drop/no-new-privs, podman rootless container where possible, and an unshare namespace fallback." >>"${summary_file}"

section "Probe 3: Hard-cost Cutoff Under Hostile Keepalive"
record_sprite_exec "Start benign keepalive" "mkdir -p '${probe_root}'; nohup tail -f /dev/null >/tmp/setta-phase1a-adv-keepalive-${run_id}.log 2>&1 </dev/null & echo \$! > '${keepalive_pid_file}'; cat '${keepalive_pid_file}'; ps -fp \$(cat '${keepalive_pid_file}')"
record_command "Sprite status with keepalive" "${sprite_bin}" api "/v1/sprites/${sprite_name}"
record_command "Host CLI help search for cutoff verbs" bash -lc "PATH='${real_home}/.local/bin:'\"\${PATH}\"; sprite --help 2>&1 | grep -Ei 'stop|pause|suspend|sleep|idle|shutdown|destroy|delete' || true"
record_command "sprite-env help search for cutoff verbs" "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "/.sprite/bin/sprite-env --help 2>&1; /.sprite/bin/sprite-env services --help 2>&1; /.sprite/bin/sprite-env checkpoints --help 2>&1" 
for cutoff_path in \
  "/v1/sprites/${sprite_name}/stop" \
  "/v1/sprites/${sprite_name}/pause" \
  "/v1/sprites/${sprite_name}/suspend" \
  "/v1/sprites/${sprite_name}/sleep" \
  "/v1/sprites/${sprite_name}/shutdown"; do
  record_command "Try non-destructive cutoff ${cutoff_path}" "${sprite_bin}" api "${cutoff_path}" -- -X POST
  record_command "Status after ${cutoff_path}" "${sprite_bin}" api "/v1/sprites/${sprite_name}"
done
record_sprite_exec "Restart keepalive for suspend latency measurement" "mkdir -p '${probe_root}'; nohup tail -f /dev/null >/tmp/setta-phase1a-adv-keepalive-${run_id}.log 2>&1 </dev/null & echo \$! > '${keepalive_pid_file}'; cat '${keepalive_pid_file}'; ps -fp \$(cat '${keepalive_pid_file}')"
# shellcheck disable=SC2016 # This host-side script expands its env vars inside the measured subprocess.
record_command "Measure suspend cutoff latency" env SPRITE_BIN="${sprite_bin}" SPRITE_NAME="${sprite_name}" bash -lc '
set -u
status_from_output() {
  grep -Eo "\"status\":\"[^\"]+\"" | head -1 | cut -d\" -f4
}
echo "status before suspend:"
"${SPRITE_BIN}" api "/v1/sprites/${SPRITE_NAME}" 2>&1 | tee /tmp/setta-phase1a-suspend-before.txt
start_s="$(date +%s)"
echo "suspend request:"
"${SPRITE_BIN}" api "/v1/sprites/${SPRITE_NAME}/suspend" -- -X POST 2>&1
for attempt in $(seq 0 30); do
  output="$("${SPRITE_BIN}" api "/v1/sprites/${SPRITE_NAME}" 2>&1)"
  status="$(printf "%s\n" "${output}" | status_from_output)"
  now_s="$(date +%s)"
  elapsed_s="$((now_s - start_s))"
  printf "attempt=%s elapsed_s=%s status=%s\n" "${attempt}" "${elapsed_s}" "${status:-unknown}"
  if [[ "${status}" != "running" && -n "${status}" ]]; then
    break
  fi
  sleep 1
done
'
record_sprite_exec "Kill keepalive" "if [[ -f '${keepalive_pid_file}' ]]; then pid=\$(cat '${keepalive_pid_file}'); kill \"\${pid}\" 2>/dev/null || true; rm -f '${keepalive_pid_file}'; fi; for pid in \$(pgrep -f '^tail -f /dev/null$' 2>/dev/null || true); do if [[ \"\${pid}\" != '2' ]]; then kill \"\${pid}\" 2>/dev/null || true; fi; done; ps -ef"
printf '%s\n' "Probe 3: started bounded keepalives, searched CLI/API surfaces for non-destructive cutoff verbs, tried stop/pause/suspend/sleep/shutdown POST candidates, measured suspend latency, then killed the keepalive." >>"${summary_file}"

section "Probe 4: Network Policy Two-sided Checks"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Ordinary dev egress" '
set -u
rm -rf /tmp/setta-phase1a-egress
mkdir -p /tmp/setta-phase1a-egress
cd /tmp/setta-phase1a-egress
echo "git clone public HTTPS:"
git clone --depth 1 https://github.com/octocat/Hello-World.git hello-world 2>&1 | sed -n "1,40p" || true
echo "pip download public package:"
python3 -m pip download --no-deps -d pip-download idna==3.7 2>&1 | sed -n "1,60p" || true
echo "normal API HTTPS GET:"
curl -fsS --max-time 15 https://api.github.com/rate_limit | sed -n "1,20p" || true
rm -rf /tmp/setta-phase1a-egress
'
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Abuse-style egress connect attempts only" '
set -u
echo "raw public IP HTTPS 1.1.1.1:"
curl -sSIL --connect-timeout 5 --max-time 8 https://1.1.1.1 2>&1 | sed -n "1,12p" || true
echo
echo "private RFC1918 HTTPS 10.0.0.1:"
curl -sSIL --connect-timeout 5 --max-time 8 https://10.0.0.1 2>&1 | sed -n "1,12p" || true
echo
echo "direct DoH by IP 8.8.8.8:"
curl -sSI --connect-timeout 5 --max-time 8 -H "accept: application/dns-json" "https://8.8.8.8/dns-query?name=example.com&type=A" 2>&1 | sed -n "1,12p" || true
echo
echo "TCP connect only to known mail IP port 25:"
timeout 8 bash -lc ":</dev/tcp/142.250.102.26/25" 2>&1 && echo "port25-connect-ok" || echo "port25-connect-failed"
echo
echo "raw ICMP ping by IP:"
ping -c 1 -W 4 1.1.1.1 2>&1 | sed -n "1,12p" || true
'
printf '%s\n' "Probe 4: tested ordinary HTTPS/git/pip egress plus bounded connect attempts to raw IP, RFC1918, DoH by IP, TCP/25, and ICMP." >>"${summary_file}"

section "Final Cleanup Verification"
delete_new_checkpoints
record_command "Final services list" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services list
record_command "Final checkpoints list" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list
record_sprite_exec "Final process and file cleanup" "if [[ -f '${keepalive_pid_file}' ]]; then pid=\$(cat '${keepalive_pid_file}' 2>/dev/null || true); [[ -n \"\${pid}\" ]] && kill \"\${pid}\" 2>/dev/null || true; fi; for pid in \$(pgrep -f '^tail -f /dev/null$' 2>/dev/null || true); do if [[ \"\${pid}\" != '2' ]]; then kill \"\${pid}\" 2>/dev/null || true; fi; done; pkill -f '^catatonit -P$' 2>/dev/null || true; sleep 1; rm -f '${keepalive_pid_file}'; rm -rf '${probe_root}'; ps -ef"

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
rm -f "${summary_file}" "${commands_file}"

echo "Phase 1a adversarial battery complete for ${sprite_name}"
echo "Report: ${out_file}"
echo "Summary:"
sed 's/^/  /' < <(grep -A 20 '^## Summary$' "${out_file}" | tail -n +2)
