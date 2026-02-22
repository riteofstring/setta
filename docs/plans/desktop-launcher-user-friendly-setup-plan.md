# Desktop Launcher User-Friendly Setup Plan

## Objective

Make desktop launcher setup genuinely user-friendly for non-developer users:

1. No repo checkout required.
2. No manual script path discovery.
3. One clear install path per OS.
4. One-click app launch after install.
5. Predictable repair/update/uninstall flows.

This plan builds on [`desktop-launcher-plan.md`](./desktop-launcher-plan.md), which implemented launcher internals and OS script wiring, but not a complete end-user distribution/setup experience.

## Current Friction (What Feels Unfriendly Today)

1. OS artifact installer scripts live in the repo (`./scripts/install_*_launcher.*`), so users with only `uv tool install setta` do not have those files.
2. There is no single public setup command that both binds metadata and installs OS launch artifacts.
3. There is no signed native installer path (macOS `.pkg`/`.dmg`, Windows `.msi`).
4. Repair guidance often references repo-local scripts that end users may not have.
5. Docs are CLI-accurate but still developer-oriented for first-time desktop users.

## Product Outcomes

### Primary UX Outcomes

1. New user can install and launch Setta from desktop UI in under 3 minutes.
2. User can repair a broken launcher in one step.
3. User can update without breaking launcher bindings.
4. User can uninstall cleanly from native OS surfaces.

### DX/Support Outcomes

1. Installer logic is centralized in backend Python, not duplicated across ad-hoc shell wrappers.
2. Testable, deterministic setup contract exists for CI and release validation.
3. Support can ask users to run one command or one native installer, not repo-specific scripts.

## Non-Goals

1. Replacing `setta`/`setta launch` existing behavior.
2. Removing advanced `pip install` workflows.
3. Solving multi-profile launcher UX in this plan.
4. Introducing auto-update background daemons in v1.

## North-Star User Journeys

### Journey A: New macOS user (no terminal familiarity)

1. User downloads Setta installer from official release page.
2. User runs installer and finishes standard OS prompts.
3. `Setta.app` appears in Applications/Launchpad.
4. User clicks Setta icon and lands in workspace switcher.
5. User selects workspace and enters IDE.

### Journey B: Existing user repairs broken launcher

1. User launches Setta from icon and sees actionable failure guidance.
2. User clicks a "Repair Launcher" action (native installer repair mode or one command).
3. Metadata + OS artifacts are reinstalled idempotently.
4. Relaunch succeeds without workspace/data loss.

### Journey C: Existing user updates Setta

1. User clicks "Update Setta" in Settings (or runs one update command / installer update).
2. Setta binary is upgraded.
3. Launcher binding is revalidated/rebound to upgraded target.
4. Desktop icon launch continues to work.

## Product Decisions

1. Keep `uv tool install setta` as a supported backend package mechanism.
2. Add a first-class user setup command that installs desktop artifacts without requiring repo scripts.
3. Ship native installer assets for macOS and Windows; Linux keeps script-first with distro packages as follow-up.
4. Keep launcher target explicit and absolute in metadata.
5. Keep default open mode `browser`; allow `chrome-app` opt-in with fallback.

## Proposed Command Surface

Add a user-facing top-level launcher management flow:

1. `setta launcher setup`
2. `setta launcher repair`
3. `setta launcher status`
4. `setta launcher remove`
5. `setta launcher update`

### Command Behavior

1. `setup`
   - Writes/updates launcher metadata.
   - Installs OS launch artifacts for current platform.
   - Accepts `--open-mode`, `--workspace-behavior`, optional `--setta-home`.
2. `repair`
   - Revalidates target + artifacts.
   - Recreates missing/corrupt artifacts.
   - Preserves `lastUsedWorkspace`.
3. `status`
   - Reports metadata path, target validity, artifact presence.
   - JSON output for diagnostics/support tooling.
4. `remove`
   - Removes only launcher-managed artifacts + launcher metadata.
5. `update`
   - Runs tool upgrade workflow, then `repair`/rebinding.

### Cutover Policy

1. Hard cutover to `setta launcher setup|repair|status|remove|update`.
2. Legacy launcher commands and script contracts are internal-only and may be removed without migration support.
3. No metadata migration layer: when schema/shape changes, stale metadata is treated as invalid and users rerun setup/repair.
4. No legacy artifact compatibility: setup/repair manage only the current artifact contract.

## Distribution Model

### Phase A: No-Repo Bootstrap Entry Points

Provide official install entrypoints that users can run without a checkout:

1. macOS/Linux bootstrap script URL.
2. Windows bootstrap PowerShell URL.
3. Each bootstrapper:
   - Ensures `uv` is available (install or guided prompt).
   - Installs/upgrades Setta via `uv tool install setta`.
   - Resolves the installed `setta` executable.
   - Runs `setta launcher setup`.

Deliver as release assets and stable URLs referenced by docs/site.

### Phase B: Native Installers

1. macOS:
   - Signed, notarized installer (`.pkg` preferred; optional `.dmg` wrapper).
   - Installs `Setta.app` + launcher metadata.
   - Supports uninstall helper.
2. Windows:
   - Signed MSI installer.
   - Creates Start Menu shortcut and optional Desktop shortcut.
   - Supports repair and uninstall via Apps & Features.
3. Linux:
   - Keep official shell installer + `.desktop` integration as baseline.
   - Follow-up: distro-specific packages (`.deb`, `.rpm`) once baseline is stable.

## Backend/CLI Implementation Plan

### Step 1: Consolidate OS Artifact Logic in Python

Move launcher artifact creation/removal from shell-only scripts into Python modules:

1. `backend/setta/launcher_artifacts/macos.py`
2. `backend/setta/launcher_artifacts/windows.py`
3. `backend/setta/launcher_artifacts/linux.py`
4. `backend/setta/launcher_artifacts/common.py`

This makes behavior testable and available to packaged `setta` installs.

### Step 2: Add High-Level Launcher Orchestration

Create orchestration module:

1. `backend/setta/launcher_setup.py`
2. Public functions:
   - `setup_launcher(...)`
   - `repair_launcher(...)`
   - `remove_launcher(...)`
   - `get_launcher_status(...)`
3. Ensure idempotence and explicit error codes/messages.

### Step 3: Extend CLI

In `backend/setta/start.py`:

1. Add `launcher setup|repair|status|remove|update`.
2. Keep machine-readable JSON payload contract.
3. Use consistent exit semantics:
   - `0` success
   - `2` user-fixable/config errors
   - `1` internal errors

### Step 4: Script Wrappers

Keep repository scripts, but reduce them to thin wrappers:

1. Parse minimal CLI args.
2. Invoke packaged command (`setta launcher setup/...`).
3. Avoid drift by keeping logic centralized in Python.

## Frontend UX Plan

Add launcher management in-app for users who can reach the UI:

1. Settings section: "Desktop Launcher"
2. Actions:
   - Install/Repair launcher
   - Update Setta
   - Show launcher status
   - Remove launcher
3. Display current binding:
   - `targetCommand`
   - install channel
   - artifact paths
4. Display update capability:
   - in-app update available
   - native-installer-managed (show "Open installer instructions")
   - unsupported/unknown (show remediation guidance)
5. Show direct remediation when launcher target/artifacts are invalid.

### In-App Update UX Requirements

1. Show "Update Setta" button when status reports in-app update capability.
2. When clicked:
   - disable launcher action buttons
   - show progress state (checking -> downloading/installing -> rebinding launcher -> done/failed)
   - stream actionable errors into UI
3. On success:
   - show installed version change (`fromVersion` -> `toVersion`)
   - run launcher repair/rebind automatically
   - prompt user if restart/reopen is recommended
4. On installer-managed channels:
   - hide destructive in-app update action
   - show primary CTA: "Open update instructions"
   - include OS-specific text ("Run installer again to update")

Backend routes needed (IDE-safe):

1. `route_get_launcher_status`
2. `route_setup_launcher`
3. `route_repair_launcher`
4. `route_update_launcher`
5. `route_remove_launcher`

## Documentation Plan

Update docs for user-first entry:

1. New page: "Install Setta Desktop (No Repo Required)"
2. `docs/reference/setta-cli-commands.md`:
   - Promote `setta launcher setup` as default user path.
   - Mark `install/uninstall` as internal and subject to removal.
3. Add OS-specific quickstart pages:
   - macOS
   - Windows
   - Linux
4. Add troubleshooting matrix:
   - missing target
   - permission denied
   - stale shortcut
   - browser/chrome-app fallback behavior

## Packaging/Release Plan

### CI Pipeline Additions

1. Build release artifacts:
   - bootstrap scripts
   - macOS installer assets
   - Windows installer assets
2. Sign artifacts where required.
3. Publish checksums and signatures.
4. Attach artifacts to GitHub Releases.

### Installer Contract

Each installer (script or native) must:

1. Bind explicit launcher target through metadata.
2. Register launcher-managed artifact paths.
3. Expose non-interactive mode for CI smoke tests.
4. Support idempotent rerun for repair.

## Testing Plan

### Automated Tests (Required)

### Backend/CLI (pytest)

1. `launcher setup` creates metadata + platform artifacts.
2. `launcher repair` restores missing artifacts and preserves preferences.
3. `launcher status` reports invalid target/artifact states precisely.
4. `launcher update` upgrades/rebinds target correctly.
5. `launcher update` respects install channel capability (in-app vs installer-managed fallback).
6. `launcher remove` deletes only managed artifacts and metadata.

### Script/Installer Wiring (pytest)

1. Bootstrap scripts invoke expected command chain.
2. Repo wrapper scripts delegate to packaged CLI commands.
3. Native installer command arguments and repair mode wiring are validated.

### Frontend (Vitest + Playwright)

1. Desktop Launcher settings panel renders status/actions.
2. Update button visibility follows capability from launcher status.
3. In-app update flow shows progress and final outcome states.
4. Installer-managed update path shows the correct guidance CTA.
5. Repair flow surfaces backend remediation errors clearly.
6. First-run launch and workspace switcher behavior remains correct.

### Release Smoke Tests

1. Install from published artifact in clean environments.
2. Launch from OS surface.
3. Upgrade then relaunch.
4. Break target deliberately, run repair, relaunch.
5. Uninstall and confirm artifact cleanup only.

## Manual Verification Matrix

For each OS:

1. Clean install.
2. Launch from icon/start menu/desktop.
3. First run with no workspace set.
4. Repeated launch with last-used workspace.
5. Missing target remediation.
6. `chrome-app` opt-in fallback behavior.
7. Repair flow from both CLI and in-app settings (where available).

## Rollout Plan

### Milestone 1: User-Facing CLI Setup (No Repo Required)

1. Ship `launcher setup/repair/status/remove`.
2. Publish bootstrap scripts with stable URLs.
3. Update docs/site with one recommended install path.

### Milestone 2: macOS Native Installer

1. Ship signed/notarized macOS installer with repair support.
2. Validate Finder/Launchpad experience end-to-end.

### Milestone 3: Windows Native Installer

1. Ship signed MSI with Start Menu + optional desktop shortcut.
2. Validate Apps & Features repair/uninstall.

### Milestone 4: Linux Hardening

1. Keep script-first path polished.
2. Add distro package strategy after telemetry/support confirms baseline stability.

## Operational Metrics

Track after release:

1. Install success rate by OS/install method.
2. Launcher startup failure rate by error code.
3. Repair success rate.
4. Time-to-first-launch (install start -> first successful IDE load).
5. Support ticket volume for install/launch issues.

## Risks and Mitigations

1. Risk: Installer/channel complexity causes drift.
   - Mitigation: single Python orchestration path; wrappers only.
2. Risk: Code-signing/notarization delays releases.
   - Mitigation: phase rollout; keep script path as fallback.
3. Risk: Existing users with custom setups break on hard cutover.
   - Mitigation: intentional hard cutover with clear "rerun setup/repair" remediation.
4. Risk: OS-specific path/permission edge cases.
   - Mitigation: broad fixture matrix + clean VM smoke tests.

## Definition of Done

This effort is done when all are true:

1. A non-repo user can install and launch Setta from desktop UI using official docs only.
2. Repair and uninstall are one-step operations from supported entrypoints.
3. Launcher setup logic is centrally implemented in backend Python and covered by tests.
4. Release artifacts include bootstrap installers and at least one native installer path (macOS + Windows), with Linux script path polished.
5. Documentation clearly separates beginner and advanced installation flows.

## Open Questions

1. Do we ship macOS `.pkg` only, or both `.pkg` and drag-and-drop `.dmg`?
2. Do we prioritize Windows MSI authoring in this repo or a dedicated release tooling repo?
3. Which Linux package target should be first after script baseline (`.deb`, `.rpm`, or AppImage)?
4. Should `launcher update` trigger automatic artifact repair every time, or only when invalid state is detected?
