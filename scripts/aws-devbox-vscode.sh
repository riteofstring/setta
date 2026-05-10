#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "${SCRIPT_DIR}/aws-devbox-common.sh"
. "${SCRIPT_DIR}/aws-devbox-worktree-picker.sh"
setta_aws_devbox_bootstrap "${SCRIPT_DIR}"

include_repo_entrypoints=${SETTA_AWS_DEVBOX_INCLUDE_REPO_ENTRYPOINTS:-0}
window_mode=${SETTA_AWS_DEVBOX_VSCODE_WINDOW_MODE:-new}
auto_install_remote_ssh=${SETTA_AWS_DEVBOX_VSCODE_AUTO_INSTALL_REMOTE_SSH:-1}
vscode_bin=${SETTA_AWS_DEVBOX_VSCODE_BIN:-code}
vscode_host_alias=${SETTA_AWS_DEVBOX_VSCODE_SSH_HOST_ALIAS:-setta-aws-devbox}
vscode_settings_file=${SETTA_AWS_DEVBOX_VSCODE_SETTINGS_FILE:-${HOME}/Library/Application Support/Code/User/settings.json}
managed_ssh_config_file=${SETTA_AWS_DEVBOX_VSCODE_SSH_MANAGED_CONFIG_FILE:-${HOME}/.ssh/setta-aws-devbox.config}
ssh_server_alive_interval=${SETTA_AWS_DEVBOX_SSH_SERVER_ALIVE_INTERVAL:-30}
ssh_server_alive_count_max=${SETTA_AWS_DEVBOX_SSH_SERVER_ALIVE_COUNT_MAX:-12}
worktree_selection_mode=select
requested_worktree_branch=""
requested_remote_path=""
print_only=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        local)
            worktree_selection_mode=local
            shift
            ;;
        select)
            worktree_selection_mode=select
            shift
            ;;
        worktree)
            if [ "$#" -lt 2 ]; then
                echo "Missing branch name for worktree" >&2
                exit 1
            fi
            worktree_selection_mode=worktree
            requested_worktree_branch="$2"
            shift 2
            ;;
        path)
            if [ "$#" -lt 2 ]; then
                echo "Missing remote path for path mode" >&2
                exit 1
            fi
            worktree_selection_mode=path
            requested_remote_path="$2"
            shift 2
            ;;
        --new-window)
            window_mode=new
            shift
            ;;
        --reuse-window)
            window_mode=reuse
            shift
            ;;
        --print-only)
            print_only=1
            shift
            ;;
        --code-bin)
            if [ "$#" -lt 2 ]; then
                echo "Missing value for --code-bin" >&2
                exit 1
            fi
            vscode_bin="$2"
            shift 2
            ;;
        --host-alias)
            if [ "$#" -lt 2 ]; then
                echo "Missing value for --host-alias" >&2
                exit 1
            fi
            vscode_host_alias="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

validate_worktree_branch_name() {
    branch_name="$1"
    case "${branch_name}" in
        *[!A-Za-z0-9._-]*)
            echo "Branch name must use letters, digits, '.', '_' or '-': ${branch_name}" >&2
            exit 1
            ;;
    esac
}

if [ "${worktree_selection_mode}" = "worktree" ]; then
    validate_worktree_branch_name "${requested_worktree_branch}"
fi

case "${include_repo_entrypoints}" in
    0|1) ;;
    *)
        echo "Invalid value for SETTA_AWS_DEVBOX_INCLUDE_REPO_ENTRYPOINTS: ${include_repo_entrypoints}. Expected 0 or 1." >&2
        exit 1
        ;;
esac

case "${window_mode}" in
    new|reuse) ;;
    *)
        echo "Invalid window mode: ${window_mode}. Expected new or reuse." >&2
        exit 1
        ;;
esac

case "${auto_install_remote_ssh}" in
    0|1) ;;
    *)
        echo "Invalid value for SETTA_AWS_DEVBOX_VSCODE_AUTO_INSTALL_REMOTE_SSH: ${auto_install_remote_ssh}. Expected 0 or 1." >&2
        exit 1
        ;;
esac

case "${ssh_server_alive_interval}" in
    ''|*[!0-9]*|0)
        echo "Invalid value for SETTA_AWS_DEVBOX_SSH_SERVER_ALIVE_INTERVAL: ${ssh_server_alive_interval}. Expected a positive integer." >&2
        exit 1
        ;;
esac

case "${ssh_server_alive_count_max}" in
    ''|*[!0-9]*|0)
        echo "Invalid value for SETTA_AWS_DEVBOX_SSH_SERVER_ALIVE_COUNT_MAX: ${ssh_server_alive_count_max}. Expected a positive integer." >&2
        exit 1
        ;;
esac

python "${SCRIPT_DIR}/aws_devbox.py" up

status_json=$(python "${SCRIPT_DIR}/aws_devbox.py" status --json)
current_status_json="${status_json}"
instance_id=$(printf '%s' "${status_json}" | jq -r '.instance_id')
region=$(printf '%s' "${status_json}" | jq -r '.region')
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

remote_checkout_parent=$(dirname "${remote_repo_root}")
ssh_user=${SETTA_AWS_DEVBOX_SSH_USER:-ubuntu}
known_hosts_file=${SETTA_AWS_DEVBOX_SSH_KNOWN_HOSTS_FILE:-${HOME}/.cache/setta-aws-devbox/known_hosts}
aws_profile=${AWS_PROFILE:-${SETTA_AWS_DEVBOX_PROFILE:-${AWS_DEFAULT_PROFILE:-}}}

if ! command -v "${vscode_bin}" >/dev/null 2>&1; then
    echo "Could not find the VS Code CLI: ${vscode_bin}" >&2
    exit 1
fi

mkdir -p "$(dirname "${known_hosts_file}")"
touch "${known_hosts_file}"

proxy_command="aws"
if [ -n "${aws_profile}" ]; then
    proxy_command="${proxy_command} --profile ${aws_profile}"
fi
proxy_command="${proxy_command} --region ${region} ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p"

ssh_login_args=(
    -F
    /dev/null
    -o "ProxyCommand=${proxy_command}"
    -o "StrictHostKeyChecking=accept-new"
    -o "UserKnownHostsFile=${known_hosts_file}"
    -o "ServerAliveInterval=${ssh_server_alive_interval}"
    -o "ServerAliveCountMax=${ssh_server_alive_count_max}"
    -o "ExitOnForwardFailure=yes"
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

    if ssh -n -T "$@" >"${stdout_file}" 2> >(tee "${stderr_file}" >&2); then
        cat "${stdout_file}"
        rm -f "${stdout_file}" "${stderr_file}"
        return 0
    else
        ssh_exit=$?
    fi

    current_status_json="$(refresh_status_json)"
    if ! status_json_has_ssm_transport "${current_status_json}"; then
        echo "AWS devbox Session Manager transport dropped during ${operation_label} ($(format_status_summary "${current_status_json}"))." >&2
        if attempt_ssm_transport_recovery "${operation_label}" "${current_status_json}"; then
            : > "${stderr_file}"
            if ssh -n -T "$@" >"${stdout_file}" 2> >(tee "${stderr_file}" >&2); then
                cat "${stdout_file}"
                rm -f "${stdout_file}" "${stderr_file}"
                return 0
            fi
            ssh_exit=$?
        fi
    fi

    rm -f "${stdout_file}" "${stderr_file}"
    return "${ssh_exit}"
}

resolve_vscode_ssh_config_file() {
    if [ -n "${SETTA_AWS_DEVBOX_VSCODE_SSH_CONFIG_FILE:-}" ]; then
        printf '%s\n' "${SETTA_AWS_DEVBOX_VSCODE_SSH_CONFIG_FILE}"
        return
    fi

    if [ -f "${vscode_settings_file}" ]; then
        resolved_path=$(VSCODE_SETTINGS_FILE="${vscode_settings_file}" python3 - <<'PY'
import os
import re
from pathlib import Path

settings_path = Path(os.environ["VSCODE_SETTINGS_FILE"])
text = settings_path.read_text(encoding="utf-8", errors="ignore")
match = re.search(r'"remote\.SSH\.configFile"\s*:\s*"([^"]+)"', text)
if not match:
    raise SystemExit(1)
print(str(Path(match.group(1)).expanduser()))
PY
 2>/dev/null || true)
        if [ -n "${resolved_path}" ]; then
            printf '%s\n' "${resolved_path}"
            return
        fi
    fi

    printf '%s\n' "${HOME}/.ssh/config"
}

ensure_remote_directory_exists() {
    remote_path="$1"
    run_noninteractive_ssh "remote folder existence check" \
        "${ssh_login_args[@]}" \
        "${ssh_user}@${instance_id}" \
        "$(printf "test -d %q" "${remote_path}")" >/dev/null
}

ensure_vscode_remote_ssh_extension() {
    if "${vscode_bin}" --list-extensions 2>/dev/null | grep -Fxq 'ms-vscode-remote.remote-ssh'; then
        return
    fi

    if [ "${auto_install_remote_ssh}" != "1" ]; then
        echo "VS Code Remote - SSH is not installed. Run: ${vscode_bin} --install-extension ms-vscode-remote.remote-ssh" >&2
        exit 1
    fi

    echo "Installing VS Code Remote - SSH extension..." >&2
    "${vscode_bin}" --install-extension ms-vscode-remote.remote-ssh --force >/dev/null
}

ensure_vscode_ssh_include() {
    ssh_config_file="$1"
    include_file="$2"
    include_line="Include ${include_file}"

    install -d "$(dirname "${ssh_config_file}")"
    install -d "$(dirname "${include_file}")"

    if [ ! -f "${ssh_config_file}" ]; then
        : > "${ssh_config_file}"
    fi

    if ! grep -Fxq "${include_line}" "${ssh_config_file}" 2>/dev/null; then
        printf '\n%s\n' "${include_line}" >>"${ssh_config_file}"
    fi
}

write_managed_vscode_ssh_host() {
    include_file="$1"
    ssh_config=$(cat <<EOF
# Managed by Setta AWS devbox VS Code launcher.
Host ${vscode_host_alias}
    HostName ${instance_id}
    User ${ssh_user}
    ProxyCommand ${proxy_command}
    StrictHostKeyChecking accept-new
    UserKnownHostsFile ${known_hosts_file}
    ServerAliveInterval ${ssh_server_alive_interval}
    ServerAliveCountMax ${ssh_server_alive_count_max}
    ExitOnForwardFailure yes
EOF
)
    if [ -n "${SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE:-}" ]; then
        ssh_config="${ssh_config}
    IdentityFile ${SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE}
    IdentitiesOnly yes"
    fi
    printf '%s\n' "${ssh_config}" >"${include_file}"
}

build_vscode_remote_folder_uri() {
    remote_path="$1"
    VSCODE_SSH_HOST_ALIAS="${vscode_host_alias}" VSCODE_REMOTE_PATH="${remote_path}" python3 - <<'PY'
from urllib.parse import quote
import os

host = quote(os.environ["VSCODE_SSH_HOST_ALIAS"], safe="")
path = quote(os.environ["VSCODE_REMOTE_PATH"], safe="/")
print(f"vscode-remote://ssh-remote+{host}{path}")
PY
}

selected_remote_path=""
selected_remote_name=""
selected_remote_branch=""
selected_remote_source_kind=""

case "${worktree_selection_mode}" in
    local)
        selected_remote_name="$(basename "${SETTA_AWS_DEVBOX_REPO_ROOT}")"
        selected_remote_path="${remote_checkout_parent}/${selected_remote_name}"
        ;;
    select)
        selection_row=$(prompt_for_remote_worktree)
        IFS=$'\t' read -r selected_remote_path selected_remote_name selected_remote_branch selected_remote_source_kind <<EOF
${selection_row}
EOF
        ;;
    worktree)
        selection_row=$(select_remote_worktree_by_branch "${requested_worktree_branch}")
        IFS=$'\t' read -r selected_remote_path selected_remote_name selected_remote_branch selected_remote_source_kind <<EOF
${selection_row}
EOF
        ;;
    path)
        selected_remote_path="${requested_remote_path}"
        selected_remote_name="$(basename "${selected_remote_path}")"
        ;;
esac

if [ -z "${selected_remote_path}" ]; then
    echo "Could not resolve the remote folder to open." >&2
    exit 1
fi

ensure_remote_directory_exists "${selected_remote_path}"
ensure_vscode_remote_ssh_extension

ssh_config_file="$(resolve_vscode_ssh_config_file)"
ensure_vscode_ssh_include "${ssh_config_file}" "${managed_ssh_config_file}"
write_managed_vscode_ssh_host "${managed_ssh_config_file}"

folder_uri="$(build_vscode_remote_folder_uri "${selected_remote_path}")"
code_args=(--folder-uri "${folder_uri}")
if [ "${window_mode}" = "reuse" ]; then
    code_args=(--reuse-window "${code_args[@]}")
else
    code_args=(--new-window "${code_args[@]}")
fi

echo "Opening VS Code for ${selected_remote_path} via SSH host ${vscode_host_alias}..." >&2

if [ "${print_only}" = "1" ]; then
    printf 'ssh_config_file=%s\n' "${ssh_config_file}"
    printf 'managed_ssh_config_file=%s\n' "${managed_ssh_config_file}"
    printf 'ssh_host_alias=%s\n' "${vscode_host_alias}"
    printf 'remote_path=%s\n' "${selected_remote_path}"
    printf 'folder_uri=%s\n' "${folder_uri}"
    exit 0
fi

"${vscode_bin}" "${code_args[@]}"
