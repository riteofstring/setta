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
managed_agent_pid=""
browser_open_pid=""

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

cleanup() {
    if [ -n "${browser_open_pid}" ]; then
        wait "${browser_open_pid}" 2>/dev/null || true
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

    ssh \
        "${ssh_login_args[@]}" \
        "${ssh_user}@${instance_id}" \
        'umask 077 && mkdir -p ~/.codex && { [ -f ~/.codex/config.toml ] || printf '\''cli_auth_credentials_store = "file"\n'\'' > ~/.codex/config.toml; } && cat > ~/.codex/auth.json && chmod 0600 ~/.codex/auth.json' \
        < "${local_codex_auth_file}"
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
    ssh \
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

wait_for_local_setta() {
    deadline_seconds=30
    start_time=$(date +%s)

    while true; do
        if curl -fsS "http://127.0.0.1:${local_setta_port}/__setta__/bootstrap" >/dev/null 2>&1; then
            return 0
        fi

        current_time=$(date +%s)
        if [ $((current_time - start_time)) -ge "${deadline_seconds}" ]; then
            return 1
        fi

        sleep 1
    done
}

open_local_browser() {
    bootstrap_url="$1"

    if command -v open >/dev/null 2>&1; then
        mkdir -p "${browser_profile_dir}"
        open -na "${browser_app}" --args \
            "--user-data-dir=${browser_profile_dir}" \
            --new-window \
            "${bootstrap_url}"
        return 0
    fi

    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "${bootstrap_url}" >/dev/null 2>&1
        return 0
    fi

    echo "Warning: could not find a browser opener for ${bootstrap_url}" >&2
    return 1
}

bootstrap_url=""
if [ "${open_browser}" = "1" ]; then
    raw_bootstrap_url=$(fetch_bootstrap_url || true)
    if [ -n "${raw_bootstrap_url}" ]; then
        bootstrap_url=$(rewrite_bootstrap_url_for_local_forward "${raw_bootstrap_url}")
        (
            if wait_for_local_setta; then
                open_local_browser "${bootstrap_url}"
            else
                echo "Warning: local Setta tunnel did not become ready before browser launch timeout." >&2
                echo "Bootstrap URL: ${bootstrap_url}" >&2
            fi
        ) &
        browser_open_pid=$!
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

    printf -v attach_command 'tmux start-server >/dev/null 2>&1 || true; tmux source-file "$HOME/.tmux.conf" >/dev/null 2>&1 || true; setta-devbox-attach %q reset' "${remote_start_dir}"
    remote_command="${remote_command}${attach_command}"
    printf '%s\n' "${remote_command}"
}

remote_attach_command=$(build_remote_attach_command)

ssh_args+=(
    "${ssh_user}@${instance_id}"
    "${remote_attach_command}"
)

echo "Opening remote shell session..." >&2
TERM="${ssh_term}" ssh "${ssh_args[@]}"
