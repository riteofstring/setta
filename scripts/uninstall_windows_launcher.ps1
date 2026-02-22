[CmdletBinding()]
param(
  [string]$AppName = "Setta",
  [string]$SettaBin = "",
  [string]$SettaHome = "",
  [string]$WrapperPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AbsolutePath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

if ([string]::IsNullOrWhiteSpace($AppName)) {
  Write-Error "--AppName must be non-empty."
  exit 1
}

$programsDir = [Environment]::GetFolderPath("Programs")
$desktopDir = [Environment]::GetFolderPath("DesktopDirectory")
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
  if (Test-Path -LiteralPath $settaCandidate -PathType Leaf) {
    $settaExecutable = $settaCandidate
  }
} else {
  $resolvedSetta = Get-Command setta -ErrorAction SilentlyContinue
  if ($resolvedSetta) {
    $settaExecutable = $resolvedSetta.Source
  }
}

if ($settaExecutable) {
  $launcherUninstallArgs = @()
  if ($SettaHome) {
    $launcherUninstallArgs += @("--setta-home", $SettaHome)
  }
  $launcherUninstallArgs += @("launcher", "remove", "--json")
  $null = & $settaExecutable @launcherUninstallArgs
}

$pathsToRemove = @(
  $startMenuShortcutPath,
  $desktopShortcutPath,
  $wrapperPathResolved
)
foreach ($path in $pathsToRemove) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force -Recurse
  }
}

$wrapperDir = Split-Path -Parent $wrapperPathResolved
if ($wrapperDir -and (Test-Path -LiteralPath $wrapperDir -PathType Container)) {
  $remaining = @(Get-ChildItem -LiteralPath $wrapperDir -Force)
  if ($remaining.Count -eq 0) {
    Remove-Item -LiteralPath $wrapperDir -Force
  }
}

Write-Output "Removed Windows launcher artifacts:"
Write-Output "  $startMenuShortcutPath"
Write-Output "  $desktopShortcutPath"
Write-Output "  $wrapperPathResolved"
