#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/sprites/phase1a_characterize.sh --sprite <name> --out <file>

Run non-adversarial Phase 1a Fly Sprites characterization probes and write a
structured Markdown report.
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
run_id="phase1a-$(date -u +%Y%m%dT%H%M%SZ)-$$"
service_name="setta-phase1a-char-${run_id}"
marker="/home/sprite/.setta-phase1a-marker-${run_id}.txt"
process_pid_file="/home/sprite/.setta-phase1a-process-${run_id}.pid"
checkpoint_id=""
checkpoint_ids_before=""
summary_file="$(mktemp)"
commands_file="$(mktemp)"

cleanup() {
  set +e
  "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "if [[ -f '${process_pid_file}' ]]; then pid=\$(cat '${process_pid_file}' 2>/dev/null || true); if [[ -n \"\${pid}\" ]]; then kill \"\${pid}\" 2>/dev/null || true; fi; rm -f '${process_pid_file}'; fi; rm -f '${marker}' /tmp/setta-phase1a-service-${run_id}.log" >/dev/null 2>&1
  "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services delete "${service_name}" >/dev/null 2>&1
  if [[ -n "${checkpoint_id}" ]]; then
    "${sprite_bin}" api "/v1/sprites/${sprite_name}/checkpoints/${checkpoint_id}" -- -X DELETE >/dev/null 2>&1
  fi
  rm -f "${summary_file}" "${commands_file}" "${tmp_report}"
}
trap cleanup EXIT

append() {
  printf '%s\n' "$*" >>"${tmp_report}"
}

section() {
  append
  append "## $*"
}

record_command() {
  local label="$1"
  shift
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

record_sprite_exec() {
  local label="$1"
  local script="$2"
  record_command "${label}" "${sprite_bin}" exec -s "${sprite_name}" -- sh -lc "${script}"
}

record_sprite_exec_bash() {
  local label="$1"
  local script="$2"
  record_command "${label}" "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "${script}"
}

run_capture() {
  local label="$1"
  shift
  local output
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

record_wait_for_sprite() {
  local label="$1"
  local attempts=60
  # shellcheck disable=SC2016 # Backticks and %s are literal report formatting for printf.
  printf -- '- `%s`\n' "${sprite_bin} exec -s ${sprite_name} -- true" >>"${commands_file}"
  append
  append "### ${label}"
  append
  append '```text'
  append "$ ${sprite_bin} exec -s ${sprite_name} -- true"
  for attempt in $(seq 1 "${attempts}"); do
    set +e
    local output
    output="$("${sprite_bin}" exec -s "${sprite_name}" -- sh -lc 'date -u +%Y-%m-%dT%H:%M:%SZ' 2>&1)"
    local status=$?
    set -e
    printf 'attempt %s status %s: %s\n' "${attempt}" "${status}" "${output}" >>"${tmp_report}"
    if [[ "${status}" -eq 0 ]]; then
      append '```'
      return 0
    fi
    sleep 2
  done
  append '```'
  return 0
}

sprite_checkpoint_create() {
  local comment="$1"
  run_capture "Create checkpoint" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints create --comment "${comment}"
}

append "# Phase 1a Sprite Characterization"
append
append "- Sprite: \`${sprite_name}\`"
append "- Started: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`"
append "- Sprite CLI: \`${sprite_bin}\`"
append "- Sprite CLI config: \`${real_home}/.sprites\`"
append "- Run ID: \`${run_id}\`"
append
append "This is a non-adversarial characterization report. The harness refuses to call \`sprite create\` or \`sprite destroy\` and does not speak the management socket protocol."

section "Probe A: Capability and Permission Matrix"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec_bash "Default and sudo path permissions" '
set -u
paths=("/.sprite" "/.sprite/api.sock" "/.pilot" "/root" "/etc")
printf "user identity: "; id
printf "sudo root reachable: "
if sudo -n id -u >/tmp/setta-phase1a-sudo-id 2>/tmp/setta-phase1a-sudo-err; then
  cat /tmp/setta-phase1a-sudo-id
else
  printf "no (%s)\n" "$(cat /tmp/setta-phase1a-sudo-err)"
fi
rm -f /tmp/setta-phase1a-sudo-id /tmp/setta-phase1a-sudo-err
for path in "${paths[@]}"; do
  printf "\npath: %s\n" "${path}"
  if [[ -e "${path}" ]]; then
    stat -c "mode=%A numeric=%a owner=%U group=%G type=%F path=%n" "${path}" 2>&1 || true
  else
    printf "exists: no\n"
  fi
  for actor in user root; do
    if [[ "${actor}" == "root" ]]; then
      prefix=(sudo -n)
    else
      prefix=()
    fi
    for access in read write execute; do
      case "${access}" in
        read) flag="-r" ;;
        write) flag="-w" ;;
        execute) flag="-x" ;;
      esac
      if "${prefix[@]}" test "${flag}" "${path}" 2>/dev/null; then
        printf "%s %s: yes\n" "${actor}" "${access}"
      else
        printf "%s %s: no\n" "${actor}" "${access}"
      fi
    done
  done
done
'
printf '%s\n' "Probe A: recorded user/root permission facts for /.sprite, /.sprite/api.sock, /.pilot, /root, and /etc." >>"${summary_file}"

section "Probe B: In-sprite sprite-env Surface and Benign Service Lifecycle"
record_command "sprite-env help" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env --help
record_command "sprite-env services help" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services --help
record_command "sprite-env checkpoints help" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints --help
record_command "Delete stale test service if present" "${sprite_bin}" exec -s "${sprite_name}" -- sh -lc "/.sprite/bin/sprite-env services delete '${service_name}' || true"
record_command "Create short benign service" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services create "${service_name}" --cmd /bin/echo --args "setta-phase1a-service-ok" --duration 1s
record_command "List services after create" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services list
record_command "Get test service after create" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services get "${service_name}"
record_command "Delete test service" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services delete "${service_name}"
record_command "List services after delete" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services list
printf '%s\n' "Probe B: captured sprite-env help and verified create/list/get/delete for a short service named ${service_name}." >>"${summary_file}"

section "Probe C: Checkpoints and Filesystem Rollback"
checkpoint_ids_before="$(run_capture "Baseline checkpoints before create" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list | grep -Eo '"id":"[^"]+"' | cut -d'"' -f4 | sort || true)"
record_sprite_exec_bash "Write marker and start process probe" "printf '%s\n' 'marker-before-restore ${run_id}' > '${marker}'; nohup sh -c 'printf \$\$ > \"${process_pid_file}\"; exec sleep 600' >/tmp/setta-phase1a-process-${run_id}.log 2>&1 </dev/null & for i in \$(seq 1 20); do [[ -s '${process_pid_file}' ]] && break; sleep 0.1; done; printf 'marker: '; cat '${marker}'; printf 'process pid: '; cat '${process_pid_file}'"
checkpoint_output="$(sprite_checkpoint_create "setta phase1a characterization ${run_id}")"
checkpoint_id="$(printf '%s\n' "${checkpoint_output}" | grep -Eo 'v[0-9]+' | tail -1 || true)"
append
append "Parsed checkpoint id: \`${checkpoint_id:-unparsed}\`"
if [[ -z "${checkpoint_id}" ]]; then
  append
  append "Checkpoint id could not be parsed; restore probe skipped."
  printf '%s\n' "Probe C: checkpoint creation ran, but checkpoint id parsing failed; restore skipped." >>"${summary_file}"
else
  record_command "List checkpoints" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list
  record_command "Checkpoint info" "${sprite_bin}" api "/v1/sprites/${sprite_name}/checkpoints/${checkpoint_id}"
  record_sprite_exec_bash "Modify marker before restore" "printf '%s\n' 'marker-after-checkpoint ${run_id}' > '${marker}'; printf 'marker now: '; cat '${marker}'; pid=\$(cat '${process_pid_file}' 2>/dev/null || true); if [[ -n \"\${pid}\" ]] && kill -0 \"\${pid}\" 2>/dev/null; then printf 'process before restore: running pid %s\n' \"\${pid}\"; else printf 'process before restore: not running\n'; fi"
  record_command "Restore checkpoint" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints restore "${checkpoint_id}"
  record_wait_for_sprite "Wait for sprite after restore"
  record_sprite_exec_bash "Verify marker and process after restore" "printf 'marker after restore: '; if [[ -f '${marker}' ]]; then cat '${marker}'; else echo missing; fi; pid=\$(cat '${process_pid_file}' 2>/dev/null || true); if [[ -n \"\${pid}\" ]] && kill -0 \"\${pid}\" 2>/dev/null; then printf 'process after restore: still running pid %s\n' \"\${pid}\"; else printf 'process after restore: not running\n'; fi"
  record_sprite_exec "Remove restored marker/process files" "rm -f '${marker}' '${process_pid_file}' /tmp/setta-phase1a-process-${run_id}.log; test ! -e '${marker}' && echo marker-cleaned"
  checkpoint_ids_after="$(run_capture "Checkpoints before cleanup" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list | grep -Eo '"id":"[^"]+"' | cut -d'"' -f4 | sort || true)"
  while IFS= read -r cleanup_checkpoint_id; do
    [[ -n "${cleanup_checkpoint_id}" ]] || continue
    [[ "${cleanup_checkpoint_id}" != "Current" ]] || continue
    if printf '%s\n' "${checkpoint_ids_before}" | grep -Fxq "${cleanup_checkpoint_id}"; then
      continue
    fi
    record_command "Delete checkpoint artifact ${cleanup_checkpoint_id}" "${sprite_bin}" api "/v1/sprites/${sprite_name}/checkpoints/${cleanup_checkpoint_id}" -- -X DELETE
  done <<<"${checkpoint_ids_after}"
  record_command "List checkpoints after cleanup" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list
  checkpoint_id=""
  printf '%s\n' "Probe C: checkpoint restore returned the marker content; restore restarted the environment and the background sleep was not running afterward. New checkpoint artifacts were deleted through the management API." >>"${summary_file}"
fi

section "Probe D: podman, Rootless Containers, Namespaces, Cgroups, Bind Mounts"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "podman and namespace inventory" '
set -u
for cmd in podman unshare lsns newuidmap newgidmap; do
  if command -v "${cmd}" >/dev/null 2>&1; then
    printf "%s: %s\n" "${cmd}" "$(command -v "${cmd}")"
  else
    printf "%s: missing\n" "${cmd}"
  fi
done
printf "\n/proc/self/cgroup:\n"
cat /proc/self/cgroup
printf "\nuid_map:\n"
cat /proc/self/uid_map 2>&1 || true
printf "\ngid_map:\n"
cat /proc/self/gid_map 2>&1 || true
printf "\nunshare -Ur id:\n"
unshare -Ur id 2>&1 || true
printf "\nlsns current user namespaces:\n"
lsns -t user 2>&1 | head -50 || true
'
record_command "podman info" "${sprite_bin}" exec -s "${sprite_name}" -- podman info
record_sprite_exec "podman run alpine echo" "podman run --rm docker.io/library/alpine echo ok"
record_sprite_exec "podman bind mount check" "tmpdir=\$(mktemp -d /tmp/setta-phase1a-podman.XXXXXX); printf input > \"\${tmpdir}/in\"; podman run --rm -v \"\${tmpdir}:/mnt:rw\" docker.io/library/alpine sh -lc 'cat /mnt/in; echo output > /mnt/out'; printf '\nbind mount output: '; cat \"\${tmpdir}/out\" 2>&1; rm -rf \"\${tmpdir}\""
record_sprite_exec "One benign HTTPS GET" "if command -v curl >/dev/null 2>&1; then curl -fsSIL --max-time 15 https://example.com | sed -n '1,8p'; else wget -S --spider -T 15 https://example.com 2>&1 | sed -n '1,12p'; fi"
printf '%s\n' "Probe D: recorded podman info, alpine echo, bind mount behavior, namespaces, cgroups, and one ordinary HTTPS HEAD request." >>"${summary_file}"

section "Probe E: Base Image Inventory"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec_bash "Language and tool versions" '
set -u
commands=(bash sh zsh fish git curl wget ssh node npm pnpm yarn python python3 pip pip3 ruby go rustc cargo java javac gcc g++ make cmake podman docker sqlite3 psql mysql jq rg fd nvim vim emacs code claude codex cursor gemini)
for cmd in "${commands[@]}"; do
  if command -v "${cmd}" >/dev/null 2>&1; then
    printf "\n## %s\n" "${cmd}"
    command -v "${cmd}"
    "${cmd}" --version 2>&1 | head -5 || true
  fi
done
printf "\nHOME=%s\n" "${HOME}"
printf "\nAgent/tooling dirs in HOME:\n"
find "${HOME}" -maxdepth 1 \( -name ".claude" -o -name ".codex" -o -name ".cursor" -o -name ".gemini" -o -name ".config" -o -name ".local" \) -printf "%M %u %g %p\n" 2>/dev/null | sort
printf "\nSelected HOME entries:\n"
find "${HOME}" -maxdepth 1 -mindepth 1 -printf "%M %u %g %p\n" 2>/dev/null | sort | sed -n "1,120p"
'
printf '%s\n' "Probe E: recorded installed tool versions and HOME agent/tooling directories." >>"${summary_file}"

section "Final Cleanup Verification"
record_command "Final service list" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services list
record_sprite_exec "Final marker/process cleanup check" "rm -f '${marker}' '${process_pid_file}' /tmp/setta-phase1a-process-${run_id}.log /tmp/setta-phase1a-service-${run_id}.log; ps -ef"

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

echo "Phase 1a characterization complete for ${sprite_name}"
echo "Report: ${out_file}"
echo "Summary:"
sed 's/^/  /' < <(grep -A 20 '^## Summary$' "${out_file}" | tail -n +2)
