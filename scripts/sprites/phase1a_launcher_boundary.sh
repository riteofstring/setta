#!/usr/bin/env bash
# shellcheck disable=SC2153 # Remote service-runner template placeholders are replaced before execution.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/sprites/phase1a_launcher_boundary.sh --sprite <name> --out <file>

Install a temporary composed-boundary launcher inside a Sprite, verify
containment and workload ergonomics, and write a structured Markdown report.
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
run_id="phase1a-boundary-$(date -u +%Y%m%dT%H%M%SZ)-$$"
remote_root="/tmp/setta-phase1a-boundary-${run_id}"
launcher_path="${remote_root}/launcher.sh"
workdir="${remote_root}/work"
service_workdir="${remote_root}/service-work"
service_name="setta-phase1a-boundary-${run_id}"

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
  "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services delete "${service_name}" >/dev/null 2>&1
  "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "if [[ -f '${remote_root}/installed-python3-pip' ]]; then sudo -n apt-get purge -y python3-pip python3-wheel python3-packaging python3-dev python3.14-dev libpython3-dev libpython3.14-dev libexpat1-dev libjs-sphinxdoc >/dev/null 2>&1 || true; sudo -n apt-get autoremove -y >/dev/null 2>&1 || true; fi; rm -rf '${remote_root}'" >/dev/null 2>&1
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

record_sprite_exec() {
  local label="$1"
  local script="$2"
  record_command "${label}" "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "${script}"
}

append "# Phase 1a Composed Launcher Boundary"
append
append "- Sprite: \`${sprite_name}\`"
append "- Started: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`"
append "- Sprite CLI: \`${sprite_bin}\`"
append "- Run ID: \`${run_id}\`"
append
append "This harness refuses \`sprite create\` and \`sprite destroy\`. It creates only temporary files, a temporary service, and package/tooling state needed to prove the launcher."

section "Environment Baseline"
record_command "Sprite metadata" "${sprite_bin}" api "/v1/sprites/${sprite_name}"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Primitive and tool inventory" '
set -u
id
printf "PATH=%s\n" "${PATH}"
for cmd in unshare setpriv capsh sudo curl git python3 pip3 cc mount find getcap; do
  if command -v "${cmd}" >/dev/null 2>&1; then
    printf "%s: %s\n" "${cmd}" "$(command -v "${cmd}")"
  else
    printf "%s: missing\n" "${cmd}"
  fi
done
stat -c "%A %U %G %n" /home/sprite /root /etc /.sprite /.pilot 2>&1 || true
'

section "Install Temporary Launcher"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Prepare dependencies, workdir, setuid helper, and launcher" "
set -euo pipefail
mkdir -p '${remote_root}' '${workdir}' '${service_workdir}'
if [[ ! -x /usr/bin/pip3 ]] && command -v apt-get >/dev/null 2>&1; then
  sudo -n apt-get update
  sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y python3-pip
  touch '${remote_root}/installed-python3-pip'
fi
sudo -n chown -R 65534:65534 '${workdir}' '${service_workdir}'
sudo -n chmod 700 '${workdir}' '${service_workdir}'
cat > '${remote_root}/suid_check.c' <<'REMOTE_C'
#include <stdio.h>
#include <unistd.h>
int main(void) {
  printf(\"ruid=%ld euid=%ld rgid=%ld egid=%ld\\n\", (long)getuid(), (long)geteuid(), (long)getgid(), (long)getegid());
  return 0;
}
REMOTE_C
cc '${remote_root}/suid_check.c' -o '${remote_root}/suid_check'
sudo -n chown root:root '${remote_root}/suid_check'
sudo -n chmod 4755 '${remote_root}/suid_check'
cat > '${launcher_path}' <<'REMOTE_LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

setta_boundary_launch() {
  local boundary_workdir=\"\"
  local boundary_uid=\"65534\"
  local boundary_gid=\"65534\"
  while [[ \$# -gt 0 ]]; do
    case \"\$1\" in
      --workdir)
        shift
        [[ \$# -gt 0 ]] || { echo \"missing --workdir value\" >&2; return 2; }
        boundary_workdir=\"\$1\"
        shift
        ;;
      --uid)
        shift
        boundary_uid=\"\$1\"
        shift
        ;;
      --gid)
        shift
        boundary_gid=\"\$1\"
        shift
        ;;
      --)
        shift
        break
        ;;
      *)
        break
        ;;
    esac
  done

  [[ -n \"\${boundary_workdir}\" ]] || { echo \"--workdir is required\" >&2; return 2; }
  [[ \$# -gt 0 ]] || { echo \"workload command is required\" >&2; return 2; }
  mkdir -p \"\${boundary_workdir}\"
  sudo -n chown \"\${boundary_uid}:\${boundary_gid}\" \"\${boundary_workdir}\"
  sudo -n chmod 700 \"\${boundary_workdir}\"

  sudo -n unshare --mount --pid --fork --mount-proc bash -c '
set -euo pipefail
boundary_workdir=\"\$1\"
boundary_uid=\"\$2\"
boundary_gid=\"\$3\"
shift 3
mount --make-rprivate / 2>/dev/null || true
mount -t tmpfs -o nosuid,nodev,noexec,mode=0555 tmpfs /.sprite
mount -t tmpfs -o nosuid,nodev,noexec,mode=0555 tmpfs /.pilot
cd \"\${boundary_workdir}\"
exec setpriv \
  --reuid \"\${boundary_uid}\" \
  --regid \"\${boundary_gid}\" \
  --clear-groups \
  --no-new-privs \
  --inh-caps=-all \
  --ambient-caps=-all \
  --bounding-set=-all \
  env -i \
    HOME=\"\${boundary_workdir}\" \
    USER=workload \
    LOGNAME=workload \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    \"\$@\"
' setta-boundary-inner \"\${boundary_workdir}\" \"\${boundary_uid}\" \"\${boundary_gid}\" \"\$@\"
}
REMOTE_LAUNCHER
chmod +x '${launcher_path}'
cat > '${remote_root}/service_runner.sh' <<'REMOTE_SERVICE'
#!/usr/bin/env bash
set -euo pipefail
source \"\${LAUNCHER_PATH}\"
setta_boundary_launch --workdir \"\${SERVICE_WORKDIR}\" -- bash -lc '
set -u
echo \"service-boundary-start\"
id
grep \"^NoNewPrivs:\\|^Cap\" /proc/self/status
ls -l /.sprite/api.sock 2>&1 || true
curl --silent --show-error --max-time 5 --unix-socket /.sprite/api.sock http://sprite/v1/services 2>&1 || true
printf service-ok > service-output.txt
cat service-output.txt
'
REMOTE_SERVICE
sed -i \"s#\\\${LAUNCHER_PATH}#${launcher_path}#g; s#\\\${SERVICE_WORKDIR}#${service_workdir}#g\" '${remote_root}/service_runner.sh'
chmod +x '${remote_root}/service_runner.sh'
printf 'launcher=%s\nworkdir=%s\nservice_runner=%s\n' '${launcher_path}' '${workdir}' '${remote_root}/service_runner.sh'
"

section "Launcher Invocation"
append
append "The reusable launcher entrypoint is:"
append
append '```bash'
append "source '${launcher_path}'"
append "setta_boundary_launch --workdir '${workdir}' -- <workload command> [args...]"
append '```'
append
append "Sequence: create mount/PID namespace with \`unshare --mount --pid --fork --mount-proc\`; make mounts private; mount empty tmpfs over \`/.sprite\` and \`/.pilot\`; \`cd\` to the workload workdir; \`setpriv\` to uid/gid 65534 with \`no_new_privs\`, empty inheritable/ambient/bounding caps, cleared groups, minimal environment and system PATH; \`exec\` the workload."

section "Containment and Ergonomics Verification"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Run verifier workload through launcher" "
set -euo pipefail
source '${launcher_path}'
setta_boundary_launch --workdir '${workdir}' -- bash -lc '
set -u
echo \"== identity ==\"
id
pwd
echo \"HOME=\${HOME}\"
echo \"PATH=\${PATH}\"

echo \"== masked trusted runtime ==\"
ls -ld /.sprite /.pilot 2>&1 || true
ls -l /.sprite/api.sock 2>&1 || true
find /.sprite -maxdepth 1 -mindepth 1 -print 2>&1 || true
curl --silent --show-error --max-time 5 --unix-socket /.sprite/api.sock http://sprite/v1/services 2>&1 || true

echo \"== caps and no_new_privs ==\"
grep \"^NoNewPrivs:\\|^Cap\" /proc/self/status
if command -v capsh >/dev/null 2>&1; then capsh --print | sed -n \"1,24p\"; else echo \"capsh-missing\"; fi

echo \"== privilege regain checks ==\"
sudo -n id 2>&1 || true
${remote_root}/suid_check 2>&1 || true
printf root-write > /root/setta-boundary-root 2>&1 || true
printf etc-write > /etc/setta-boundary-etc 2>&1 || true
rm -f /root/setta-boundary-root /etc/setta-boundary-etc 2>/dev/null || true

echo \"== trusted state readability ==\"
for path in /home/sprite/.sprites /home/sprite/.codex /home/sprite/.claude /home/sprite/.config /.pilot /.sprite; do
  printf \"%s: \" \"\${path}\"
  if [[ -r \"\${path}\" ]]; then
    echo readable
    find \"\${path}\" -maxdepth 1 -mindepth 1 -print 2>&1 | sed -n \"1,5p\" || true
  else
    echo not-readable
  fi
done

echo \"== workdir read/write ==\"
printf \"workdir-ok\" > own-file.txt
cat own-file.txt

echo \"== python ==\"
python3 - <<PY
print(\"python-ok\")
PY

echo \"== c compile ==\"
cat > hello.c <<C
#include <stdio.h>
int main(void) { puts(\"c-ok\"); return 0; }
C
cc hello.c -o hello
./hello

echo \"== git clone ==\"
git clone --depth 1 https://github.com/octocat/Hello-World.git hello-world 2>&1 | sed -n \"1,30p\"
test -d hello-world/.git && echo git-ok

echo \"== pip download ==\"
python3 -m pip download --no-deps -d pip-download idna==3.7 2>&1 | sed -n \"1,60p\"
test -f pip-download/idna-3.7-py3-none-any.whl && echo pip-ok

echo \"== https get ==\"
curl -fsSIL --max-time 12 https://example.com | sed -n \"1,8p\"
'
"
printf '%s\n' "Containment and ergonomics verifier ran through the composed launcher." >>"${summary_file}"

section "Service Entrypoint Verification"
record_command "Create boundary service" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services create "${service_name}" --cmd /bin/bash --args "${remote_root}/service_runner.sh" --duration 5s
record_command "Get boundary service" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services get "${service_name}"
record_command "Delete boundary service" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services delete "${service_name}"
record_command "List services after boundary service delete" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services list
printf '%s\n' "The launcher was exercised as a sprite-env Service entrypoint and the temporary service was deleted." >>"${summary_file}"

section "Final Cleanup Verification"
record_command "Final services list" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services list
record_command "Final checkpoints list" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env checkpoints list
record_sprite_exec "Final process and file cleanup" "if [[ -f '${remote_root}/installed-python3-pip' ]]; then sudo -n apt-get purge -y python3-pip python3-wheel python3-packaging python3-dev python3.14-dev libpython3-dev libpython3.14-dev libexpat1-dev libjs-sphinxdoc; sudo -n apt-get autoremove -y; fi; rm -rf '${remote_root}'; ps -ef"

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

echo "Phase 1a launcher boundary verification complete for ${sprite_name}"
echo "Report: ${out_file}"
echo "Summary:"
sed 's/^/  /' < <(grep -A 20 '^## Summary$' "${out_file}" | tail -n +2)
