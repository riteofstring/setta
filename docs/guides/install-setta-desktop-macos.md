# Install Setta Desktop on macOS

This guide is for end users who want Setta Desktop without cloning this repository.

## Script Quickstart

1. Install `uv` if it is not already installed:
   - `brew install uv`
2. Run the desktop bootstrap script from the latest release:
   - `curl -fsSL https://github.com/riteofstring/setta/releases/latest/download/setta-install-desktop.sh | bash`
3. Verify launcher status:
   - `setta launcher status --json`

## Native Installer Quickstart

1. Download `SettaDesktop-<version>.pkg` from the latest GitHub release.
2. Install:
   - `sudo installer -pkg SettaDesktop-<version>.pkg -target /`
3. Verify:
   - `setta launcher status --json`

## Optional Launcher Mode

- Chrome app mode (default):
  - `setta launcher`
- Browser mode:
  - `setta launcher setup --open-mode browser`
  - `setta launcher`

## Remove Desktop Launcher

- `setta launcher remove --json`
