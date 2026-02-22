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
if not "%~1"=="" (
  set "first_path=%~1"
  if exist "%first_path%\*" (
    $targetCommandForCmd launcher --workspace "%first_path%"
    exit /b %ERRORLEVEL%
  )
  if exist "%first_path%" (
    for %%I in ("%first_path%") do set "first_dir=%%~dpI"
    if defined first_dir (
      if "%first_dir:~-1%"=="\" set "first_dir=%first_dir:~0,-1%"
      $targetCommandForCmd launcher --workspace "%first_dir%"
      exit /b %ERRORLEVEL%
    )
  )
)
$targetCommandForCmd launcher
exit /b %ERRORLEVEL%
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
