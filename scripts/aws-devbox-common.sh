#!/bin/sh

set -eu

setta_aws_devbox_bootstrap() {
    SETTA_AWS_DEVBOX_SCRIPT_DIR=$1
    SETTA_AWS_DEVBOX_REPO_ROOT=$(CDPATH= cd -- "${SETTA_AWS_DEVBOX_SCRIPT_DIR}/.." && pwd)
    export SETTA_AWS_DEVBOX_SCRIPT_DIR
    export SETTA_AWS_DEVBOX_REPO_ROOT

    DEFAULT_ENV_FILE="${SETTA_AWS_DEVBOX_REPO_ROOT}/infra/aws-devbox/aws-devbox.env"
    ENV_FILE="${SETTA_AWS_DEVBOX_ENV_FILE:-${DEFAULT_ENV_FILE}}"

    if [ -n "${SETTA_AWS_DEVBOX_ENV_FILE:-}" ] && [ ! -f "${ENV_FILE}" ]; then
        echo "Configured AWS devbox env file does not exist: ${ENV_FILE}" >&2
        exit 1
    fi

    if [ -f "${ENV_FILE}" ]; then
        set -a
        . "${ENV_FILE}"
        set +a
    fi

    . "${SETTA_AWS_DEVBOX_REPO_ROOT}/activate.sh"
    setta_aws_devbox_export_terraform_vars
    setta_aws_devbox_export_repo_git_context
}

setta_aws_devbox_export_terraform_vars() {
    if [ -n "${TF_VAR_ssh_authorized_keys:-}" ]; then
        return
    fi

    if [ -n "${SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY:-}" ]; then
        TF_VAR_ssh_authorized_keys=$(python - <<'PY'
import json
import os

key_text = os.environ["SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY"].strip().split()
if len(key_text) < 2:
    raise SystemExit("Configured SSH public key is malformed.")
print(json.dumps([" ".join(key_text[:2])]))
PY
)
        export TF_VAR_ssh_authorized_keys
        return
    fi

    if [ -z "${SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY_FILE:-}" ]; then
        return
    fi

    if [ ! -f "${SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY_FILE}" ]; then
        echo "Configured SSH public key file does not exist: ${SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY_FILE}" >&2
        exit 1
    fi

    TF_VAR_ssh_authorized_keys=$(python - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY_FILE"]).expanduser()
key_text = path.read_text(encoding="utf-8").strip().split()
if len(key_text) < 2:
    raise SystemExit(f"Configured SSH public key file is malformed: {path}")
print(json.dumps([" ".join(key_text[:2])]))
PY
)
    export TF_VAR_ssh_authorized_keys
}

setta_aws_devbox_resolve_repo_remote_url() {
    if [ -n "${SETTA_AWS_DEVBOX_REPO_REMOTE_URL:-}" ]; then
        printf '%s\n' "${SETTA_AWS_DEVBOX_REPO_REMOTE_URL}"
        return 0
    fi

    if ! command -v git >/dev/null 2>&1; then
        return 1
    fi

    if ! git -C "${SETTA_AWS_DEVBOX_REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        return 1
    fi

    repo_remote_url=$(git -C "${SETTA_AWS_DEVBOX_REPO_ROOT}" remote get-url origin 2>/dev/null || true)
    if [ -z "${repo_remote_url}" ]; then
        return 1
    fi

    printf '%s\n' "${repo_remote_url}"
}

setta_aws_devbox_resolve_repo_branch() {
    if [ -n "${SETTA_AWS_DEVBOX_REPO_BRANCH:-}" ]; then
        printf '%s\n' "${SETTA_AWS_DEVBOX_REPO_BRANCH}"
        return 0
    fi

    if ! command -v git >/dev/null 2>&1; then
        return 1
    fi

    if ! git -C "${SETTA_AWS_DEVBOX_REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        return 1
    fi

    repo_branch=$(git -C "${SETTA_AWS_DEVBOX_REPO_ROOT}" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
    if [ -z "${repo_branch}" ]; then
        return 1
    fi

    printf '%s\n' "${repo_branch}"
}

setta_aws_devbox_export_repo_git_context() {
    repo_remote_url=$(setta_aws_devbox_resolve_repo_remote_url || true)
    if [ -n "${repo_remote_url}" ]; then
        SETTA_AWS_DEVBOX_REPO_REMOTE_URL="${repo_remote_url}"
        export SETTA_AWS_DEVBOX_REPO_REMOTE_URL
    fi

    repo_branch=$(setta_aws_devbox_resolve_repo_branch || true)
    if [ -n "${repo_branch}" ]; then
        SETTA_AWS_DEVBOX_REPO_BRANCH="${repo_branch}"
        export SETTA_AWS_DEVBOX_REPO_BRANCH
    fi
}

setta_aws_devbox_browser_open_target() {
    browser_app_value="${1:-}"

    case "${browser_app_value}" in
        *.app)
            printf '%s\n' "${browser_app_value}"
            ;;
        *.app/Contents/MacOS/*)
            printf '%s\n' "${browser_app_value%/Contents/MacOS/*}"
            ;;
        *)
            printf '%s\n' ""
            ;;
    esac
}

setta_aws_devbox_browser_binary_path() {
    browser_app_value="${1:-}"

    case "${browser_app_value}" in
        "")
            printf '%s\n' ""
            return
            ;;
        */*)
            if [ -x "${browser_app_value}" ]; then
                printf '%s\n' "${browser_app_value}"
                return
            fi
            ;;
        *)
            resolved_browser_bin=$(command -v "${browser_app_value}" 2>/dev/null || true)
            if [ -n "${resolved_browser_bin}" ] && [ -x "${resolved_browser_bin}" ]; then
                printf '%s\n' "${resolved_browser_bin}"
                return
            fi
            ;;
    esac

    printf '%s\n' ""
}

setta_aws_devbox_open_browser_url() {
    target_url="${1:-}"
    browser_app_value="${2:-}"
    browser_profile_dir="${3:-}"

    if [ -z "${target_url}" ]; then
        echo "Warning: cannot launch browser without a target URL." >&2
        return 1
    fi

    mkdir -p "${browser_profile_dir}"

    browser_open_target="$(setta_aws_devbox_browser_open_target "${browser_app_value}")"
    if [ -z "${browser_open_target}" ]; then
        browser_open_target="${browser_app_value}"
    fi

    if command -v open >/dev/null 2>&1; then
        if [ -n "${browser_open_target}" ] && open -na "${browser_open_target}" --args \
            "--user-data-dir=${browser_profile_dir}" \
            --no-first-run \
            --no-default-browser-check \
            --new-window \
            "${target_url}" >/dev/null 2>&1; then
            return 0
        fi
    fi

    browser_binary_path="$(setta_aws_devbox_browser_binary_path "${browser_app_value}")"
    if [ -n "${browser_binary_path}" ]; then
        if "${browser_binary_path}" \
            "--user-data-dir=${browser_profile_dir}" \
            --no-first-run \
            --no-default-browser-check \
            --new-window \
            "${target_url}" >/dev/null 2>&1 & then
            return 0
        fi
    fi

    if command -v xdg-open >/dev/null 2>&1; then
        if xdg-open "${target_url}" >/dev/null 2>&1; then
            return 0
        fi
    fi

    if [ -n "${browser_app_value}" ]; then
        echo "Warning: could not launch browser app ${browser_app_value}. Open ${target_url} manually." >&2
    else
        echo "Warning: could not launch browser for ${target_url}. Open it manually." >&2
    fi
    return 1
}

setta_aws_devbox_open_browser_url_existing_instance() {
    target_url="${1:-}"
    browser_app_value="${2:-}"

    if [ -z "${target_url}" ]; then
        echo "Warning: cannot open browser tab without a target URL." >&2
        return 1
    fi

    browser_open_target="$(setta_aws_devbox_browser_open_target "${browser_app_value}")"
    if [ -z "${browser_open_target}" ]; then
        browser_open_target="${browser_app_value}"
    fi

    if command -v open >/dev/null 2>&1; then
        if [ -n "${browser_open_target}" ] && open -a "${browser_open_target}" "${target_url}" >/dev/null 2>&1; then
            return 0
        fi
    fi

    if command -v xdg-open >/dev/null 2>&1; then
        if xdg-open "${target_url}" >/dev/null 2>&1; then
            return 0
        fi
    fi

    if [ -n "${browser_app_value}" ]; then
        echo "Warning: could not open a browser tab in ${browser_app_value}. Open ${target_url} manually." >&2
    else
        echo "Warning: could not open a browser tab for ${target_url}. Open it manually." >&2
    fi
    return 1
}
