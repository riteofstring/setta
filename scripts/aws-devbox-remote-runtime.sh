#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $(basename "$0") <ai|aireset> [args...]" >&2
    exit 1
fi

lifecycle_mode="$1"
shift

case "${lifecycle_mode}" in
    ai|aireset) ;;
    *)
        echo "Unsupported remote runtime lifecycle: ${lifecycle_mode}" >&2
        exit 1
        ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "${SCRIPT_DIR}/aws-devbox-common.sh"
setta_aws_devbox_bootstrap "${SCRIPT_DIR}"

start_mode=${SETTA_AWS_DEVBOX_REMOTE_START_MODE:-working}
open_browser=${SETTA_AWS_DEVBOX_OPEN_BROWSER:-1}
sync_codex_auth=${SETTA_AWS_DEVBOX_SYNC_CODEX_AUTH:-1}
remote_browser_mode=${SETTA_AWS_DEVBOX_REMOTE_BROWSER_MODE:-headless}
worktree_selection_mode=local
requested_worktree_branch=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        local)
            worktree_selection_mode=local
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
        select)
            worktree_selection_mode=select
            shift
            ;;
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
        --browser-mode)
            if [ "$#" -lt 2 ]; then
                echo "Missing value for --browser-mode" >&2
                exit 1
            fi
            remote_browser_mode="$2"
            shift 2
            ;;
        --browser-mode=*)
            remote_browser_mode="${1#*=}"
            if [ -z "${remote_browser_mode}" ]; then
                echo "Missing value for --browser-mode" >&2
                exit 1
            fi
            shift
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

case "${remote_browser_mode}" in
    headed|headless) ;;
    *)
        echo "Invalid value for --browser-mode: ${remote_browser_mode}. Expected headed or headless." >&2
        exit 1
        ;;
esac

case "${SETTA_AWS_DEVBOX_TMUX_MOUSE:-off}" in
    on|off) ;;
    *)
        echo "Invalid value for SETTA_AWS_DEVBOX_TMUX_MOUSE: ${SETTA_AWS_DEVBOX_TMUX_MOUSE}. Expected on or off." >&2
        exit 1
        ;;
esac

case "${SETTA_AWS_DEVBOX_AUTO_STOP_LOCAL_BROWSER_MCP:-1}" in
    0|1) ;;
    *)
        echo "Invalid value for SETTA_AWS_DEVBOX_AUTO_STOP_LOCAL_BROWSER_MCP: ${SETTA_AWS_DEVBOX_AUTO_STOP_LOCAL_BROWSER_MCP}. Expected 0 or 1." >&2
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
remote_runtime_log_max_bytes=${SETTA_AWS_DEVBOX_REMOTE_RUNTIME_LOG_MAX_BYTES:-67108864}
remote_runtime_log_backup_count=${SETTA_AWS_DEVBOX_REMOTE_RUNTIME_LOG_BACKUP_COUNT:-2}
auto_stop_local_browser_mcp=${SETTA_AWS_DEVBOX_AUTO_STOP_LOCAL_BROWSER_MCP:-1}
managed_agent_pid=""
browser_watch_pid=""
worktree_name_override=""
remote_worktree_root_override=""
remote_worktree_mode=ensure_origin_branch
remote_main_reference_branch=${SETTA_AWS_DEVBOX_REMOTE_MAIN_REFERENCE_BRANCH:-main}
remote_main_reference_root_override=${SETTA_AWS_DEVBOX_REMOTE_MAIN_REFERENCE_ROOT:-}
remote_main_reference_wait_seconds=${SETTA_AWS_DEVBOX_REMOTE_MAIN_REFERENCE_WAIT_SECONDS:-30}
local_runtime_info_script_b64=""
local_runtime_log_tee_b64=""

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

ssh_login_args=(
    -F
    /dev/null
    -o "ProxyCommand=${proxy_command}"
    -o "StrictHostKeyChecking=accept-new"
    -o "UserKnownHostsFile=${known_hosts_file}"
    -o "ServerAliveInterval=30"
    -o "ServerAliveCountMax=3"
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

base64_encode_local_file() {
    local file_path="$1"

    if [ ! -f "${file_path}" ]; then
        echo "Missing local helper file: ${file_path}" >&2
        exit 1
    fi

    LOCAL_FILE_TO_ENCODE="${file_path}" python3 - <<'PY'
import base64
import os
from pathlib import Path

print(base64.b64encode(Path(os.environ["LOCAL_FILE_TO_ENCODE"]).read_bytes()).decode("ascii"), end="")
PY
}

resolve_local_browser_mcp_profile_dir() {
    local workspace_root="$1"
    local cdp_port_json=""

    cdp_port_json="$("${SCRIPT_DIR}/cdp-port.sh" --workspace "${workspace_root}" --json 2>/dev/null || true)"
    if [ -z "${cdp_port_json}" ]; then
        return 0
    fi

    printf '%s' "${cdp_port_json}" | jq -r '.profileDir // empty' 2>/dev/null || true
}

ensure_git_agent
sync_local_codex_auth
local_runtime_info_script_b64="$(base64_encode_local_file "${SCRIPT_DIR}/dev-runtime-info.sh")"
local_runtime_log_tee_b64="$(base64_encode_local_file "${SCRIPT_DIR}/runtime-log-tee.py")"

local_worktree_root="${SETTA_AWS_DEVBOX_REPO_ROOT}"
local_browser_mcp_profile_dir="$(resolve_local_browser_mcp_profile_dir "${local_worktree_root}")"
remote_checkout_parent=$(dirname "${remote_repo_root}")

sanitize_tmux_session_name() {
    raw_name="$1"
    sanitized_name=$(printf '%s' "${raw_name}" | tr -c 'A-Za-z0-9_-' '-')
    sanitized_name=${sanitized_name#-}
    sanitized_name=${sanitized_name%-}

    if [ -z "${sanitized_name}" ]; then
        sanitized_name="worktree"
    fi

    printf 'setta-%s\n' "${sanitized_name}"
}

repo_dir_name_from_remote_url() {
    raw_url="$1"
    repo_name="${raw_url##*/}"
    repo_name="${repo_name%.git}"
    printf '%s\n' "${repo_name}"
}

build_remote_worktree_catalog_command() {
    remote_script=$(cat <<'EOF'
set -euo pipefail

remote_repo_root="${SETTA_REMOTE_REPO_ROOT}"
remote_entrypoint_parent="${SETTA_REMOTE_ENTRYPOINT_PARENT}"

render_worktree_catalog() {
python3 - <<'PY'
import os
import subprocess

repo_root = os.environ["SETTA_REMOTE_REPO_ROOT"]
entries = []
current = {}

worktree_output = subprocess.run(
    ["git", "-C", repo_root, "worktree", "list", "--porcelain"],
    capture_output=True,
    text=True,
    check=False,
)
if worktree_output.returncode != 0:
    raise SystemExit(0)

for raw_line in worktree_output.stdout.splitlines():
    line = raw_line.rstrip("\n")
    if not line:
        if current:
            entries.append(current)
            current = {}
        continue

    key, _, value = line.partition(" ")
    if key == "worktree":
        current["path"] = value
    elif key == "branch":
        current["branch_ref"] = value
    elif key == "detached":
        current["detached"] = True

if current:
    entries.append(current)

for entry in entries:
    path = str(entry.get("path", ""))
    branch_ref = str(entry.get("branch_ref", ""))
    branch = branch_ref.removeprefix("refs/heads/") if branch_ref.startswith("refs/heads/") else branch_ref
    name = os.path.basename(path.rstrip("/")) or path
    is_primary = "1" if path == repo_root else "0"
    print(f"{path}\t{name}\t{branch}\t{is_primary}\tworktree")
PY
}

render_entrypoint_catalog() {
python3 - <<'PY'
import os
import subprocess

repo_root = os.environ["SETTA_REMOTE_REPO_ROOT"]
entrypoint_parent = os.environ["SETTA_REMOTE_ENTRYPOINT_PARENT"]


def has_runtime_entrypoint(path: str) -> bool:
    return os.path.isfile(os.path.join(path, "ai.sh")) and os.path.isfile(
        os.path.join(path, "scripts", "dev-runtime-info.sh")
    )


def git_branch(path: str) -> str:
    result = subprocess.run(
        ["git", "-C", path, "symbolic-ref", "--quiet", "--short", "HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def git_origin(path: str) -> str:
    result = subprocess.run(
        ["git", "-C", path, "remote", "get-url", "origin"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


if not os.path.isdir(entrypoint_parent):
    raise SystemExit(0)

repo_origin = git_origin(repo_root)

for name in sorted(os.listdir(entrypoint_parent)):
    path = os.path.join(entrypoint_parent, name)
    if not os.path.isdir(path):
        continue
    if not has_runtime_entrypoint(path):
        continue
    git_check = subprocess.run(
        ["git", "-C", path, "rev-parse", "--git-dir"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if git_check.returncode != 0:
        continue
    if repo_origin:
        candidate_origin = git_origin(path)
        if candidate_origin != repo_origin:
            continue
    is_primary = "1" if os.path.normpath(path) == os.path.normpath(repo_root) else "0"
    print(f"{path}\t{name}\t{git_branch(path)}\t{is_primary}\tentrypoint")
PY
}

if git -C "${remote_repo_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    worktree_catalog="$(render_worktree_catalog)"
else
    worktree_catalog=""
fi

entrypoint_catalog="$(render_entrypoint_catalog)"

WORKTREE_CATALOG="${worktree_catalog}" ENTRYPOINT_CATALOG="${entrypoint_catalog}" python3 - <<'PY'
import os

seen_paths = set()

for env_key in ("WORKTREE_CATALOG", "ENTRYPOINT_CATALOG"):
    catalog = os.environ.get(env_key, "")
    for raw_line in catalog.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        path = line.split("\t", 1)[0]
        if path in seen_paths:
            continue
        seen_paths.add(path)
        print(line)
PY
EOF
)

    printf "SETTA_REMOTE_REPO_ROOT=%q SETTA_REMOTE_ENTRYPOINT_PARENT=%q bash -lc %q" \
        "${remote_repo_root}" \
        "${remote_checkout_parent}" \
        "${remote_script}"
}

fetch_remote_worktree_catalog() {
    run_noninteractive_ssh "remote worktree catalog lookup" \
        "${ssh_login_args[@]}" \
        "${ssh_user}@${instance_id}" \
        "$(build_remote_worktree_catalog_command)"
}

prompt_for_remote_worktree() {
    catalog_output=$(fetch_remote_worktree_catalog)
    if [ -z "${catalog_output}" ]; then
        echo "No remote worktrees or repo entry points found on the devbox." >&2
        exit 1
    fi

    worktree_paths=()
    worktree_names=()
    worktree_branches=()
    worktree_primary_flags=()
    worktree_source_kinds=()
    catalog_has_worktrees=0
    catalog_has_entrypoints=0

    while IFS=$'\t' read -r path name branch is_primary source_kind; do
        [ -z "${path}" ] && continue
        worktree_paths+=("${path}")
        worktree_names+=("${name}")
        worktree_branches+=("${branch}")
        worktree_primary_flags+=("${is_primary}")
        worktree_source_kinds+=("${source_kind}")
        if [ "${source_kind}" = "entrypoint" ]; then
            catalog_has_entrypoints=1
        else
            catalog_has_worktrees=1
        fi
    done <<EOF
${catalog_output}
EOF

    if [ "${#worktree_paths[@]}" -eq 0 ]; then
        echo "No remote worktrees or repo entry points found on the devbox." >&2
        exit 1
    fi

    if [ "${catalog_has_worktrees}" -ne 1 ] && [ "${catalog_has_entrypoints}" -eq 1 ]; then
        echo "No remote worktrees found on the devbox; falling back to repo folders under ${remote_checkout_parent}." >&2
    fi

    selected_index="${SETTA_AWS_DEVBOX_SELECT_INDEX:-}"
    if [ -z "${selected_index}" ]; then
        if [ "${#worktree_paths[@]}" -eq 1 ]; then
            selected_index=1
        else
            if [ "${catalog_has_worktrees}" -eq 1 ] && [ "${catalog_has_entrypoints}" -ne 1 ]; then
                echo "Available remote worktrees:" >&2
            else
                echo "Available remote entry points:" >&2
            fi
            i=1
            while [ "${i}" -le "${#worktree_paths[@]}" ]; do
                array_index=$((i - 1))
                label="${worktree_names[${array_index}]}"
                if [ "${worktree_primary_flags[${array_index}]}" = "1" ]; then
                    label="${label} [primary]"
                fi
                if [ -n "${worktree_branches[${array_index}]}" ]; then
                    label="${label} (${worktree_branches[${array_index}]})"
                fi
                if [ "${worktree_source_kinds[${array_index}]}" = "entrypoint" ]; then
                    label="${label} [repo folder]"
                fi
                echo "  ${i}) ${label} -> ${worktree_paths[${array_index}]}" >&2
                i=$((i + 1))
            done

            while :; do
                printf 'Select remote worktree: ' >&2
                IFS= read -r selected_index
                case "${selected_index}" in
                    ''|*[!0-9]*)
                        echo "Enter a number from 1 to ${#worktree_paths[@]}." >&2
                        ;;
                    *)
                        if [ "${selected_index}" -lt 1 ] || [ "${selected_index}" -gt "${#worktree_paths[@]}" ]; then
                            echo "Enter a number from 1 to ${#worktree_paths[@]}." >&2
                        else
                            break
                        fi
                        ;;
                esac
            done
        fi
    fi

    case "${selected_index}" in
        ''|*[!0-9]*)
            echo "Invalid remote worktree selection index: ${selected_index}" >&2
            exit 1
            ;;
    esac

    if [ "${selected_index}" -lt 1 ] || [ "${selected_index}" -gt "${#worktree_paths[@]}" ]; then
        echo "Invalid remote worktree selection index: ${selected_index}" >&2
        exit 1
    fi

    array_index=$((selected_index - 1))
    printf '%s\t%s\t%s\n' \
        "${worktree_paths[${array_index}]}" \
        "${worktree_names[${array_index}]}" \
        "${worktree_branches[${array_index}]}"
}

if [ "${worktree_selection_mode}" = "worktree" ]; then
    repo_branch="${requested_worktree_branch}"
    worktree_name_override="setta.${requested_worktree_branch}"
    remote_worktree_root_override="${remote_checkout_parent}/${worktree_name_override}"
    remote_worktree_mode=create_or_reuse_branch_worktree
elif [ "${worktree_selection_mode}" = "select" ]; then
    selection_row=$(prompt_for_remote_worktree)
    IFS=$'\t' read -r selected_remote_worktree_root selected_worktree_name selected_worktree_branch <<EOF
${selection_row}
EOF
    remote_worktree_root_override="${selected_remote_worktree_root}"
    worktree_name_override="${selected_worktree_name}"
    if [ -n "${selected_worktree_branch}" ]; then
        repo_branch="${selected_worktree_branch}"
    fi
    remote_worktree_mode=reuse_existing_worktree
fi

if [ -n "${worktree_name_override}" ]; then
    local_worktree_name="${worktree_name_override}"
else
    local_worktree_name=$(basename "${local_worktree_root}")
fi

if [ -n "${SETTA_AWS_DEVBOX_REMOTE_WORKTREE_ROOT:-}" ]; then
    remote_worktree_root="${SETTA_AWS_DEVBOX_REMOTE_WORKTREE_ROOT}"
elif [ -n "${remote_worktree_root_override}" ]; then
    remote_worktree_root="${remote_worktree_root_override}"
else
    remote_worktree_root="${remote_checkout_parent}/${local_worktree_name}"
fi

if [ -z "${remote_main_reference_root_override}" ] && [ -n "${repo_remote_url}" ]; then
    remote_main_reference_root_override="${remote_checkout_parent}/$(repo_dir_name_from_remote_url "${repo_remote_url}")"
fi

remote_runtime_dir="${SETTA_AWS_DEVBOX_REMOTE_RUNTIME_DIR:-/home/ubuntu/.cache/setta-aws-devbox/${local_worktree_name}}"
remote_runtime_log="${remote_runtime_dir}/${lifecycle_mode}.log"

remote_session_name=$(sanitize_tmux_session_name "${local_worktree_name}")

resolve_remote_start_dir() {
    case "${start_mode}" in
        repo_root)
            printf '%s\n' "${remote_worktree_root}"
            return
            ;;
        working)
            local_pwd=$(pwd -P)
            if [ "${local_pwd}" = "${local_worktree_root}" ]; then
                printf '%s\n' "${remote_worktree_root}"
                return
            fi

            case "${local_pwd}" in
                "${local_worktree_root}"/*)
                    relative_path=${local_pwd#${local_worktree_root}/}
                    printf '%s/%s\n' "${remote_worktree_root}" "${relative_path}"
                    return
                    ;;
            esac

            printf '%s\n' "${remote_worktree_root}"
            return
            ;;
        *)
            echo "Unsupported remote start mode: ${start_mode}" >&2
            exit 1
            ;;
    esac
}

remote_start_dir=$(resolve_remote_start_dir)

build_remote_runtime_command() {
remote_script=$(cat <<'EOF'
set -euo pipefail

remote_repo_root="${SETTA_REMOTE_REPO_ROOT}"
remote_worktree_root="${SETTA_REMOTE_WORKTREE_ROOT}"
remote_repo_remote_url="${SETTA_REMOTE_REPO_REMOTE_URL}"
remote_repo_branch="${SETTA_REMOTE_REPO_BRANCH}"
remote_worktree_mode="${SETTA_REMOTE_WORKTREE_MODE}"
remote_session_name="${SETTA_REMOTE_SESSION_NAME}"
remote_start_dir="${SETTA_REMOTE_START_DIR}"
remote_runtime_log="${SETTA_REMOTE_RUNTIME_LOG}"
remote_browser_mode="${SETTA_REMOTE_BROWSER_MODE}"
lifecycle_mode="${SETTA_REMOTE_LIFECYCLE_MODE}"
remote_tmux_mouse="${SETTA_REMOTE_TMUX_MOUSE}"
remote_runtime_log_max_bytes="${SETTA_REMOTE_RUNTIME_LOG_MAX_BYTES}"
remote_runtime_log_backup_count="${SETTA_REMOTE_RUNTIME_LOG_BACKUP_COUNT}"
remote_runtime_info_script_b64="${SETTA_REMOTE_RUNTIME_INFO_SCRIPT_B64}"
remote_runtime_log_tee_b64="${SETTA_REMOTE_RUNTIME_LOG_TEE_B64}"
remote_main_reference_root="${SETTA_REMOTE_MAIN_REFERENCE_ROOT}"
remote_main_reference_branch="${SETTA_REMOTE_MAIN_REFERENCE_BRANCH}"
remote_main_reference_wait_seconds="${SETTA_REMOTE_MAIN_REFERENCE_WAIT_SECONDS}"

sanitize_tmux_session_name() {
    raw_name="$1"
    sanitized_name=$(printf '%s' "${raw_name}" | tr -c 'A-Za-z0-9_-' '-')
    sanitized_name=${sanitized_name#-}
    sanitized_name=${sanitized_name%-}

    if [ -z "${sanitized_name}" ]; then
        sanitized_name="worktree"
    fi

    printf 'setta-%s\n' "${sanitized_name}"
}

tmux_session_target() {
    printf '=%s\n' "$1"
}

tmux_window_target() {
    session_name="$1"
    window_name="$2"
    printf '=%s:%s\n' "${session_name}" "${window_name}"
}

staged_runtime_info_script_for_log() {
    log_path="$1"
    printf '%s/dev-runtime-info.sh\n' "$(dirname "${log_path}")"
}

staged_runtime_log_tee_script_for_log() {
    log_path="$1"
    printf '%s/runtime-log-tee.py\n' "$(dirname "${log_path}")"
}

stage_runtime_helper_file() {
    target_path="$1"
    helper_b64="$2"

    TARGET_PATH="${target_path}" HELPER_B64="${helper_b64}" python3 - <<'PY'
import base64
import os
from pathlib import Path

target_path = Path(os.environ["TARGET_PATH"])
target_path.parent.mkdir(parents=True, exist_ok=True)
target_path.write_bytes(base64.b64decode(os.environ["HELPER_B64"]))
target_path.chmod(0o755)
PY
}

stage_runtime_helpers_for_log() {
    log_path="$1"

    stage_runtime_helper_file \
        "$(staged_runtime_info_script_for_log "${log_path}")" \
        "${remote_runtime_info_script_b64}"
    stage_runtime_helper_file \
        "$(staged_runtime_log_tee_script_for_log "${log_path}")" \
        "${remote_runtime_log_tee_b64}"
}

ensure_origin_url() {
    repo_path="$1"
    if [ -z "${remote_repo_remote_url}" ]; then
        return
    fi

    current_remote_url="$(git -C "${repo_path}" remote get-url origin 2>/dev/null || true)"
    if [ -z "${current_remote_url}" ]; then
        git -C "${repo_path}" remote add origin "${remote_repo_remote_url}"
        return
    fi

    if [ "${current_remote_url}" != "${remote_repo_remote_url}" ]; then
        git -C "${repo_path}" remote set-url origin "${remote_repo_remote_url}"
    fi
}

ensure_base_repo() {
    SETTA_DEVBOX_REPO_CHECKOUT="${remote_repo_root}" \
    SETTA_DEVBOX_REPO_REMOTE_URL="${remote_repo_remote_url}" \
    SETTA_DEVBOX_REPO_BRANCH="${remote_repo_branch}" \
    /usr/local/bin/setta-devbox-prepare-repo
    ensure_origin_url "${remote_repo_root}"
}

git_branch_for_root() {
    repo_path="$1"
    git -C "${repo_path}" symbolic-ref --quiet --short HEAD 2>/dev/null || true
}

git_origin_for_root() {
    repo_path="$1"
    git -C "${repo_path}" remote get-url origin 2>/dev/null || true
}

has_runtime_entrypoint() {
    repo_path="$1"
    [ -f "${repo_path}/ai.sh" ] && [ -f "${repo_path}/scripts/dev-runtime-info.sh" ]
}

start_dir_for_workspace() {
    target_root="$1"

    if [ "${target_root}" = "${remote_worktree_root}" ]; then
        printf '%s\n' "${remote_start_dir}"
        return
    fi

    case "${remote_start_dir}" in
        "${remote_worktree_root}"/*)
            relative_path=${remote_start_dir#${remote_worktree_root}/}
            printf '%s/%s\n' "${target_root}" "${relative_path}"
            return
            ;;
        *)
            printf '%s\n' "${target_root}"
            return
            ;;
    esac
}

discover_existing_main_reference_root() {
    if [ -z "${remote_main_reference_branch}" ]; then
        return
    fi

    sibling_parent="$(dirname "${remote_repo_root}")"
    repo_origin="${remote_repo_remote_url}"
    if [ -z "${repo_origin}" ]; then
        repo_origin="$(git_origin_for_root "${remote_repo_root}")"
    fi

    for candidate_root in "${sibling_parent}"/*; do
        [ -d "${candidate_root}" ] || continue
        has_runtime_entrypoint "${candidate_root}" || continue
        if ! git -C "${candidate_root}" rev-parse --git-dir >/dev/null 2>&1; then
            continue
        fi
        if [ -n "${repo_origin}" ]; then
            candidate_origin="$(git_origin_for_root "${candidate_root}")"
            if [ "${candidate_origin}" != "${repo_origin}" ]; then
                continue
            fi
        fi
        candidate_branch="$(git_branch_for_root "${candidate_root}")"
        if [ "${candidate_branch}" = "${remote_main_reference_branch}" ]; then
            printf '%s\n' "${candidate_root}"
            return
        fi
    done
}

resolve_main_reference_root() {
    if [ -z "${remote_main_reference_branch}" ]; then
        return
    fi

    current_branch="$(git_branch_for_root "${remote_worktree_root}")"
    if [ "${current_branch}" = "${remote_main_reference_branch}" ]; then
        printf '%s\n' "${remote_worktree_root}"
        return
    fi

    existing_root="$(discover_existing_main_reference_root || true)"
    if [ -n "${existing_root}" ]; then
        printf '%s\n' "${existing_root}"
        return
    fi

    if [ -n "${remote_main_reference_root}" ]; then
        printf '%s\n' "${remote_main_reference_root}"
    fi
}

ensure_remote_worktree() {
    if [ "${remote_worktree_root}" = "${remote_repo_root}" ]; then
        ensure_base_repo
        return
    fi

    ensure_base_repo

    if [ -d "${remote_worktree_root}/.git" ] || [ -f "${remote_worktree_root}/.git" ]; then
        ensure_origin_url "${remote_worktree_root}"
        return
    fi

    if [ -z "${remote_repo_branch}" ]; then
        echo "Remote runtime requires a branch for worktree creation. Set SETTA_AWS_DEVBOX_REPO_BRANCH explicitly." >&2
        exit 1
    fi

    install -d "$(dirname "${remote_worktree_root}")"

    if git -C "${remote_repo_root}" show-ref --verify --quiet "refs/heads/${remote_repo_branch}"; then
        git -C "${remote_repo_root}" worktree add "${remote_worktree_root}" "${remote_repo_branch}"
        ensure_origin_url "${remote_worktree_root}"
        return
    fi

    if [ "${remote_worktree_mode}" = "create_or_reuse_branch_worktree" ]; then
        if [ -n "${remote_repo_remote_url}" ] && git -C "${remote_repo_root}" ls-remote --exit-code --heads origin "${remote_repo_branch}" >/dev/null 2>&1; then
            git -C "${remote_repo_root}" fetch origin "${remote_repo_branch}:${remote_repo_branch}"
            git -C "${remote_repo_root}" worktree add "${remote_worktree_root}" "${remote_repo_branch}"
        else
            git -C "${remote_repo_root}" worktree add -b "${remote_repo_branch}" "${remote_worktree_root}" HEAD
        fi
        ensure_origin_url "${remote_worktree_root}"
        return
    fi

    if [ -z "${remote_repo_remote_url}" ]; then
        echo "Remote branch ${remote_repo_branch} is missing and no repo remote URL is configured." >&2
        exit 1
    fi
    if ! git -C "${remote_repo_root}" ls-remote --exit-code --heads origin "${remote_repo_branch}" >/dev/null 2>&1; then
        echo "Remote branch not found on origin: ${remote_repo_branch}" >&2
        exit 1
    fi
    git -C "${remote_repo_root}" fetch origin "${remote_repo_branch}:${remote_repo_branch}"
    git -C "${remote_repo_root}" worktree add "${remote_worktree_root}" "${remote_repo_branch}"
    ensure_origin_url "${remote_worktree_root}"
}

ensure_main_reference_checkout() {
    target_root="$1"

    if [ -z "${remote_main_reference_branch}" ] || [ -z "${target_root}" ]; then
        return
    fi

    if [ "${target_root}" = "${remote_worktree_root}" ]; then
        return
    fi

    ensure_base_repo

    if [ -d "${target_root}/.git" ] || [ -f "${target_root}/.git" ]; then
        ensure_origin_url "${target_root}"
        existing_branch="$(git_branch_for_root "${target_root}")"
        if [ "${existing_branch}" = "${remote_main_reference_branch}" ]; then
            return
        fi
        echo "Existing remote main reference checkout at ${target_root} is on branch ${existing_branch:-detached}; expected ${remote_main_reference_branch}." >&2
        exit 1
    fi

    if [ -z "${remote_repo_remote_url}" ]; then
        echo "Remote main reference branch ${remote_main_reference_branch} is missing and no repo remote URL is configured." >&2
        exit 1
    fi
    if ! git -C "${remote_repo_root}" ls-remote --exit-code --heads origin "${remote_main_reference_branch}" >/dev/null 2>&1; then
        echo "Remote main reference branch not found on origin: ${remote_main_reference_branch}" >&2
        exit 1
    fi

    install -d "$(dirname "${target_root}")"

    if ! git -C "${remote_repo_root}" show-ref --verify --quiet "refs/heads/${remote_main_reference_branch}"; then
        git -C "${remote_repo_root}" fetch origin "${remote_main_reference_branch}:${remote_main_reference_branch}"
    fi
    git -C "${remote_repo_root}" worktree add "${target_root}" "${remote_main_reference_branch}"
    ensure_origin_url "${target_root}"
}

shell_window_command() {
    start_dir="$1"
    printf "bash -lc 'cd %q && exec bash'" "${start_dir}"
}

runtime_window_command() {
    workspace_root="$1"
    runtime_log="$2"
    browser_mode="$3"
    runtime_state_path="$4"
    runtime_log_tee_script="$(staged_runtime_log_tee_script_for_log "${runtime_log}")"
    install -d "$(dirname "${runtime_log}")"
    printf "bash -lc 'mkdir -p %q && rm -f %q && cd %q && export DEVTOOLS_OPEN_WITH_CHROME=0 && ./%s.sh --browser-mode %q 2>&1 | python3 %q --log-path %q --state-path %q --max-bytes %q --backups %q'" \
        "$(dirname "${runtime_log}")" \
        "${runtime_state_path}" \
        "${workspace_root}" \
        "${lifecycle_mode}" \
        "${browser_mode}" \
        "${runtime_log_tee_script}" \
        "${runtime_log}" \
        "${runtime_state_path}" \
        "${remote_runtime_log_max_bytes}" \
        "${remote_runtime_log_backup_count}"
}

runtime_info_is_ready() {
    info_json="$1"
    printf '%s' "${info_json}" | jq -e '
      (.frontendUrl // "") != "" and
      (.backendUrl // "") != "" and
      (.debugPort // 0) > 0 and
      (.debugPortSource // "") != "default"
    ' >/dev/null 2>&1
}

extract_runtime_value_from_log() {
    log_path="$1"
    pattern="$2"
    replacement="$3"

    if [ ! -f "${log_path}" ]; then
        return 1
    fi

    sed -nE "s/${pattern}/${replacement}/p" "${log_path}" | tail -n1
}

runtime_state_path_for_log() {
    log_path="$1"
    printf '%s.runtime.json\n' "${log_path}"
}

extract_runtime_value_from_state() {
    log_path="$1"
    jq_filter="$2"
    state_path="$(runtime_state_path_for_log "${log_path}")"

    if [ ! -f "${state_path}" ]; then
        return 1
    fi

    jq -r "${jq_filter}" "${state_path}" 2>/dev/null || true
}

extract_frontend_url_from_log() {
    log_path="$1"
    extract_runtime_value_from_log "${log_path}" '.*Local:[[:space:]]*(http:\/\/[^[:space:]]+).*$' '\1'
}

extract_backend_url_from_log() {
    log_path="$1"
    extract_runtime_value_from_log "${log_path}" '.*Ready:[[:space:]]*(http:\/\/[^[:space:]]+).*$' '\1'
}

extract_debug_port_from_log() {
    log_path="$1"
    extract_runtime_value_from_log "${log_path}" '.*Starting Chrome with remote debugging on port ([0-9]+).*$' '\1'
}

extract_frontend_url_from_runtime_sources() {
    log_path="$1"
    frontend_url="$(extract_runtime_value_from_state "${log_path}" '.frontendUrl // empty' | tail -n1)"
    if [ -n "${frontend_url}" ]; then
        printf '%s\n' "${frontend_url}"
        return 0
    fi
    extract_frontend_url_from_log "${log_path}"
}

extract_backend_url_from_runtime_sources() {
    log_path="$1"
    backend_url="$(extract_runtime_value_from_state "${log_path}" '.backendUrl // empty' | tail -n1)"
    if [ -n "${backend_url}" ]; then
        printf '%s\n' "${backend_url}"
        return 0
    fi
    extract_backend_url_from_log "${log_path}"
}

extract_debug_port_from_runtime_sources() {
    log_path="$1"
    debug_port="$(extract_runtime_value_from_state "${log_path}" 'if (.debugPort // 0) > 0 then (.debugPort | tostring) else "" end' | tail -n1)"
    if [ -n "${debug_port}" ]; then
        printf '%s\n' "${debug_port}"
        return 0
    fi
    extract_debug_port_from_log "${log_path}"
}

runtime_info_from_log_fallback() {
    workspace_root="$1"
    runtime_log="$2"

    frontend_url="$(extract_frontend_url_from_runtime_sources "${runtime_log}" 2>/dev/null || true)"
    backend_url="$(extract_backend_url_from_runtime_sources "${runtime_log}" 2>/dev/null || true)"
    debug_port="$(extract_debug_port_from_runtime_sources "${runtime_log}" 2>/dev/null || true)"

    if [ -z "${frontend_url}" ] || [ -z "${backend_url}" ] || [ -z "${debug_port}" ]; then
        return 1
    fi

    jq -n \
        --arg workspace_root "${workspace_root}" \
        --arg frontend_url "${frontend_url}" \
        --arg backend_url "${backend_url}" \
        --arg runtime_log_path "${runtime_log}" \
        --arg debug_port "${debug_port}" \
        '{
          workspaceRoot: $workspace_root,
          connectInfoAvailable: false,
          frontendUrl: $frontend_url,
          frontendUrlSource: "runtime_log_latest",
          backendUrl: $backend_url,
          backendUrlSource: "runtime_log",
          bootstrapUrl: null,
          runtimeLogPath: $runtime_log_path,
          session: {},
          runtimeRoot: null,
          settaFilesRoot: null,
          settaHome: null,
          debugPort: ($debug_port | tonumber),
          debugPortSource: "runtime_log",
          debugPortPid: null,
          profileDir: null,
          mcpRunDir: null,
          runtimeMetadataPath: null
        }'
}

read_runtime_info() {
    runtime_info_script="$1"
    workspace_root="$2"
    runtime_log="$3"
    allow_missing_connect_info="${4:-0}"

    info_json="$("${runtime_info_script}" --workspace "${workspace_root}" --runtime-log "${runtime_log}" 2>/dev/null || true)"
    if [ -n "${info_json}" ]; then
        printf '%s\n' "${info_json}"
        return 0
    fi

    if [ "${allow_missing_connect_info}" = "1" ]; then
        runtime_info_from_log_fallback "${workspace_root}" "${runtime_log}" && return 0
    fi

    return 1
}

log_runtime_progress() {
    info_json="$1"
    attempts_left="$2"
    runtime_label="$3"

    if [ -z "${info_json}" ]; then
        echo "Remote ${runtime_label} ${lifecycle_mode} runtime still starting: waiting for runtime metadata (${attempts_left}s left)." >&2
        return
    fi

    frontend_url="$(printf '%s' "${info_json}" | jq -r '.frontendUrl // empty' 2>/dev/null || true)"
    backend_url="$(printf '%s' "${info_json}" | jq -r '.backendUrl // empty' 2>/dev/null || true)"
    debug_port="$(printf '%s' "${info_json}" | jq -r 'if (.debugPort // 0) > 0 then (.debugPort | tostring) else "" end' 2>/dev/null || true)"

    if [ -z "${frontend_url}" ]; then
        frontend_url="pending"
    fi
    if [ -z "${backend_url}" ]; then
        backend_url="pending"
    fi
    if [ -z "${debug_port}" ]; then
        debug_port="pending"
    fi

    echo "Remote ${runtime_label} ${lifecycle_mode} runtime still starting: frontend ${frontend_url}, backend ${backend_url}, cdp ${debug_port} (${attempts_left}s left)." >&2
}

ensure_tmux_session() {
    session_name="$1"
    shell_start_dir="$2"
    workspace_root="$3"
    runtime_log="$4"
    runtime_info_script="$5"
    browser_mode="$6"
    allow_missing_connect_info="${7:-0}"
    runtime_state_path="$(runtime_state_path_for_log "${runtime_log}")"
    session_target="$(tmux_session_target "${session_name}")"
    shell_target="$(tmux_window_target "${session_name}" shell)"
    ai_target="$(tmux_window_target "${session_name}" ai)"

    tmux start-server >/dev/null 2>&1 || true
    tmux source-file "$HOME/.tmux.conf" >/dev/null 2>&1 || true

    if ! tmux has-session -t "${session_target}" 2>/dev/null; then
        tmux new-session -d -s "${session_name}" -n shell "$(shell_window_command "${shell_start_dir}")"
    fi

    tmux set-option -g mouse "${remote_tmux_mouse}" >/dev/null 2>&1 || true
    tmux set-option -t "${session_target}" allow-rename off >/dev/null 2>&1 || true
    if [ -n "${SSH_AUTH_SOCK:-}" ]; then
        tmux set-environment -t "${session_target}" SSH_AUTH_SOCK "${SSH_AUTH_SOCK}" >/dev/null 2>&1 || true
    else
        tmux set-environment -t "${session_target}" -r SSH_AUTH_SOCK >/dev/null 2>&1 || true
    fi

    if ! tmux list-windows -t "${session_target}" -F '#{window_name}' 2>/dev/null | grep -Fxq shell; then
        tmux new-window -d -t "${session_target}" -n shell "$(shell_window_command "${shell_start_dir}")"
    else
        tmux respawn-window -k -t "${shell_target}" "$(shell_window_command "${shell_start_dir}")"
    fi

    current_runtime_info="$(read_runtime_info "${runtime_info_script}" "${workspace_root}" "${runtime_log}" "${allow_missing_connect_info}" 2>/dev/null || true)"
    if [ "${lifecycle_mode}" = "aireset" ] || ! runtime_info_is_ready "${current_runtime_info}"; then
        if tmux list-windows -t "${session_target}" -F '#{window_name}' 2>/dev/null | grep -Fxq ai; then
            tmux respawn-window -k -t "${ai_target}" "$(runtime_window_command "${workspace_root}" "${runtime_log}" "${browser_mode}" "${runtime_state_path}")"
        else
            tmux new-window -d -t "${session_target}" -n ai "$(runtime_window_command "${workspace_root}" "${runtime_log}" "${browser_mode}" "${runtime_state_path}")"
        fi
    fi
}

emit_runtime_info() {
    runtime_info_script="$1"
    workspace_root="$2"
    runtime_log="$3"
    runtime_label="$4"
    timeout_seconds="$5"
    allow_timeout="${6:-0}"
    allow_missing_connect_info="${7:-0}"

    deadline_epoch=$(( $(date +%s) + timeout_seconds ))
    progress_interval=5
    last_progress_bucket=""
    while true; do
        info_json="$(read_runtime_info "${runtime_info_script}" "${workspace_root}" "${runtime_log}" "${allow_missing_connect_info}" 2>/dev/null || true)"
        if [ -n "${info_json}" ] && runtime_info_is_ready "${info_json}"; then
            printf '%s\n' "${info_json}"
            return
        fi
        now_epoch=$(date +%s)
        remaining_seconds=$((deadline_epoch - now_epoch))
        if [ "${remaining_seconds}" -le 0 ]; then
            break
        fi
        progress_bucket=$(( ((remaining_seconds + progress_interval - 1) / progress_interval) * progress_interval ))
        if [ "${progress_bucket}" != "${last_progress_bucket}" ]; then
            log_runtime_progress "${info_json}" "${progress_bucket}" "${runtime_label}"
            last_progress_bucket="${progress_bucket}"
        fi
        sleep 1
    done

    if [ "${allow_timeout}" = "1" ]; then
        return 1
    fi

    echo "Timed out waiting for remote ${runtime_label} ${lifecycle_mode} runtime in ${workspace_root}." >&2
    exit 1
}

ensure_remote_worktree
stage_runtime_helpers_for_log "${remote_runtime_log}"
remote_runtime_info_script="$(staged_runtime_info_script_for_log "${remote_runtime_log}")"
main_reference_root="$(resolve_main_reference_root || true)"
main_reference_info_json=""

ensure_tmux_session \
    "${remote_session_name}" \
    "${remote_start_dir}" \
    "${remote_worktree_root}" \
    "${remote_runtime_log}" \
    "${remote_runtime_info_script}" \
    "${remote_browser_mode}" \
    "1"
selected_runtime_info_json="$(emit_runtime_info "${remote_runtime_info_script}" "${remote_worktree_root}" "${remote_runtime_log}" "worktree" "180" "0" "1")"

if [ -n "${main_reference_root}" ] && [ "${main_reference_root}" != "${remote_worktree_root}" ]; then
    ensure_main_reference_checkout "${main_reference_root}"
    main_reference_runtime_log="/home/ubuntu/.cache/setta-aws-devbox/$(basename "${main_reference_root}")/${lifecycle_mode}.log"
    stage_runtime_helpers_for_log "${main_reference_runtime_log}"
    main_reference_runtime_info_script="$(staged_runtime_info_script_for_log "${main_reference_runtime_log}")"
    main_reference_session_name="$(sanitize_tmux_session_name "$(basename "${main_reference_root}")")"
    main_reference_start_dir="$(start_dir_for_workspace "${main_reference_root}")"

    ensure_tmux_session \
        "${main_reference_session_name}" \
        "${main_reference_start_dir}" \
        "${main_reference_root}" \
        "${main_reference_runtime_log}" \
        "${main_reference_runtime_info_script}" \
        "${remote_browser_mode}" \
        "0"
    if ! main_reference_info_json="$(emit_runtime_info "${main_reference_runtime_info_script}" "${main_reference_root}" "${main_reference_runtime_log}" "main reference" "${remote_main_reference_wait_seconds}" "1")"; then
        main_reference_info_json=""
        echo "Remote main reference ${lifecycle_mode} runtime is still bootstrapping in ${main_reference_root}; continuing without main reference port forwards for now." >&2
        echo "Remote main reference runtime log: ${main_reference_runtime_log}" >&2
        echo "Remote main reference tmux session: ${main_reference_session_name}" >&2
    fi
fi

if [ -n "${main_reference_info_json}" ]; then
    jq -n \
        --argjson selected "${selected_runtime_info_json}" \
        --argjson main_reference "${main_reference_info_json}" \
        '$selected + {mainReference: $main_reference}'
else
    printf '%s\n' "${selected_runtime_info_json}"
fi
EOF
)

    printf "SETTA_REMOTE_REPO_ROOT=%q SETTA_REMOTE_WORKTREE_ROOT=%q SETTA_REMOTE_REPO_REMOTE_URL=%q SETTA_REMOTE_REPO_BRANCH=%q SETTA_REMOTE_WORKTREE_MODE=%q SETTA_REMOTE_SESSION_NAME=%q SETTA_REMOTE_START_DIR=%q SETTA_REMOTE_RUNTIME_LOG=%q SETTA_REMOTE_BROWSER_MODE=%q SETTA_REMOTE_LIFECYCLE_MODE=%q SETTA_REMOTE_TMUX_MOUSE=%q SETTA_REMOTE_RUNTIME_LOG_MAX_BYTES=%q SETTA_REMOTE_RUNTIME_LOG_BACKUP_COUNT=%q SETTA_REMOTE_RUNTIME_INFO_SCRIPT_B64=%q SETTA_REMOTE_RUNTIME_LOG_TEE_B64=%q SETTA_REMOTE_MAIN_REFERENCE_ROOT=%q SETTA_REMOTE_MAIN_REFERENCE_BRANCH=%q SETTA_REMOTE_MAIN_REFERENCE_WAIT_SECONDS=%q bash -lc %q" \
        "${remote_repo_root}" \
        "${remote_worktree_root}" \
        "${repo_remote_url}" \
        "${repo_branch}" \
        "${remote_worktree_mode}" \
        "${remote_session_name}" \
        "${remote_start_dir}" \
        "${remote_runtime_log}" \
        "${remote_browser_mode}" \
        "${lifecycle_mode}" \
        "${remote_tmux_mouse}" \
        "${remote_runtime_log_max_bytes}" \
        "${remote_runtime_log_backup_count}" \
        "${local_runtime_info_script_b64}" \
        "${local_runtime_log_tee_b64}" \
        "${remote_main_reference_root_override}" \
        "${remote_main_reference_branch}" \
        "${remote_main_reference_wait_seconds}" \
        "${remote_script}"
}

remote_runtime_command=$(build_remote_runtime_command)

echo "Preparing remote ${lifecycle_mode} runtime for ${remote_worktree_root}..." >&2
runtime_info_json=$(
    run_noninteractive_ssh "remote ${lifecycle_mode} runtime bootstrap" \
        "${ssh_login_args[@]}" \
        "${ssh_user}@${instance_id}" \
        "${remote_runtime_command}"
)

extract_port_from_url() {
    URL_TO_PARSE="$1" python - <<'PY'
import os
from urllib.parse import urlparse

url = os.environ["URL_TO_PARSE"]
parsed = urlparse(url)
if parsed.port is not None:
    print(parsed.port)
elif parsed.scheme == "https":
    print(443)
else:
    print(80)
PY
}

rewrite_url_for_local_forward() {
    URL_TO_REWRITE="$1" LOCAL_PORT="$2" python - <<'PY'
import os
from urllib.parse import urlparse, urlunparse

raw_url = os.environ["URL_TO_REWRITE"]
local_port = os.environ["LOCAL_PORT"]
parsed = urlparse(raw_url)
rewritten = parsed._replace(scheme="http", netloc=f"127.0.0.1:{local_port}")
print(urlunparse(rewritten))
PY
}

remote_frontend_url=$(printf '%s' "${runtime_info_json}" | jq -r '.frontendUrl')
remote_backend_url=$(printf '%s' "${runtime_info_json}" | jq -r '.backendUrl')
remote_debug_port=$(printf '%s' "${runtime_info_json}" | jq -r '.debugPort')
remote_main_frontend_url=$(printf '%s' "${runtime_info_json}" | jq -r '.mainReference.frontendUrl // empty')
remote_main_backend_url=$(printf '%s' "${runtime_info_json}" | jq -r '.mainReference.backendUrl // empty')
remote_main_debug_port=$(printf '%s' "${runtime_info_json}" | jq -r 'if (.mainReference.debugPort // 0) > 0 then (.mainReference.debugPort | tostring) else "" end')
remote_main_workspace_root=$(printf '%s' "${runtime_info_json}" | jq -r '.mainReference.workspaceRoot // empty')

if [ -z "${remote_frontend_url}" ] || [ "${remote_frontend_url}" = "null" ]; then
    echo "Remote runtime info did not include a frontend URL." >&2
    exit 1
fi

if [ -z "${remote_backend_url}" ] || [ "${remote_backend_url}" = "null" ]; then
    echo "Remote runtime info did not include a backend URL." >&2
    exit 1
fi

if [ -z "${remote_debug_port}" ] || [ "${remote_debug_port}" = "null" ]; then
    echo "Remote runtime info did not include a debug port." >&2
    exit 1
fi

remote_frontend_port=$(extract_port_from_url "${remote_frontend_url}")
remote_backend_port=$(extract_port_from_url "${remote_backend_url}")
local_frontend_port=${SETTA_AWS_DEVBOX_LOCAL_FRONTEND_PORT:-${remote_frontend_port}}
local_backend_port=${SETTA_AWS_DEVBOX_LOCAL_SETTA_PORT:-${remote_backend_port}}
local_cdp_port=${SETTA_AWS_DEVBOX_LOCAL_CDP_PORT:-${remote_debug_port}}
remote_main_frontend_port=""
remote_main_backend_port=""
local_main_frontend_port=""
local_main_backend_port=""
local_main_cdp_port=""
local_main_frontend_url=""
remote_main_reference_session_name=""

if [ -n "${remote_main_frontend_url}" ] && [ -n "${remote_main_backend_url}" ] && [ -n "${remote_main_debug_port}" ]; then
    remote_main_frontend_port=$(extract_port_from_url "${remote_main_frontend_url}")
    remote_main_backend_port=$(extract_port_from_url "${remote_main_backend_url}")
    local_main_frontend_port=${SETTA_AWS_DEVBOX_LOCAL_MAIN_FRONTEND_PORT:-${remote_main_frontend_port}}
    local_main_backend_port=${SETTA_AWS_DEVBOX_LOCAL_MAIN_SETTA_PORT:-${remote_main_backend_port}}
    local_main_cdp_port=${SETTA_AWS_DEVBOX_LOCAL_MAIN_CDP_PORT:-${remote_main_debug_port}}
fi

echo "Remote ${lifecycle_mode} runtime ready: frontend ${remote_frontend_url}, backend ${remote_backend_url}, cdp ${remote_debug_port}." >&2

if [ "${local_backend_port}" != "${remote_backend_port}" ]; then
    echo "Remote frontend expects backend port ${remote_backend_port}; local backend port override ${local_backend_port} is unsupported for remote ai/aireset." >&2
    exit 1
fi

local_frontend_url=$(rewrite_url_for_local_forward "${remote_frontend_url}" "${local_frontend_port}")

if [ -n "${remote_main_frontend_port}" ] && [ "${local_main_backend_port}" != "${remote_main_backend_port}" ]; then
    echo "Remote main reference frontend expects backend port ${remote_main_backend_port}; local backend port override ${local_main_backend_port} is unsupported for remote ai/aireset." >&2
    exit 1
fi

if [ -n "${remote_main_frontend_port}" ]; then
    local_main_frontend_url=$(rewrite_url_for_local_forward "${remote_main_frontend_url}" "${local_main_frontend_port}")
    echo "Remote main reference ${lifecycle_mode} runtime ready: frontend ${remote_main_frontend_url}, backend ${remote_main_backend_url}, cdp ${remote_main_debug_port}." >&2
    echo "Forwarded main reference frontend URL: ${local_main_frontend_url}" >&2
fi

echo "Remote selected tmux session: ${remote_session_name}" >&2
if [ -n "${remote_main_workspace_root}" ] && [ "${remote_main_workspace_root}" != "${remote_worktree_root}" ]; then
    remote_main_reference_session_name="$(sanitize_tmux_session_name "$(basename "${remote_main_workspace_root}")")"
    echo "Remote main reference tmux session: ${remote_main_reference_session_name}" >&2
fi

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

restart_local_browser_profile_instance() {
    if ! command -v pgrep >/dev/null 2>&1 || ! command -v pkill >/dev/null 2>&1; then
        return 0
    fi

    browser_pattern="$(browser_profile_match_pattern)"
    if [ -z "${browser_pattern}" ]; then
        return 0
    fi

    if ! pgrep -f -- "${browser_pattern}" >/dev/null 2>&1; then
        return 0
    fi

    echo "Closing existing local browser instance for ${browser_profile_dir} before reopening..." >&2
    pkill -f -- "${browser_pattern}" >/dev/null 2>&1 || true

    attempts=0
    while pgrep -f -- "${browser_pattern}" >/dev/null 2>&1; do
        if [ "${attempts}" -ge 50 ]; then
            pkill -9 -f -- "${browser_pattern}" >/dev/null 2>&1 || true
            break
        fi

        sleep 0.1
        attempts=$((attempts + 1))
    done
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

managed_local_browser_mcp_listener_matches_port() {
    local_port="$1"
    process_command="$2"
    process_tty="$3"

    if [ "${auto_stop_local_browser_mcp}" != "1" ] || [ -z "${local_browser_mcp_profile_dir}" ]; then
        return 1
    fi

    case "${process_command}" in
        *"--remote-debugging-port=${local_port}"*|*"--remote-debugging-port ${local_port}"*) ;;
        *)
            return 1
            ;;
    esac

    case "${process_command}" in
        *"--user-data-dir=${local_browser_mcp_profile_dir}"*) ;;
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

managed_wrapper_attach_listener_matches_port() {
    local_port="$1"
    remote_port="$2"
    expected_session_name="$3"
    process_command="$4"

    if [ -z "${expected_session_name}" ]; then
        return 1
    fi

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

    case "${process_command}" in
        *"SETTA_REMOTE_SESSION_NAME=${expected_session_name}"*|*"remote_session_name=${expected_session_name}"*) ;;
        *)
            return 1
            ;;
    esac

    case "${process_command}" in
        *"tmux attach-session"*) ;;
        *)
            return 1
            ;;
    esac

    return 0
}

stop_managed_wrapper_attach_listener() {
    process_pid="$1"
    local_port="$2"
    expected_session_name="$3"

    echo "Closing existing local remote attach process ${process_pid} for session ${expected_session_name} on port ${local_port} before reopening..." >&2
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

stop_managed_local_browser_mcp_listener() {
    process_pid="$1"
    local_port="$2"

    echo "Closing local browser MCP process ${process_pid} on port ${local_port} before reopening the remote CDP tunnel..." >&2
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
    expected_session_name="${5:-}"

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

            if managed_local_browser_mcp_listener_matches_port "${local_port}" "${listener_command}" "${listener_tty}"; then
                stop_managed_local_browser_mcp_listener "${listener_pid}" "${local_port}"
                closed_stale_listener=1
                break
            fi

            if managed_wrapper_attach_listener_matches_port "${local_port}" "${remote_port}" "${expected_session_name}" "${listener_command}"; then
                stop_managed_wrapper_attach_listener "${listener_pid}" "${local_port}" "${expected_session_name}"
                closed_stale_listener=1
                break
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
    target_url="$1"

    if command -v open >/dev/null 2>&1; then
        mkdir -p "${browser_profile_dir}"
        restart_local_browser_profile_instance
        open -na "${browser_app}" --args \
            "--user-data-dir=${browser_profile_dir}" \
            --new-window \
            "${target_url}"
        return 0
    fi

    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "${target_url}" >/dev/null 2>&1
        return 0
    fi

    echo "Warning: could not find a browser opener for ${target_url}" >&2
    return 1
}

start_local_browser_watch() {
    target_url="$1"

    if ! browser_opener_available; then
        echo "Warning: could not find a browser opener for ${target_url}" >&2
        return 1
    fi

    initially_ready=0
    if local_url_is_ready "${target_url}"; then
        open_local_browser "${target_url}" || true
        initially_ready=1
    fi

    (
        previously_ready="${initially_ready}"
        while true; do
            if local_url_is_ready "${target_url}"; then
                if [ "${previously_ready}" = "0" ] || ! browser_profile_instance_running; then
                    open_local_browser "${target_url}" || true
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

build_remote_attach_command() {
remote_script=$(cat <<'EOF'
set -euo pipefail

remote_session_name="${SETTA_REMOTE_SESSION_NAME}"
remote_start_dir="${SETTA_REMOTE_START_DIR}"
remote_tmux_mouse="${SETTA_REMOTE_TMUX_MOUSE}"

shell_window_command() {
    printf "bash -lc 'cd %q && exec bash'" "${remote_start_dir}"
}

remote_session_target="=${remote_session_name}"
remote_shell_target="=${remote_session_name}:shell"

if ! tmux has-session -t "${remote_session_target}" 2>/dev/null; then
    echo "Remote tmux session not found: ${remote_session_name}" >&2
    exit 1
fi

tmux start-server >/dev/null 2>&1 || true
tmux source-file "$HOME/.tmux.conf" >/dev/null 2>&1 || true
tmux set-option -g mouse "${remote_tmux_mouse}" >/dev/null 2>&1 || true
tmux set-option -t "${remote_session_target}" allow-rename off >/dev/null 2>&1 || true
if [ -n "${SSH_AUTH_SOCK:-}" ]; then
    tmux set-environment -t "${remote_session_target}" SSH_AUTH_SOCK "${SSH_AUTH_SOCK}" >/dev/null 2>&1 || true
else
    tmux set-environment -t "${remote_session_target}" -r SSH_AUTH_SOCK >/dev/null 2>&1 || true
fi

if tmux list-windows -t "${remote_session_target}" -F '#{window_name}' 2>/dev/null | grep -Fxq shell; then
    tmux respawn-window -k -t "${remote_shell_target}" "$(shell_window_command)"
else
    tmux new-window -d -t "${remote_session_target}" -n shell "$(shell_window_command)"
fi

tmux select-window -t "${remote_shell_target}" >/dev/null 2>&1 || true
exec tmux attach-session -t "${remote_session_target}"
EOF
)

    printf "SETTA_REMOTE_SESSION_NAME=%q SETTA_REMOTE_START_DIR=%q SETTA_REMOTE_TMUX_MOUSE=%q bash -lc %q" \
        "${remote_session_name}" \
        "${remote_start_dir}" \
        "${remote_tmux_mouse}" \
        "${remote_script}"
}

remote_attach_command=$(build_remote_attach_command)

ssh_attach_args=(
    -A
    -tt
    -o "LogLevel=QUIET"
    "${ssh_login_args[@]}"
    -L "${local_frontend_port}:127.0.0.1:${remote_frontend_port}"
    -L "${local_backend_port}:127.0.0.1:${remote_backend_port}"
    -L "${local_cdp_port}:127.0.0.1:${remote_debug_port}"
    "${ssh_user}@${instance_id}"
    "${remote_attach_command}"
)

if [ -n "${remote_main_frontend_port}" ] && [ -n "${remote_main_workspace_root}" ] && [ "${remote_main_workspace_root}" != "${remote_worktree_root}" ] && [ "${local_main_frontend_port}" = "${local_frontend_port}" ]; then
    echo "Remote main reference frontend local port ${local_main_frontend_port} conflicts with the selected runtime local frontend port. Set SETTA_AWS_DEVBOX_LOCAL_MAIN_FRONTEND_PORT to a different value." >&2
    exit 1
fi
if [ -n "${remote_main_backend_port}" ] && [ -n "${remote_main_workspace_root}" ] && [ "${remote_main_workspace_root}" != "${remote_worktree_root}" ] && [ "${local_main_backend_port}" = "${local_backend_port}" ]; then
    echo "Remote main reference backend local port ${local_main_backend_port} conflicts with the selected runtime local backend port. Set SETTA_AWS_DEVBOX_LOCAL_MAIN_SETTA_PORT to a different value." >&2
    exit 1
fi
if [ -n "${remote_main_debug_port}" ] && [ -n "${remote_main_workspace_root}" ] && [ "${remote_main_workspace_root}" != "${remote_worktree_root}" ] && [ "${local_main_cdp_port}" = "${local_cdp_port}" ]; then
    echo "Remote main reference CDP local port ${local_main_cdp_port} conflicts with the selected runtime local CDP port. Set SETTA_AWS_DEVBOX_LOCAL_MAIN_CDP_PORT to a different value." >&2
    exit 1
fi

if [ -n "${remote_main_frontend_port}" ] && [ "${local_main_frontend_port}" != "${local_frontend_port}" ]; then
    ssh_attach_args=(
        "${ssh_attach_args[@]:0:${#ssh_attach_args[@]}-2}"
        -L "${local_main_frontend_port}:127.0.0.1:${remote_main_frontend_port}"
        -L "${local_main_backend_port}:127.0.0.1:${remote_main_backend_port}"
        -L "${local_main_cdp_port}:127.0.0.1:${remote_main_debug_port}"
        "${ssh_user}@${instance_id}"
        "${remote_attach_command}"
    )
elif [ -n "${remote_main_frontend_port}" ] && [ -n "${remote_main_workspace_root}" ] && [ "${remote_main_workspace_root}" != "${remote_worktree_root}" ]; then
    echo "Main reference runtime is using the same forwarded ports as the selected runtime; skipping duplicate local tunnel setup." >&2
fi

if ! ensure_local_forward_port_available "${local_frontend_port}" "${remote_frontend_port}" "selected runtime frontend tunnel" "SETTA_AWS_DEVBOX_LOCAL_FRONTEND_PORT" "${remote_session_name}"; then
    exit 1
fi
if ! ensure_local_forward_port_available "${local_backend_port}" "${remote_backend_port}" "selected runtime backend tunnel" "" "${remote_session_name}"; then
    exit 1
fi
if ! ensure_local_forward_port_available "${local_cdp_port}" "${remote_debug_port}" "selected runtime CDP tunnel" "SETTA_AWS_DEVBOX_LOCAL_CDP_PORT" "${remote_session_name}"; then
    exit 1
fi

if [ -n "${remote_main_frontend_port}" ] && [ -n "${remote_main_workspace_root}" ] && [ "${remote_main_workspace_root}" != "${remote_worktree_root}" ]; then
    if ! ensure_local_forward_port_available "${local_main_frontend_port}" "${remote_main_frontend_port}" "main reference frontend tunnel" "SETTA_AWS_DEVBOX_LOCAL_MAIN_FRONTEND_PORT" "${remote_main_reference_session_name}"; then
        exit 1
    fi
    if ! ensure_local_forward_port_available "${local_main_backend_port}" "${remote_main_backend_port}" "main reference backend tunnel" "" "${remote_main_reference_session_name}"; then
        exit 1
    fi
    if ! ensure_local_forward_port_available "${local_main_cdp_port}" "${remote_main_debug_port}" "main reference CDP tunnel" "SETTA_AWS_DEVBOX_LOCAL_MAIN_CDP_PORT" "${remote_main_reference_session_name}"; then
        exit 1
    fi
fi

if [ "${open_browser}" = "1" ]; then
    echo "Watching local browser at ${local_frontend_url} and reopening the dedicated profile on tunnel recovery..." >&2
    start_local_browser_watch "${local_frontend_url}" || true
fi

echo "Opening remote ${lifecycle_mode} session..." >&2
if ! ensure_ssm_transport_ready "remote ${lifecycle_mode} session attach"; then
    exit 1
fi
TERM="${ssh_term}" ssh "${ssh_attach_args[@]}"
