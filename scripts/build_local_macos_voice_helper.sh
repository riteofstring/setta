#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_dir="${repo_root}/desktop/native/local-macos-voice-helper"
source_dir="${package_dir}/Sources/SettaLocalMacOSVoiceHelper"
whisper_cli_source="${repo_root}/desktop/native/local-macos-whisper-cli/main.swift"
desktop_out_dir="${repo_root}/desktop/out/local-macos-voice"
helper_name="setta-local-macos-voice-helper"
helper_out_dir="${desktop_out_dir}/bin"
helper_out_path="${helper_out_dir}/${helper_name}"
whisper_cli_out_path="${helper_out_dir}/whisper-cli"
frameworks_out_dir="${desktop_out_dir}/Frameworks"
whisper_framework_out_path="${frameworks_out_dir}/whisper.framework"
downloads_dir="${desktop_out_dir}/downloads"
whisper_release_version="v1.9.1"
whisper_xcframework_filename="whisper-${whisper_release_version}-xcframework.zip"
whisper_xcframework_url="https://github.com/ggml-org/whisper.cpp/releases/download/${whisper_release_version}/${whisper_xcframework_filename}"
whisper_xcframework_sha256="8c3ecbe73f48b0cb9318fc3058264f951ab336fd530e82c4ccdd2298d1311a4c"
whisper_xcframework_zip="${downloads_dir}/${whisper_xcframework_filename}"
whisper_xcframework_extract_dir="${downloads_dir}/whisper-${whisper_release_version}-xcframework"
whisper_xcframework_path="${whisper_xcframework_extract_dir}/build-apple/whisper.xcframework"
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
mkdir -p "${downloads_dir}" "${frameworks_out_dir}"

if [[ ! -f "${whisper_xcframework_zip}" ]] || \
  [[ "$(shasum -a 256 "${whisper_xcframework_zip}" | awk '{print $1}')" != "${whisper_xcframework_sha256}" ]]; then
  curl --fail --location --output "${whisper_xcframework_zip}" "${whisper_xcframework_url}"
fi

actual_whisper_sha256="$(shasum -a 256 "${whisper_xcframework_zip}" | awk '{print $1}')"
if [[ "${actual_whisper_sha256}" != "${whisper_xcframework_sha256}" ]]; then
  echo "whisper.cpp XCFramework hash mismatch: ${actual_whisper_sha256}" >&2
  exit 1
fi

rm -rf "${whisper_xcframework_extract_dir}" "${whisper_framework_out_path}"
mkdir -p "${whisper_xcframework_extract_dir}"
unzip -q "${whisper_xcframework_zip}" -d "${whisper_xcframework_extract_dir}"
cp -R "${whisper_xcframework_path}/macos-arm64_x86_64/whisper.framework" "${whisper_framework_out_path}"

swiftc \
  -O \
  -o "${helper_out_path}" \
  "${source_dir}"/*.swift \
  -Xlinker -sectcreate \
  -Xlinker __TEXT \
  -Xlinker __info_plist \
  -Xlinker "${info_plist}"

swiftc \
  -O \
  -o "${whisper_cli_out_path}" \
  "${whisper_cli_source}" \
  -F "${frameworks_out_dir}" \
  -framework whisper \
  -Xlinker -rpath \
  -Xlinker "@executable_path/../Frameworks"

chmod 0755 "${helper_out_path}"
chmod 0755 "${whisper_cli_out_path}"

if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - --timestamp=none "${whisper_framework_out_path}" >/dev/null
  codesign --force --sign - --timestamp=none "${helper_out_path}" >/dev/null
  codesign --force --sign - --timestamp=none "${whisper_cli_out_path}" >/dev/null
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
