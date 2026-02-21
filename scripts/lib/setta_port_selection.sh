#!/bin/sh

setta_instance_offset() {
  instance_name="$1"
  segment="${instance_name}"
  suffix=""

  case "${segment}" in
    setta.*)
      segment="${segment#setta.}"
      ;;
  esac

  offset="${segment##*[!0-9]}"
  if [ -n "${offset}" ]; then
    offset="$(printf "%s" "${offset}" | sed 's/^0*//')"
    if [ -z "${offset}" ]; then
      offset="0"
    fi
    echo "${offset}"
    return 0
  fi

  suffix="${segment}"
  suffix="${suffix##*-}"
  suffix="${suffix##*_}"
  suffix="${suffix##*.}"
  if [ "${#suffix}" -eq 1 ]; then
    case "${suffix}" in
      [a-z])
        echo $(( $(printf '%d' "'${suffix}") - 97 ))
        return 0
        ;;
      [A-Z])
        echo $(( $(printf '%d' "'${suffix}") - 65 ))
        return 0
        ;;
    esac
  fi

  if command -v cksum >/dev/null 2>&1; then
    cksum_output=$(printf "%s" "${segment}" | cksum)
    cksum_value=${cksum_output%% *}
    if [ -n "${cksum_value}" ]; then
      echo $(( cksum_value % 100 ))
      return 0
    fi
  fi

  echo 0
}

setta_port_in_use() {
  port="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi
  lsof -iTCP:"${port}" -sTCP:LISTEN -n >/dev/null 2>&1
}

setta_pick_free_offset() {
  offset="$1"
  attempts="${2:-200}"
  extra_base_port="${3:-}"
  i=0
  while [ "${i}" -le "${attempts}" ]; do
    candidate_offset=$((offset + i))
    backend_port=$((8000 + candidate_offset))
    frontend_port=$((3000 + candidate_offset))
    if ! setta_port_in_use "${backend_port}" && ! setta_port_in_use "${frontend_port}"; then
      if [ -z "${extra_base_port}" ]; then
        echo "${candidate_offset}"
        return 0
      fi
      extra_port=$((extra_base_port + candidate_offset))
      if ! setta_port_in_use "${extra_port}"; then
        echo "${candidate_offset}"
        return 0
      fi
    fi
    i=$((i + 1))
  done
  return 1
}

setta_pick_free_port_from() {
  port="$1"
  attempts="${2:-200}"
  exclude_port_a="${3:-}"
  exclude_port_b="${4:-}"
  i=0
  while [ "${i}" -le "${attempts}" ]; do
    candidate_port=$((port + i))
    if [ -n "${exclude_port_a}" ] && [ "${candidate_port}" = "${exclude_port_a}" ]; then
      i=$((i + 1))
      continue
    fi
    if [ -n "${exclude_port_b}" ] && [ "${candidate_port}" = "${exclude_port_b}" ]; then
      i=$((i + 1))
      continue
    fi
    if ! setta_port_in_use "${candidate_port}"; then
      echo "${candidate_port}"
      return 0
    fi
    i=$((i + 1))
  done
  return 1
}
