[CmdletBinding()]
param(
  [string]$AppName = "Setta",
  [string]$SettaBin = "",
  [string]$SettaHome = "",
  [string]$WrapperPath = "",
  [string]$DesktopShortcutPath = "",
  [string]$Channel = "windows-script",
  [ValidateSet("browser", "chrome-app")]
  [string]$OpenMode = "chrome-app",
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

if ([string]::IsNullOrWhiteSpace($AppName)) {
  Fail "--AppName must be non-empty."
}
if ([string]::IsNullOrWhiteSpace($Channel)) {
  Fail "--Channel must be non-empty."
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

$launcherSetupArgs = @()
if ($SettaHome) {
  $launcherSetupArgs += @("--setta-home", $SettaHome)
}
$launcherSetupArgs += @(
  "launcher",
  "setup",
  "--json",
  "--channel",
  $Channel,
  "--install-source",
  "installer-managed",
  "--open-mode",
  $OpenMode,
  "--artifact-option",
  "app_name=$AppName"
)
if ($WrapperPath) {
  $launcherSetupArgs += @(
    "--artifact-option",
    "wrapper_path=$(Resolve-AbsolutePath $WrapperPath)"
  )
}
if ($DesktopShortcut.IsPresent) {
  $launcherSetupArgs += @("--artifact-option", "desktop_shortcut=true")
  if ($DesktopShortcutPath) {
    $launcherSetupArgs += @(
      "--artifact-option",
      "desktop_shortcut_path=$(Resolve-AbsolutePath $DesktopShortcutPath)"
    )
  }
} else {
  $launcherSetupArgs += @("--artifact-option", "desktop_shortcut=false")
}

$installJson = & $settaExecutable @launcherSetupArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$payload = $installJson | ConvertFrom-Json
if (-not $payload.ok) {
  Fail "setta launcher setup did not return a successful JSON payload."
}
if (-not $payload.metadataPath) {
  Fail "launcher setup payload is missing metadataPath."
}
if (-not $payload.targetCommand) {
  Fail "launcher setup payload is missing targetCommand."
}

$targetCommand = ($payload.targetCommand | ForEach-Object { "$($_)" }) -join " "
Write-Output "Launcher metadata written: $($payload.metadataPath)"
Write-Output "Bound launcher target: $targetCommand"

if ($payload.managedArtifacts) {
  if ($payload.managedArtifacts.windowsWrapper) {
    Write-Output "Managed wrapper: $($payload.managedArtifacts.windowsWrapper)"
  }
  if ($payload.managedArtifacts.windowsStartMenuShortcut) {
    Write-Output "Managed Start Menu shortcut: $($payload.managedArtifacts.windowsStartMenuShortcut)"
  }
  if ($payload.managedArtifacts.windowsDesktopShortcut) {
    Write-Output "Managed Desktop shortcut: $($payload.managedArtifacts.windowsDesktopShortcut)"
  }
}
