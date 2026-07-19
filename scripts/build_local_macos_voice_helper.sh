#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_dir="${repo_root}/desktop/native/local-macos-voice-helper"
source_dir="${package_dir}/Sources/SettaLocalMacOSVoiceHelper"
desktop_out_dir="${repo_root}/desktop/out/local-macos-voice"
helper_name="setta-local-macos-voice-helper"
helper_out_dir="${desktop_out_dir}/bin"
helper_out_path="${helper_out_dir}/${helper_name}"
source_manifest="${repo_root}/desktop/resources/local-macos-voice/manifest.json"
out_manifest="${desktop_out_dir}/manifest.json"
info_plist="${package_dir}/Resources/Info.plist"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping local macOS voice helper build on non-macOS host."
  exit 0
fi

command -v swift >/dev/null 2>&1 || {
  echo "Swift is required to build the local macOS voice helper." >&2
  exit 1
}

mkdir -p "${helper_out_dir}"
swiftc \
  -O \
  -o "${helper_out_path}" \
  "${source_dir}"/*.swift \
  -Xlinker -sectcreate \
  -Xlinker __TEXT \
  -Xlinker __info_plist \
  -Xlinker "${info_plist}"

chmod 0755 "${helper_out_path}"

if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - --timestamp=none "${helper_out_path}" >/dev/null
fi

mkdir -p "${desktop_out_dir}"
node - "${source_manifest}" "${out_manifest}" <<'NODE'
const { existsSync, readFileSync, writeFileSync } = require("node:fs");

const sourceManifest = process.argv[2];
const outManifest = process.argv[3];
let manifest = {};
if (existsSync(sourceManifest)) {
  manifest = JSON.parse(readFileSync(sourceManifest, "utf8"));
}
manifest.helperPath = "bin/setta-local-macos-voice-helper";
writeFileSync(outManifest, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

echo "Built ${helper_out_path}"
