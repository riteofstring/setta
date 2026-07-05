#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_root="${repo_root}/resources/skills"
repo_dest_root="${repo_root}/.codex/skills"
codex_home="${CODEX_HOME:-${HOME}/.codex}"
check_only=0
install_user=0

usage() {
  cat <<'EOF'
Usage: scripts/sync_codex_skills.sh [--check] [--install-user] [--codex-home PATH]

Sync repo-owned skills from:
  resources/skills

to the repo Codex skill root used by the in-app app-server integration:
  .codex/skills

Options:
  --check         Check for drift instead of copying files.
  --install-user  Also sync to ${CODEX_HOME:-$HOME/.codex}/skills for local
                  Codex CLI use outside the app.
  --codex-home PATH
                  Use PATH as CODEX_HOME and imply --install-user.
  --help          Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      check_only=1
      shift
      ;;
    --install-user)
      install_user=1
      shift
      ;;
    --codex-home)
      shift
      if [[ $# -eq 0 || -z "$1" ]]; then
        echo "Missing value for --codex-home" >&2
        exit 1
      fi
      codex_home="$1"
      install_user=1
      shift
      ;;
    --help|-h)
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

if [[ ! -d "${source_root}" ]]; then
  echo "Skill source root does not exist: ${source_root}" >&2
  exit 1
fi

list_source_skills() {
  find "${source_root}" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort
}

has_source_skills() {
  local skill_name=""
  while IFS= read -r skill_name; do
    [[ -n "${skill_name}" ]] && return 0
  done < <(list_source_skills)
  return 1
}

copy_skill_to_root() {
  local skill_name="$1"
  local dest_root="$2"
  local source_skill="${source_root}/${skill_name}"
  local dest_skill="${dest_root}/${skill_name}"

  mkdir -p "${dest_root}"
  rm -rf "${dest_skill}"
  cp -R "${source_skill}" "${dest_skill}"
}

sync_to_root() {
  local dest_root="$1"
  local label="$2"
  local skill_name=""

  while IFS= read -r skill_name; do
    [[ -n "${skill_name}" ]] || continue
    copy_skill_to_root "${skill_name}" "${dest_root}"
    echo "Synced ${label}: ${skill_name}"
  done < <(list_source_skills)
}

check_root() {
  local dest_root="$1"
  local label="$2"
  local skill_name=""
  local status=0

  if [[ ! -d "${dest_root}" ]]; then
    echo "Codex skill destination missing for ${label}: ${dest_root}" >&2
    return 1
  fi

  while IFS= read -r skill_name; do
    [[ -n "${skill_name}" ]] || continue
    if [[ ! -d "${dest_root}/${skill_name}" ]]; then
      echo "Codex skill missing from ${label}: ${skill_name}" >&2
      status=1
      continue
    fi
    if ! diff -ruN --exclude='.DS_Store' "${source_root}/${skill_name}" "${dest_root}/${skill_name}"; then
      echo "Codex skill drift detected in ${label}: ${skill_name}" >&2
      status=1
    fi
  done < <(list_source_skills)

  return "${status}"
}

if ! has_source_skills; then
  echo "No source skills found under ${source_root}" >&2
  exit 1
fi

if [[ "${check_only}" -eq 1 ]]; then
  check_root "${repo_dest_root}" "repo .codex/skills"
  if [[ "${install_user}" -eq 1 ]]; then
    check_root "${codex_home}/skills" "user CODEX_HOME skills"
  fi
else
  sync_to_root "${repo_dest_root}" "repo .codex/skills"
  if [[ "${install_user}" -eq 1 ]]; then
    sync_to_root "${codex_home}/skills" "user CODEX_HOME skills"
  fi
fi
