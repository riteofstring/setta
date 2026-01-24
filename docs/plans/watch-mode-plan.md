# Watch Code Mode Plan (Tagged Callables)

This document outlines how "Watch Code" should auto-surface function args as UI
sections when code changes, with a toggle in the top nav bar.

## Goals
- Add a top-nav toggle that enables/disables watch mode per project.
- When enabled, **tagged** functions/classes appear as callable UI sections.
- Work for new projects and pre-existing codebases via explicit watch roots.
- Code sections update live; external files update on save.
- Avoid running user code; rely on static parsing.

## UX Behavior
- Add a "Watch Code" toggle next to existing nav actions (ProjectNav).
- Provide a simple UI for watch inputs:
  - Folder watches: path + recursive on/off.
  - File watches: explicit file paths.
- On enable, run an initial scan and surface tagged callables.
- For code sections edited inside Setta, tagged callables update as soon as the
  definition stabilizes (debounced by existing `set_code` updates).
- For external files, tagged callables update after the file save event.
- Watch mode does not block normal editing; it only adds or refreshes UI sections.

## Function Detection Rules
- Parse Python AST for **tag discovery only** (no AST param extraction).
- Tags are **previous-line comments only**, immediately above `def`/`async def`/`class`.
  - Example: `# setta-auto-detect sections=3`
- Tagged `def`/`async def` produce callable sections.
- Tagged `class` produces callable sections targeting the class constructor.
- Use a canonical callable name: `<module_path>.<callable_name>`.
- Track a signature hash (arg names, kinds, defaults) to detect changes.
- Do not auto-surface untagged symbols.

## Module Path Resolution
- Derive module paths exactly like run commands do today:
  - `module_path = convert_path_to_module_path(normalize_path(file_path))`
- This matches `build_python_module_run_command` behavior and keeps imports consistent
  with how code sections are executed.
- If a watched file resolves **outside** the workspace root, imports may fail; surface
  a notification and still create the section (with empty params if LSP fails).

## Watch Registry + State
- Add a per-project flag: `watchCodeEnabled`.
- Add per-project watch inputs:
  - `watchCodeFolders: list[{ path: str, recursive: bool }]`
  - `watchCodeFiles: list[str]`
- Add a per-project registry:
  - `watchCodeRegistry[callableName] = { sectionIds, sectionsCount, signatureHash, sourcePath }`
- Registry lets us avoid duplicates and update only when signatures change.
- `sectionIds` is ordered to match `sectionsCount` so N copies stay stable across rescans.
- If the flag is off, no scanning or auto-creation occurs.

## Backend Flow
- Add a watch mode manager (new module under `backend/setta/project_state/`).
- Entry points:
  - On toggle enable: scan configured watch folders + files and populate registry.
  - On watch inputs change: re-scan affected paths.
  - On `set_code`: parse the updated code section.
  - On `reload_code_sections`: parse updated file content.
  - File watcher for watch inputs (folders + files).
- For each new function:
  - Create a callable top-level section.
  - Set section name to the callable name (or a display name derived from it).
  - Create/attach callable + params via `set_callable` (LSP signature help).
- For signature changes:
  - Rebuild params only for auto-managed sections.
  - Preserve user-set values when possible.
- For removals: do nothing (do not delete or mark stale).

## Param Extraction
- **Rely on LSP signature help only** (via `set_callable`).
- If LSP cannot resolve, create the callable section with no params.
- Reuse code object creation helpers (`create_code_obj_impl`, `add_children_of_callable`).
- Do not exclude empty-arg callables; if tagged, create the section.

## Import Handling
- If `callableName` uses a module path, the generated code still needs imports.
- Best-effort auto-imports:
  - Auto-insert `import <module>` and reference `<module>.<callable>`.
  - If import fails (non-importable module), keep the section but params stay empty.
  - Surface a notification (similar to existing LSP/type error UX) so the user can fix imports manually.

## Frontend Flow
- Add a `WatchCodeToggleButton` similar to `FollowAIToggleButton`.
- Store the toggle in project state (`ProjectConfig.watchCodeEnabled`).
- Add UI for watch folders + files (path + recursive).
- On toggle change, call a new endpoint and rely on websocket updates.
- Optional: show a small "scanning" indicator while initial scan runs.

## Performance + Safety
- Debounce parsing per file (200-400ms).
- Cache last seen signature hash per function and per file.
- Ignore noisy directories by default (`node_modules`, `.venv`, `setta_files`).
- Never import or execute user modules for signature discovery.

## Suggested Files to Touch
- Backend:
  - `backend/setta/types/project_config.py` (watch flag + registry)
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/project_state/project_manager_types.py`
  - `backend/setta/routers/project_manager.py`
  - `backend/setta/project_state/watch_code.py` (new)
- Frontend:
  - `frontend/src/components/AppHeader/ProjectNav.tsx`
  - `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx` (new)
  - `frontend/src/state/definitions.ts`
  - `frontend/src/utils/generatedEndpoints.ts` (via `pnpm generate`)

## Tests
- Tag parsing (previous-line comment).
- Auto-create callable section on new function in a code section.
- External file update flow (simulate reload + watch mode on).
- Signature change refresh (new arg added) without mocks.
- Class tag handling (LSP resolution on class callable).

## Open Questions
- None (current default: do nothing when `sections=N` decreases).
