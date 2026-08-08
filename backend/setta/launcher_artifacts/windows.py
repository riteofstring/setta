import os
import shutil
import subprocess
from pathlib import Path

from setta.launcher_artifacts.common import (
    LauncherArtifactContext,
    LauncherArtifactError,
    build_scoped_launcher_command,
    existing_artifact_path,
    parse_bool_option,
    resolve_path_option_with_existing,
    validate_file_name_component,
    write_text_file,
)

MANAGED_ARTIFACT_KEYS = (
    "windowsWrapper",
    "windowsStartMenuShortcut",
    "windowsDesktopShortcut",
)


def plan_windows_artifact_paths(
    *,
    context: LauncherArtifactContext,
) -> dict[str, Path]:
    app_name = validate_file_name_component(
        option_key="app_name",
        raw_value=context.options.get("app_name", "Setta"),
    )
    local_app_data = _resolve_local_app_data()
    programs_dir = _resolve_programs_dir()
    desktop_dir = _resolve_desktop_dir()

    wrapper_path = resolve_path_option_with_existing(
        options=context.options,
        option_key="wrapper_path",
        existing_managed_artifacts=context.existing_managed_artifacts,
        existing_key="windowsWrapper",
        default_path=local_app_data / "Setta" / "Launcher" / "setta-launcher.cmd",
    )
    start_menu_shortcut_path = resolve_path_option_with_existing(
        options=context.options,
        option_key="start_menu_shortcut_path",
        existing_managed_artifacts=context.existing_managed_artifacts,
        existing_key="windowsStartMenuShortcut",
        default_path=programs_dir / f"{app_name}.lnk",
    )
    existing_desktop_shortcut = existing_artifact_path(
        existing_managed_artifacts=context.existing_managed_artifacts,
        key="windowsDesktopShortcut",
    )
    create_desktop_shortcut = parse_bool_option(
        options=context.options,
        key="desktop_shortcut",
        default=existing_desktop_shortcut is not None,
    )
    desktop_shortcut_path = resolve_path_option_with_existing(
        options=context.options,
        option_key="desktop_shortcut_path",
        existing_managed_artifacts=context.existing_managed_artifacts,
        existing_key="windowsDesktopShortcut",
        default_path=desktop_dir / f"{app_name}.lnk",
    )
    planned_artifacts: dict[str, Path] = {
        "windowsWrapper": wrapper_path,
        "windowsStartMenuShortcut": start_menu_shortcut_path,
    }
    if create_desktop_shortcut:
        planned_artifacts["windowsDesktopShortcut"] = desktop_shortcut_path
    return planned_artifacts


def install_windows_artifacts(*, context: LauncherArtifactContext) -> dict[str, str]:
    planned_artifacts = plan_windows_artifact_paths(context=context)
    wrapper_path = planned_artifacts["windowsWrapper"]
    start_menu_shortcut_path = planned_artifacts["windowsStartMenuShortcut"]
    create_desktop_shortcut = "windowsDesktopShortcut" in planned_artifacts
    desktop_shortcut_path = planned_artifacts.get("windowsDesktopShortcut")

    wrapper_content = _build_windows_wrapper(
        target_command=context.target_command,
        setta_home=context.setta_home,
        channel=context.channel,
    )
    write_text_file(path=wrapper_path, content=wrapper_content, executable=False)

    _create_windows_shortcut(
        shortcut_path=start_menu_shortcut_path,
        target_path=wrapper_path,
    )
    artifacts = {
        "windowsWrapper": str(wrapper_path),
        "windowsStartMenuShortcut": str(start_menu_shortcut_path),
    }

    if create_desktop_shortcut and desktop_shortcut_path is not None:
        _create_windows_shortcut(
            shortcut_path=desktop_shortcut_path,
            target_path=wrapper_path,
        )
        artifacts["windowsDesktopShortcut"] = str(desktop_shortcut_path)

    return artifacts


def _resolve_local_app_data() -> Path:
    raw = os.environ.get("LOCALAPPDATA")
    if raw and raw.strip():
        return Path(raw.strip()).expanduser().resolve(strict=False)
    return (Path.home() / "AppData" / "Local").resolve(strict=False)


def _resolve_programs_dir() -> Path:
    raw_appdata = os.environ.get("APPDATA")
    if raw_appdata and raw_appdata.strip():
        return (
            Path(raw_appdata.strip())
            / "Microsoft"
            / "Windows"
            / "Start Menu"
            / "Programs"
        ).resolve(strict=False)
    return (
        Path.home()
        / "AppData"
        / "Roaming"
        / "Microsoft"
        / "Windows"
        / "Start Menu"
        / "Programs"
    ).resolve(strict=False)


def _resolve_desktop_dir() -> Path:
    raw = os.environ.get("USERPROFILE")
    if raw and raw.strip():
        return (Path(raw.strip()) / "Desktop").resolve(strict=False)
    return (Path.home() / "Desktop").resolve(strict=False)


def _build_windows_wrapper(
    *, target_command: list[str], setta_home: str, channel: str
) -> str:
    quoted_target_command = " ".join(_quote_for_cmd(part) for part in target_command)
    quoted_setta_home = _quote_for_cmd(setta_home)
    repair_command = " ".join(
        _quote_for_cmd(part)
        for part in build_scoped_launcher_command(
            target_command=target_command,
            setta_home=setta_home,
            launcher_args=["repair"],
        )
    )
    setup_command = " ".join(
        _quote_for_cmd(part)
        for part in build_scoped_launcher_command(
            target_command=target_command,
            setta_home=setta_home,
            launcher_args=["setup", "--channel", channel],
        )
    )
    return f"""@echo off
setlocal
set "setta_launcher_log=%TEMP%\\setta-launcher-error-%RANDOM%%RANDOM%.log"
set "setta_launcher_repair_cmd={repair_command}"
set "setta_launcher_setup_cmd={setup_command}"

if not "%~1"=="" (
  set "first_path=%~1"
  if exist "%first_path%\\*" (
    call :launch_with_workspace "%first_path%"
    exit /b %ERRORLEVEL%
  )
  if exist "%first_path%" (
    for %%I in ("%first_path%") do set "first_dir=%%~dpI"
    if defined first_dir (
      if "%first_dir:~-1%"=="\\" set "first_dir=%first_dir:~0,-1%"
      call :launch_with_workspace "%first_dir%"
      exit /b %ERRORLEVEL%
    )
  )
)
call :launch_default
exit /b %ERRORLEVEL%

:launch_with_workspace
{quoted_target_command} --setta-home {quoted_setta_home} launcher --workspace "%~1" > "%setta_launcher_log%" 2>&1
set "setta_launcher_exit=%ERRORLEVEL%"
if "%setta_launcher_exit%"=="0" (
  if exist "%setta_launcher_log%" del /q "%setta_launcher_log%" >nul 2>&1
  exit /b 0
)
call :show_failure
exit /b %setta_launcher_exit%

:launch_default
{quoted_target_command} --setta-home {quoted_setta_home} launcher > "%setta_launcher_log%" 2>&1
set "setta_launcher_exit=%ERRORLEVEL%"
if "%setta_launcher_exit%"=="0" (
  if exist "%setta_launcher_log%" del /q "%setta_launcher_log%" >nul 2>&1
  exit /b 0
)
call :show_failure
exit /b %setta_launcher_exit%

:show_failure
echo Setta could not start.>&2
if exist "%setta_launcher_log%" (
  type "%setta_launcher_log%" >&2
)
echo Repair launcher metadata with: %setta_launcher_repair_cmd%>&2
echo Or rerun setup with: %setta_launcher_setup_cmd%>&2
powershell -NoProfile -ExecutionPolicy Bypass -Command "$msg='Setta could not start. Open PowerShell and run: %setta_launcher_repair_cmd%'; try {{ Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($msg,'Setta Launch Failed','OK','Error') | Out-Null }} catch {{ }}"
exit /b 0
"""


def _quote_for_cmd(raw: str) -> str:
    return '"' + raw.replace('"', '""') + '"'


def _create_windows_shortcut(*, shortcut_path: Path, target_path: Path) -> None:
    powershell = shutil.which("powershell")
    if powershell is None:
        powershell = shutil.which("pwsh")
    if powershell is None:
        raise LauncherArtifactError(
            "PowerShell is required to create Windows launcher shortcuts."
        )

    script = (
        "param([string]$ShortcutPath,[string]$TargetPath);"
        "$shortcutDir = Split-Path -Parent $ShortcutPath;"
        "if ($shortcutDir) { New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null };"
        "$wshShell = New-Object -ComObject WScript.Shell;"
        "$shortcut = $wshShell.CreateShortcut($ShortcutPath);"
        "$shortcut.TargetPath = $TargetPath;"
        "$shortcut.WorkingDirectory = Split-Path -Parent $TargetPath;"
        "$shortcut.Description = 'Launch Setta';"
        "$shortcut.Save();"
    )
    result = subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
            "-ShortcutPath",
            str(shortcut_path),
            "-TargetPath",
            str(target_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        if not detail:
            detail = f"PowerShell exited with status {result.returncode}."
        raise LauncherArtifactError(f"Failed to create Windows shortcut: {detail}")
