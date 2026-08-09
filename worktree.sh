#!/bin/sh

worktree_sh_sourced=0
if [ -n "${ZSH_EVAL_CONTEXT:-}" ]; then
  case "${ZSH_EVAL_CONTEXT}" in
    *:file) worktree_sh_sourced=1 ;;
  esac
else
  (return 0 2>/dev/null) && worktree_sh_sourced=1 || worktree_sh_sourced=0
fi

worktree_sh_script_path() {
  if [ -n "${ZSH_VERSION:-}" ]; then
    # zsh: %x is the current file path (works for sourced + executed).
    printf '%s\n' "${(%):-%x}"
    return 0
  fi

  if [ -n "${BASH_VERSION:-}" ]; then
    # bash: BASH_SOURCE[0] is this file even when sourced.
    printf '%s\n' "${BASH_SOURCE[0]}"
    return 0
  fi

  printf '%s\n' "$0"
}

worktree_sh_usage() {
  cat <<'EOF' >&2
Usage: ./worktree.sh [--stay] [--existing] <branch-name ...>
Example: ./worktree.sh feature-auth-1 fix-realtime-2
Example: ./worktree.sh --existing app-gen-styles

Notes:
  - If you create a single worktree, this script will enter it by starting a new
    shell there (exit to return).
  - If you create multiple worktrees, this script will stay in the current folder
    (equivalent to --stay).
  - Use --existing to create worktrees from already-existing local branches.
  - If you want it to 'cd' in your current shell (no subshell), source it:
      . ./worktree.sh feature-auth-1
  - Use --stay to skip the final enter/cd step.
EOF
}

worktree_sh_impl() {
  # Runs worktree creation + install. Safe to run with `set -e`.
  root_dir="$1"
  base_dir="$2"
  use_existing_branches="$3"
  shift 3

  for name in "$@"; do
    case "${name}" in
      *[!A-Za-z0-9._-]*)
        echo "Branch name must use letters, digits, '.', '_' or '-': ${name}" >&2
        exit 1
        ;;
    esac

    worktree_path="${base_dir}/setta.${name}"
    branch_name="${name}"

    if [ -e "${worktree_path}" ]; then
      echo "Path already exists: ${worktree_path}" >&2
      exit 1
    fi

    if [ "${use_existing_branches}" -eq 1 ]; then
      if ! git -C "${root_dir}" show-ref --verify --quiet "refs/heads/${branch_name}"; then
        echo "Branch does not exist: ${branch_name}" >&2
        exit 1
      fi

      git -C "${root_dir}" worktree add "${worktree_path}" "${branch_name}"
    else
      if git -C "${root_dir}" show-ref --verify --quiet "refs/heads/${branch_name}"; then
        echo "Branch already exists: ${branch_name}" >&2
        exit 1
      fi

      git -C "${root_dir}" worktree add -b "${branch_name}" "${worktree_path}" HEAD
    fi

    for env_file in .env .env.local .env.development.local .env.test.local .env.production.local; do
      if [ -f "${root_dir}/${env_file}" ] && [ ! -f "${worktree_path}/${env_file}" ]; then
        cp "${root_dir}/${env_file}" "${worktree_path}/${env_file}"
      fi
    done

    echo "Running dev install in ${worktree_path}..."
    (
      cd "${worktree_path}"
      . ./dev_install.sh
    )
  done
}

worktree_sh_main() {
  stay=0
  use_existing_branches=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --stay)
        stay=1
        shift
        ;;
      --existing)
        use_existing_branches=1
        shift
        ;;
      -h|--help)
        worktree_sh_usage
        return 0
        ;;
      --)
        shift
        break
        ;;
      -*)
        echo "Unknown flag: $1" >&2
        worktree_sh_usage
        return 1
        ;;
      *)
        break
        ;;
    esac
  done

  if [ "$#" -eq 0 ]; then
    worktree_sh_usage
    return 1
  fi

  # Multi-worktree runs should not guess which folder the caller wants to enter.
  if [ "${stay}" -eq 0 ] && [ "$#" -gt 1 ]; then
    stay=1
  fi

  script_path="$(worktree_sh_script_path)"
  script_dir="$(cd "$(dirname "${script_path}")" && pwd)"
  root_dir="${script_dir}"
  base_dir="$(cd "${root_dir}/.." && pwd)"

  last_name=""
  for name in "$@"; do
    last_name="${name}"
  done
  final_path="${base_dir}/setta.${last_name}"

  if [ "${worktree_sh_sourced}" -eq 1 ]; then
    # In sourced mode, run the installs in a subshell so `set -e` can't kill the interactive shell.
    (
      set -e
      worktree_sh_impl "${root_dir}" "${base_dir}" "${use_existing_branches}" "$@"
    )
    rc=$?

    if [ "${rc}" -ne 0 ]; then
      return "${rc}"
    fi

    if [ "${stay}" -eq 0 ] && [ -n "${final_path}" ]; then
      cd "${final_path}" || return 1
    fi

    return 0
  fi

  # Normal execution mode.
  set -e
  worktree_sh_impl "${root_dir}" "${base_dir}" "${use_existing_branches}" "$@"

  if [ "${stay}" -eq 0 ] && [ -n "${final_path}" ]; then
    if [ -t 0 ] && [ -t 1 ]; then
      echo "Entering ${final_path} (exit to return)..." >&2
      cd "${final_path}"
      exec "${SHELL:-/bin/sh}"
    fi

    echo "To enter the last worktree:" >&2
    echo "  cd \"${final_path}\"" >&2
    echo "Tip: source this script if you want it to cd your current shell:" >&2
    echo "  . ./worktree.sh $*" >&2
  fi
}

worktree_sh_main "$@"
rc=$?

if [ "${worktree_sh_sourced}" -eq 1 ]; then
  return "${rc}"
fi
exit "${rc}"
