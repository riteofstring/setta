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

1. Install `uv` if it is not already installed (PowerShell):
   - `irm https://astral.sh/uv/install.ps1 | iex`
2. Download `SettaDesktop-<version>.msi` from the latest GitHub release.
3. Install interactively by opening the `.msi`, or non-interactively:
   - `msiexec /i SettaDesktop-<version>.msi /qn /norestart`
4. Verify:
   - `setta launcher status --json`

The `.msi` runs desktop bootstrap during installation, so no extra bootstrap command is required after `msiexec /i`.

## Optional Launcher Mode

- Chrome app mode (default):
  - `setta launcher`
- Browser mode:
  - `setta launcher setup --open-mode browser`
  - `setta launcher`

## Remove Desktop Launcher

- `setta launcher remove --json`
