# Install Setta Desktop (No Repo Required)

This is the beginner-first install flow.
It installs Setta as a desktop launcher without cloning this repository.

Advanced `pip`/venv workflows are documented separately:
- `docs/reference/remote-built-install.md`
- `docs/reference/setta-cli-commands.md`

## Official Bootstrap URLs

Use release assets from the latest GitHub release:

- macOS/Linux shell bootstrap:
  - `https://github.com/riteofstring/setta/releases/latest/download/setta-install-desktop.sh`
- Windows PowerShell bootstrap:
  - `https://github.com/riteofstring/setta/releases/latest/download/setta-install-desktop.ps1`
- Checksums:
  - `https://github.com/riteofstring/setta/releases/latest/download/checksums.sha256`

The bootstrap chain is:
1. Ensure `uv` exists.
2. Run `uv tool install --upgrade setta`.
3. Resolve the explicit `setta` executable path.
4. Run `setta launcher setup`.
5. Default launcher mode is `chrome-app` (with automatic browser fallback when unavailable).

## Quickstarts

- macOS: [install-setta-desktop-macos.md](./install-setta-desktop-macos.md)
- Windows: [install-setta-desktop-windows.md](./install-setta-desktop-windows.md)
- Linux: [install-setta-desktop-linux.md](./install-setta-desktop-linux.md)

## Troubleshooting Matrix

| Issue | Typical Symptom | Fix |
| --- | --- | --- |
| Missing launcher target | Desktop app opens an error saying Setta cannot start | Run `setta launcher repair`, then retry launch |
| Stale shortcut/app bundle | Launcher opens the wrong path or environment | Run `setta launcher setup` again |
| Permission errors | Installer script cannot write app/shortcut files | Re-run with proper permissions for your user paths |
| Browser opens instead of app mode | Launcher is configured for Chrome app mode but opens in a normal browser window | Install Chrome, or use `--open-mode browser` |
| Launcher metadata missing | `setta launcher status` shows `installed=false` | Run the bootstrap installer again |

## Native Installer Notes

Release workflows also publish native installers:
- macOS `.pkg` (with optional `.dmg` wrapper)
- Windows `.msi`

Non-interactive install modes for CI:
- macOS: `sudo installer -pkg SettaDesktop-<version>.pkg -target /`
- Windows: `msiexec /i SettaDesktop-<version>.msi /qn /norestart`

After native install, launch once to validate setup, then run:
- `setta launcher status --json`
