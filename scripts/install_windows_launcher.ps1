[CmdletBinding()]
param(
  [string]$AppName = "Setta",
  [string]$SettaBin = "",
  [string]$SettaHome = "",
  [string]$WrapperPath = "",
  [string]$Channel = "windows-script",
  [ValidateSet("browser", "chrome-app")]
  [string]$OpenMode = "browser",
  [switch]$DesktopShortcut
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

function Resolve-AbsolutePath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

function New-LauncherShortcut(
  [string]$ShortcutPath,
  [string]$TargetPath
) {
  $shortcutDir = Split-Path -Parent $ShortcutPath
  if ($shortcutDir) {
    New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null
  }
  $wshShell = New-Object -ComObject WScript.Shell
  $shortcut = $wshShell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $TargetPath
  $shortcut.WorkingDirectory = (Split-Path -Parent $TargetPath)
  $shortcut.Description = "Launch Setta"
  $shortcut.Save()
}

if ([string]::IsNullOrWhiteSpace($AppName)) {
  Fail "--AppName must be non-empty."
}
if ([string]::IsNullOrWhiteSpace($Channel)) {
  Fail "--Channel must be non-empty."
}

$programsDir = [Environment]::GetFolderPath("Programs")
if (-not $programsDir) {
  Fail "Could not resolve the Start Menu Programs directory."
}
$desktopDir = [Environment]::GetFolderPath("DesktopDirectory")
if (-not $desktopDir) {
  Fail "Could not resolve the Desktop directory."
}

$localAppData = $env:LOCALAPPDATA
if (-not $localAppData) {
  $localAppData = Join-Path $HOME "AppData\\Local"
}

$startMenuShortcutPath = Resolve-AbsolutePath (Join-Path $programsDir "$AppName.lnk")
$desktopShortcutPath = Resolve-AbsolutePath (Join-Path $desktopDir "$AppName.lnk")
$wrapperPathResolved = if ($WrapperPath) {
  Resolve-AbsolutePath $WrapperPath
} else {
  Resolve-AbsolutePath (Join-Path $localAppData "Setta\\Launcher\\setta-launcher.cmd")
}

$settaExecutable = ""
if ($SettaBin) {
  $settaCandidate = Resolve-AbsolutePath $SettaBin
  if (-not (Test-Path -LiteralPath $settaCandidate -PathType Leaf)) {
    Fail "Setta executable does not exist: $settaCandidate"
  }
  $settaExecutable = $settaCandidate
} else {
  $resolvedSetta = Get-Command setta -ErrorAction SilentlyContinue
  if (-not $resolvedSetta) {
    Fail "Could not find setta executable. Use -SettaBin PATH."
  }
  $settaExecutable = $resolvedSetta.Source
}

$launcherInstallArgs = @()
if ($SettaHome) {
  $launcherInstallArgs += @("--setta-home", $SettaHome)
}
$launcherInstallArgs += @(
  "launcher",
  "install",
  "--json",
  "--channel",
  $Channel,
  "--open-mode",
  $OpenMode,
  "--managed-artifact",
  "windowsWrapper=$wrapperPathResolved",
  "--managed-artifact",
  "windowsStartMenuShortcut=$startMenuShortcutPath"
)
if ($DesktopShortcut.IsPresent) {
  $launcherInstallArgs += @(
    "--managed-artifact",
    "windowsDesktopShortcut=$desktopShortcutPath"
  )
}

$installJson = & $settaExecutable @launcherInstallArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$payload = $installJson | ConvertFrom-Json
if (-not $payload -or -not $payload.ok) {
  Fail "setta launcher install did not return a successful JSON payload."
}
if (-not $payload.targetCommand) {
  Fail "launcher install payload is missing targetCommand."
}

$targetCommandParts = @()
foreach ($part in @($payload.targetCommand)) {
  $partString = [string]$part
  if ([string]::IsNullOrWhiteSpace($partString)) {
    Fail "targetCommand includes an empty value."
  }
  $targetCommandParts += '"' + $partString.Replace('"', '""') + '"'
}
$targetCommandForCmd = $targetCommandParts -join " "

$wrapperDir = Split-Path -Parent $wrapperPathResolved
if (-not [string]::IsNullOrWhiteSpace($wrapperDir)) {
  New-Item -ItemType Directory -Path $wrapperDir -Force | Out-Null
}

$wrapperContent = @"
@echo off
setlocal
set "setta_launcher_log=%TEMP%\setta-launcher-error-%RANDOM%%RANDOM%.log"

if not "%~1"=="" (
  set "first_path=%~1"
  if exist "%first_path%\*" (
    call :launch_with_workspace "%first_path%"
    exit /b %ERRORLEVEL%
  )
  if exist "%first_path%" (
    for %%I in ("%first_path%") do set "first_dir=%%~dpI"
    if defined first_dir (
      if "%first_dir:~-1%"=="\" set "first_dir=%first_dir:~0,-1%"
      call :launch_with_workspace "%first_dir%"
      exit /b %ERRORLEVEL%
    )
  )
)
call :launch_default
exit /b %ERRORLEVEL%

:launch_with_workspace
$targetCommandForCmd launcher --workspace %1 > "%setta_launcher_log%" 2>&1
set "setta_launcher_exit=%ERRORLEVEL%"
if "%setta_launcher_exit%"=="0" (
  if exist "%setta_launcher_log%" del /q "%setta_launcher_log%" >nul 2>&1
  exit /b 0
)
call :show_failure
exit /b %setta_launcher_exit%

:launch_default
$targetCommandForCmd launcher > "%setta_launcher_log%" 2>&1
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "$msg='Setta could not start. Open PowerShell and rerun scripts\install_windows_launcher.ps1 to repair the launcher.'; try { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($msg,'Setta Launch Failed','OK','Error') | Out-Null } catch { }"
exit /b 0
"@
Set-Content -LiteralPath $wrapperPathResolved -Value $wrapperContent -Encoding ascii

New-LauncherShortcut -ShortcutPath $startMenuShortcutPath -TargetPath $wrapperPathResolved
if ($DesktopShortcut.IsPresent) {
  New-LauncherShortcut -ShortcutPath $desktopShortcutPath -TargetPath $wrapperPathResolved
}

Write-Output "Installed Windows launcher wrapper: $wrapperPathResolved"
Write-Output "Installed Start Menu shortcut: $startMenuShortcutPath"
if ($DesktopShortcut.IsPresent) {
  Write-Output "Installed Desktop shortcut: $desktopShortcutPath"
}
