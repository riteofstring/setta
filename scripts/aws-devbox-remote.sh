#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "${SCRIPT_DIR}/aws-devbox-common.sh"
setta_aws_devbox_bootstrap "${SCRIPT_DIR}"

start_mode=${SETTA_AWS_DEVBOX_REMOTE_START_MODE:-working}
open_browser=${SETTA_AWS_DEVBOX_OPEN_BROWSER:-1}
sync_codex_auth=${SETTA_AWS_DEVBOX_SYNC_CODEX_AUTH:-1}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --root)
            start_mode=repo_root
            shift
            ;;
        --working)
            start_mode=working
            shift
            ;;
        --no-open)
            open_browser=0
            shift
            ;;
        --open)
            open_browser=1
            shift
            ;;
        --no-codex-auth-sync)
            sync_codex_auth=0
            shift
            ;;
        --codex-auth-sync)
            sync_codex_auth=1
            shift
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

python "${SCRIPT_DIR}/aws_devbox.py" up

status_json=$(python "${SCRIPT_DIR}/aws_devbox.py" status --json)
current_status_json="${status_json}"
instance_id=$(printf '%s' "${status_json}" | jq -r '.instance_id')
region=$(printf '%s' "${status_json}" | jq -r '.region')
remote_setta_port=$(printf '%s' "${status_json}" | jq -r '.setta_port')
remote_cdp_port=$(printf '%s' "${status_json}" | jq -r '.cdp_port')
remote_repo_root=$(printf '%s' "${status_json}" | jq -r '.repo_checkout_path')

if [ "${instance_id}" = "null" ] || [ -z "${instance_id}" ]; then
    echo "Could not resolve the devbox instance id." >&2
    exit 1
fi

if [ "${region}" = "null" ] || [ -z "${region}" ]; then
    echo "Could not resolve the devbox region." >&2
    exit 1
fi

if [ "${remote_repo_root}" = "null" ] || [ -z "${remote_repo_root}" ]; then
    echo "Could not resolve the remote repo checkout path." >&2
    exit 1
fi

local_setta_port=${SETTA_AWS_DEVBOX_LOCAL_SETTA_PORT:-${remote_setta_port}}
local_cdp_port=${SETTA_AWS_DEVBOX_LOCAL_CDP_PORT:-${remote_cdp_port}}
ssh_user=${SETTA_AWS_DEVBOX_SSH_USER:-ubuntu}
known_hosts_file=${SETTA_AWS_DEVBOX_SSH_KNOWN_HOSTS_FILE:-${HOME}/.cache/setta-aws-devbox/known_hosts}
aws_profile=${AWS_PROFILE:-${SETTA_AWS_DEVBOX_PROFILE:-${AWS_DEFAULT_PROFILE:-}}}
git_identity_file=${SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE:-}
repo_remote_url=${SETTA_AWS_DEVBOX_REPO_REMOTE_URL:-}
repo_branch=${SETTA_AWS_DEVBOX_REPO_BRANCH:-}
browser_app=${SETTA_AWS_DEVBOX_BROWSER_APP:-Google Chrome}
browser_profile_dir=${SETTA_AWS_DEVBOX_BROWSER_PROFILE_DIR:-${HOME}/.cache/setta-aws-devbox/chrome-profile}
local_codex_auth_file=${SETTA_AWS_DEVBOX_CODEX_AUTH_FILE:-${HOME}/.codex/auth.json}
remote_tmux_mouse=${SETTA_AWS_DEVBOX_TMUX_MOUSE:-off}
managed_agent_pid=""
browser_watch_pid=""
last_local_forward_check_reused=0
required_local_forward_checks=0
reused_local_forward_checks=0
reuse_existing_local_forward_tunnel=0

case "${remote_tmux_mouse}" in
    on|off) ;;
    *)
        echo "Invalid value for SETTA_AWS_DEVBOX_TMUX_MOUSE: ${remote_tmux_mouse}. Expected on or off." >&2
        exit 1
        ;;
esac

resolve_ssh_term() {
    if [ -n "${SETTA_AWS_DEVBOX_TERM:-}" ]; then
        printf '%s\n' "${SETTA_AWS_DEVBOX_TERM}"
        return
    fi

    if [ -n "${TERM:-}" ] && [ "${TERM}" != "dumb" ]; then
        printf '%s\n' "${TERM}"
        return
    fi

    printf 'xterm-256color\n'
}

ssh_term=$(resolve_ssh_term)

mkdir -p "$(dirname "${known_hosts_file}")"
touch "${known_hosts_file}"

proxy_command="aws"
if [ -n "${aws_profile}" ]; then
    proxy_command="${proxy_command} --profile ${aws_profile}"
fi
proxy_command="${proxy_command} --region ${region} ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p"

ssh_common_args=(
    -F
    /dev/null
    -o "ProxyCommand=${proxy_command}"
    -o "StrictHostKeyChecking=accept-new"
    -o "UserKnownHostsFile=${known_hosts_file}"
    -o "ServerAliveInterval=30"
    -o "ServerAliveCountMax=3"
    -o "ExitOnForwardFailure=yes"
)

ssh_login_args=("${ssh_common_args[@]}")

ssh_args=(
    -A
    -tt
    -o "LogLevel=QUIET"
    "${ssh_login_args[@]}"
    -L "${local_setta_port}:127.0.0.1:${remote_setta_port}"
    -L "${local_cdp_port}:127.0.0.1:${remote_cdp_port}"
)

if [ -n "${SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE:-}" ]; then
    if [ ! -f "${SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE}" ]; then
        echo "Configured SSH identity file does not exist: ${SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE}" >&2
        exit 1
    fi
    ssh_login_args+=(
        -i "${SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE}"
        -o "IdentitiesOnly=yes"
    )
    ssh_args+=(
        -i "${SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE}"
        -o "IdentitiesOnly=yes"
    )
fi

refresh_status_json() {
    python "${SCRIPT_DIR}/aws_devbox.py" status --json
}

status_json_field() {
    raw_status_json="$1"
    field_name="$2"
    printf '%s' "${raw_status_json}" | jq -r --arg field_name "${field_name}" '.[$field_name] // empty' 2>/dev/null || true
}

status_json_has_ssm_transport() {
    raw_status_json="$1"
    status_state="$(status_json_field "${raw_status_json}" state)"
    status_ping="$(status_json_field "${raw_status_json}" ssm_ping_status)"
    [ "${status_state}" = "running" ] && [ "${status_ping}" = "online" ]
}

format_status_summary() {
    raw_status_json="$1"
    status_state="$(status_json_field "${raw_status_json}" state)"
    status_ping="$(status_json_field "${raw_status_json}" ssm_ping_status)"
    printf 'state: %s, ssm_ping_status: %s' "${status_state:-unknown}" "${status_ping:-unknown}"
}

attempt_ssm_transport_recovery() {
    operation_label="$1"
    recovery_status_json="$2"
    recovery_state="$(status_json_field "${recovery_status_json}" state)"

    echo "AWS devbox Session Manager transport is unavailable before ${operation_label} ($(format_status_summary "${recovery_status_json}")). Attempting bounded recovery..." >&2

    if [ "${recovery_state}" = "running" ]; then
        if ! python "${SCRIPT_DIR}/aws_devbox.py" down; then
            echo "Could not stop the AWS devbox while recovering Session Manager connectivity." >&2
            return 1
        fi
    fi

    if ! python "${SCRIPT_DIR}/aws_devbox.py" up; then
        echo "Could not bring the AWS devbox back online while recovering Session Manager connectivity." >&2
        return 1
    fi

    current_status_json="$(refresh_status_json)"
    if status_json_has_ssm_transport "${current_status_json}"; then
        echo "AWS devbox Session Manager transport recovered for ${operation_label}." >&2
        return 0
    fi

    echo "AWS devbox Session Manager transport is still unavailable after recovery ($(format_status_summary "${current_status_json}"))." >&2
    return 1
}

ensure_ssm_transport_ready() {
    operation_label="$1"

    if status_json_has_ssm_transport "${current_status_json}"; then
        return 0
    fi

    current_status_json="$(refresh_status_json)"
    if status_json_has_ssm_transport "${current_status_json}"; then
        return 0
    fi

    if attempt_ssm_transport_recovery "${operation_label}" "${current_status_json}"; then
        return 0
    fi

    echo "Cannot continue with ${operation_label} while Session Manager remains unavailable." >&2
    return 1
}

run_noninteractive_ssh() {
    operation_label="$1"
    shift

    if ! ensure_ssm_transport_ready "${operation_label}"; then
        return 1
    fi

    stdout_file="$(mktemp)"
    stderr_file="$(mktemp)"

    if ssh -n -T "$@" >"${stdout_file}" 2>"${stderr_file}"; then
        cat "${stdout_file}"
        rm -f "${stdout_file}" "${stderr_file}"
        return 0
    fi

    ssh_exit=$?
    current_status_json="$(refresh_status_json)"
    if ! status_json_has_ssm_transport "${current_status_json}"; then
        echo "AWS devbox Session Manager transport dropped during ${operation_label} ($(format_status_summary "${current_status_json}"))." >&2
        if attempt_ssm_transport_recovery "${operation_label}" "${current_status_json}"; then
            if ssh -n -T "$@" >"${stdout_file}" 2>"${stderr_file}"; then
                cat "${stdout_file}"
                rm -f "${stdout_file}" "${stderr_file}"
                return 0
            fi
            ssh_exit=$?
        fi
    fi

    cat "${stderr_file}" >&2
    rm -f "${stdout_file}" "${stderr_file}"
    return "${ssh_exit}"
}

cleanup() {
    if [ -n "${browser_watch_pid}" ]; then
        kill "${browser_watch_pid}" >/dev/null 2>&1 || true
        wait "${browser_watch_pid}" 2>/dev/null || true
    fi
    if [ -n "${managed_agent_pid}" ]; then
        ssh-agent -k >/dev/null 2>&1 || true
    fi
}

trap cleanup EXIT INT TERM

ssh_agent_has_identities() {
    ssh-add -L >/dev/null 2>&1
}

ensure_git_agent() {
    if [ -z "${git_identity_file}" ]; then
        return
    fi

    if [ ! -f "${git_identity_file}" ]; then
        echo "Configured Git identity file does not exist: ${git_identity_file}" >&2
        exit 1
    fi

    eval "$(ssh-agent -s)" >/dev/null
    managed_agent_pid=${SSH_AGENT_PID}

    echo "Loading Git identity into the session ssh-agent..." >&2
    if ssh-add "${git_identity_file}" >/dev/null 2>&1; then
        echo "Git identity registered with the session ssh-agent. YubiKey touch may still be required on the first GitHub operation." >&2
        return
    fi

    echo "Warning: could not load ${git_identity_file} into the session ssh-agent. Remote git auth may still fail." >&2
}

ensure_git_agent

sync_local_codex_auth() {
    if [ "${sync_codex_auth}" != "1" ]; then
        return
    fi

    if [ ! -f "${local_codex_auth_file}" ]; then
        return
    fi

    echo "Syncing Codex auth to the remote devbox..." >&2
    codex_auth_b64="$(
        LOCAL_CODEX_AUTH_FILE="${local_codex_auth_file}" python3 - <<'PY'
import base64
import os
from pathlib import Path

print(base64.b64encode(Path(os.environ["LOCAL_CODEX_AUTH_FILE"]).read_bytes()).decode("ascii"), end="")
PY
    )"
    remote_auth_script=$(cat <<'EOF'
set -euo pipefail
umask 077
mkdir -p ~/.codex
if [ ! -f ~/.codex/config.toml ]; then
    printf 'cli_auth_credentials_store = "file"\n' > ~/.codex/config.toml
fi
python3 - <<'PY'
import base64
import os
from pathlib import Path

auth_path = Path.home() / ".codex" / "auth.json"
auth_path.write_bytes(base64.b64decode(os.environ["SETTA_CODEX_AUTH_B64"]))
auth_path.chmod(0o600)
PY
EOF
)
    printf -v remote_auth_command 'SETTA_CODEX_AUTH_B64=%q bash -lc %q' \
        "${codex_auth_b64}" \
        "${remote_auth_script}"

    if ! run_noninteractive_ssh "Codex auth sync" \
        "${ssh_login_args[@]}" \
        "${ssh_user}@${instance_id}" \
        "${remote_auth_command}"; then
        if ! status_json_has_ssm_transport "${current_status_json}"; then
            return 1
        fi
        echo "Warning: could not sync Codex auth to the remote devbox. Continuing without auth sync." >&2
    fi
}

sync_local_codex_auth

resolve_remote_start_dir() {
    case "${start_mode}" in
        repo_root)
            printf '%s\n' "${remote_repo_root}"
            return
            ;;
        working)
            local_pwd=$(pwd -P)
            if [ "${local_pwd}" = "${SETTA_AWS_DEVBOX_REPO_ROOT}" ]; then
                printf '%s\n' "${remote_repo_root}"
                return
            fi

            case "${local_pwd}" in
                "${SETTA_AWS_DEVBOX_REPO_ROOT}"/*)
                    relative_path=${local_pwd#${SETTA_AWS_DEVBOX_REPO_ROOT}/}
                    printf '%s/%s\n' "${remote_repo_root}" "${relative_path}"
                    return
                    ;;
            esac

            printf '%s\n' "${remote_repo_root}"
            return
            ;;
        *)
            echo "Unsupported remote start mode: ${start_mode}" >&2
            exit 1
            ;;
    esac
}

remote_start_dir=$(resolve_remote_start_dir)

build_remote_bootstrap_command() {
    printf "setta-devbox-ensure-ready %q preserve >/dev/null && cd %q && ./scripts/bootstrap-url.sh" \
        "${remote_start_dir}" \
        "${remote_repo_root}"
}

remote_bootstrap_command=$(build_remote_bootstrap_command)

fetch_bootstrap_url() {
    run_noninteractive_ssh "bootstrap URL lookup" \
        "${ssh_login_args[@]}" \
        "${ssh_user}@${instance_id}" \
        "${remote_bootstrap_command}"
}

rewrite_bootstrap_url_for_local_forward() {
    BOOTSTRAP_URL="$1" LOCAL_SETTA_PORT="${local_setta_port}" python - <<'PY'
import os
from urllib.parse import urlparse, urlunparse

raw_url = os.environ["BOOTSTRAP_URL"]
local_port = os.environ["LOCAL_SETTA_PORT"]
parsed = urlparse(raw_url)
rewritten = parsed._replace(scheme="http", netloc=f"127.0.0.1:{local_port}")
print(urlunparse(rewritten))
PY
}

local_setta_is_ready() {
    curl -fsS "http://127.0.0.1:${local_setta_port}/__setta__/bootstrap" >/dev/null 2>&1
}

local_url_is_ready() {
    target_url="$1"

    if curl -fsS "${target_url}" >/dev/null 2>&1; then
        return 0
    fi
    local_url_port_is_connectable "${target_url}"
}

local_url_port_is_connectable() {
    URL_TO_PROBE="$1" python - <<'PY'
import os
import socket
import sys
from urllib.parse import urlparse

raw_url = os.environ["URL_TO_PROBE"]
parsed = urlparse(raw_url)
host = parsed.hostname or "127.0.0.1"
port = parsed.port
if port is None:
    port = 443 if parsed.scheme == "https" else 80

try:
    with socket.create_connection((host, port), timeout=1.0):
        pass
except OSError:
    sys.exit(1)
PY
}

browser_profile_match_pattern() {
    BROWSER_PROFILE_ARG="--user-data-dir=${browser_profile_dir}" python - <<'PY'
import os
import re

print(re.escape(os.environ["BROWSER_PROFILE_ARG"]))
PY
}

browser_profile_instance_detected() {
    if ! command -v pgrep >/dev/null 2>&1; then
        return 1
    fi

    browser_pattern="$(browser_profile_match_pattern)"
    if [ -z "${browser_pattern}" ]; then
        return 1
    fi

    pgrep -f -- "${browser_pattern}" >/dev/null 2>&1
}

browser_opener_available() {
    command -v open >/dev/null 2>&1 || command -v xdg-open >/dev/null 2>&1
}

browser_profile_instance_running() {
    if ! command -v pgrep >/dev/null 2>&1; then
        return 0
    fi

    browser_pattern="$(browser_profile_match_pattern)"
    if [ -z "${browser_pattern}" ]; then
        return 0
    fi

    pgrep -f -- "${browser_pattern}" >/dev/null 2>&1
}

local_listener_pids_for_port() {
    local_port="$1"

    if ! command -v lsof >/dev/null 2>&1; then
        return 0
    fi

    lsof -nP -t -iTCP:"${local_port}" -sTCP:LISTEN 2>/dev/null | awk '!seen[$0]++'
}

process_command_for_pid() {
    process_pid="$1"
    ps -p "${process_pid}" -o command= 2>/dev/null || true
}

process_tty_for_pid() {
    process_pid="$1"
    ps -p "${process_pid}" -o tty= 2>/dev/null | awk '{$1=$1; print}' || true
}

stale_ssh_listener_matches_port() {
    local_port="$1"
    remote_port="$2"
    process_command="$3"
    process_tty="$4"

    case "${process_command}" in
        ssh\ *|*/ssh\ *) ;;
        *)
            return 1
            ;;
    esac

    case "${process_command}" in
        *"${ssh_user}@${instance_id}"*) ;;
        *)
            return 1
            ;;
    esac

    case "${process_command}" in
        *"-L ${local_port}:127.0.0.1:${remote_port}"*) ;;
        *)
            return 1
            ;;
    esac

    case "${process_tty:-}" in
        ""|"?"|"??"|"not a tty") ;;
        *)
            return 1
            ;;
    esac

    return 0
}

reusable_ssh_listener_matches_port() {
    local_port="$1"
    remote_port="$2"
    process_command="$3"

    case "${process_command}" in
        ssh\ *|*/ssh\ *) ;;
        *)
            return 1
            ;;
    esac

    case "${process_command}" in
        *"${ssh_user}@${instance_id}"*) ;;
        *)
            return 1
            ;;
    esac

    case "${process_command}" in
        *"-L ${local_port}:127.0.0.1:${remote_port}"*) ;;
        *)
            return 1
            ;;
    esac

    return 0
}

stop_stale_local_ssh_listener() {
    process_pid="$1"
    local_port="$2"

    echo "Closing stale local SSH forward process ${process_pid} on port ${local_port} before reopening..." >&2
    kill "${process_pid}" >/dev/null 2>&1 || true

    attempts=0
    while kill -0 "${process_pid}" >/dev/null 2>&1; do
        if [ "${attempts}" -ge 50 ]; then
            kill -9 "${process_pid}" >/dev/null 2>&1 || true
            break
        fi

        sleep 0.1
        attempts=$((attempts + 1))
    done
}

ensure_local_forward_port_available() {
    local_port="$1"
    remote_port="$2"
    port_label="$3"
    override_hint="${4:-}"
    last_local_forward_check_reused=0

    if ! command -v lsof >/dev/null 2>&1; then
        return 0
    fi

    while true; do
        listener_pids="$(local_listener_pids_for_port "${local_port}")"
        if [ -z "${listener_pids}" ]; then
            return 0
        fi

        closed_stale_listener=0
        while IFS= read -r listener_pid; do
            [ -n "${listener_pid}" ] || continue

            listener_command="$(process_command_for_pid "${listener_pid}")"
            listener_tty="$(process_tty_for_pid "${listener_pid}")"

            if stale_ssh_listener_matches_port "${local_port}" "${remote_port}" "${listener_command}" "${listener_tty}"; then
                stop_stale_local_ssh_listener "${listener_pid}" "${local_port}"
                closed_stale_listener=1
                break
            fi

            if reusable_ssh_listener_matches_port "${local_port}" "${remote_port}" "${listener_command}"; then
                echo "Reusing existing local SSH forward process ${listener_pid} on port ${local_port} for ${port_label}." >&2
                last_local_forward_check_reused=1
                return 0
            fi

            tty_label="${listener_tty:-none}"
            echo "Local port ${local_port} required for ${port_label} is already in use by PID ${listener_pid} (tty ${tty_label})." >&2
            if [ -n "${listener_command}" ]; then
                echo "Conflicting process: ${listener_command}" >&2
            fi
            if [ -n "${override_hint}" ]; then
                echo "Stop the conflicting process or choose a different local port with ${override_hint}." >&2
            else
                echo "Stop the conflicting process and retry." >&2
            fi
            return 1
        done <<EOF
${listener_pids}
EOF

        if [ "${closed_stale_listener}" != "1" ]; then
            return 0
        fi
    done
}

open_local_browser() {
    bootstrap_url="$1"
    if browser_profile_instance_detected; then
        setta_aws_devbox_open_browser_url_existing_instance "${bootstrap_url}" "${browser_app}"
        return 0
    fi
    setta_aws_devbox_open_browser_url "${bootstrap_url}" "${browser_app}" "${browser_profile_dir}"
}

start_local_browser_watch() {
    initial_url="$1"
    auth_url="${2:-}"
    reopen_url="${3:-${initial_url}}"
    probe_url="${4:-${reopen_url}}"
    auth_probe_url=""
    if [ -n "${auth_url}" ]; then
        auth_probe_url="${auth_url%%#*}"
    fi

    if ! browser_opener_available; then
        echo "Warning: could not find a browser opener for ${initial_url}" >&2
        return 1
    fi

    auth_opened=0
    initially_ready=0
    auth_ready=0
    if [ -n "${auth_probe_url}" ] && local_url_is_ready "${auth_probe_url}"; then
        auth_ready=1
    fi
    if local_url_is_ready "${probe_url}"; then
        initially_ready=1
    fi
    if [ "${auth_ready}" = "1" ]; then
        open_local_browser "${auth_url}" || true
        auth_opened=1
    elif [ "${initially_ready}" = "1" ] && [ -z "${auth_url}" ]; then
        open_local_browser "${reopen_url}" || true
    elif [ -z "${auth_url}" ]; then
        open_local_browser "${initial_url}" || true
    fi

    (
        previously_ready="${initially_ready}"
        auth_opened="${auth_opened}"
        auth_probe_url="${auth_probe_url}"
        while true; do
            opened_auth_this_tick=0
            if [ "${auth_opened}" = "0" ] && [ -n "${auth_url}" ] && [ -n "${auth_probe_url}" ]; then
                if local_url_is_ready "${auth_probe_url}"; then
                    open_local_browser "${auth_url}" || true
                    auth_opened=1
                    opened_auth_this_tick=1
                fi
            fi
            if local_url_is_ready "${probe_url}"; then
                if [ "${auth_opened}" = "0" ] && [ -n "${auth_url}" ]; then
                    :
                elif [ "${opened_auth_this_tick}" = "1" ]; then
                    :
                elif [ "${previously_ready}" = "0" ] || ! browser_profile_instance_running; then
                    open_local_browser "${reopen_url}" || true
                fi
                previously_ready=1
            else
                previously_ready=0
            fi
            sleep 2
        done
    ) &
    browser_watch_pid=$!
}

bootstrap_url=""
if ! ensure_local_forward_port_available "${local_setta_port}" "${remote_setta_port}" "remote shell tunnel" "SETTA_AWS_DEVBOX_LOCAL_SETTA_PORT"; then
    exit 1
fi
required_local_forward_checks=$((required_local_forward_checks + 1))
if [ "${last_local_forward_check_reused}" = "1" ]; then
    reused_local_forward_checks=$((reused_local_forward_checks + 1))
fi
if ! ensure_local_forward_port_available "${local_cdp_port}" "${remote_cdp_port}" "remote shell CDP tunnel" "SETTA_AWS_DEVBOX_LOCAL_CDP_PORT"; then
    exit 1
fi
required_local_forward_checks=$((required_local_forward_checks + 1))
if [ "${last_local_forward_check_reused}" = "1" ]; then
    reused_local_forward_checks=$((reused_local_forward_checks + 1))
fi

if [ "${reused_local_forward_checks}" -gt 0 ]; then
    if [ "${reused_local_forward_checks}" -ne "${required_local_forward_checks}" ]; then
        echo "Some required local ports are already forwarded by existing SSH sessions while others are not. Stop the existing tunnel(s) or align the local port overrides before retrying." >&2
        exit 1
    fi
    reuse_existing_local_forward_tunnel=1
fi

if [ "${open_browser}" = "1" ]; then
    raw_bootstrap_url=$(fetch_bootstrap_url || true)
    if [ -n "${raw_bootstrap_url}" ]; then
        bootstrap_url=$(rewrite_bootstrap_url_for_local_forward "${raw_bootstrap_url}")
        root_url="http://127.0.0.1:${local_setta_port}/"
        if [ "${reuse_existing_local_forward_tunnel}" = "1" ]; then
            echo "Reusing existing local SSH tunnel(s) for the remote shell and opening the browser on the existing tunnel..." >&2
            open_local_browser "${root_url}" || true
        else
            echo "Watching local Setta tunnel at ${bootstrap_url} and reopening the dedicated browser profile on recovery..." >&2
            start_local_browser_watch "${root_url}" "${bootstrap_url}" "${root_url}" "${root_url}" || true
        fi
    else
        echo "Warning: could not fetch a remote bootstrap URL." >&2
    fi
fi

build_remote_attach_command() {
    remote_command=""

    if [ -n "${repo_remote_url}" ]; then
        printf -v remote_command 'SETTA_DEVBOX_REPO_REMOTE_URL=%q ' "${repo_remote_url}"
    fi

    if [ -n "${repo_branch}" ]; then
        printf -v branch_prefix 'SETTA_DEVBOX_REPO_BRANCH=%q ' "${repo_branch}"
        remote_command="${remote_command}${branch_prefix}"
    fi

    printf -v attach_command 'tmux start-server >/dev/null 2>&1 || true; tmux source-file "$HOME/.tmux.conf" >/dev/null 2>&1 || true; tmux set-option -g mouse %q >/dev/null 2>&1 || true; setta-devbox-attach %q preserve' "${remote_tmux_mouse}" "${remote_start_dir}"
    remote_command="${remote_command}${attach_command}"
    printf '%s\n' "${remote_command}"
}

remote_attach_command=$(build_remote_attach_command)

ssh_args+=(
    "${ssh_user}@${instance_id}"
    "${remote_attach_command}"
)
ssh_args_no_forward=(
    -A
    -tt
    -o "LogLevel=QUIET"
    "${ssh_login_args[@]}"
    "${ssh_user}@${instance_id}"
    "${remote_attach_command}"
)

if [ "${reuse_existing_local_forward_tunnel}" = "1" ]; then
    echo "Opening remote shell session without duplicate local forwards..." >&2
    ssh_args=("${ssh_args_no_forward[@]}")
fi

echo "Opening remote shell session..." >&2
if ! ensure_ssm_transport_ready "remote shell attach"; then
    exit 1
fi
TERM="${ssh_term}" ssh "${ssh_args[@]}"
