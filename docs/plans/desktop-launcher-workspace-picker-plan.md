# Desktop Launch + Workspace Picker Plan

Setta has outgrown "a CLI tool you run inside a project directory." If Setta is now an orchestration + configuration + node-graph UI system, launching from the desktop (no preselected working directory) is a meaningful UX upgrade.

This plan proposes a launcher-style home that lets users open or create projects (filesystem directories) and then transitions into the normal IDE experience.

## Why This Is A Good Idea

1. It removes "cd into the right folder" as a prerequisite. That matters for non-terminal users and for anyone juggling multiple projects.
2. It aligns with Setta becoming "an app" rather than "a config tool".
3. It unlocks OS-level integrations later (Open With, recent projects, pinned projects, etc.).
4. It sets up a clean separation between "workspace selection" and "project config editing".

## Goals

1. Users can launch Setta from the desktop with no directory context.
2. Setta opens to a home/launcher surface with: open an existing project directory, create a new project directory, and see/open recent projects.
3. Opening a project directory launches Setta in that directory (so `setta_files/` stays per-project as today).
4. The existing terminal workflow continues to work unchanged (`cd project && setta`).
5. "Home page uses browser section's code" is supported: the launcher uses the same File Browser UI primitives (list/icon/carousel as desired).

## Non-Goals (For V1)

1. Turning Setta into an Electron/Tauri app shell. Desktop launch can be a thin wrapper around the existing local-web-app approach.
2. True in-process workspace switching (no restart) across arbitrary directories.
3. Multi-user security hardening for remote deployments. This is local-first UX.

## Current Constraints (Important)

1. Backend assumes the "workspace root" is `Path.cwd()` in several places (for example `backend/setta/start.py` session creation and `backend/setta/utils/constants.py` `CWD`).
2. The existing file browser endpoints intentionally restrict browsing to within the project root (`backend/setta/routers/artifact.py` checks `resolved.is_relative_to(CWD.resolve())`).
3. Auth cookies are per-domain (not per-port). Running multiple Setta instances on `127.0.0.1` can cause cookie collisions unless `SETTA_AUTH_COOKIE_NAME` differs per instance.

Given these, the safest low-risk path is: "launcher spawns a normal Setta instance per selected workspace directory" rather than trying to retrofit true multi-workspace support into one server process.

## Terminology

1. Workspace: a filesystem directory that Setta treats as the project root; `setta_files/` is created inside it.
2. Launcher: a Setta mode that starts with no project selected and exists to help pick a workspace and spawn/open an IDE instance.
3. IDE instance: a normal Setta server process whose workspace is a specific directory.

## Proposed UX

### Launcher Home Surface

1. Recent projects (carousel or grid).
2. Open project (browse filesystem directories).
3. New project (choose parent dir + name, or choose empty dir).
4. Optional toggle: open in same tab vs open in new tab.

### "Browser Section" Reuse

Use the existing browser UI (for example `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`) as the foundation for directory selection:

1. In launcher mode, the browser acts as a directory picker (open folders, select a folder, confirm).
2. In IDE mode, the browser remains the existing project-root-scoped file browser (current behavior).

This implies a launcher-specific backend browsing API, so we do not loosen the security model of the IDE file browser.

## Architecture Options

### Option A (Recommended): Launcher Spawns IDE Processes

Flow

1. `setta launcher` starts a lightweight backend + frontend launcher UI.
2. User selects a directory in the launcher.
3. Launcher opens an existing IDE session for that workspace if one is already running.
4. Otherwise launcher spawns a new `setta` process with `cwd=<workspace>` and opens its bootstrap URL.

Pros

1. Minimal disruption to the current Setta backend assumptions.
2. `setta_files/` stays per-project naturally.
3. Easy to keep normal file-browser sandboxing in IDE mode.

Cons

1. Requires managing multiple processes and ports.
2. Requires cookie-name isolation per IDE instance to avoid collisions.

### Option B: Single Process Switches Workspace In-Place

Pros

1. "Feels like a desktop app" with instant project switching.
2. No multi-process management.

Cons

1. Large refactor: many paths and watchers are rooted at CWD or derived constants computed at import time.
2. Risky performance and correctness regressions.

Recommendation: build Option A first. If project switching becomes a priority, add Option B as a later refactor with performance baselines and a deliberate re-architecture of path handling.

## Implementation Plan (Option A)

### Phase 0: Decisions and Spec Lock

1. Launcher storage location for "recent projects". Recommendation: `~/.setta/launcher/launcher.json` (or `~/.setta/launcher.json`).
2. Allowed roots for launcher filesystem browsing. Recommendation: start with `Path.home()` (cross-platform, good enough for V1).
3. "Open in same tab" behavior. Recommendation: default to same tab (replace current page with IDE bootstrap URL).
4. Cookie-name scheme for spawned IDE instances. Recommendation: set `SETTA_AUTH_COOKIE_NAME` per instance (for example `setta_auth_<port>`), matching how worktrees already avoid collisions.

### Phase 1: Backend Launcher Mode Skeleton

1. Add a CLI subcommand: `setta launcher`.
2. In `setta launcher`, choose a working directory for launcher runtime (not user-visible). Recommendation: `~/.setta/launcher_workdir` as the process CWD so `setta_files/` does not pollute user directories.
3. Start uvicorn the same way as normal, but in "launcher mode".
4. Add a launcher mode flag to backend. Recommendation: env var `SETTA_LAUNCHER_MODE=1`, plus a small endpoint the frontend can call to confirm mode.
5. Keep launcher backend initialization fast.
Implementation direction: add flags to `SettaFastAPIState` (or a separate minimal state) so launcher avoids booting LSP, MCP, and project manager services unless needed.

Notes

1. Do not reuse share mode for this; launcher is neither IDE nor share.
2. Avoid try/catch based control flow. Make the mode explicit.

### Phase 2: Backend APIs for Launcher

Add a new router, for example `backend/setta/routers/workspaces.py`, and new routes in `backend/setta/types/routes.py`.

Endpoints (names must match frontend generatedEndpoints)

1. `route_get_app_mode`. Returns `{ mode: "ide" | "share" | "launcher" }`.
2. `route_list_recent_workspaces`. Returns `[{ path, displayName, lastOpenedAt, pinned }]`.
3. `route_add_recent_workspace`. Input: `{ path }`. Writes to launcher storage.
4. `route_remove_recent_workspace`.
5. `route_pin_workspace`.
6. `route_get_launcher_fs_root` (launcher-only). Returns `{ rootPath, pathSeparator, ignorePatterns }`.
7. `route_get_launcher_folder_contents` (launcher-only). Takes input similar to the existing folder listing but without "must be within project root". Enforce: resolved path must be within the allowed roots list.
8. `route_open_workspace` (launcher-only). Returns a bootstrap URL for either an existing IDE session for that workspace, or a newly spawned IDE instance.

Codegen note

After adding or changing backend routes, run `source activate.sh && cd frontend && pnpm generate` so frontend `generatedEndpoints` stays in sync.

`route_open_workspace` details

Input: `{ path, preferExistingSession: boolean }`.
Output: `{ bootstrapUrl }`.
Algorithm
1. Validate path exists and is a directory.
2. If `preferExistingSession` is true, search for the latest running session for that workspace (using `SessionRegistry` rooted at `<workspace>/setta_files/runtime/sessions`).
3. If a running session is found, mint and return a bootstrap URL for that session.
4. Otherwise allocate an available port, spawn `setta --host 127.0.0.1 --port <port>` with `cwd=<workspace>`, set `SETTA_AUTH_COOKIE_NAME` for the child process to a unique value (for example `setta_auth_<port>`), and return the child's bootstrap URL.

Security notes (launcher filesystem endpoints)

1. Restrict to local host sessions only (launcher should bind to 127.0.0.1 by default).
2. Resolve symlinks and enforce "is within allowed roots" after resolution.
3. Do not expose arbitrary file reading in launcher mode beyond directory listing unless explicitly required.

### Phase 3: Frontend Launcher UI

1. Add a new page, for example `frontend/src/components/Pages/Launcher/LauncherHomePage.tsx`.
2. Routing.
Recommendation: reuse `/home` and swap content based on `route_get_app_mode`, so URLs stay stable.
3. State.
Add a store `useAppMode` with `mode` and `modeResolved`, initialized early (similar to share detection).
4. UI composition.
Include recent projects list, a directory picker using the browser section code, and actions for Open and New Project.
5. Behavior when opening a project.
Call `route_open_workspace`, then `window.location.assign(bootstrapUrl)` to switch into the IDE instance.

### Phase 4: Desktop Entry Points

Start with "desktop shortcut launches `setta launcher`" and iterate.

1. macOS
Provide a script under `scripts/` to generate a minimal `.app` wrapper that runs `setta launcher`. Keep the initial scope to developer installs or pip installs; packaging into a signed .app can be a later phase.
2. Windows
Provide a `.bat` or small wrapper script that runs `setta launcher`. Later consider PyInstaller for a single executable if distribution demands it.
3. Linux
Provide a `.desktop` entry example that runs `setta launcher`.

### Phase 5: Tests and Verification

Backend tests (pytest)

1. Workspace list persistence
Uses a temp dir for the launcher storage file.
2. Launcher folder listing security
Rejects paths outside allowed roots and handles symlinks correctly.
3. `route_open_workspace`
Validates missing or invalid directory, then spawns a child process in a temp workspace and returns a bootstrap URL.

Frontend tests (Vitest)

1. Launcher renders recents.
2. Selecting a directory enables the "Open" CTA.
3. Clicking Open calls `route_open_workspace` and navigates.

Playwright (E2E)

1. Start launcher backend in CI-friendly mode (may require a test-only flag to not auto-open a browser).
2. Navigate to launcher, select a temp workspace directory, click open, verify the IDE home loads.

Manual verification checklist

1. Launch via `setta launcher` from outside a project directory.
2. Use launcher to open a workspace with an existing `setta_files/`.
3. Use launcher to open a fresh empty directory and create a config.
4. Open two workspaces in parallel and verify auth cookies do not collide (confirm by using distinct `SETTA_AUTH_COOKIE_NAME` per instance).

## Follow-Ups (After V1 Ships)

1. "Open With Setta" OS integration: opening a folder launches `setta open <folder>`.
2. Better allowed-roots model in launcher browser (add `/Volumes` on macOS, drive roots on Windows, etc.).
3. "Single-instance switch" refactor (Option B): separate workspace root from app runtime root, replace global `CWD = Path.cwd()` usage with explicit workspace root in state, convert derived constants in `C` into computed properties, and baseline then measure perf before and after (append results in `perf/`).

## Open Questions

1. Should Setta store any state globally across workspaces (LLM config, agent profiles), or keep everything per-workspace as today?
2. What is the correct "new project" behavior: create empty folder only, seed minimal files, and/or auto-add `setta_files/` to `.gitignore` when a git repo is detected.
3. Should launcher default to reopening the most recent workspace automatically?
4. How important is "open outside home directory" for V1 (drives, /Volumes)?
