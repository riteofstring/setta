# Desktop Launcher Remaining Work (Canonical)

This document replaces and supersedes:
- `docs/plans/desktop-launcher-plan.md`
- `docs/plans/desktop-launcher-user-friendly-setup-plan.md`
- `docs/plans/desktop-launcher-workspace-picker-plan.md`

Precedence:
1. User-friendly setup decisions are authoritative where plans conflict.
2. Workspace-picker items remain required unless explicitly superseded below.

## Implementation Status

All previously missing items are implemented.

### CLI Setup and Artifact Lifecycle

- [x] Make `setta launcher setup` install platform launcher artifacts directly (macOS app bundle, Windows shortcuts/wrapper, Linux desktop entry/wrapper), not only launcher metadata.
- [x] Make `setta launcher repair` recreate missing/corrupt artifacts through the same backend Python orchestration path while preserving `lastUsedWorkspace`, `openMode`, and `workspaceBehavior`.
- [x] Keep `setta launcher remove` limited to launcher-managed artifacts + metadata after artifact management is fully centralized.
- [x] Implement backend Python artifact modules:
- [x] `backend/setta/launcher_artifacts/common.py`
- [x] `backend/setta/launcher_artifacts/macos.py`
- [x] `backend/setta/launcher_artifacts/windows.py`
- [x] `backend/setta/launcher_artifacts/linux.py`
- [x] Refactor repo scripts to thin wrappers that only parse minimal args and delegate to packaged CLI orchestration.

### No-Repo Bootstrap Distribution

- [x] Publish official no-checkout bootstrap entrypoints as release assets with stable URLs (macOS/Linux shell + Windows PowerShell).
- [x] Ensure bootstrappers run the full chain: ensure `uv` -> `uv tool install --upgrade setta` -> resolve explicit executable -> run `setta launcher setup`.
- [x] Ensure desktop setup flows are usable from packaged installs without requiring repository-local script paths.

### Workspace Picker and Launcher Mode Architecture

- [x] Add launcher app mode contract in backend/frontend mode detection (launcher as first-class mode, not only IDE/share/app behavior).
- [x] Add launcher-specific backend APIs for:
- [x] app mode lookup
- [x] recent workspace list/add/remove/pin
- [x] launcher filesystem root + directory listing
- [x] open workspace and return bootstrap URL
- [x] Enforce launcher filesystem security model (allowed roots, symlink resolution, outside-root rejection).
- [x] Add launcher home UI page with:
- [x] recent projects
- [x] directory-picker browsing flow
- [x] new project flow
- [x] open-project transition into IDE bootstrap URL
- [x] Route launcher home by app mode so desktop launch lands in launcher UX directly.

### Frontend Launcher UX Hardening

- [x] Add dedicated Settings section for Desktop Launcher management (not only workspace switcher modal controls).
- [x] Implement in-app update progress states: `checking -> downloading/installing -> rebinding -> done/failed`.
- [x] Disable conflicting launcher actions while update/setup/repair/remove is in flight.
- [x] For installer-managed channels, hide destructive in-app update action and provide primary CTA: open update instructions with OS-specific guidance.
- [x] Surface binding details clearly in UI: `targetCommand`, channel, managed artifact paths, remediation guidance.

### Documentation

- [x] Add beginner-first install page: "Install Setta Desktop (No Repo Required)".
- [x] Add OS quickstarts for macOS, Windows, Linux.
- [x] Add troubleshooting matrix for missing target, stale shortcut, permission errors, and browser/chrome-app fallback.
- [x] Clearly separate beginner desktop install flow from advanced `pip`/venv workflows.

### Native Installers and Release Pipeline

- [x] Ship macOS native installer path (signed/notarized `.pkg`, optional `.dmg` wrapper).
- [x] Ship Windows native installer path (signed `.msi` with repair/uninstall integration).
- [x] Add CI/release jobs to build installer assets, sign/notarize as required, publish checksums/signatures, and attach artifacts to GitHub releases.
- [x] Provide non-interactive installer modes suitable for CI smoke tests.

### Automated Testing and Verification

- [x] Add backend tests for Python launcher artifact installers (setup/repair/remove behavior per platform contract).
- [x] Add backend tests for launcher-mode workspace-picker APIs and security constraints.
- [x] Add tests proving script wrappers stay thin delegates to packaged CLI orchestration.
- [x] Expand frontend Vitest coverage for launcher settings panel behavior and installer-managed update guidance UX.
- [x] Add Playwright E2E coverage for launcher home directory selection/new-project/open transitions.
- [x] Add release smoke tests for published artifacts:
- [x] clean install
- [x] desktop launch
- [x] upgrade and relaunch
- [x] deliberate break + repair
- [x] uninstall cleanup verification

## Explicitly Superseded / Closed

- Legacy `setta launcher install` / `setta launcher uninstall` commands are intentionally not required.
- Canonical command surface remains:
- `setta launcher`
- `setta launcher setup`
- `setta launcher repair`
- `setta launcher status`
- `setta launcher remove`
- `setta launcher update`
