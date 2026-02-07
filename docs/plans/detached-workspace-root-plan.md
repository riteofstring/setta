# Detached Workspace Root Plan

## Goal

Allow Setta to run from one folder (stable environment) while treating a different folder as the active workspace (code + watch-code + LSP), with `setta_files` stored in a centralized location.

## Motivation

Today the workspace root, code root, and `setta_files` root all equal the process CWD. This makes Setta fragile when the worktree’s `setta_files` is reset or wiped during development. The new model must keep workspace code separate from state storage.

## Non-Goals

- No support for editing code outside the chosen workspace root.
- No changes to share deployments beyond using the new root resolver.
- No attempt to make multiple workspaces share a single project state.

## Proposed Behavior

- Introduce a distinct `workspace_root` used for code operations (watch-code, LSP, file read/write, project paths).
- Introduce a distinct `setta_files_root` used for all state, runtime, artifacts, and session metadata.
- Default behavior remains unchanged when no new flags or env vars are provided.
- `--workspace` must exist and be a directory; fail fast with a clear error code when invalid.

## Configuration Surface

- New CLI flag on `setta` start: `--workspace /path/to/worktree`.
- New CLI flag on `setta` start: `--files-root /path/to/setta_files`.
- New CLI flag on `setta` start: `--files-root-base /path/to/setta_files_base`.
- New env var `SETTA_WORKSPACE_ROOT` mirrors `--workspace`.
- New env var `SETTA_FILES_ROOT` mirrors `--files-root`.
- New env var `SETTA_FILES_ROOT_BASE` mirrors `--files-root-base`.
- If only `SETTA_FILES_ROOT` is set, `workspace_root` still defaults to CWD.
- If only `SETTA_WORKSPACE_ROOT` is set, `setta_files_root` defaults to `workspace_root/setta_files`.

## Workspace Switcher UX (Option 2 + Reload)

- Add a simple workspace picker in the UI (likely settings or a launch screen).
- Selecting a workspace triggers a full reload and connects to a new session running with the chosen roots.
- The switcher does not hot-swap roots in-process; it always starts or connects to a separate session.
- The UI calls a backend API endpoint that wraps launch/connect, so the UX is identical for local and SSH.
  - Local: backend runs the same logic as `setta launch` and returns the bootstrap URL JSON.
  - SSH: backend uses the existing `setta connect` flow (or a thin wrapper).
- Persist the most recent workspace(s) locally (e.g., localStorage) and validate before launch.
- On failure, show the error message + a retry action (optionally “show logs”).

## Local Launcher Command

Add a new CLI command:

- `setta launch --workspace <path> --files-root <path> --files-root-base <path> --json`

Behavior:

1. Check for an existing session for the workspace (`setta status --connect-info --json --workspace ...`).
2. If none exists, start Setta with the provided roots and `--no-open`.
3. Poll until a session is available, then emit JSON with `bootstrapUrlFragment`, `workspaceRoot`, `filesRoot`, and session metadata.
4. On error, return `{"ok": false, "error": {"code": "...", "message": "..."}}` and exit non-zero. On success, return `{"ok": true, ...}`.

This gives the UI a single, stable entry point for auto-start.

## Launcher API Contract

- Add `/api/launch` (name TBD) with optional inputs: `workspaceRoot`, `filesRoot`, `filesRootBase`.
- Response shape mirrors `setta launch --json`: `{ok, bootstrapUrlFragment, workspaceRoot, filesRoot, sessionId, startedNew}`.
- Errors use `{ok: false, error: {code, message}}` with consistent codes for invalid paths, launch failure, and timeout.

## Path Resolution Model

- Add a `setta.utils.paths` module with a `SettaPaths` dataclass.
- `SettaPaths.workspace_root` resolves from env/CLI with CLI taking precedence.
- `SettaPaths.setta_files_root` resolves from env/CLI with CLI taking precedence.
- Resolve paths to absolute, canonical paths (e.g., `Path.resolve(strict=False)`) and use canonical values for hashing and session lookups.
- Files root precedence (highest to lowest): `--files-root` > `SETTA_FILES_ROOT` > `--files-root-base` > `SETTA_FILES_ROOT_BASE` > default (`workspace_root/setta_files`).
- For `files-root-base`, name the subfolder as `<leaf>-<hash>` where `leaf` is sanitized to ASCII `[A-Za-z0-9._-]` (fallback `workspace`) and `hash` is `sha256(canonical_workspace_root)` truncated to 8–10 hex chars.
- `SettaPaths.runtime_root` defaults to `setta_files_root/runtime` unless overridden.
- Store the resolved paths in `SettaFastAPIState` for access by routers and managers.
- Remove reliance on `CWD` as a global source of truth.

## Core Code Changes

0. Root mapping rules
Code operations (LSP, watch-code, file read/write, project paths) must use `workspace_root`. State/runtime (sessions, artifacts, attachments, codegen, generated files) must use `setta_files_root`.

1. Replace `CWD` usage
Update modules using `CWD` to reference `paths.workspace_root` or `paths.setta_files_root`, depending on intent. This includes LSP, watch-code, artifact and attachment routers, external agent runners, and file watchers.

2. Update constants
Replace `C.SETTA_FILES_FOLDER = Path("setta_files")` with a lazy getter that uses `SettaPaths.setta_files_root`. Keep `C.CODE_FOLDER` and related paths derived from the new base.

3. Normalize paths with explicit roots
Introduce `normalize_workspace_path()` and `normalize_state_path()` helpers. Migrate existing `normalize_path()` call sites to the appropriate helper so relative paths resolve against the correct root.

4. Update CLI start
Add `--workspace` and `--files-root` to the main `setta` command. Before importing `setta.server:app`, set `SETTA_WORKSPACE_ROOT` and `SETTA_FILES_ROOT` so module imports use the correct roots.

5. Update session registry
`resolve_sessions_root()` must use `setta_files_root` (runtime root) instead of the workspace root. Session metadata should record both the canonical workspace path (for lookup) and the display/original path (for UX).

6. Update project state + codegen
Ensure watch-code path validation uses `workspace_root`, not CWD. Ensure codegen and generated paths continue to live under `setta_files_root`.

7. Update tool defaults
Tools that default to `Path.cwd()` should default to `SettaPaths.workspace_root` instead (e.g., MCP file read, API runner defaults).

## Collisions and Namespacing

Centralized `setta_files_root` can collide across worktrees. The chosen strategy:

- Add an optional `--files-root-base` that auto-names a subfolder using a stable hash of `workspace_root` (e.g., `<files_root_base>/<leaf>-<hash>`).
- Keep `--files-root` as an explicit override for users who want full control.
- Precedence: `--files-root` (or `SETTA_FILES_ROOT`) wins over `--files-root-base` when both are provided.

This preserves the default `workspace_root/setta_files` when neither flag is set, while preventing collisions when a shared base is used.

## SSH Integration Notes

- The workspace switcher should map to the same behavior as `setta connect` today:
  start a session in the selected workspace, then connect/tunnel to it.
- Session metadata should continue to record the workspace path so `setta status --connect-info --workspace ...` works as-is.
- `SETTA_FILES_ROOT` should be passed through the remote start command so remote sessions also use centralized state.

## Migration / Existing State

- Do not auto-move or copy existing `workspace_root/setta_files` (no backward compatibility or legacy support required).
- If the new `setta_files_root` is empty but `workspace_root/setta_files` exists, log a clear warning with the exact command to point at the old location. This is a safety hint, not a migration path.

## Tests

- Unit tests for `SettaPaths` resolution with different env/CLI inputs.
- Tests for `resolve_sessions_root()` to ensure sessions go to the centralized runtime root.
- Watch-code path validation tests to ensure workspace-relative rules still apply.
- Regression test for artifact routing to ensure paths resolve under the centralized `setta_files_root`.
- Integration test for `setta launch --json` and error cases (invalid workspace, invalid files-root).
- Playwright test for the workspace switcher flow (launch, error, retry).

## Docs Updates

- `docs/reference/setta-cli-commands.md`: document new flags and env vars.
- `docs/reference/dev-vs-built.md`: explain the split between workspace and `setta_files` roots.
- `docs/guides/worktree-dev-quickstart.md`: add examples for centralized state.

## Example Usage

- `setta --workspace /path/to/setta.feature_a --files-root /path/to/setta_environment/setta_files/feature_a`
- `SETTA_WORKSPACE_ROOT=/path/to/setta.feature_b SETTA_FILES_ROOT=/path/to/setta_environment/setta_files/feature_b setta`
- `setta --workspace /path/to/setta.feature_c --files-root-base /path/to/setta_environment/setta_files`

## Developer Experience Examples

### 1. Default behavior unchanged (no flags)

Command:

```
setta
```

Experience:

- Workspace root = current directory.
- `setta_files` lives at `<cwd>/setta_files`.
- Watch-code/LSP/file ops resolve relative to `<cwd>`.

### 2. Centralized state with a worktree (CLI flags)

Command:

```
setta --workspace /Users/kevin/worktrees/setta.feature_a \
      --files-root /Users/kevin/setta_state/feature_a
```

Experience:

- Code ops target `/Users/kevin/worktrees/setta.feature_a`.
- State lives in `/Users/kevin/setta_state/feature_a`.
- Worktree resets do not wipe runtime state.

### 3. Centralized state with hashed subfolders (files-root-base)

Command:

```
setta --workspace /Users/kevin/worktrees/setta.feature_b \
      --files-root-base /Users/kevin/setta_state
```

Experience:

- `setta_files_root` becomes `/Users/kevin/setta_state/setta.feature_b-9a3b2c1f` (example hash).
- Multiple worktrees avoid collisions under a shared base.

### 4. Launch + connect in one step (CLI JSON launcher)

Command:

```
setta launch --workspace /Users/kevin/worktrees/setta.feature_c \
             --files-root-base /Users/kevin/setta_state \
             --json
```

Experience:

- Reuses an existing session for the workspace when available.
- Otherwise starts a new session, polls, then emits JSON:
  `{ "ok": true, "bootstrapUrlFragment": "...", "workspaceRoot": "...", "filesRoot": "...", "startedNew": true }`.

### 5. UI workspace switcher (local)

Interaction:

- In the UI, choose "Switch workspace" and select `/Users/kevin/worktrees/setta.feature_d`.

Experience:

- Full reload into a session backed by that workspace.
- Uses `files-root-base` naming when configured.
- Invalid paths show a clear error with retry.

### 6. UI workspace switcher (SSH)

Interaction:

- Choose a remote workspace path.

Experience:

- UI calls `/api/launch`, which wraps the existing `setta connect` flow.
- Remote session starts with the chosen workspace and files roots.

### 7. Failure cases are crisp

Command:

```
setta --workspace /path/does/not/exist
```

Experience:

- Fast failure with a clear error code and message.
- No partial session is left behind.

## Risks

- Missing a `CWD` call site will lead to mixed roots and confusing behavior.
- Path normalization changes can subtly affect UI state serialization.
- Centralized state increases the blast radius of state corruption; per-worktree namespaces are safer.

## Milestones

1. Introduce path resolver + env/CLI wiring.
2. Swap core modules to new roots.
3. Update tests and docs.
4. Verify the centralized workflow against at least two worktrees.
