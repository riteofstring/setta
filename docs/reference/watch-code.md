# Watch Code

Watch Code keeps the UI in sync with top-level Python definitions. When the
plugin provider is active and a project has configured file or folder inputs, it
watches those repo-relative paths, parses `.py` files for new
callables, and automatically creates, updates, or removes **Callable** sections to
match what's on disk.

## Overview
- **Scope:** Python only. Watch Code skips updates if Python codegen is disabled.
- **Targets:** Top-level `def`, `async def`, and `class` definitions (via `__init__`).
- **Outputs:** Callable sections plus registry entries that track signatures, source
  paths, and linked section IDs.
- **Sync sources:** File watcher events, inline code edits, and bound code file reloads.

## Provider Contract
Watch Code is available only when exactly one active plugin contributes the
Watch Code provider capability. The provider must declare
`featureCapabilities.watchCode`, probe a `watchCodeBackend` registration with
contract/data schema version `1`, support the `python` language, and register
the required backend route under `/plugins/<pluginId>/watch-code/inputs`.

The first-party provider is `setta-watch-code`. It declares:
- `registerWatchCodeBackend`
- `registerRouter`
- `registerUISettings`
- `registerCanvasControl`
- `registerSettingRevealHandler`
- `readProjectState`
- `subscribeProjectState`

If the provider probe sets `requiresLanguageServer=true`, plugin runtime status
also reports a Python language-server dependency. The parser and persistence
contract are still Go-owned, but callable param refresh depends on the selected
Python language server being active after any required restart.

## Configuration & Inputs
Watch Code state is stored under document plugin data:

```json
{
  "pluginData": {
    "setta-watch-code": {
      "schemaVersion": 1,
      "projects": {
        "<projectId>": {
          "folders": [],
          "files": [],
          "registry": {},
          "baselineByPath": {}
        }
      }
    }
  }
}
```

The per-project fields are:
- `folders`: list of `{ path, recursive }` folder inputs.
- `files`: list of file paths.
- `registry`: identity -> metadata (callable name, hashes, source path,
  sections).
- `baselineByPath`: file -> list of identities recorded at baseline.

Input rules:
- Paths must be **repo-relative**. Absolute or outside-the-repo paths raise.
- Inputs are normalized and deduplicated.
- Only `.py` files are considered.
- Default ignore dirs: `node_modules`, `.venv`, `setta_files`, `__pycache__`.

The plugin UI writes inputs through `fetchBackendRoute("/watch-code/inputs")`.
An active provider plus non-empty `folders` or `files` is the project-level
activation signal. When inputs change, the backend baselines only the new
additions (so existing callables don't auto-create sections).

Frontend project-state snapshots expose only the active project's payload as
`pluginData[providerPluginId]`. The full `schemaVersion/projects` wrapper is
kept in `project.json`; project clone/save-as copies matching project-scoped
payloads, and project deletion removes matching project entries.

## UI surface
- Watch Code no longer has its own Overview tab.
- The first-party `setta-watch-code` plugin contributes the radar button to the
  canvas controls rail. It opens a floating Watch Code popover from
  `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`.
- The plugin uses canonical UI-setting ids under
  `plugin::setta-watch-code::*`; the old `core.watch_code.*` ids are not
  registered as aliases.
- UI-setting reveal flows call the plugin reveal handler, which opens the
  popover and highlights the matching plugin-owned anchor.

## Baselines: avoiding retroactive section creation
When Watch Code inputs are added, the backend records a **baseline**:
1. It scans the configured watch inputs and stores every discovered identity in
   plugin-owned `baselineByPath`.
2. It also scans existing code sections bound to files, so current callables are
   considered "already known."

During updates:
- If a callable is in the baseline for that file, it is **not** auto-created.
- The baseline is pruned as definitions disappear.

This keeps adding Watch Code inputs from creating a flood of sections for
existing code.

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
Watch Code now uses a Go-owned polling/runtime path under `internal/watchcode`:
- `Manager` normalizes config snapshots into tracked files/dirs, desired watch
  dirs, and scheduled scan/delete work.
- `Service` snapshots tracked files on a poll interval (default 300ms), diffs
  them, translates changes into create/modify/delete/move events, and drains
  the scheduled scans/deletes.
- The runtime handles explicit files plus watched folders, respects the
  `recursive` flag, and keeps pending dirs when configured roots do not exist
  yet.

App wiring keeps the service in sync with the active provider and
project-scoped plugin data, then routes file updates into the Go project-state
watch-code apply path.

## Update flow (file changes)
On file changes, Watch Code compares the current scan with the registry for that
source file:

1. **Moves:** A rename/move stores `moved_from` and updates baseline + registry
   source paths for tracked files.
2. **Renames:** If both removals and additions exist, Watch Code matches by
   `{kind, signature_hash, body_hash}` and treats the pair as a rename.
3. **Removals:** Missing callables remove registry entries and clean up sections.
4. **Signature changes:** Existing entries with new signatures refresh the
   callable section's param UI through the Go watch-code apply path.
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
  `ApplyWatchCodeBoundSectionUpdate` after syncing the bound source into the Go
  LSP/runtime path.
- On-disk edits for bound code files: the bound-code reload path rehydrates the
  section content and then applies the same bound-section watch-code update.

For bound Python code sections, the LSP sync happens before Watch Code processes
the updated file contents.

This keeps Watch Code aligned whether edits happen in the UI or in the editor.

## Path matching rules
- Non-recursive folders only match direct children.
- Recursive folders match any descendant path.
- Watch inputs are resolved with `normalize_workspace_path` so comparisons stay
  consistent relative to the workspace root across relative/absolute paths.

## Code references
- `internal/watchcode/service.go`
- `internal/watchcode/manager.go`
- `internal/projectstate/watch_code.go`
- `internal/projectstate/watch_code_apply.go`
- `internal/projectstate/watch_code_bound_sections.go`
- `internal/projectstate/watch_code_plugin_data.go`
- `internal/app/code_updates.go`
- `internal/app/watch_code_plugin_backend_routes.go`
- `internal/watchcodecontracts/backend.go`
- `backend/setta/plugin_runtime/watch_code.py`
- `plugins/setta-watch-code/backend/main.py`
- `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
