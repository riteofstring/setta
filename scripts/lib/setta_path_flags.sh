#!/bin/sh

setta_require_option_value() {
  flag="$1"
  arg_count="$2"
  if [ "${arg_count}" -lt 2 ]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

setta_path_flags_init() {
  default_setta_home="$1"
  default_setta_files_root="$2"

  SETTA_PROFILE_OVERRIDE=""
  SETTA_HOME_OVERRIDE=""
  SETTA_FILES_ROOT_OVERRIDE=""
  SETTA_FILES_LOCATION_OVERRIDE=""
  SETTA_RUNTIME_ROOT_OVERRIDE=""

  EFFECTIVE_SETTA_HOME="${default_setta_home}"
  EFFECTIVE_SETTA_FILES_ROOT="${default_setta_files_root}"
  EFFECTIVE_SETTA_FILES_LOCATION=""

  SETTA_PATH_FLAGS_CONSUMED=0
}

setta_path_flags_try_parse() {
  SETTA_PATH_FLAGS_CONSUMED=0
  case "$1" in
    --profile)
      setta_require_option_value "$1" "$#"
      SETTA_PROFILE_OVERRIDE="$2"
      SETTA_PATH_FLAGS_CONSUMED=2
      return 0
      ;;
    --setta-home)
      setta_require_option_value "$1" "$#"
      SETTA_HOME_OVERRIDE="$2"
      SETTA_PATH_FLAGS_CONSUMED=2
      return 0
      ;;
    --setta-files-root)
      setta_require_option_value "$1" "$#"
      SETTA_FILES_ROOT_OVERRIDE="$2"
      SETTA_PATH_FLAGS_CONSUMED=2
      return 0
      ;;
    --setta-files-location)
      setta_require_option_value "$1" "$#"
      SETTA_FILES_LOCATION_OVERRIDE="$2"
      SETTA_PATH_FLAGS_CONSUMED=2
      return 0
      ;;
    --runtime-root)
      setta_require_option_value "$1" "$#"
      SETTA_RUNTIME_ROOT_OVERRIDE="$2"
      SETTA_PATH_FLAGS_CONSUMED=2
      return 0
      ;;
  esac
  return 1
}

setta_path_flags_validate() {
  if [ -n "${SETTA_FILES_ROOT_OVERRIDE}" ] && [ -n "${SETTA_FILES_LOCATION_OVERRIDE}" ]; then
    echo "Cannot pass both --setta-files-root and --setta-files-location." >&2
    exit 1
  fi
}

setta_path_flags_apply_env() {
  if [ -n "${SETTA_HOME_OVERRIDE}" ]; then
    EFFECTIVE_SETTA_HOME="${SETTA_HOME_OVERRIDE}"
  fi
  export SETTA_HOME="${EFFECTIVE_SETTA_HOME}"

  if [ -n "${SETTA_FILES_ROOT_OVERRIDE}" ]; then
    EFFECTIVE_SETTA_FILES_ROOT="${SETTA_FILES_ROOT_OVERRIDE}"
    EFFECTIVE_SETTA_FILES_LOCATION=""
  elif [ -n "${SETTA_FILES_LOCATION_OVERRIDE}" ]; then
    EFFECTIVE_SETTA_FILES_LOCATION="${SETTA_FILES_LOCATION_OVERRIDE}"
    EFFECTIVE_SETTA_FILES_ROOT=""
  fi

  if [ -n "${EFFECTIVE_SETTA_FILES_ROOT}" ]; then
    export SETTA_FILES_ROOT="${EFFECTIVE_SETTA_FILES_ROOT}"
    unset SETTA_FILES_LOCATION
  else
    unset SETTA_FILES_ROOT
    if [ -n "${EFFECTIVE_SETTA_FILES_LOCATION}" ]; then
      export SETTA_FILES_LOCATION="${EFFECTIVE_SETTA_FILES_LOCATION}"
    else
      unset SETTA_FILES_LOCATION
    fi
  fi

  if [ -n "${SETTA_PROFILE_OVERRIDE}" ]; then
    export SETTA_PROFILE="${SETTA_PROFILE_OVERRIDE}"
  else
    unset SETTA_PROFILE
  fi

  if [ -n "${SETTA_RUNTIME_ROOT_OVERRIDE}" ]; then
    export SETTA_RUNTIME_ROOT="${SETTA_RUNTIME_ROOT_OVERRIDE}"
  else
    unset SETTA_RUNTIME_ROOT
  fi
}
