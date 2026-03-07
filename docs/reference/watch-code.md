# Watch Code

Watch Code keeps the UI in sync with top-level Python definitions. When enabled, it
watches a set of repo-relative files and folders, parses `.py` files for new
callables, and automatically creates, updates, or removes **Callable** sections to
match what's on disk.

## Overview
- **Scope:** Python only. Watch Code skips updates if Python codegen is disabled.
- **Targets:** Top-level `def`, `async def`, and `class` definitions (via `__init__`).
- **Outputs:** Callable sections plus registry entries that track signatures, source
  paths, and linked section IDs.
- **Sync sources:** File watcher events, inline code edits, and bound code file reloads.

## Configuration & Inputs
Watch Code lives on `ProjectConfig`:
- `watchCodeEnabled`: master toggle.
- `watchCodeFolders`: list of `{ path, recursive }` folder inputs.
- `watchCodeFiles`: list of file paths.
- `watchCodeRegistry`: identity -> metadata (callable name, hashes, source path,
  sections).
- `watchCodeBaselineByPath`: file -> list of identities recorded at baseline.

Input rules:
- Paths must be **repo-relative**. Absolute or outside-the-repo paths raise.
- Inputs are normalized and deduplicated.
- Only `.py` files are considered.
- Default ignore dirs: `node_modules`, `.venv`, `setta_files`, `__pycache__`.

The UI writes inputs via `route_set_watch_code_enabled` and
`route_set_watch_code_inputs`. When inputs change, the backend baselines only the
new additions (so existing callables don't auto-create sections).

## UI surface
- Watch Code no longer has its own Overview tab.
- The primary UI entry point is the radar button in the canvas controls rail
  (`frontend/src/forks/xyflow/controls/Controls.tsx`), which opens a floating
  `WatchCodePane` popover.
- The popover-open flag is session-local (`watchCodePortalOpen`) and is
  intentionally reset on reload even though the underlying watch settings still
  persist on `ProjectConfig`.
- UI-setting reveal flows now keep the Overview pane targeted while opening the
  Watch Code popover so `core.watch_code.*` anchors still resolve after the tab
  removal.

## Baselines: avoiding retroactive section creation
When Watch Code is enabled, the backend records a **baseline**:
1. It scans the configured watch inputs and stores every discovered identity in
   `watchCodeBaselineByPath`.
2. It also scans existing code sections bound to files, so current callables are
   considered "already known."

During updates:
- If a callable is in the baseline for that file, it is **not** auto-created.
- The baseline is pruned as definitions disappear.

This keeps "turn on Watch Code" from creating a flood of sections for existing
code.

## Callable discovery
Watch Code parses each `.py` file with `ast.parse` and captures:
- `def foo(...)` -> kind `function`
- `async def foo(...)` -> kind `async_function`
- `class Foo: ...` -> kind `class_init` (signature from `__init__`, dropping `self`)

Each callable yields:
- **Identity**: `{module_path}.{symbol}:{kind}`
- **Signature hash**: args + defaults (positional, kw-only, varargs)
- **Body hash**: AST of the node body

`module_path` is derived from the normalized file path with `/` -> `.`. Syntax
errors short-circuit updates to avoid corrupting registry state.

## Watcher architecture
Watch Code uses a dedicated `watchdog.Observer` (separate from
`SpecificFileWatcher`):
- Watches **parent dirs** of `watchCodeFiles` and each `watchCodeFolder` root.
- Respects the `recursive` flag per folder.
- If a watched dir does not exist yet, it watches the nearest existing ancestor
  and resyncs once the directory appears.
- Debounces file events with a 0.3s `AsyncDebouncer`.

The manager is started during `BaseProjectManager` initialization and resynced
whenever project configs change.

## Update flow (file changes)
On file changes, Watch Code compares the current scan with the registry for that
source file:

1. **Moves:** A rename/move stores `moved_from` and updates baseline + registry
   source paths for tracked files.
2. **Renames:** If both removals and additions exist, Watch Code matches by
   `{kind, signature_hash, body_hash}` and treats the pair as a rename.
3. **Removals:** Missing callables remove registry entries and clean up sections.
4. **Signature changes:** Existing entries with new signatures trigger
   `gen_code.set_callable` to refresh parameter UIs.
5. **New callables:** Not in registry **and not in baseline** -> create a new
   Callable section and register it.

After updates, the project state is broadcast to the frontend.

## Section creation & imports
New callables create a top-level `SectionType.Callable` section and a registry
entry linking the callable to the section ID. Watch Code also updates the Python
codegen prefix:
- Adds `from module import symbol` (or `as alias` if name collisions exist).
- Skips invalid module paths or symbols.
- Avoids duplicate import lines.

If the LSP signature help cannot resolve a callable, a warning notification is
emitted: "Watch Code could not resolve params ...". Repeated `no_match`
warnings are deduped until the callable state changes.

## Deletions
When a watched file is deleted:
- All registry entries with that `sourcePath` are removed.
- Matching section variants are deleted; entire sections are removed if no
  variants remain.
- The baseline entry for that file is dropped.

## Inline edits & bound code files
Watch Code responds to **both**:
- Inline edits (`set_code`): the code section update calls
  `handle_code_section_update`.
- On-disk edits for bound code files: the `CodeFiles` watcher reloads sections
  and then calls `handle_code_section_update`.

For bound Python code sections, the LSP sync happens before Watch Code processes
the updated file contents.

This keeps Watch Code aligned whether edits happen in the UI or in the editor.

## Path matching rules
- Non-recursive folders only match direct children.
- Recursive folders match any descendant path.
- Watch inputs are resolved with `normalize_workspace_path` so comparisons stay
  consistent relative to the workspace root across relative/absolute paths.

## Code references
- `backend/setta/project_state/watch_code.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/code_files.py`
- `backend/setta/types/project_config.py`
- `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`
