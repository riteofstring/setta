# Install Setta Desktop on Linux

This guide is for end users who want Setta Desktop without cloning this repository.

## Script Quickstart

1. Install `uv` if it is not already installed:
   - `curl -LsSf https://astral.sh/uv/install.sh | sh`
2. Run the desktop bootstrap script from the latest release:
   - `curl -fsSL https://github.com/riteofstring/setta/releases/latest/download/setta-install-desktop.sh | bash`
3. Verify launcher status:
   - `setta launcher status --json`

## Optional Desktop Shortcut Setup

If your distro needs explicit launcher setup, run:
- `setta launcher setup --channel linux-script --open-mode browser`

## Optional Launcher Mode

- Browser mode (default):
  - `setta launcher`
- Chrome app mode:
  - `setta launcher setup --open-mode chrome-app`
  - `setta launcher`

## Remove Desktop Launcher

- `setta launcher remove --json`
