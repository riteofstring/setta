[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$MsiPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

if (-not (Test-Path -LiteralPath $MsiPath -PathType Leaf)) {
  Fail "MSI not found: $MsiPath"
}

$resolvedMsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
$msiBaseName = [System.IO.Path]::GetFileNameWithoutExtension($resolvedMsiPath)
$expectedVersionMatch = [System.Text.RegularExpressions.Regex]::Match(
  $msiBaseName,
  '^SettaDesktop-(\d+\.\d+\.\d+)$'
)
if (-not $expectedVersionMatch.Success) {
  Fail "Could not derive expected Setta version from MSI name: $resolvedMsiPath"
}
$expectedSettaVersion = $expectedVersionMatch.Groups[1].Value
Write-Output "[native-smoke][windows] Installing $resolvedMsiPath ..."
$installProcess = Start-Process `
  -FilePath "msiexec.exe" `
  -ArgumentList @("/i", "`"$resolvedMsiPath`"", "/qn", "/norestart") `
  -Wait `
  -PassThru
if ($installProcess.ExitCode -ne 0) {
  Fail "msiexec failed with exit code $($installProcess.ExitCode)."
}

$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uvCommand) {
  Fail "uv is required for native installer smoke tests."
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

$statusJson = & $settaExecutable launcher status --json
if ($LASTEXITCODE -ne 0) {
  Fail "setta launcher status failed after MSI install."
}
$payload = $statusJson | ConvertFrom-Json
if (-not $payload.ok) {
  Fail "launcher status payload was not successful after MSI install."
}
if (-not $payload.installed) {
  Fail "native MSI install did not bootstrap launcher metadata."
}
if (-not $payload.managedArtifacts) {
  Fail "native MSI install did not report managed artifacts."
}
if ($payload.settaVersion -ne $expectedSettaVersion) {
  Fail "native MSI install bootstrapped Setta '$($payload.settaVersion)' but expected '$expectedSettaVersion'."
}

Write-Output "[native-smoke][windows] launcher status OK"
