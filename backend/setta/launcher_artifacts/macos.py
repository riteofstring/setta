import plistlib
import shlex
import shutil
from pathlib import Path

from setta.launcher_artifacts.common import (
    LauncherArtifactContext,
    LauncherArtifactError,
    build_scoped_launcher_shell_command,
    resolve_path_option_with_existing,
    shell_array_literal,
    write_text_file,
)

MANAGED_ARTIFACT_KEYS = ("macosApp",)
DEFAULT_MACOS_ICON_FILE_NAME = "Setta.icns"


def plan_macos_artifact_paths(*, context: LauncherArtifactContext) -> dict[str, Path]:
    app_path = resolve_path_option_with_existing(
        options=context.options,
        option_key="app_path",
        existing_managed_artifacts=context.existing_managed_artifacts,
        existing_key="macosApp",
        default_path=Path.home() / "Applications" / "Setta.app",
    )
    return {"macosApp": app_path}


def install_macos_artifacts(*, context: LauncherArtifactContext) -> dict[str, str]:
    planned_artifacts = plan_macos_artifact_paths(context=context)
    app_path = planned_artifacts["macosApp"]
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
    setta_home_literal = shlex.quote(context.setta_home)
    repair_command_literal = shlex.quote(
        build_scoped_launcher_shell_command(
            target_command=context.target_command,
            setta_home=context.setta_home,
            launcher_args=["repair"],
        )
    )
    setup_command_literal = shlex.quote(
        build_scoped_launcher_shell_command(
            target_command=context.target_command,
            setta_home=context.setta_home,
            launcher_args=["setup", "--channel", context.channel],
        )
    )
    launcher_content = _build_launcher_script(
        target_array_literal=target_array_literal,
        setta_home_literal=setta_home_literal,
        repair_command_literal=repair_command_literal,
        setup_command_literal=setup_command_literal,
    )

    info_plist_payload: dict[str, str] = {
        "CFBundleDisplayName": "Setta",
        "CFBundleExecutable": "setta-launcher",
        "CFBundleIdentifier": "dev.setta.desktop",
        "CFBundleName": "Setta",
        "CFBundlePackageType": "APPL",
        "CFBundleShortVersionString": "1.0",
        "CFBundleVersion": "1",
        "LSMinimumSystemVersion": "11.0",
    }
    if icon_file_name is not None:
        info_plist_payload["CFBundleIconFile"] = icon_file_name
    info_plist_content = plistlib.dumps(
        info_plist_payload,
        fmt=plistlib.FMT_XML,
        sort_keys=False,
    ).decode("utf-8")

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
        resolved_source = (
            Path(__file__).resolve(strict=False).parent
            / "assets"
            / DEFAULT_MACOS_ICON_FILE_NAME
        )
        if not resolved_source.exists() or not resolved_source.is_file():
            raise LauncherArtifactError(
                f"Bundled launcher icon is missing: {resolved_source}"
            )
    else:
        resolved_source = Path(source_path).expanduser().resolve(strict=False)
    if not resolved_source.exists() or not resolved_source.is_file():
        raise LauncherArtifactError(f"Icon file does not exist: {resolved_source}")
    if resolved_source.suffix.lower() != ".icns":
        raise LauncherArtifactError(
            "Artifact option `icon_path` must point to a .icns file."
        )
    icon_file_name = _sanitize_info_plist_text_value(
        raw_value=resolved_source.name,
        option_key="icon_path",
    )
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination_path = destination_dir / icon_file_name
    shutil.copyfile(resolved_source, destination_path)
    return icon_file_name


def _sanitize_info_plist_text_value(*, raw_value: str, option_key: str) -> str:
    if any(ord(char) < 0x20 or ord(char) == 0x7F for char in raw_value):
        raise LauncherArtifactError(
            f"Artifact option `{option_key}` must not contain control characters."
        )
    return raw_value


def _build_launcher_script(
    *,
    target_array_literal: str,
    setta_home_literal: str,
    repair_command_literal: str,
    setup_command_literal: str,
) -> str:
    template = """#!/usr/bin/env bash
set -euo pipefail

TARGET_COMMAND=(__TARGET_ARRAY__)
SETTA_HOME=__SETTA_HOME__
REPAIR_COMMAND=__REPAIR_COMMAND__
SETUP_COMMAND=__SETUP_COMMAND__

run_launcher() {
  local workspace_arg="${1-}"
  local cmd=("${TARGET_COMMAND[@]}" --setta-home "${SETTA_HOME}" launcher)
  if [[ -n "${workspace_arg}" ]]; then
    cmd+=(--workspace "${workspace_arg}")
  fi

  local output=""
  if output="$("${cmd[@]}" 2>&1)"; then
    return 0
  fi

  local exit_code=$?
  local guidance
  guidance="Setta could not start.\n\n${output}\n\nRepair launcher metadata with:\n${REPAIR_COMMAND}\n\nOr rerun setup with:\n${SETUP_COMMAND}"
  printf '%b\n' "${guidance}" >&2
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display alert \\\"Setta Launch Failed\\\" message \\\"Open Terminal and run: ${REPAIR_COMMAND}\\\" as critical buttons {\\\"OK\\\"} default button \\\"OK\\\"" >/dev/null 2>&1 || true
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
        .replace("__SETTA_HOME__", setta_home_literal)
        .replace("__REPAIR_COMMAND__", repair_command_literal)
        .replace("__SETUP_COMMAND__", setup_command_literal)
    )
