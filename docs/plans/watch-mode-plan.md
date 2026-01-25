# Watch Code Mode Plan

This document outlines how "Watch Code" should auto-surface function args as UI
sections when code changes, with a toggle in the top nav bar.

## Goals
- Add a top-nav toggle that enables/disables watch mode per project.
- When enabled, new functions with args appear as callable UI sections.
- Work for new projects and pre-existing codebases.
- Code sections update live; external files update on save.
- Avoid running user code; rely on static parsing.

## UX Behavior
- Add a "Watch Code" toggle next to existing nav actions (ProjectNav).
- On enable, run an initial scan and surface new callable sections.
- For code sections edited inside Setta, new functions appear as soon as the
  definition stabilizes (debounced by existing `set_code` updates).
- For external files, new functions appear after the file save event.
- Watch mode does not block normal editing; it only adds or refreshes UI sections.

## Function Detection Rules
- Parse Python AST for top-level `def` and `async def`.
- Skip functions with zero args. Count `*args`/`**kwargs` as args.
- Default: ignore nested functions and class methods.
- Use a canonical callable name: `<module_path>.<function_name>`.
- Track a signature hash (arg names, kinds, defaults) to detect changes.

## Watch Registry + State
- Add a per-project flag: `watchCodeEnabled`.
- Add a per-project registry:
  - `watchCodeRegistry[callableName] = { sectionId, signatureHash, sourcePath }`
- Registry lets us avoid duplicates and update only when signatures change.
- If the flag is off, no scanning or auto-creation occurs.

## Backend Flow
- Add a watch mode manager (new module under `backend/setta/project_state/`).
- Entry points:
  - On toggle enable: scan configured roots and populate registry.
  - On `set_code`: parse the updated code section.
  - On `reload_code_sections`: parse updated file content.
  - Optional: file watcher for general workspace files (pre-existing projects).
- For each new function:
  - Create a callable top-level section.
  - Set section name to the function name (or a display name derived from it).
  - Create/attach callable + params from the AST signature.
- For signature changes:
  - Rebuild params only for auto-managed sections.
  - Preserve user-set values when possible.
- For removals:
  - Do not auto-delete by default; mark as stale (open question).

## Param Extraction
- Build params directly from AST to avoid importing user code.
- Use `docstring_parser` on the function docstring for descriptions/defaults.
- Map args to `ParameterPassingStyle` using existing conventions.
- Reuse code object creation helpers (`create_code_obj_impl`, `add_children_of_callable`).

## Import Handling
- If `callableName` uses a module path, the generated code still needs imports.
- Options:
  1) Auto-insert `from <module> import <function>` into `genCodePrefix`.
  2) Auto-insert `import <module>` and reference `<module>.<function>`.
  3) Require users to manage imports manually (lowest automation).
- Prefer option 2 to avoid name collisions; keep a deduped import list.

## Frontend Flow
- Add a `WatchCodeToggleButton` similar to `FollowAIToggleButton`.
- Store the toggle in project state (`ProjectConfig.watchCodeEnabled`).
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
- AST signature extraction (positional, keyword-only, varargs, defaults).
- Auto-create callable section on new function in a code section.
- External file update flow (simulate reload + watch mode on).
- Signature change refresh (new arg added) without mocks.

## Open Questions
- Should watch mode auto-remove sections when a function disappears?
- Should class methods be included if they have args?
- What are the default watch roots for pre-existing repos?
- Should watch mode auto-edit `genCodePrefix`, or prompt instead?
