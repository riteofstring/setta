# Project Codegen Languages Plan

This plan introduces a per-project codegen language configuration so projects like
`settings` can opt out of generated Python code, while keeping an architecture that
can grow into multi-language generation later.

## Goals
- Allow each project config to enable/disable generated code explicitly.
- Keep the Python codegen path intact for standard projects.
- Ensure settings-only projects never create generated Python files or LSP sessions.
- Keep manual `Code` sections runnable even when `codegenTargets` is empty.
- Lay groundwork for multiple codegen targets in a single project.

## Non-Goals (for this pass)
- Do not implement non-Python code generators.
- Do not change how manual `Code` sections work.
- Do not preserve backward compatibility with legacy config formats.

## Data Model Changes
- Add a project-level language/target list instead of a single implicit Python target.
  - Example: `ProjectConfig.codegenTargets: list[ProjectCodegenTarget]`.
  - Each target includes `language` and language-specific settings.
- Introduce `ProjectCodegenLanguage` enum (start with `python`).
- Move `genCodePrefix`/`genCodeSuffix` into the Python target settings so each
  future language can carry its own template metadata.
- Provide a helper to check if a project config supports a given language, e.g.
  `project_config_has_codegen_language(projectConfig, ProjectCodegenLanguage.python)`.

## Default Behavior
- New project configs default to a single Python target with existing prefix/suffix.
- Settings project config sets `codegenTargets = []`.
- If Python target is removed, generated code bindings are cleared and no new
  code is written.

## Backend Behavior Updates
- Skip Python code generation entirely when the project lacks a Python target,
  but keep manual code sections fully active.
  - `ProjectStateSingleConfig.validate_code_file_bindings` should only create
    `genCodeBinding` when Python is enabled; otherwise keep it `None`.
  - `CodeFiles._generate_bindings_for_config` should skip GenPython bindings
    if `genCodeBinding` is `None`.
  - `BaseProjectManager._refresh_codegen_state` should:
    - Clean up any cached `ProjectGenPythonCode` for that config.
    - Skip generator work + LSP sync for generated code only.
    - Still build/update `ProjectPythonCode`/`ProjectBashCode` entries for
      manual `Code` sections (including LSP for Python code sections).
- Guard gen-code-only operations with explicit checks and clear errors:
  - `type_check`, gen-code completions, `set_callable`,
    `gen_code_prefix_completion`, `gen_code_suffix_completion`.
  - If Python is disabled, raise a clear `KeyError` or return a no-op response
    depending on the endpoint’s semantics.
- Update `create_run_command` to allow running manual `Code` sections even when
  Python codegen is disabled.
  - If `sectionId` (or `entryCodeBlockId`) targets a manual code section, run it.
  - If no runnable section is specified and Python codegen is disabled, raise a
    clear error.
- Ensure share/deployment paths don’t force gen code bindings:
  - Update `ShareRuntimeState._ensure_gen_code_binding` to no-op if Python is
    not enabled.
  - Skip `genCodeBinding` adjustments in `share/deployment_utils.py` when missing.
- Update new project creation to conditionally add a GenPythonCode section only
  when Python codegen is enabled.

## Generated Code Section Strategy
- Short-term: keep `SectionType.GenPythonCode`, but only create/use it when the
  project includes Python in `codegenTargets`.
- Long-term (optional follow-up):
  - Replace `GenPythonCode` with a generic `GeneratedCode` section that carries
    a `language` attribute.
  - Track generated sections by language in project state instead of a single
    `singletonSections.GenPythonCode`.
  - UI can then show multiple generated code sections (one per language).

## Frontend + UI Updates
- Read `projectConfig.codegenTargets` to drive UI:
  - Hide “Show Generated Python” in the section menu when Python is disabled.
  - Hide GenPythonCode sections in run lists if Python codegen is disabled.
  - Keep manual `Code` sections in run lists regardless of codegen targets.
  - Disable or adjust only gen-code-specific actions; keep code-section
    run actions and code completions intact.
- Main run button behavior:
  - If Python codegen is disabled and `entryCodeBlockId` points to a manual code
    section, run that section.
  - If there is no entry code block, disable the main run button or show a
    clear prompt.
- Add UI to edit project codegen targets (likely in Overview > Project Config):
  - Toggle Python codegen on/off per project.
  - When toggled off, remove the GenPythonCode section (if present) or mark it
    as hidden.
- Adjust CodeArea wiring to read prefix/suffix from the Python target settings.
- Regenerate frontend bindings after backend type updates
  (`source activate.sh && cd frontend && pnpm generate`).

## API + Endpoint Updates
- Add an endpoint to update `codegenTargets` for a project config.
- Update `set_gen_code_prefix`/`set_gen_code_suffix` to target the Python
  codegen settings, or replace them with a single per-language update endpoint.
- Ensure frontend uses `generatedEndpoints` for all new routes.

## Tests
- Backend unit tests:
  - Settings project creates no `genCodeBinding`.
  - `create_run_command` runs manual code sections even when Python is disabled.
  - `create_run_command` errors with a clear message when there is no runnable
    section and Python is disabled.
  - `validate_code_file_bindings` leaves GenPythonCode binding empty when no
    Python target exists.
  - Share runtime state skips gen code binding creation for non-Python configs.
- Integration-ish flows (no mocks):
  - Toggle Python codegen on/off and confirm generated code sections appear
    or disappear and no new generated files are written.

## Documentation Updates
- Update `backend/setta/mcp/system_prompt.md` to mention that generated code
  sections exist only when Python codegen is enabled.
- Add a short note to `docs/README.md` or a dedicated doc describing
  `codegenTargets` and supported languages.

## Suggested Files to Touch
- Backend:
  - `backend/setta/types/project_config.py`
  - `backend/setta/types/project_state.py`
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/project_state/project_state_summary_types.py`
  - `backend/setta/project_state/share_runtime_state.py`
  - `backend/setta/project_state/settings_project.py`
  - `backend/setta/project_state/code_files.py`
  - `backend/setta/project_state/project_manager_types.py`
  - `backend/setta/routers/project_manager.py`
  - `backend/setta/share/deployment_utils.py`
  - `backend/setta/mcp/system_prompt.md`
- Frontend:
  - `frontend/src/state/actions/sections/createSectionsHelper.ts`
  - `frontend/src/components/Section/Layouts/CodeArea.tsx`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/state/actions/runOrImportCode.ts`
  - `frontend/src/components/Panes/Overview/ProjectConfigs.tsx`
  - `frontend/src/utils/generatedTypes.ts` (via `pnpm generate`)
  - `frontend/src/utils/generatedEndpoints.ts` (via `pnpm generate`)

## Open Questions
- Should callable sections be completely disabled when Python codegen is off,
  or allowed with a warning?
- When toggling Python off, should the GenPythonCode section be deleted or just
  hidden?
- Do we want multiple generated code sections (one per language) or a single
  combined view with a language selector?
