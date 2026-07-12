#!/bin/sh
set -eu

fail() {
  echo "install.sh: $*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

bool_env() {
  name="$1"
  value="$2"
  case "$value" in
    ""|0|false|False|FALSE|no|No|NO)
      printf '%s\n' "0"
      ;;
    1|true|True|TRUE|yes|Yes|YES)
      printf '%s\n' "1"
      ;;
    *)
      fail "${name} must be 0/1, true/false, or yes/no"
      ;;
  esac
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    LC_ALL=C LANG=C shasum -a 256 "$1" | awk '{print $1}'
  else
    fail "no SHA256 checksum tool available (need sha256sum or shasum)"
  fi
}

download_file() {
  source_url="$1"
  output_path="$2"
  curl -fsSL "$source_url" -o "$output_path" ||
    fail "failed to download ${source_url}"
}

checksum_for_name() {
  checksum_file="$1"
  checksum_name="$2"
  awk -v name="$checksum_name" '$2 == name { print $1; found = 1; exit } END { if (!found) exit 1 }' "$checksum_file"
}

verify_checksum() {
  checksum_file="$1"
  checksum_name="$2"
  actual_path="$3"

  expected_checksum="$(checksum_for_name "$checksum_file" "$checksum_name")" ||
    fail "SHA256SUMS does not include ${checksum_name}"
  actual_checksum="$(sha256_file "$actual_path")"
  if [ "$actual_checksum" != "$expected_checksum" ]; then
    fail "checksum mismatch for ${checksum_name}"
  fi
}

verify_checksums_signature() {
  checksum_file="$1"
  signature_file="$2"
  public_key="$3"

  [ -n "$public_key" ] ||
    fail "SETTA_MINISIGN_PUBLIC_KEY is required to verify signed release checksums"
  need_command minisign
  minisign -Vm "$checksum_file" -P "$public_key" -x "$signature_file" >/dev/null ||
    fail "minisign verification failed for SHA256SUMS"
}

require_absolute_path() {
  label="$1"
  path="$2"
  case "$path" in
    /*) ;;
    *) fail "${label} must be an absolute path: ${path}" ;;
  esac
  case "$path" in
    *" "*)
      fail "${label} must not contain spaces because it is written into a systemd unit: ${path}"
      ;;
  esac
}

ensure_service_identity() {
  service_user="$1"
  service_group="$2"
  service_app_data_dir="$3"

  if ! getent group "$service_group" >/dev/null 2>&1; then
    groupadd --system "$service_group" ||
      fail "failed to create service group ${service_group}"
  fi
  if ! id -u "$service_user" >/dev/null 2>&1; then
    useradd --system \
      --gid "$service_group" \
      --home-dir "$service_app_data_dir" \
      --no-create-home \
      --shell /usr/sbin/nologin \
      "$service_user" ||
      fail "failed to create service user ${service_user}"
  fi
}

write_service_env_file() {
  env_file="$1"
  service_app_data_dir="$2"
  provisioning_seed_file="$3"
  tmp_file="${tmp_dir}/setta.env"

  cat >"$tmp_file" <<EOF
SETTA_APP_DATA_DIR=${service_app_data_dir}
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EOF
  if [ -n "$provisioning_seed_file" ]; then
    printf 'SETTA_PROVISIONING_SEED_FILE=%s\n' "$provisioning_seed_file" >>"$tmp_file"
  fi
  install -m 0644 -o root -g root "$tmp_file" "$env_file" ||
    fail "failed to install service environment file ${env_file}"
}

write_service_unit_file() {
  unit_file="$1"
  install_path="$2"
  service_app_data_dir="$3"
  env_file="$4"
  service_user="$5"
  service_group="$6"
  tmp_file="${tmp_dir}/setta.service"

  cat >"$tmp_file" <<EOF
[Unit]
Description=Setta Runtime
Wants=network-online.target tailscaled.service
After=network-online.target tailscaled.service

[Service]
Type=simple
User=${service_user}
Group=${service_group}
WorkingDirectory=${service_app_data_dir}
EnvironmentFile=${env_file}
PermissionsStartOnly=true
ExecStartPre=${install_path} service wait-tailnet --timeout 90s
ExecStart=${install_path} serve --app-data-dir ${service_app_data_dir} --tailnet
ExecStartPost=${install_path} service configure-tailscale-serve --app-data-dir ${service_app_data_dir} --timeout 90s
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${service_app_data_dir}

[Install]
WantedBy=multi-user.target
EOF
  install -m 0644 -o root -g root "$tmp_file" "$unit_file" ||
    fail "failed to install systemd unit ${unit_file}"
}

detect_os() {
  case "$(uname -s)" in
    Linux)
      printf '%s\n' "linux"
      ;;
    *)
      fail "unsupported OS: $(uname -s) (supported: Linux)"
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)
      printf '%s\n' "amd64"
      ;;
    aarch64|arm64)
      printf '%s\n' "arm64"
      ;;
    *)
      fail "unsupported architecture: $(uname -m) (supported: amd64, arm64)"
      ;;
  esac
}

resolve_latest_version() {
  repo="$1"
  latest_url="https://github.com/${repo}/releases/latest"
  effective_url="$(curl -fsSIL -o /dev/null -w '%{url_effective}' "$latest_url")" ||
    fail "failed to resolve latest release for ${repo}"
  latest_version="${effective_url##*/}"
  if [ -z "$latest_version" ] || [ "$latest_version" = "latest" ]; then
    fail "could not resolve latest release version from ${effective_url}"
  fi
  printf '%s\n' "$latest_version"
}

for command_name in awk chmod cp curl mkdir mktemp mv rm tar uname; do
  need_command "$command_name"
done

repo="${SETTA_INSTALL_REPO:-riteofstring/setta}"
version="${SETTA_VERSION:-latest}"
base_url="${SETTA_INSTALL_BASE_URL:-}"
service_mode="$(bool_env SETTA_INSTALL_SERVICE "${SETTA_INSTALL_SERVICE:-0}")"
service_start="$(bool_env SETTA_SERVICE_START "${SETTA_SERVICE_START:-1}")"
service_unit_name="${SETTA_SERVICE_UNIT_NAME:-setta.service}"
service_user="${SETTA_SERVICE_USER:-setta}"
service_group="${SETTA_SERVICE_GROUP:-setta}"
service_app_data_dir="${SETTA_SERVICE_APP_DATA_DIR:-/var/lib/setta}"
service_provisioning_seed_file="${SETTA_PROVISIONING_SEED_FILE:-}"
service_env_dir="${SETTA_SERVICE_ENV_DIR:-/etc/setta}"
service_env_file="${service_env_dir}/setta.env"
service_unit_file="/etc/systemd/system/${service_unit_name}"
minisign_public_key="${SETTA_MINISIGN_PUBLIC_KEY:-}"

if [ "$service_mode" -eq 0 ]; then
  [ -n "${HOME:-}" ] || fail "HOME is not set"
fi

case "$repo" in
  */*) ;;
  *) fail "SETTA_INSTALL_REPO must use owner/repo form: ${repo}" ;;
esac

if [ "$service_mode" -eq 1 ]; then
  [ "$version" != "latest" ] ||
    fail "SETTA_VERSION must be explicit for service installs; do not install VM services from latest"
  for command_name in getent groupadd id install systemctl useradd; do
    need_command "$command_name"
  done
  [ "$(id -u)" = "0" ] ||
    fail "service install requires root; rerun with sudo and SETTA_INSTALL_SERVICE=1"
  case "$service_unit_name" in
    *.service) ;;
    *) fail "SETTA_SERVICE_UNIT_NAME must end with .service: ${service_unit_name}" ;;
  esac
  case "$service_unit_name" in
    */*) fail "SETTA_SERVICE_UNIT_NAME must be a unit name, not a path: ${service_unit_name}" ;;
  esac
  require_absolute_path SETTA_SERVICE_APP_DATA_DIR "$service_app_data_dir"
  if [ -n "$service_provisioning_seed_file" ]; then
    require_absolute_path SETTA_PROVISIONING_SEED_FILE "$service_provisioning_seed_file"
  fi
  require_absolute_path SETTA_SERVICE_ENV_DIR "$service_env_dir"
  require_absolute_path service_unit_file "$service_unit_file"
fi

if [ -n "$base_url" ]; then
  if [ "$version" = "latest" ]; then
    fail "SETTA_VERSION must be explicit when SETTA_INSTALL_BASE_URL is set"
  fi
  release_base_url="${base_url%/}"
else
  if [ "$version" = "latest" ]; then
    version="$(resolve_latest_version "$repo")"
  fi
  release_base_url="https://github.com/${repo}/releases/download/${version}"
fi

os_name="$(detect_os)"
arch_name="$(detect_arch)"
artifact="setta_${version}_${os_name}_${arch_name}"
archive_name="${artifact}.tar.gz"

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-install.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

archive_path="${tmp_dir}/${archive_name}"
checksums_path="${tmp_dir}/SHA256SUMS"
checksums_signature_path="${tmp_dir}/SHA256SUMS.minisig"
extract_dir="${tmp_dir}/extract"
binary_path="${extract_dir}/${artifact}/setta"
if [ "$service_mode" -eq 1 ]; then
  install_dir="${SETTA_INSTALL_DIR:-/usr/local/bin}"
else
  install_dir="${SETTA_INSTALL_DIR:-${HOME}/.local/bin}"
fi
install_path="${install_dir}/setta"
install_tmp="${install_path}.tmp.$$"

require_absolute_path SETTA_INSTALL_DIR "$install_dir"

mkdir -p "$extract_dir"

echo "Downloading Setta ${version} for ${os_name}/${arch_name}..."
download_file "${release_base_url}/${archive_name}" "$archive_path"
download_file "${release_base_url}/SHA256SUMS" "$checksums_path"
download_file "${release_base_url}/SHA256SUMS.minisig" "$checksums_signature_path"

verify_checksums_signature "$checksums_path" "$checksums_signature_path" "$minisign_public_key"
verify_checksum "$checksums_path" "$archive_name" "$archive_path"

tar -xzf "$archive_path" -C "$extract_dir" ||
  fail "failed to extract ${archive_name}"

[ -f "$binary_path" ] || fail "release archive did not contain ${artifact}/setta"
verify_checksum "$checksums_path" "${artifact}/setta" "$binary_path"

if [ "$service_mode" -eq 1 ]; then
  ensure_service_identity "$service_user" "$service_group" "$service_app_data_dir"
  install -d -m 0755 -o root -g root "$install_dir" ||
    fail "failed to create install directory ${install_dir}"
  install -m 0755 -o root -g root "$binary_path" "$install_path" ||
    fail "failed to install setta to ${install_path}"
  install -d -m 0750 -o "$service_user" -g "$service_group" "$service_app_data_dir" ||
    fail "failed to create service app data directory ${service_app_data_dir}"
  install -d -m 0755 -o root -g root "$service_env_dir" ||
    fail "failed to create service environment directory ${service_env_dir}"
  write_service_env_file "$service_env_file" "$service_app_data_dir" "$service_provisioning_seed_file"
  write_service_unit_file "$service_unit_file" "$install_path" "$service_app_data_dir" "$service_env_file" "$service_user" "$service_group"
  systemctl daemon-reload || fail "systemctl daemon-reload failed"
  if [ "$service_start" -eq 1 ]; then
    systemctl enable --now "$service_unit_name" ||
      fail "failed to enable and start ${service_unit_name}; inspect with journalctl -u ${service_unit_name}"
  else
    systemctl enable "$service_unit_name" ||
      fail "failed to enable ${service_unit_name}"
  fi
else
  mkdir -p "$install_dir"
  cp "$binary_path" "$install_tmp" || fail "failed to copy setta to ${install_tmp}"
  chmod 0755 "$install_tmp"
  mv "$install_tmp" "$install_path" || fail "failed to install setta to ${install_path}"
fi

echo "Installed setta to ${install_path}"

if [ "$service_mode" -eq 1 ]; then
  cat <<EOF

Installed ${service_unit_name} as user ${service_user}.
The runtime binds to the Tailscale IPv4 address only, and the service configures Tailscale HTTPS with tailscale serve.

Next steps:
  1. journalctl -u ${service_unit_name} -f
  2. ${install_path} pair --app-data-dir ${service_app_data_dir}
  3. ${install_path} doctor --json --app-data-dir ${service_app_data_dir}
EOF
else
  case ":${PATH:-}:" in
    *":${install_dir}:"*) ;;
    *)
      echo "Warning: ${install_dir} is not on PATH." >&2
      ;;
  esac

  cat <<EOF

Next steps:
  1. Install and start Tailscale on this Linux box.
  2. setta serve --tailnet
EOF
fi
