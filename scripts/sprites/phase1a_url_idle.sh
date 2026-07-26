#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/sprites/phase1a_url_idle.sh --sprite <name> --out <file>

Probe Sprite URL wake behavior, proxy gateway credentials, and attached-idle
lifecycle behavior. The harness refuses create/destroy, restores URL auth in an
EXIT trap, deletes its temporary service, and kills local/remote processes it
starts.
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
[[ "${sprite_name}" == "setta-phase1a-20260713-net" ]] || {
  echo "Refusing to operate on non-target Sprite: ${sprite_name}" >&2
  exit 1
}

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
proxy_log="$(mktemp)"
tty_log="$(mktemp)"
sse_log="$(mktemp)"
preview_log="$(mktemp)"
run_id="phase1a-url-idle-$(date -u +%Y%m%dT%H%M%SZ)-$$"
service_name="setta-phase1a-url-idle-${run_id}"
remote_root="/tmp/setta-phase1a-url-idle-${run_id}"
app_port="8097"
tty_pid=""
sse_pid=""
preview_pid=""
original_auth=""
service_created=0
remote_cleanup_needed=0

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

kill_local_pid() {
  local pid="$1"
  [[ -n "${pid}" ]] || return 0
  kill "${pid}" >/dev/null 2>&1 || true
  sleep 1
  kill -9 "${pid}" >/dev/null 2>&1 || true
  wait "${pid}" >/dev/null 2>&1 || true
}

cleanup() {
  set +e
  kill_local_pid "${sse_pid}"
  kill_local_pid "${preview_pid}"
  kill_local_pid "${tty_pid}"
  if [[ "${service_created}" -eq 1 ]]; then
    "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services delete "${service_name}" >/dev/null 2>&1
  fi
  if [[ "${remote_cleanup_needed}" -eq 1 ]]; then
    "${sprite_bin}" exec -s "${sprite_name}" -- bash -lc "p='setta-phase1a-url-'; s='idle-${run_id}'; m=\"\${p}\${s}\"; pkill -f \"[s]\${m#s}\" 2>/dev/null || true; rm -rf \"/tmp/\${m}\"" >/dev/null 2>&1
  fi
  if [[ -n "${original_auth}" ]]; then
    "${sprite_bin}" url update -s "${sprite_name}" --auth "${original_auth}" >/dev/null 2>&1
  else
    "${sprite_bin}" url update -s "${sprite_name}" --auth sprite >/dev/null 2>&1
  fi
  rm -f "${commands_file}" "${summary_file}" "${proxy_log}" "${tty_log}" "${sse_log}" "${preview_log}" "${tmp_report}"
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

status_from_text() {
  grep -Eo '"status":"[^"]+"' | tail -1 | cut -d'"' -f4
}

auth_from_text() {
  grep -Eo '"url_settings":\{[^}]*\}' | grep -Eo '"auth":"[^"]+"' | tail -1 | cut -d'"' -f4
}

url_from_text() {
  grep -Eo '"url":"[^"]+"' | tail -1 | cut -d'"' -f4
}

sprite_metadata_raw() {
  "${sprite_bin}" api "/v1/sprites/${sprite_name}" 2>&1
}

sprite_status() {
  sprite_metadata_raw | status_from_text
}

poll_status() {
  local label="$1"
  local max_seconds="$2"
  local interval_seconds="$3"
  local start_s now_s elapsed_s status
  append
  append "### ${label}"
  append
  append '```text'
  start_s="$(date +%s)"
  while :; do
    now_s="$(date +%s)"
    elapsed_s="$((now_s - start_s))"
    status="$(sprite_status || true)"
    printf 'elapsed_s=%s status=%s\n' "${elapsed_s}" "${status:-unknown}" >>"${tmp_report}"
    if (( elapsed_s >= max_seconds )); then
      break
    fi
    sleep "${interval_seconds}"
  done
  append '```'
}

wait_until_not_running() {
  local label="$1"
  local max_seconds="$2"
  local interval_seconds="$3"
  local start_s now_s elapsed_s status
  append
  append "### ${label}"
  append
  append '```text'
  start_s="$(date +%s)"
  while :; do
    now_s="$(date +%s)"
    elapsed_s="$((now_s - start_s))"
    status="$(sprite_status || true)"
    printf 'elapsed_s=%s status=%s\n' "${elapsed_s}" "${status:-unknown}" >>"${tmp_report}"
    if [[ -n "${status}" && "${status}" != "running" ]]; then
      break
    fi
    if (( elapsed_s >= max_seconds )); then
      break
    fi
    sleep "${interval_seconds}"
  done
  append '```'
}

suspend_and_confirm() {
  local label="$1"
  record_command "${label}: POST suspend" "${sprite_bin}" api "/v1/sprites/${sprite_name}/suspend" -- -X POST
  wait_until_not_running "${label}: poll until status leaves running" 45 2
}

set_url_auth() {
  local auth="$1"
  record_command "Set URL auth ${auth}" "${sprite_bin}" url update -s "${sprite_name}" --auth "${auth}"
}

probe_unauth_url() {
  local label="$1"
  local url="$2"
  record_command "${label}: status before plain curl" "${sprite_bin}" api "/v1/sprites/${sprite_name}"
  record_command "${label}: unauthenticated external HTTPS request" env -u SPRITE_API_TOKEN -u SPRITES_TOKEN -u FLY_API_TOKEN curl --silent --show-error --include --max-time 20 "${url}/"
  poll_status "${label}: status after unauthenticated request" 60 3
}

append "# Phase 1a Sprite URL, Proxy, and Attached-Idle Probes"
append
append "- Sprite: \`${sprite_name}\`"
append "- Started: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`"
append "- Sprite CLI: \`${sprite_bin}\`"
append "- Run ID: \`${run_id}\`"
append
append "This harness refuses \`sprite create\` and \`sprite destroy\`. It restores URL auth in an EXIT trap, deletes its temporary Service, and kills local and remote processes it starts."

section "Baseline"
initial_metadata="$(run_capture "Initial Sprite metadata" "${sprite_bin}" api "/v1/sprites/${sprite_name}")"
original_auth="$(printf '%s\n' "${initial_metadata}" | auth_from_text || true)"
sprite_url="$(printf '%s\n' "${initial_metadata}" | url_from_text || true)"
[[ -n "${original_auth}" ]] || original_auth="sprite"
[[ -n "${sprite_url}" ]] || {
  echo "Unable to parse Sprite URL from metadata" >&2
  exit 1
}
append
append "- Parsed public URL: \`${sprite_url}\`"
append "- Parsed original URL auth: \`${original_auth}\`"
record_command "CLI URL info" "${sprite_bin}" info "${sprite_name}"
record_command "Org credential inventory without token material" "${sprite_bin}" org list

section "Probe 1: Unauthenticated URL Wake"
set_url_auth "sprite"
suspend_and_confirm "auth=sprite baseline"
probe_unauth_url "auth=sprite" "${sprite_url}"

set_url_auth "public"
suspend_and_confirm "auth=public baseline"
probe_unauth_url "auth=public" "${sprite_url}"
set_url_auth "sprite"
printf '%s\n' "Probe 1: tested unauthenticated external HTTPS requests under auth=sprite and auth=public, polling management status before and after each request." >>"${summary_file}"

section "Probe 2: Proxy API as Gateway"
# shellcheck disable=SC2016 # This script body must expand inside the Sprite, not on the host.
record_sprite_exec "Install temporary HTTP/SSE app" "
set -euo pipefail
mkdir -p '${remote_root}'
cat > '${remote_root}/app.py' <<'PY'
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import time

RUN_ID = '${run_id}'

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        if self.path.startswith('/events'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            for i in range(60):
                self.wfile.write(f'data: {RUN_ID} {i}\\n\\n'.encode())
                self.wfile.flush()
                time.sleep(2)
            return
        if self.path.startswith('/hold'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            for i in range(60):
                self.wfile.write(f'hold {RUN_ID} {i}\\n'.encode())
                self.wfile.flush()
                time.sleep(2)
            return
        body = json.dumps({'ok': True, 'run_id': RUN_ID, 'path': self.path}) + '\\n'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body.encode())

ThreadingHTTPServer(('127.0.0.1', ${app_port}), Handler).serve_forever()
PY
"
remote_cleanup_needed=1
record_command "Create temporary HTTP Service" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services create "${service_name}" --cmd /usr/bin/python3 --args app.py --dir "${remote_root}" --http-port "${app_port}" --duration 2s
service_created=1
record_command "Service state after create" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services get "${service_name}"
record_sprite_exec "In-Sprite service health check" "curl --silent --show-error --max-time 5 http://127.0.0.1:${app_port}/"
record_command "Authenticated Proxy API WebSocket upgrade through sprite api" "${sprite_bin}" api "/v1/sprites/${sprite_name}/proxy" -- --http1.1 --include --max-time 10 -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: MTIzNDU2Nzg5MDEyMzQ1Ng==" -H "Sec-WebSocket-Version: 13"
record_command "Unauthenticated raw WebSocket upgrade attempt to Proxy API" curl --http1.1 --silent --show-error --include --max-time 10 -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: MTIzNDU2Nzg5MDEyMzQ1Ng==" -H "Sec-WebSocket-Version: 13" "https://api.sprites.dev/v1/sprites/${sprite_name}/proxy"
append
append "Documented Proxy API endpoint: \`WSS /v1/sprites/{name}/proxy\`; documented client credential: \`Authorization: Bearer \$SPRITES_TOKEN\`. In this sandbox, \`sprite proxy\` itself attempts to rewrite \`~/.sprites/sprites.json\`, so the harness uses \`sprite api\` for the authenticated WebSocket upgrade evidence instead of running the local port forward. No scoped/non-org Proxy credential surface was exposed by \`sprite auth --help\`, \`sprite org --help\`, or the Proxy API behavior."
printf '%s\n' "Probe 2: created a temporary HTTP Service, verified it in-sprite, and recorded authenticated-vs-unauthenticated Proxy API WebSocket behavior." >>"${summary_file}"

section "Probe 3: Attached-Idle Mechanisms"
suspend_and_confirm "Reset before idle TTY"
append
append "### Start idle TTY"
append
append '```text'
append "$ script -q /dev/null ${sprite_bin} exec -s ${sprite_name} --tty -- bash -lc 'while :; do sleep 60; done' setta-phase1a-url-idle-tty-${run_id}"
script -q /dev/null "${sprite_bin}" exec -s "${sprite_name}" --tty -- bash -lc "printf 'tty-open ${run_id}\n'; while :; do sleep 60; done" "setta-phase1a-url-idle-tty-${run_id}" >"${tty_log}" 2>&1 &
tty_pid="$!"
append "tty_pid=${tty_pid}"
append '```'
sleep 8
poll_status "Idle TTY held open: status observation" 45 5
append
append "### Idle TTY disconnect"
append
append '```text'
append "killing local tty_pid=${tty_pid}"
append '```'
kill_local_pid "${tty_pid}"
tty_pid=""
wait_until_not_running "Idle TTY disconnect: poll until status leaves running" 120 5
append
append "### Idle TTY local log"
append
append '```text'
sed -n '1,80p' "${tty_log}" >>"${tmp_report}" || true
append '```'

suspend_and_confirm "Reset before SSE"
set_url_auth "public"
append
append "### Start long-lived SSE client through public URL"
append
append '```text'
append "$ curl --no-buffer ${sprite_url}/events"
curl --silent --show-error --no-buffer --max-time 150 "${sprite_url}/events" >"${sse_log}" 2>&1 &
sse_pid="$!"
append "sse_pid=${sse_pid}"
append '```'
sleep 8
poll_status "SSE client held open: status observation" 45 5
append
append "### SSE disconnect"
append
append '```text'
append "killing local sse_pid=${sse_pid}"
append '```'
kill_local_pid "${sse_pid}"
sse_pid=""
wait_until_not_running "SSE disconnect: poll until status leaves running" 120 5
set_url_auth "sprite"
append
append "### SSE client log"
append
append '```text'
sed -n '1,80p' "${sse_log}" >>"${tmp_report}" || true
append '```'

suspend_and_confirm "Reset before preview/proxy attachment"
set_url_auth "public"
append
append "### Start preview-style HTTP client attachment through public URL"
append
append '```text'
append "$ curl --no-buffer ${sprite_url}/hold"
curl --silent --show-error --no-buffer --max-time 150 "${sprite_url}/hold" >"${preview_log}" 2>&1 &
preview_pid="$!"
append "preview_pid=${preview_pid}"
append '```'
sleep 8
poll_status "Preview HTTP client held open: status observation" 45 5
append
append "### Preview HTTP client disconnect"
append
append '```text'
append "killing local preview_pid=${preview_pid}"
append '```'
kill_local_pid "${preview_pid}"
preview_pid=""
wait_until_not_running "Preview HTTP client disconnect: poll until status leaves running" 120 5
set_url_auth "sprite"
append
append "### Preview request log"
append
append '```text'
sed -n '1,80p' "${preview_log}" >>"${tmp_report}" || true
append '```'
printf '%s\n' "Probe 3: measured idle TTY, long-lived SSE over the Sprite URL, and preview-style HTTP client attachment over the Sprite URL with bounded hold/disconnect windows." >>"${summary_file}"

section "Final Cleanup Verification"
record_command "Delete temporary Service" "${sprite_bin}" exec -s "${sprite_name}" -- /.sprite/bin/sprite-env services delete "${service_name}"
service_created=0
record_sprite_exec "Remove remote probe files and process markers" "p='setta-phase1a-url-'; s='idle-${run_id}'; m=\"\${p}\${s}\"; pkill -f \"[s]\${m#s}\" 2>/dev/null || true; rm -rf \"/tmp/\${m}\"; ps -ef | grep \"[s]\${m#s}\" || true"
remote_cleanup_needed=0
set_url_auth "${original_auth}"
suspend_and_confirm "Final suspend after cleanup"
record_command "Final Sprite metadata" "${sprite_bin}" api "/v1/sprites/${sprite_name}"
record_command "Final services list" "${sprite_bin}" api "/v1/sprites/${sprite_name}/services"
append
append "### Summary"
append
while IFS= read -r line; do
  append "- ${line}"
done <"${summary_file}"
append
append "### Commands Run"
append
cat "${commands_file}" >>"${tmp_report}"

mv "${tmp_report}" "${out_file}"
trap - EXIT
cleanup
