#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/release/build_macos_installer.sh [output-dir]

Builds an unsigned (or optionally signed/notarized) macOS .pkg installer that
installs desktop bootstrap commands under /usr/local/bin and runs bootstrap
during postinstall:
- setta-install-desktop
- setta-remove-desktop

Optional environment variables:
  SETTA_DESKTOP_INSTALLER_VERSION   Installer version (default: 1.0.0)
  SETTA_DESKTOP_INSTALLER_RELEASE_MODE  Set to 1 to require explicit installer version
  SETTA_DESKTOP_INSTALLER_PACKAGE_PATH  Packaged Setta sdist to bundle
                                        (default: dist/setta-<version>.tar.gz)
  SETTA_MACOS_SIGN_IDENTITY         productsign identity for the .pkg
  SETTA_MACOS_NOTARY_PROFILE        xcrun notarytool keychain profile name
  SETTA_MACOS_BUILD_DMG             Set to 1 to wrap the .pkg in a .dmg
USAGE
}

if [[ "${1-}" == "-h" || "${1-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build_macos_installer.sh must run on macOS." >&2
  exit 1
fi

for required_bin in pkgbuild shasum; do
  if ! command -v "${required_bin}" >/dev/null 2>&1; then
    echo "Missing required command: ${required_bin}" >&2
    exit 1
  fi
done

output_dir="${1:-dist/native-installers/macos}"
release_mode="${SETTA_DESKTOP_INSTALLER_RELEASE_MODE:-0}"
version="${SETTA_DESKTOP_INSTALLER_VERSION:-}"
if [[ -z "${version}" ]]; then
  if [[ "${release_mode}" == "1" ]]; then
    echo "SETTA_DESKTOP_INSTALLER_VERSION is required when release mode is enabled." >&2
    exit 1
  fi
  version="1.0.0"
fi
if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Installer version must use major.minor.patch format (got '${version}')." >&2
  exit 1
fi
package_path="${SETTA_DESKTOP_INSTALLER_PACKAGE_PATH:-dist/setta-${version}.tar.gz}"
if [[ ! -f "${package_path}" ]]; then
  echo "Packaged Setta distribution not found: ${package_path}" >&2
  echo "Build it first with ./scripts/build_python_distribution_with_go_binaries.sh --sdist" >&2
  exit 1
fi
if [[ "${package_path}" != *.tar.gz ]]; then
  echo "Native installers currently bundle a Setta sdist (.tar.gz), got: ${package_path}" >&2
  exit 1
fi
package_path="$(cd "$(dirname "${package_path}")" && pwd)/$(basename "${package_path}")"
identifier="dev.setta.desktop.bootstrap"
base_name="SettaDesktop-${version}"
unsigned_pkg_path="${output_dir}/${base_name}-unsigned.pkg"
final_pkg_path="${output_dir}/${base_name}.pkg"

mkdir -p "${output_dir}"

payload_root="$(mktemp -d)"
installer_scripts_root="$(mktemp -d)"
trap 'rm -rf "${payload_root}" "${installer_scripts_root}"' EXIT

mkdir -p "${payload_root}/usr/local/bin"
mkdir -p "${payload_root}/usr/local/share/setta-installer"
cp "scripts/install_desktop_launcher.sh" \
  "${payload_root}/usr/local/bin/setta-install-desktop"
cp "${package_path}" \
  "${payload_root}/usr/local/share/setta-installer/setta-package.tar.gz"
cat > "${payload_root}/usr/local/bin/setta-remove-desktop" <<'REMOVE'
#!/usr/bin/env bash
set -euo pipefail
exec setta launcher remove "$@"
REMOVE
chmod +x "${payload_root}/usr/local/bin/setta-install-desktop"
chmod +x "${payload_root}/usr/local/bin/setta-remove-desktop"

cat > "${installer_scripts_root}/postinstall" <<'POSTINSTALL'
#!/usr/bin/env bash
set -euo pipefail

installer_bin="/usr/local/bin/setta-install-desktop"
if [[ ! -x "${installer_bin}" ]]; then
  echo "Missing bootstrap installer command: ${installer_bin}" >&2
  exit 1
fi

bootstrap_cmd="${installer_bin} --package '/usr/local/share/setta-installer/setta-package.tar.gz' --channel native-installer --install-source installer-managed --open-mode chrome-app"
target_user="${SUDO_USER:-}"
if [[ -z "${target_user}" || "${target_user}" == "root" ]]; then
  target_user="$(/usr/bin/stat -f '%Su' /dev/console 2>/dev/null || true)"
fi

if [[ -n "${target_user}" && "${target_user}" != "root" && "${target_user}" != "loginwindow" ]]; then
  /usr/bin/su - "${target_user}" -c "${bootstrap_cmd}"
else
  /bin/bash -lc "${bootstrap_cmd}"
fi
POSTINSTALL
chmod +x "${installer_scripts_root}/postinstall"

pkgbuild \
  --root "${payload_root}" \
  --scripts "${installer_scripts_root}" \
  --identifier "${identifier}" \
  --version "${version}" \
  --install-location "/" \
  "${unsigned_pkg_path}"

if [[ -n "${SETTA_MACOS_SIGN_IDENTITY:-}" ]]; then
  if ! command -v productsign >/dev/null 2>&1; then
    echo "productsign is required when SETTA_MACOS_SIGN_IDENTITY is set." >&2
    exit 1
  fi
  productsign \
    --sign "${SETTA_MACOS_SIGN_IDENTITY}" \
    "${unsigned_pkg_path}" \
    "${final_pkg_path}"
  rm -f "${unsigned_pkg_path}"
else
  mv "${unsigned_pkg_path}" "${final_pkg_path}"
fi

if [[ -n "${SETTA_MACOS_NOTARY_PROFILE:-}" ]]; then
  if ! command -v xcrun >/dev/null 2>&1; then
    echo "xcrun is required for notarization." >&2
    exit 1
  fi
  xcrun notarytool submit "${final_pkg_path}" \
    --keychain-profile "${SETTA_MACOS_NOTARY_PROFILE}" \
    --wait
  xcrun stapler staple "${final_pkg_path}"
fi

if [[ "${SETTA_MACOS_BUILD_DMG:-0}" == "1" ]]; then
  if ! command -v hdiutil >/dev/null 2>&1; then
    echo "hdiutil is required to build a .dmg." >&2
    exit 1
  fi
  dmg_path="${output_dir}/${base_name}.dmg"
  temp_dmg_root="$(mktemp -d)"
  cp "${final_pkg_path}" "${temp_dmg_root}/"
  hdiutil create \
    -volname "Setta Desktop Installer" \
    -srcfolder "${temp_dmg_root}" \
    -ov \
    -format UDZO \
    "${dmg_path}"
  rm -rf "${temp_dmg_root}"
  shasum -a 256 "${dmg_path}" > "${dmg_path}.sha256"
fi

shasum -a 256 "${final_pkg_path}" > "${final_pkg_path}.sha256"

echo "Built macOS installer: ${final_pkg_path}"
echo "Bundled Setta package: ${package_path}"
