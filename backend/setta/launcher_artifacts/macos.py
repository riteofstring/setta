import shlex
import shutil
from pathlib import Path

from setta.launcher_artifacts.common import (
    LauncherArtifactContext,
    LauncherArtifactError,
    resolve_path_option_with_existing,
    shell_array_literal,
    shell_command,
    write_text_file,
)

MANAGED_ARTIFACT_KEYS = ("macosApp",)


def install_macos_artifacts(*, context: LauncherArtifactContext) -> dict[str, str]:
    app_path = resolve_path_option_with_existing(
        options=context.options,
        option_key="app_path",
        existing_managed_artifacts=context.existing_managed_artifacts,
        existing_key="macosApp",
        default_path=Path.home() / "Applications" / "Setta.app",
    )
    app_contents_dir = app_path / "Contents"
    app_macos_dir = app_contents_dir / "MacOS"
    app_resources_dir = app_contents_dir / "Resources"
    launcher_binary_path = app_macos_dir / "setta-launcher"
    info_plist_path = app_contents_dir / "Info.plist"

    icon_file_name = _copy_optional_icns_icon(
        source_path=context.options.get("icon_path"),
        destination_dir=app_resources_dir,
    )

    target_array_literal = shell_array_literal(context.target_command)
    target_command_shell = shell_command(context.target_command)
    channel_literal = shlex.quote(context.channel)
    launcher_content = _build_launcher_script(
        target_array_literal=target_array_literal,
        target_command_shell=target_command_shell,
        channel_literal=channel_literal,
    )

    icon_plist_block = ""
    if icon_file_name is not None:
        icon_plist_block = (
            f"  <key>CFBundleIconFile</key>\n  <string>{icon_file_name}</string>\n"
        )

    info_plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Setta</string>
  <key>CFBundleExecutable</key>
  <string>setta-launcher</string>
  <key>CFBundleIdentifier</key>
  <string>dev.setta.desktop</string>
  <key>CFBundleName</key>
  <string>Setta</string>
{icon_plist_block}  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
</dict>
</plist>
"""

    write_text_file(
        path=launcher_binary_path, content=launcher_content, executable=True
    )
    write_text_file(path=info_plist_path, content=info_plist_content)
    return {"macosApp": str(app_path.resolve(strict=False))}


def _copy_optional_icns_icon(
    *,
    source_path: str | None,
    destination_dir: Path,
) -> str | None:
    if source_path is None:
        return None
    resolved_source = Path(source_path).expanduser().resolve(strict=False)
    if not resolved_source.exists() or not resolved_source.is_file():
        raise LauncherArtifactError(f"Icon file does not exist: {resolved_source}")
    if resolved_source.suffix.lower() != ".icns":
        raise LauncherArtifactError(
            "Artifact option `icon_path` must point to a .icns file."
        )
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination_path = destination_dir / resolved_source.name
    shutil.copyfile(resolved_source, destination_path)
    return resolved_source.name


def _build_launcher_script(
    *,
    target_array_literal: str,
    target_command_shell: str,
    channel_literal: str,
) -> str:
    template = """#!/usr/bin/env bash
set -euo pipefail

TARGET_COMMAND=(__TARGET_ARRAY__)

run_launcher() {
  local workspace_arg="${1-}"
  local cmd=("${TARGET_COMMAND[@]}" launcher)
  if [[ -n "${workspace_arg}" ]]; then
    cmd+=(--workspace "${workspace_arg}")
  fi

  local output=""
  if output="$("${cmd[@]}" 2>&1)"; then
    return 0
  fi

  local exit_code=$?
  local guidance
  guidance="Setta could not start.\n\n${output}\n\nRepair launcher metadata with:\n__TARGET_SHELL__ launcher repair\n\nOr rerun setup with:\n__TARGET_SHELL__ launcher setup --channel __CHANNEL__"
  printf '%b\n' "${guidance}" >&2
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display alert \\\"Setta Launch Failed\\\" message \\\"Open Terminal and run 'setta launcher repair'.\\\" as critical buttons {\\\"OK\\\"} default button \\\"OK\\\"" >/dev/null 2>&1 || true
  fi
  return "${exit_code}"
}

if [[ $# -gt 0 ]]; then
  first_path="$1"
  if [[ -d "${first_path}" ]]; then
    run_launcher "${first_path}"
    exit $?
  fi
  if [[ -e "${first_path}" ]]; then
    run_launcher "$(dirname "${first_path}")"
    exit $?
  fi
fi

run_launcher
exit $?
"""
    return (
        template.replace("__TARGET_ARRAY__", target_array_literal)
        .replace("__TARGET_SHELL__", target_command_shell)
        .replace("__CHANNEL__", channel_literal)
    )
