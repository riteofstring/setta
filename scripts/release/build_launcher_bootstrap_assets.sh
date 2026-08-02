#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/release/build_launcher_bootstrap_assets.sh [output-dir]

Build release-ready no-checkout bootstrap assets:
- setta-install-desktop.sh
- setta-install-desktop.ps1
- checksums.sha256
USAGE
}

if [[ "${1-}" == "-h" || "${1-}" == "--help" ]]; then
  usage
  exit 0
fi

output_dir="${1:-dist/launcher-bootstrap}"
mkdir -p "${output_dir}"
rm -f \
  "${output_dir}/setta-install-desktop.sh" \
  "${output_dir}/setta-install-desktop.ps1" \
  "${output_dir}/checksums.sha256"

cp "scripts/install_desktop_launcher.sh" "${output_dir}/setta-install-desktop.sh"
cp "scripts/install_desktop_launcher.ps1" "${output_dir}/setta-install-desktop.ps1"
chmod +x "${output_dir}/setta-install-desktop.sh"

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "${output_dir}"
    sha256sum \
      "setta-install-desktop.sh" \
      "setta-install-desktop.ps1" \
      > "checksums.sha256"
  )
else
  (
    cd "${output_dir}"
    shasum -a 256 \
      "setta-install-desktop.sh" \
      "setta-install-desktop.ps1" \
      > "checksums.sha256"
  )
fi

echo "Built launcher bootstrap assets in ${output_dir}"
