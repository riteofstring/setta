build_remote_worktree_catalog_command() {
    remote_script=$(cat <<'EOF'
set -euo pipefail

remote_repo_root="${SETTA_REMOTE_REPO_ROOT}"
remote_entrypoint_parent="${SETTA_REMOTE_ENTRYPOINT_PARENT}"

render_worktree_catalog() {
python3 - <<'PY'
import os
import subprocess
from urllib.parse import urlsplit

repo_root = os.path.realpath(os.environ["SETTA_REMOTE_REPO_ROOT"])
entrypoint_parent = os.environ["SETTA_REMOTE_ENTRYPOINT_PARENT"]


def has_runtime_entrypoint(path: str) -> bool:
    return os.path.isfile(os.path.join(path, "ai.sh")) or os.path.isfile(
        os.path.join(path, "scripts", "ai.sh")
    )


def git_inside(path: str) -> bool:
    result = subprocess.run(
        ["git", "-C", path, "rev-parse", "--is-inside-work-tree"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


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


def normalize_repo_identity(raw_origin: str) -> str:
    value = raw_origin.strip()
    if not value:
        return ""

    if "://" in value:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").lower()
        path = parsed.path.lstrip("/")
    elif ":" in value and "@" in value.split(":", 1)[0]:
        user_host, path = value.split(":", 1)
        host = user_host.split("@", 1)[1].lower()
    else:
        return value.rstrip("/")

    path = path.rstrip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if not host or not path:
        return value.rstrip("/")
    return f"{host}/{path}"


def git_common_dir(path: str) -> str:
    result = subprocess.run(
        ["git", "-C", path, "rev-parse", "--path-format=absolute", "--git-common-dir"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return ""
    value = result.stdout.strip()
    if not value:
        return ""
    return os.path.realpath(value)


def git_dir(path: str) -> str:
    result = subprocess.run(
        ["git", "-C", path, "rev-parse", "--path-format=absolute", "--git-dir"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return ""
    value = result.stdout.strip()
    if not value:
        return ""
    return os.path.realpath(value)


def parse_worktree_entries(path: str) -> list[dict[str, str]]:
    worktree_output = subprocess.run(
        ["git", "-C", path, "worktree", "list", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
    )
    if worktree_output.returncode != 0:
        return []

    entries: list[dict[str, str]] = []
    current: dict[str, str] = {}
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
            current["detached"] = "1"

    if current:
        entries.append(current)

    return entries


repo_origin = normalize_repo_identity(git_origin(repo_root))
current_common_dir = git_common_dir(repo_root)
if not current_common_dir:
    raise SystemExit(0)

candidate_roots: list[str] = [repo_root]
if os.path.isdir(entrypoint_parent):
    for name in sorted(os.listdir(entrypoint_parent)):
        path = os.path.realpath(os.path.join(entrypoint_parent, name))
        if not os.path.isdir(path) or path == repo_root:
            continue
        if not has_runtime_entrypoint(path):
            continue
        if not git_inside(path):
            continue
        if repo_origin:
            candidate_origin = normalize_repo_identity(git_origin(path))
            if candidate_origin != repo_origin:
                continue
        candidate_roots.append(path)

families: dict[str, dict[str, object]] = {}
for candidate_root in candidate_roots:
    common_dir = git_common_dir(candidate_root)
    if not common_dir:
        continue
    if common_dir not in families:
        families[common_dir] = {
            "representative": candidate_root,
            "is_current": common_dir == current_common_dir,
        }
    elif common_dir == current_common_dir:
        families[common_dir]["representative"] = repo_root
        families[common_dir]["is_current"] = True

seen_paths: set[str] = set()
family_order: list[str] = []
if current_common_dir in families:
    family_order.append(current_common_dir)
family_order.extend(
    common_dir for common_dir in sorted(families) if common_dir != current_common_dir
)

for family_common_dir in family_order:
    family = families[family_common_dir]
    representative = str(family["representative"])
    is_current_family = bool(family["is_current"])
    for entry in parse_worktree_entries(representative):
        path = os.path.realpath(str(entry.get("path", "")))
        if not path or path in seen_paths:
            continue
        if not has_runtime_entrypoint(path):
            continue
        branch_ref = str(entry.get("branch_ref", ""))
        branch = (
            branch_ref.removeprefix("refs/heads/")
            if branch_ref.startswith("refs/heads/")
            else branch_ref
        )
        name = os.path.basename(path.rstrip("/")) or path
        is_primary = "1" if git_dir(path) == family_common_dir else "0"
        source_kind = "worktree" if is_current_family or is_primary == "0" else "entrypoint"
        seen_paths.add(path)
        print(f"{path}\t{name}\t{branch}\t{is_primary}\t{source_kind}")
PY
}

render_entrypoint_catalog() {
    :
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

load_remote_worktree_catalog_arrays() {
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
    hidden_entrypoint_count=0

    while IFS=$'\t' read -r path name branch is_primary source_kind; do
        [ -z "${path}" ] && continue
        if [ "${source_kind}" = "entrypoint" ]; then
            catalog_has_entrypoints=1
            if [ "${include_repo_entrypoints}" != "1" ]; then
                hidden_entrypoint_count=$((hidden_entrypoint_count + 1))
                continue
            fi
        fi
        worktree_paths+=("${path}")
        worktree_names+=("${name}")
        worktree_branches+=("${branch}")
        worktree_primary_flags+=("${is_primary}")
        worktree_source_kinds+=("${source_kind}")
        if [ "${source_kind}" = "entrypoint" ]; then
            :
        else
            catalog_has_worktrees=1
        fi
    done <<EOF
${catalog_output}
EOF

    if [ "${#worktree_paths[@]}" -eq 0 ]; then
        if [ "${hidden_entrypoint_count}" -gt 0 ]; then
            echo "Repo-folder entry points are hidden by default. Set SETTA_AWS_DEVBOX_INCLUDE_REPO_ENTRYPOINTS=1 to include them." >&2
        fi
        echo "No remote worktrees or repo entry points found on the devbox." >&2
        exit 1
    fi
}

print_selected_remote_worktree_row() {
    array_index="$1"
    printf '%s\t%s\t%s\t%s\n' \
        "${worktree_paths[${array_index}]}" \
        "${worktree_names[${array_index}]}" \
        "${worktree_branches[${array_index}]}" \
        "${worktree_source_kinds[${array_index}]}"
}

prompt_for_remote_worktree() {
    load_remote_worktree_catalog_arrays

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
            if [ "${hidden_entrypoint_count}" -gt 0 ]; then
                echo "Repo-folder entry points are hidden by default. Set SETTA_AWS_DEVBOX_INCLUDE_REPO_ENTRYPOINTS=1 to include them." >&2
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

    print_selected_remote_worktree_row "$((selected_index - 1))"
}

select_remote_worktree_by_branch() {
    requested_branch="$1"
    load_remote_worktree_catalog_arrays

    match_array_index=""
    match_count=0
    i=0
    while [ "${i}" -lt "${#worktree_paths[@]}" ]; do
        if [ "${worktree_branches[${i}]}" = "${requested_branch}" ] || \
            [ "${worktree_names[${i}]}" = "${requested_branch}" ] || \
            [ "${worktree_names[${i}]}" = "setta.${requested_branch}" ]; then
            match_count=$((match_count + 1))
            match_array_index="${i}"
        fi
        i=$((i + 1))
    done

    if [ "${match_count}" -eq 0 ]; then
        echo "Could not find a remote worktree or repo entry point for branch/name: ${requested_branch}" >&2
        exit 1
    fi

    if [ "${match_count}" -gt 1 ]; then
        echo "Multiple remote worktrees matched ${requested_branch}. Use select mode instead." >&2
        exit 1
    fi

    print_selected_remote_worktree_row "${match_array_index}"
}
