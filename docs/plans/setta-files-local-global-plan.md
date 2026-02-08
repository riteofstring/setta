# Setta Local/Global `setta_files` Plan

Setta currently exposes a “workspace switcher” UX plus two different knobs for state storage:

- `files root` (explicit `setta_files` path)
- `files root base` (a directory that contains per-workspace hashed `setta_files` folders)

This plan replaces that model with a simpler, explicit two-tier storage concept:

- **Local** `setta_files` (inside the workspace) is the default.
- **Global** `setta_files` live under a user Setta directory (`~/.setta` on Unix/macOS, `%APPDATA%\\Setta` on Windows).

No backward compatibility, legacy support, or migrations are required.

## Goals

- Make “where is `setta_files` stored?” understandable: `local` (workspace) vs `global` (user-level).
- Provide a single user config file under `<setta_home>/` that controls:
  - the global state base directory (default `<setta_home>/setta_files`)
  - the fallback behavior when opening a workspace that has no local `setta_files`
  - the default location to create new `setta_files` for a workspace (local or global)
- Remove `files root` and `files root base` from both UX and the public CLI surface.

## Non-Goals

- Any automatic migration of old `files root base` data into the new global layout.
- Preserving existing workspace history entries / localStorage formats.
- Supporting multiple legacy ways to specify state roots (we will delete the old ones).
- Adding UI for editing `<setta_home>/config.json` (edit the file manually).

## Terminology

- **Workspace root**: the project folder Setta operates on (code operations).
- **Setta home** (`<setta_home>`): the per-user Setta directory.
  - Unix/macOS: `~/.setta`
  - Windows: `%APPDATA%\\Setta`
- **Local state root**: `<workspace_root>/setta_files`.
- **Global state base**: a directory that contains per-workspace state roots.
  - Default: `<setta_home>/setta_files`
  - Example computed per-workspace root: `<setta_home>/setta_files/<workspace-name>-<hash>/`
- **Per-workspace global state root**: the actual `setta_files` directory used for a workspace when using global storage.

## Storage Model (New)

### Local (workspace) state

- Path: `<workspace_root>/setta_files`
- Behavior: if it exists, it wins by default (local is the “default unless otherwise specified”).

### Global (user) state

- Base path (configurable): `<setta_home>/setta_files`
- Per-workspace state root is computed under the base using the existing “workspace-name + hash” scheme.
  - Reuse `backend/setta/utils/paths.py:build_files_root_from_base(...)` for determinism and length limits.

## User Config File (`<setta_home>`)

### Directory

- Unix/macOS: `~/.setta`
- Windows “equivalent” (common): `%APPDATA%\\Setta` (so `config.json` and the default global `setta_files` live together).

### File format and location

Recommendation: JSON (easy to read/write without extra tooling).

- Path: `<setta_home>/config.json`
  - Unix/macOS: `~/.setta/config.json`
  - Windows: `%APPDATA%\\Setta\\config.json`

### Config schema (proposed)

```ts
type SettaUserConfig = {
  // Where the global per-workspace state roots live.
  // This directory contains multiple hashed per-workspace folders.
  globalSettaFilesBase: string; // default: "<setta_home>/setta_files"

  // What to do when opening a workspace that has no local setta_files directory.
  openWorkspaceFallback: "create_local" | "use_global_if_present";

  // If we need to create state for a workspace (no local and no global),
  // which location should be created by default.
  defaultCreateLocation: "local" | "global";
};
```

### Defaults (must preserve today’s behavior)

- `globalSettaFilesBase = "<setta_home>/setta_files"`
- `openWorkspaceFallback = "create_local"`
- `defaultCreateLocation = "local"`

### Semantics

When opening a workspace (no explicit CLI override):

1. If `<workspace_root>/setta_files` exists, use it (local wins).
2. Else if `openWorkspaceFallback == "create_local"`, use local and create `<workspace_root>/setta_files` (normal current behavior).
3. Else `openWorkspaceFallback == "use_global_if_present"`:
   - Compute the per-workspace global state root under `globalSettaFilesBase`.
   - If it exists, use it.
   - If it does not exist, create new state at `defaultCreateLocation`:
     - `local`: create `<workspace_root>/setta_files`
     - `global`: create the computed per-workspace global state root

Notes:

- Config errors should fail loudly at startup (clear error message) rather than silently falling back.
- Directory creation itself remains handled by `DBE` (it already `mkdir(..., exist_ok=True)`), but path selection must happen before `DBE` runs to avoid creating local state in “use_global_if_present” mode.
- Local always wins if it exists (even if config defaults would otherwise pick global).

## Backend Design

### New modules / responsibilities

1. User config resolution
   - Add `backend/setta/utils/user_config.py` (or similar) responsible for:
     - computing `<setta_home>` (Unix/macOS: `Path.home() / ".setta"`, Windows: `%APPDATA%\\Setta`)
     - reading `config.json`
     - validating fields and applying defaults
2. State-root resolution
   - Update `backend/setta/utils/paths.py` so `resolve_setta_paths(...)` can select:
     - local `<workspace>/setta_files`
     - global computed root under `globalSettaFilesBase`
   - The new logic must be centralized here so all subsystems (DBE, sessions, mcp, etc.) follow it.

### Remove Existing “Files Root” APIs

Delete the “files root” and “files root base” concepts from public interfaces:

- CLI options: remove `--files-root` and `--files-root-base` from `backend/setta/start.py`
- Env vars: stop reading `SETTA_FILES_ROOT` and `SETTA_FILES_ROOT_BASE` as inputs (and remove them from docs)
- Launch plumbing: remove all `files_root` / `files_root_base` parameters from:
  - `backend/setta/launch.py`
  - `backend/setta/routers/launch.py`
  - `backend/setta/ssh_common.py` / `backend/setta/ssh_connect.py`

### New explicit override (recommended)

Add a higher-level override that matches the new model:

- CLI option: `--setta-files-location local|global|auto` (name bikeshed ok)
  - `auto` = use config + fallback rules
  - `local` = force `<workspace>/setta_files` (create if missing)
  - `global` = force computed global state root (create if missing)

This keeps “explicit override” aligned with the new two-tier mental model, without forcing users to paste filesystem paths.

### Launch route changes

Update `/api/launch` request schema (see `backend/setta/routers/launch.py`) to remove `filesRoot` / `filesRootBase` and replace the “paths” concept with:

- optional `settaFilesLocation` (`auto|local|global`)

Then, in `launch_workspace_session(...)`:

- compute the final `setta_files_root` based on:
  - `settaFilesLocation` if provided
  - else user config + fallback rules

### Sessions registry stability

Today the session registry root is derived from the resolved runtime root (which is nested under `setta_files/runtime` by default). With global state, this naturally becomes global as well, which is desirable.

Make sure the workspace session discovery logic still behaves correctly when switching between local and global state roots.

## Frontend Design

### Workspace switcher simplification

Replace the advanced “Files Root / Files Root Base” inputs in:

- `frontend/src/components/Modals/WorkspaceSwitcherModal/WorkspaceSwitcherModal.tsx`

with a single selector that matches the new model:

- `Setta files location`: `Default (auto)`, `Local (workspace)`, `Global (<setta_home>)`

Keep “advanced” solely for SSH args/remote command/local tunnel port, not filesystem state paths.

### Workspace history format

Replace `filesRoot` / `filesRootBase` fields in:

- `frontend/src/utils/workspaceHistory.ts`

with a single `settaFilesLocation` field (`auto|local|global`), and reset history without migration.

Update:

- `frontend/tests/e2e/overview/workspace-switcher.spec.ts`
- `frontend/src/utils/workspaceHistory.test.ts`
- `frontend/src/components/Pages/Launch/WorkspaceLaunchPage.tsx`

### Generated endpoint types

Changing `/api/launch` payloads requires regenerating frontend bindings:

- `source activate.sh && cd frontend && pnpm generate`

## Documentation Updates

Update docs that mention `--files-root` / `--files-root-base` or the old state model:

- `docs/reference/dev-vs-built.md`
- `docs/reference/setta-cli-commands.md`

Add a new short doc (or extend one of the above) describing:

- local vs global state
- config file location and schema
- examples for each mode

## Testing Plan

### Backend (pytest)

Add focused unit tests under `tests/utils/` for the new resolver behavior:

- local exists -> always local
- missing local + fallback=create_local -> local selected
- missing local + fallback=use_global_if_present + global exists -> global selected
- missing local + fallback=use_global_if_present + global missing + defaultCreateLocation=local -> local selected
- missing local + fallback=use_global_if_present + global missing + defaultCreateLocation=global -> global selected
- explicit `--setta-files-location local|global` forces selection (and creates the selected root if missing)

Tests must not rely on real `<setta_home>`; provide an override for the config directory path (env var or dependency injection) so tests can use a temp dir.

### Frontend (Vitest)

Update / add tests for:

- workspace history parsing/normalization with `settaFilesLocation`
- switcher draft storage roundtrip after schema change

### E2E (Playwright)

Update `frontend/tests/e2e/overview/workspace-switcher.spec.ts` to:

- launch a workspace using `Default (auto)` location
- verify the UI no longer shows “Files Root” / “Files Root Base” inputs
- (optional) verify the request payload includes `settaFilesLocation`

## Implementation Phases

1. Spec lock
   - finalize config file name, format, and exact enum strings
   - finalize CLI flag name for `--setta-files-location`
2. Backend: config + resolver
   - implement user config loader
   - update `resolve_setta_paths(...)` to apply the new rules
3. Backend: delete legacy knobs
   - remove `--files-root` / `--files-root-base` and stop reading `SETTA_FILES_ROOT` / `SETTA_FILES_ROOT_BASE`
   - remove all `files_root` / `files_root_base` plumbing and update `/api/launch`
4. Frontend: update workspace switcher + history
   - simplify modal UI and payload
   - update stored history format (no migration; just reset)
5. Regenerate types
   - `pnpm generate`
6. Tests
   - backend unit tests for resolver
   - update Vitest + Playwright suites
7. Docs
   - update CLI and runtime docs to match the new model

## Decisions (Locked For V1)

- Windows Setta home directory: use `%APPDATA%\\Setta` (the common per-user app settings location).
- Local always wins when `<workspace_root>/setta_files` exists.
- No in-app UI for editing `config.json` yet; edit the file on disk.
