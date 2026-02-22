# Install Setta Desktop on Windows

This guide is for end users who want Setta Desktop without cloning this repository.

## Script Quickstart

1. Install `uv` if it is not already installed (PowerShell):
   - `irm https://astral.sh/uv/install.ps1 | iex`
2. Run the desktop bootstrap script from the latest release (PowerShell):
   - `irm https://github.com/riteofstring/setta/releases/latest/download/setta-install-desktop.ps1 | iex`
3. Verify launcher status:
   - `setta launcher status --json`

## Native Installer Quickstart

1. Download `SettaDesktop-<version>.msi` from the latest GitHub release.
2. Install interactively by opening the `.msi`, or non-interactively:
   - `msiexec /i SettaDesktop-<version>.msi /qn /norestart`
3. Verify:
   - `setta launcher status --json`

## Optional Launcher Mode

- Browser mode (default):
  - `setta launcher`
- Chrome app mode:
  - `setta launcher setup --open-mode chrome-app`
  - `setta launcher`

## Remove Desktop Launcher

- `setta launcher remove --json`
