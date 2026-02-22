[CmdletBinding()]
param(
  [string]$Package = "setta",
  [string]$Channel = "uv-tool-script",
  [ValidateSet("browser", "chrome-app")]
  [string]$OpenMode = "browser",
  [string]$SettaHome = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uvCommand) {
  Fail "uv is required but was not found on PATH. Install uv from https://docs.astral.sh/uv/getting-started/installation/"
}

& $uvCommand.Source tool install --upgrade $Package
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$uvToolBinDir = (& $uvCommand.Source tool dir --bin).Trim()
if (-not $uvToolBinDir) {
  Fail "Could not resolve uv tool executable directory."
}

$settaExecutable = Join-Path $uvToolBinDir "setta.exe"
if (-not (Test-Path -LiteralPath $settaExecutable -PathType Leaf)) {
  $settaExecutable = Join-Path $uvToolBinDir "setta"
}
if (-not (Test-Path -LiteralPath $settaExecutable -PathType Leaf)) {
  Fail "Expected Setta executable under $uvToolBinDir, but none was found."
}

$launcherInstallArgs = @()
if ($SettaHome) {
  $launcherInstallArgs += @("--setta-home", $SettaHome)
}
$launcherInstallArgs += @(
  "launcher",
  "setup",
  "--json",
  "--channel",
  $Channel,
  "--open-mode",
  $OpenMode
)

$installJson = & $settaExecutable @launcherInstallArgs
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

$targetCommand = ($payload.targetCommand | ForEach-Object { "$_" }) -join " "
Write-Output "Launcher metadata written: $($payload.metadataPath)"
Write-Output "Bound launcher target: $targetCommand"
