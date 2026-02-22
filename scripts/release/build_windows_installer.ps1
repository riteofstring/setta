[CmdletBinding()]
param(
  [string]$OutputDir = "dist/native-installers/windows",
  [string]$Version = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

if ($env:SETTA_DESKTOP_INSTALLER_VERSION) {
  $Version = $env:SETTA_DESKTOP_INSTALLER_VERSION
}

if (-not $Version) {
  if ($env:SETTA_DESKTOP_INSTALLER_RELEASE_MODE -eq "1") {
    Fail "SETTA_DESKTOP_INSTALLER_VERSION is required when release mode is enabled."
  }
  $Version = "1.0.0"
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  Fail "Version must use MSI numeric format: major.minor.patch (got '$Version')."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$installScript = Join-Path $repoRoot "scripts\install_desktop_launcher.ps1"
if (-not (Test-Path -LiteralPath $installScript -PathType Leaf)) {
  Fail "Missing install_desktop_launcher.ps1 at $installScript"
}

$candle = Get-Command candle.exe -ErrorAction SilentlyContinue
if (-not $candle) {
  $candle = Get-Command candle -ErrorAction SilentlyContinue
}
$light = Get-Command light.exe -ErrorAction SilentlyContinue
if (-not $light) {
  $light = Get-Command light -ErrorAction SilentlyContinue
}
if (-not $candle -or -not $light) {
  Fail "WiX Toolset is required. Install candle/light (for example via choco install wixtoolset)."
}

$outputPath = Join-Path $repoRoot $OutputDir
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("setta-wix-" + [Guid]::NewGuid().ToString("N"))
$sourceDir = Join-Path $tempRoot "source"
New-Item -ItemType Directory -Path $sourceDir -Force | Out-Null

try {
  $installCopy = Join-Path $sourceDir "setta-install-desktop.ps1"
  Copy-Item -LiteralPath $installScript -Destination $installCopy -Force

  $removeScriptPath = Join-Path $sourceDir "setta-remove-desktop.ps1"
  @'
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

setta launcher remove --json @Args
'@ | Set-Content -LiteralPath $removeScriptPath -Encoding UTF8

  $wxsPath = Join-Path $tempRoot "installer.wxs"
  @"
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product
    Id="*"
    Name="Setta Desktop Bootstrap"
    Language="1033"
    Version="$(var.ProductVersion)"
    Manufacturer="Setta"
    UpgradeCode="F572E857-4B70-42C2-B896-377A25C5E414">
    <Package InstallerVersion="500" Compressed="yes" InstallScope="perMachine" />
    <MajorUpgrade DowngradeErrorMessage="A newer Setta Desktop Bootstrap installer is already installed." />
    <MediaTemplate EmbedCab="yes" />

    <Feature Id="MainFeature" Title="Setta Desktop Bootstrap" Level="1">
      <ComponentGroupRef Id="ProductComponents" />
    </Feature>
  </Product>

  <Fragment>
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="Setta Desktop">
          <Directory Id="INSTALLBIN" Name="bin" />
        </Directory>
      </Directory>
    </Directory>
  </Fragment>

  <Fragment>
    <ComponentGroup Id="ProductComponents" Directory="INSTALLBIN">
      <Component Id="InstallScriptComponent" Guid="*">
        <File Id="InstallScriptFile" Source="$(var.SourceDir)\setta-install-desktop.ps1" KeyPath="yes" />
      </Component>
      <Component Id="RemoveScriptComponent" Guid="*">
        <File Id="RemoveScriptFile" Source="$(var.SourceDir)\setta-remove-desktop.ps1" KeyPath="yes" />
      </Component>
    </ComponentGroup>
  </Fragment>
</Wix>
  "@ | Set-Content -LiteralPath $wxsPath -Encoding UTF8

  $wixobjPath = Join-Path $tempRoot "installer.wixobj"
  $candleArgs = @(
    "-nologo"
    "-dSourceDir=$sourceDir"
    "-dProductVersion=$Version"
    "-out"
    "$wixobjPath"
    "$wxsPath"
  )
  & $candle.Source @candleArgs

  $msiPath = Join-Path $outputPath ("SettaDesktop-$Version.msi")
  $lightArgs = @(
    "-nologo"
    "-out"
    "$msiPath"
    "$wixobjPath"
  )
  & $light.Source @lightArgs

  if (
    $env:SETTA_WINDOWS_SIGNTOOL_PATH -and
    $env:SETTA_WINDOWS_PFX_PATH -and
    $env:SETTA_WINDOWS_PFX_PASSWORD
  ) {
    $signArgs = @(
      "/f"
      "$env:SETTA_WINDOWS_PFX_PATH"
      "/p"
      "$env:SETTA_WINDOWS_PFX_PASSWORD"
      "/fd"
      "sha256"
      "/tr"
      "http://timestamp.digicert.com"
      "/td"
      "sha256"
      "$msiPath"
    )
    & $env:SETTA_WINDOWS_SIGNTOOL_PATH sign @signArgs
  }

  $hashPath = "$msiPath.sha256"
  $hash = Get-FileHash -LiteralPath $msiPath -Algorithm SHA256
  "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), (Split-Path -Leaf $msiPath) |
    Set-Content -LiteralPath $hashPath -Encoding ASCII

  Write-Output "Built Windows installer: $msiPath"
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
