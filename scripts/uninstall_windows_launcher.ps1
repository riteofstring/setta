[CmdletBinding()]
param(
  [string]$SettaBin = "",
  [string]$SettaHome = ""
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

$launcherRemoveArgs = @()
if ($SettaHome) {
  $launcherRemoveArgs += @("--setta-home", $SettaHome)
}
$launcherRemoveArgs += @("launcher", "remove", "--json")

$removeJson = & $settaExecutable @launcherRemoveArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$payload = $removeJson | ConvertFrom-Json
if (-not $payload.ok) {
  Fail "setta launcher remove did not return a successful JSON payload."
}

Write-Output "Launcher metadata removed: $($payload.metadataRemoved)"
if ($payload.removedPaths) {
  foreach ($path in $payload.removedPaths) {
    Write-Output "Removed: $path"
  }
}
if ($payload.missingPaths) {
  foreach ($path in $payload.missingPaths) {
    Write-Output "Missing: $path"
  }
}
