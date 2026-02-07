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

## Configuration Surface

- New CLI flag on `setta` start: `--workspace /path/to/worktree`.
- New CLI flag on `setta` start: `--files-root /path/to/setta_files`.
- New env var `SETTA_WORKSPACE_ROOT` mirrors `--workspace`.
- New env var `SETTA_FILES_ROOT` mirrors `--files-root`.
- If only `SETTA_FILES_ROOT` is set, `workspace_root` still defaults to CWD.
- If only `SETTA_WORKSPACE_ROOT` is set, `setta_files_root` defaults to `workspace_root/setta_files`.

## Workspace Switcher UX (Option 2 + Reload)

- Add a simple workspace picker in the UI (likely settings or a launch screen).
- Selecting a workspace triggers a full reload and connects to a new session running with the chosen roots.
- The switcher does not hot-swap roots in-process; it always starts or connects to a separate session.
- For local usage, the switcher calls a new `setta launch` command that starts (or reuses) a session and returns the bootstrap URL as JSON.
- For SSH usage, the switcher should use the existing `setta connect` flow (or a thin wrapper) so the UX is the same locally and remotely.

## Local Launcher Command

Add a new CLI command:

- `setta launch --workspace <path> --files-root <path> --json`

Behavior:

1. Check for an existing session for the workspace (`setta status --connect-info --json --workspace ...`).
2. If none exists, start Setta with the provided roots and `--no-open`.
3. Poll until a session is available, then emit JSON with `bootstrapUrlFragment`, `workspaceRoot`, `filesRoot`, and session metadata.

This gives the UI a single, stable entry point for auto-start.

## Path Resolution Model

- Add a `setta.utils.paths` module with a `SettaPaths` dataclass.
- `SettaPaths.workspace_root` resolves from env/CLI.
- `SettaPaths.setta_files_root` resolves from env/CLI.
- `SettaPaths.runtime_root` defaults to `setta_files_root/runtime` unless overridden.
- Store the resolved paths in `SettaFastAPIState` for access by routers and managers.
- Remove reliance on `CWD` as a global source of truth.

## Core Code Changes

1. Replace `CWD` usage
Update modules using `CWD` to reference `paths.workspace_root` or `paths.setta_files_root`, depending on intent. This includes LSP, watch-code, artifact and attachment routers, external agent runners, and file watchers.

2. Update constants
Replace `C.SETTA_FILES_FOLDER = Path("setta_files")` with a lazy getter that uses `SettaPaths.setta_files_root`. Keep `C.CODE_FOLDER` and related paths derived from the new base.

3. Normalize paths with explicit roots
Introduce `normalize_workspace_path()` and `normalize_state_path()` helpers. Migrate existing `normalize_path()` call sites to the appropriate helper so relative paths resolve against the correct root.

4. Update CLI start
Add `--workspace` and `--files-root` to the main `setta` command. Before importing `setta.server:app`, set `SETTA_WORKSPACE_ROOT` and `SETTA_FILES_ROOT` so module imports use the correct roots.

5. Update session registry
`resolve_sessions_root()` must use `setta_files_root` (runtime root) instead of the workspace root. Session metadata should continue to record the actual workspace path.

6. Update project state + codegen
Ensure watch-code path validation uses `workspace_root`, not CWD. Ensure codegen and generated paths continue to live under `setta_files_root`.

7. Update tool defaults
Tools that default to `Path.cwd()` should default to `SettaPaths.workspace_root` instead (e.g., MCP file read, API runner defaults).

## Collisions and Namespacing

Centralized `setta_files_root` can collide across worktrees. There are two safe options:

- Require explicit per-worktree `--files-root` paths, e.g. `~/setta_environment/setta_files/feature_a`.
- Add an optional `--files-root-base` that auto-names a subfolder using a stable hash of `workspace_root`.

Pick one option during implementation and document it clearly.

## SSH Integration Notes

- The workspace switcher should map to the same behavior as `setta connect` today:
  start a session in the selected workspace, then connect/tunnel to it.
- Session metadata should continue to record the workspace path so `setta status --connect-info --workspace ...` works as-is.
- `SETTA_FILES_ROOT` should be passed through the remote start command so remote sessions also use centralized state.

## Tests

- Unit tests for `SettaPaths` resolution with different env/CLI inputs.
- Tests for `resolve_sessions_root()` to ensure sessions go to the centralized runtime root.
- Watch-code path validation tests to ensure workspace-relative rules still apply.
- Regression test for artifact routing to ensure paths resolve under the centralized `setta_files_root`.

## Docs Updates

- `docs/reference/setta-cli-commands.md`: document new flags and env vars.
- `docs/reference/dev-vs-built.md`: explain the split between workspace and `setta_files` roots.
- `docs/guides/worktree-dev-quickstart.md`: add examples for centralized state.

## Example Usage

- `setta --workspace /path/to/setta.feature_a --files-root /path/to/setta_environment/setta_files/feature_a`
- `SETTA_WORKSPACE_ROOT=/path/to/setta.feature_b SETTA_FILES_ROOT=/path/to/setta_environment/setta_files/feature_b setta`

## Risks

- Missing a `CWD` call site will lead to mixed roots and confusing behavior.
- Path normalization changes can subtly affect UI state serialization.
- Centralized state increases the blast radius of state corruption; per-worktree namespaces are safer.

## Milestones

1. Introduce path resolver + env/CLI wiring.
2. Swap core modules to new roots.
3. Update tests and docs.
4. Verify the centralized workflow against at least two worktrees.
