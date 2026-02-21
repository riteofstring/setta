# Desktop Launcher Plan (Cross-Platform, macOS-First)

## Objective

Allow users to start Setta from desktop OS launch surfaces (icon double-click, app list/start menu/launchpad) without opening a terminal, and land in a usable Setta session in a browser or optional app-style Chrome window.

## Product Decisions (Agreed Direction)

1. Keep `pip install setta` as a supported advanced/developer path.
2. Make managed global install the default for desktop users (`uv tool install setta`).
3. Desktop launchers must target one explicit Setta install captured at launcher-install time, never implicit PATH resolution.
4. Desktop launch remains workspace-based; launcher UX chooses workspace instead of relying on shell CWD.

## Current Startup Flow (Codebase Baseline)

1. CLI entrypoint is `setta` via `pyproject.toml` (`setta = "setta.start:cli"`).
2. Running `setta` with no subcommand starts uvicorn from `backend/setta/start.py`, resolves workspace/runtime roots via `resolve_setta_paths`, registers a session, mints bootstrap token, and auto-opens browser unless `--no-open` is set.
3. Workspace defaults to `Path.cwd()` when `--workspace` is omitted (`backend/setta/utils/paths.py`).
4. Programmatic launch infra already exists:
   - `POST /api/launch` in `backend/setta/routers/launch.py` calls `launch_workspace_session`.
   - Frontend workspace switcher and launching page already handle workspace/session handoff.
5. `setta launch --json` already emits bootstrap/session payload for non-interactive launchers.

## Gaps To Desktop Launch

1. No OS launcher artifacts are installed today (`.app`, `.desktop`, Windows Start Menu shortcuts).
2. No desktop installer flow that records which Setta install a launcher should execute.
3. No dedicated CLI command for “desktop launch context” independent of caller CWD.
4. No OS-specific install/uninstall scripts for launcher artifacts.
5. No shared cross-platform packaging/distribution strategy for non-CLI-first users.

## Strategy

Ship a cross-platform design with phased OS rollouts:

1. Build one shared launcher core in CLI/backend first.
2. Define installer/target binding model once and reuse it on each OS.
3. Deliver macOS first as the initial desktop-launch UX.
4. Add Windows and Linux launchers on top of the same core.

## Implementation Defaults (Ready to Build)

1. CLI contract:
   - Add `setta launcher`, `setta launcher install`, `setta launcher uninstall`.
   - `setta launcher --json` returns a stable payload shape: `ok`, `workspaceRoot`, `sessionId`, `bootstrapUrl`, `reusedSession`, and structured `error` (`code`, `message`) on failure.
   - Exit codes: `0` success, `2` user-fixable/configuration error, `1` unexpected/internal failure.
   - UX effect: desktop launch can show precise remediation instead of generic "failed to launch" errors.

2. Launcher metadata schema:
   - Store versioned metadata in `<setta_home>/launcher/launcher-install.json`.
   - Include `schemaVersion`, explicit `targetCommand` (absolute path), install `channel`, Setta `version`, defaults (`openMode`, workspace behavior), `lastUsedWorkspace`, and managed artifact paths.
   - UX effect: launcher always opens the intended Setta install, even when users have multiple virtual environments or versions.

3. Workspace resolution policy:
   - Resolve workspace in this order: explicit workspace argument/context from OS launch -> saved default/last-used workspace -> workspace picker.
   - On first run, if no workspace is configured, open picker instead of inventing a hidden default folder.
   - UX effect: predictable first-run behavior and one-click repeat launches for returning users.

4. Installer/uninstaller behavior:
   - `setta launcher install` is primarily installer-facing (shell/PowerShell/package-manager hooks), not a required manual user step.
   - Installer flow: ensure `uv` -> install/upgrade Setta -> invoke the just-installed Setta executable by absolute path with `launcher install`.
   - Installer is idempotent and safe to re-run for repair.
   - Uninstall removes only launcher-managed artifacts and metadata, never workspaces or `setta_files`.
   - UX effect: "reinstall to fix launcher" is safe and reliable.

5. Open mode default:
   - Default launcher open mode is `browser`.
   - `chrome-app` is opt-in via installer/settings and must gracefully fall back to browser when unavailable.
   - UX effect: highest compatibility by default with optional app-like window behavior.

## Phase 1: Shared Launcher Core (All OSes)

Add `setta launcher` command in `backend/setta/start.py`:

1. Runs without depending on shell CWD.
2. Accepts explicit `--workspace`; if omitted, uses launcher workspace resolution policy (defined below).
3. Reuses `launch_workspace_session` for reuse/start behavior.
4. Opens bootstrap URL by default.
5. Supports `--open-mode browser|chrome-app`.
6. Supports `--json` for wrapper scripts with stable payload fields and exit codes defined above.

Add `setta launcher install` and `setta launcher uninstall` commands:

1. `setta launcher install` records launcher target metadata (absolute executable/interpreter path, install channel, version).
2. Metadata is stored under `<setta_home>/launcher/` (for example `launcher-install.json`).
3. `setta launcher uninstall` removes launcher metadata/artifacts created by install flows.

Supporting updates:

1. Update `docs/reference/setta-cli-commands.md` with launcher command docs.
2. Keep `setta` and `setta launch` behavior unchanged.
3. Add backend validation that launcher target path exists and fails with clear remediation if missing.

## Phase 2: Distribution and Install Model (Cross-Platform Foundation)

Primary distribution:

1. Recommended user install is `uv tool install setta`.
2. Update docs to include `uv tool upgrade setta` and `uv tool uninstall setta`.

Secondary/advanced distribution:

1. Keep `pip install setta` supported for virtualenv/project isolation.
2. Launcher install must be explicit about which env it binds to when used from `pip` installs.

Convenience installer layer:

1. Provide an official script entrypoint (shell for macOS/Linux, PowerShell for Windows).
2. Script responsibilities:
   - Ensure `uv` is present (install instructions or bootstrap).
   - Install/upgrade Setta via `uv tool install setta`.
   - Resolve the just-installed Setta executable path and run `launcher install` through that absolute target.
3. This keeps a one-command install UX while preserving a Python-native packaging model.

## Phase 3: macOS Launcher (V1)

Provide macOS installer scripts to create/remove `Setta.app`:

1. `scripts/install_macos_launcher.sh`:
   - Creates `Setta.app` bundle (default `~/Applications/Setta.app`).
   - Generates `Info.plist` + `Contents/MacOS/setta-launcher` wrapper calling the explicit bound launcher target.
2. `scripts/uninstall_macos_launcher.sh`:
   - Removes installed app bundle.
3. Optional icon support via `.icns`.

Runtime behavior:

1. Finder/Launchpad launch starts Setta without terminal interaction.
2. Browser opens to Setta bootstrap flow.
3. If bound target is missing/stale, show actionable error with reinstall instructions.

## Phase 4: Windows Launcher (V2)

Add Windows install/remove scripts and shortcut generation:

1. Install script creates Start Menu shortcut and optional Desktop shortcut.
2. Wrapper target runs explicit bound launcher target (not generic PATH lookup).
3. Uninstall script removes shortcuts safely.

Optional follow-up:

1. Package a dedicated executable wrapper for environments where Python PATH resolution is unreliable.

## Phase 5: Linux Launcher (V3)

Add Linux desktop integration:

1. Install script writes `.desktop` file into `~/.local/share/applications/`.
2. Optional Desktop shortcut creation where supported.
3. Wrapper command launches explicit bound launcher target.
4. Uninstall script removes generated `.desktop` artifacts.

## Phase 6: Workspace UX Hardening

Improve desktop-first experience across all OSes:

1. Apply workspace resolution policy:
   - If launched with a folder/file-association context, use that workspace.
   - Else if launcher has last-used/default workspace, use it.
   - Else open workspace switcher and require selection.
2. Persist launcher preferences (open mode, default workspace behavior) under `<setta_home>/launcher/`.
3. Auto-open workspace switcher on first launcher-run when no workspace context exists.
4. Add user-visible failure guidance when launch fails from OS shell.
5. Keep using existing frontend workspace-switcher + launch page flow for consistency.

## Testing Plan

## Backend / CLI (pytest)

1. `setta launcher --json` returns bootstrap/session payload.
2. Existing-session reuse path works.
3. Workspace resolution order works (explicit arg, context/default, switcher trigger conditions).
4. `--open-mode` validation works.
5. Launcher target metadata read/write + validation works.

## Script Tests

1. macOS installer/uninstaller generate expected files and remove only intended targets.
2. Install scripts bind absolute launcher target and do not depend on shell PATH.
3. Windows/Linux installer script wiring validates generated artifacts/commands.
4. Script tests live under `tests/start/` with existing script-wiring style.

## Manual Verification Matrix

1. macOS: Finder + Launchpad launch.
2. Windows (later phase): Start Menu + Desktop shortcut launch.
3. Linux (later phase): app list + desktop launcher launch.
4. For each OS: cold launch, repeated launch, missing-target remediation, and optional Chrome app mode.
5. Validate first-run behavior when no workspace is configured.

## Rollout

1. Ship Phase 1 + Phase 2 + Phase 3 first (macOS-first milestone).
2. Follow with Windows (Phase 4), then Linux (Phase 5).
3. Keep current CLI/dev workflows unchanged throughout rollout.

## Open Questions

1. Do we want a single cross-platform installer entrypoint later, or keep per-OS scripts permanently?
2. How should we expose multi-version launch profiles (stable/beta/dev) in launcher UX?
