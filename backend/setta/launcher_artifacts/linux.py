import shlex
import shutil
import stat
import subprocess
from pathlib import Path

from setta.launcher_artifacts.common import (
    LauncherArtifactContext,
    LauncherArtifactError,
    build_scoped_launcher_shell_command,
    existing_artifact_path,
    parse_bool_option,
    resolve_path_option_with_existing,
    shell_array_literal,
    validate_file_name_component,
    write_text_file,
)

MANAGED_ARTIFACT_KEYS = (
    "linuxDesktopEntry",
    "linuxWrapper",
    "linuxDesktopShortcut",
)


def plan_linux_artifact_paths(*, context: LauncherArtifactContext) -> dict[str, Path]:
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

    desktop_entry_name_option = context.options.get("desktop_entry_name")
    if desktop_entry_name_option is None:
        if existing_desktop_entry is not None:
            desktop_entry_name_option = existing_desktop_entry.name
        else:
            desktop_entry_name_option = "setta.desktop"
    desktop_entry_name = validate_file_name_component(
        option_key="desktop_entry_name",
        raw_value=desktop_entry_name_option,
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

    planned_artifacts: dict[str, Path] = {
        "linuxDesktopEntry": desktop_entry_path,
        "linuxWrapper": wrapper_path,
    }
    if create_desktop_shortcut:
        planned_artifacts["linuxDesktopShortcut"] = desktop_shortcut_path
    return planned_artifacts


def install_linux_artifacts(*, context: LauncherArtifactContext) -> dict[str, str]:
    planned_artifacts = plan_linux_artifact_paths(context=context)

    desktop_entry_path = planned_artifacts["linuxDesktopEntry"]
    wrapper_path = planned_artifacts["linuxWrapper"]
    applications_dir = desktop_entry_path.parent

    app_name = _sanitize_desktop_entry_text_value(
        raw_value=context.options.get("app_name", "Setta"),
        option_key="app_name",
    )

    icon_path_raw = context.options.get("icon_path")
    icon_path: str | None = None
    if icon_path_raw is not None:
        resolved_icon_path = Path(icon_path_raw).expanduser().resolve(strict=False)
        if not resolved_icon_path.exists() or not resolved_icon_path.is_file():
            raise LauncherArtifactError(
                f"Icon file does not exist: {resolved_icon_path}"
            )
        icon_path = _sanitize_desktop_entry_text_value(
            raw_value=str(resolved_icon_path),
            option_key="icon_path",
        )

    create_desktop_shortcut = "linuxDesktopShortcut" in planned_artifacts
    desktop_shortcut_path = planned_artifacts.get("linuxDesktopShortcut")

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

    wrapper_content = _build_linux_wrapper_script(
        target_array_literal=target_array_literal,
        setta_home_literal=setta_home_literal,
        repair_command_literal=repair_command_literal,
        setup_command_literal=setup_command_literal,
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
    if create_desktop_shortcut and desktop_shortcut_path is not None:
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

    _refresh_desktop_database(applications_dir)
    return artifacts


def _build_linux_wrapper_script(
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
  show_failure_dialog "Setta could not start. Open a terminal and run: ${REPAIR_COMMAND}"
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


def _build_desktop_entry(
    *,
    app_name: str,
    wrapper_path: Path,
    icon_path: str | None,
) -> str:
    escaped_wrapper = _escape_desktop_exec_argument(str(wrapper_path))
    icon_line = ""
    if icon_path is not None:
        icon_line = f"Icon={icon_path}\n"
    return (
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Version=1.0\n"
        f"Name={app_name}\n"
        "Comment=Launch Setta\n"
        f"Exec={escaped_wrapper} %F\n"
        f"{icon_line}"
        "Terminal=false\n"
        "Categories=Development;IDE;\n"
        "StartupNotify=true\n"
    )


def _escape_desktop_exec_argument(raw_value: str) -> str:
    if "\n" in raw_value or "\r" in raw_value:
        raise LauncherArtifactError(
            "Launcher wrapper path must not contain newline characters."
        )
    escaped = raw_value.replace("\\", "\\\\")
    escaped = escaped.replace('"', '\\"')
    escaped = escaped.replace("$", "\\$")
    escaped = escaped.replace("`", "\\`")
    escaped = escaped.replace("%", "%%")
    return f'"{escaped}"'


def _sanitize_desktop_entry_text_value(*, raw_value: object, option_key: str) -> str:
    if not isinstance(raw_value, str):
        raise LauncherArtifactError(f"Artifact option `{option_key}` must be a string.")
    normalized = raw_value.strip()
    if not normalized:
        raise LauncherArtifactError(
            f"Artifact option `{option_key}` must be non-empty."
        )
    if any(ord(char) < 0x20 or ord(char) == 0x7F for char in normalized):
        raise LauncherArtifactError(
            f"Artifact option `{option_key}` must not contain control characters."
        )
    return normalized


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
