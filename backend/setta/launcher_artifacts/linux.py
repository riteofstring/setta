import shlex
import shutil
import stat
import subprocess
from pathlib import Path

from setta.launcher_artifacts.common import (
    LauncherArtifactContext,
    LauncherArtifactError,
    existing_artifact_path,
    parse_bool_option,
    resolve_path_option_with_existing,
    shell_array_literal,
    shell_command,
    write_text_file,
)

MANAGED_ARTIFACT_KEYS = (
    "linuxDesktopEntry",
    "linuxWrapper",
    "linuxDesktopShortcut",
)


def install_linux_artifacts(*, context: LauncherArtifactContext) -> dict[str, str]:
    existing_desktop_entry = existing_artifact_path(
        existing_managed_artifacts=context.existing_managed_artifacts,
        key="linuxDesktopEntry",
    )
    existing_shortcut = existing_artifact_path(
        existing_managed_artifacts=context.existing_managed_artifacts,
        key="linuxDesktopShortcut",
    )

    applications_dir_option = context.options.get("applications_dir")
    if applications_dir_option is not None:
        applications_dir = (
            Path(applications_dir_option).expanduser().resolve(strict=False)
        )
    elif existing_desktop_entry is not None:
        applications_dir = existing_desktop_entry.parent
    else:
        applications_dir = (Path.home() / ".local" / "share" / "applications").resolve(
            strict=False
        )

    desktop_entry_name = context.options.get("desktop_entry_name")
    if desktop_entry_name is None:
        if existing_desktop_entry is not None:
            desktop_entry_name = existing_desktop_entry.name
        else:
            desktop_entry_name = "setta.desktop"
    desktop_entry_name = desktop_entry_name.strip()
    if not desktop_entry_name:
        raise LauncherArtifactError(
            "Artifact option `desktop_entry_name` must be non-empty."
        )
    desktop_entry_path = (applications_dir / desktop_entry_name).resolve(strict=False)

    wrapper_path = resolve_path_option_with_existing(
        options=context.options,
        option_key="wrapper_path",
        existing_managed_artifacts=context.existing_managed_artifacts,
        existing_key="linuxWrapper",
        default_path=Path.home()
        / ".local"
        / "share"
        / "setta"
        / "launcher"
        / "setta-launcher",
    )

    app_name = context.options.get("app_name", "Setta").strip()
    if not app_name:
        raise LauncherArtifactError("Artifact option `app_name` must be non-empty.")

    icon_path_raw = context.options.get("icon_path")
    icon_path: Path | None = None
    if icon_path_raw is not None:
        icon_path = Path(icon_path_raw).expanduser().resolve(strict=False)
        if not icon_path.exists() or not icon_path.is_file():
            raise LauncherArtifactError(f"Icon file does not exist: {icon_path}")

    create_desktop_shortcut = parse_bool_option(
        options=context.options,
        key="desktop_shortcut",
        default=existing_shortcut is not None,
    )
    desktop_shortcut_path = resolve_path_option_with_existing(
        options=context.options,
        option_key="desktop_shortcut_path",
        existing_managed_artifacts=context.existing_managed_artifacts,
        existing_key="linuxDesktopShortcut",
        default_path=Path.home() / "Desktop" / desktop_entry_name,
    )

    target_array_literal = shell_array_literal(context.target_command)
    target_command_shell = shell_command(context.target_command)
    channel_literal = shlex.quote(context.channel)

    wrapper_content = _build_linux_wrapper_script(
        target_array_literal=target_array_literal,
        target_command_shell=target_command_shell,
        channel_literal=channel_literal,
    )
    write_text_file(path=wrapper_path, content=wrapper_content, executable=True)

    desktop_entry_content = _build_desktop_entry(
        app_name=app_name,
        wrapper_path=wrapper_path,
        icon_path=icon_path,
    )
    write_text_file(path=desktop_entry_path, content=desktop_entry_content)
    desktop_entry_path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)

    artifacts = {
        "linuxDesktopEntry": str(desktop_entry_path),
        "linuxWrapper": str(wrapper_path),
    }
    if create_desktop_shortcut:
        desktop_shortcut_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(desktop_entry_path, desktop_shortcut_path)
        desktop_shortcut_path.chmod(
            stat.S_IRUSR
            | stat.S_IWUSR
            | stat.S_IXUSR
            | stat.S_IRGRP
            | stat.S_IXGRP
            | stat.S_IROTH
            | stat.S_IXOTH
        )
        artifacts["linuxDesktopShortcut"] = str(desktop_shortcut_path)
    elif existing_shortcut is not None and existing_shortcut.exists():
        existing_shortcut.unlink()

    _refresh_desktop_database(applications_dir)
    return artifacts


def _build_linux_wrapper_script(
    *,
    target_array_literal: str,
    target_command_shell: str,
    channel_literal: str,
) -> str:
    template = """#!/usr/bin/env bash
set -euo pipefail

TARGET_COMMAND=(__TARGET_ARRAY__)

show_failure_dialog() {
  local message="${1-}"
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="Setta Launch Failed" --text="${message}" --width=460 >/dev/null 2>&1 || true
    return
  fi
  if command -v kdialog >/dev/null 2>&1; then
    kdialog --error "${message}" --title "Setta Launch Failed" >/dev/null 2>&1 || true
  fi
}

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
  show_failure_dialog "Setta could not start. Open a terminal and run 'setta launcher repair'."
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


def _build_desktop_entry(
    *,
    app_name: str,
    wrapper_path: Path,
    icon_path: Path | None,
) -> str:
    quoted_wrapper = shlex.quote(str(wrapper_path))
    icon_line = ""
    if icon_path is not None:
        icon_line = f"Icon={icon_path}\n"
    return (
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Version=1.0\n"
        f"Name={app_name}\n"
        "Comment=Launch Setta\n"
        f"Exec={quoted_wrapper} %F\n"
        f"{icon_line}"
        "Terminal=false\n"
        "Categories=Development;IDE;\n"
        "StartupNotify=true\n"
    )


def _refresh_desktop_database(applications_dir: Path) -> None:
    executable = shutil.which("update-desktop-database")
    if executable is None:
        return
    subprocess.run(
        [executable, str(applications_dir)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
