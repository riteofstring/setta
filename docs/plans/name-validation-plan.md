# Name Validation Plan (Projects, Sections, Params)

This plan defines how Setta should validate project, section, and param names to
prevent route collisions (ex: `home`, `settings`), path issues, and invalid
codegen identifiers. It targets backend-first validation with frontend
pre-checks for UX, and adds tests to lock behavior.

## Background + Current State
- Project names are only validated for uniqueness in
  `backend/setta/types/helpers_lvl2.py` (`set_project_config_name`).
- Section names are only guarded in the UI for empty strings and duplicate
  siblings (`frontend/src/components/Section/Header/SectionTitle.tsx`).
- Param names are not validated; they are used directly in codegen keyword
  arguments (`backend/setta/code_gen/value_codec.py`).
- Routes reserve `/home` and `/settings`, but project names can currently be
  `home` or `settings`, which collides with routing.
- `sanitize_name` does not remove path separators or `..`, and is used to build
  project/section code paths.

## Goals
- Enforce consistent, explicit validation for project/section/param names.
- Prevent collisions with reserved routes and the settings project.
- Prevent path traversal or path-separator names from influencing file paths.
- Keep codegen-safe identifiers for params when Python codegen is enabled.
- Provide clear error messages to the frontend (HTTP 422).

## Non-Goals
- Backward compatibility for invalid existing names (we can break/fail fast).
- Overly permissive name normalization (prefer explicit errors).
- Adding new try/except blocks unless truly required.

## Validation Rules (Proposed)
### Shared rules (project, section, param)
- Trim whitespace; reject empty after trim.
- Reject control characters.
- Reject path separators (`/`, `\\`) and `..` segments.
- Disallow reserved names (case-insensitive) per entity.

### Project name rules
- Reserved names: `home`, `settings` (and `C.SETTINGS_PROJECT_NAME`).
- Additionally reserve any routes that are not project names (ex: `/home`).
- Enforce uniqueness against other project config names (already exists).
- Ensure `sanitize_name(project)` produces a non-empty slug.

### Section name rules
- Reject empty after trim.
- Enforce no duplicate sibling names (currently only in UI; must enforce in
  backend too).
- Enforce `sanitize_name(get_section_path_full_name(...))` uniqueness within the
  project config to prevent codegen path collisions.
- When a move would cause a conflict (duplicate sibling name or slug collision),
  allow the move but mark the section name(s) as invalid in state.
- If a slug collision impacts code file bindings, clear/disable the bindings for
  the conflicting sections until the conflict is resolved.

### Param name rules
- Reject empty after trim, except for kwargs/dict-key params that start with an
  empty draft name (`coreNameEditable`); treat empty names as a draft state and
  skip validation until the user enters a non-empty value.
- Reject duplicates within the same callable (if applicable).
- If Python codegen is enabled for the project, require valid Python identifiers
  for keyword-style params (and forbid Python keywords).

## Backend Implementation Plan
1. Create a new validation module:
   - `backend/setta/utils/name_validation.py`
   - Functions:
     - `validate_project_name(...)`
     - `validate_section_name(...)`
     - `validate_param_name(...)`
     - `validate_view_mode_name(...)` (optional, if we decide to guard view mode
       names too)
   - Define reserved sets and helper functions (string trimming, forbidden
     chars, keyword checks, etc).

2. Add new exceptions (no try/except, but raise explicit errors):
   - `InvalidProjectName`, `InvalidSectionName`, `InvalidParamName` in
     `backend/setta/types/helpers_lvl2.py` or a new `backend/setta/utils/errors.py`.

3. Wire validation into backend flows:
   - Project creation + rename
     - `backend/setta/project_state/base_project_manager.py`
       - `create_project_config` (validate generated name if we keep auto name)
       - `set_project_config_name`
       - `save_as_new_project_config`
     - `backend/setta/types/helpers_lvl2.py::set_project_config_name`
   - Section renames
     - `backend/setta/types/helpers_lvl2.py::set_section_name`
     - `backend/setta/project_state/base_project_manager.py` where names are
       set directly.
   - Section moves
     - After `move_sections_to_parent_section` / `move_section_to_pane`, recompute
       name conflicts and update state (do not block the move).
   - Param renames
     - `backend/setta/project_state/base_project_manager.py::set_code_obj_name`
     - `set_param_name_and_value`
   - Text block heading-as-name path (if it sets section name directly).

4. Validate name collisions via slug/paths:
   - For sections, compute full path name and `sanitize_name` and ensure the
     resulting slug is unique within the project config.
   - For projects, ensure `sanitize_name(project_name)` does not collide with
     other projects' slugs used in code paths.
   - Add a per-project conflict map (ex: `invalidNameErrors`) that records
     section/param IDs with conflict messages so the frontend can render a red
     indicator + tooltip. Populate this map during renames and moves.
   - Recommended transport: a **separate websocket payload** (similar to type
     errors) instead of embedding in `ProjectStateSingleConfig`, to avoid
     persisting derived/ephemeral state.

5. Return HTTP 422 with explicit error messages:
   - Update routers to catch new exceptions (similar to ProjectNameTaken in
     `backend/setta/routers/projects.py`).
   - Keep error details readable and consistent.

## Frontend Changes (UX)
- Add pre-validation in UI to reduce round trips:
  - Project rename input (`frontend/src/components/Panes/Overview/ProjectOverview/ProjectName.tsx`).
  - Section title rename (`frontend/src/components/Section/Header/SectionTitle.tsx`).
  - Param rename (`frontend/src/components/Params/ParamItems/ParamNameInput.tsx`).
- Display inline errors for reserved names / invalid characters.
- When conflicts are present (duplicate sibling names or slug collisions), show
  a red invalid-name indicator on section titles (and on param name inputs where
  applicable) with a tooltip listing the conflicts. Keep the move allowed but
  visually flagged until fixed.
- Keep backend as the source of truth (frontend checks can be stricter later).
  - Use a dedicated store (like `useTypeErrors`) fed by the new websocket
    payload for invalid-name diagnostics.

## Tests
- Backend unit tests (no mocks):
  - New tests under `tests/` mirroring `backend/setta/utils/name_validation.py`.
  - Validate reserved names: `home`, `settings`.
  - Validate path separators and `..`.
  - Validate slug collisions for sections and projects.
  - Validate python-identifier enforcement for param names under codegen.
  - Validate move conflict behavior: move succeeds, conflicting sections are
    marked invalid, and conflicting code file bindings are cleared/disabled.
- API-level tests for rename endpoints:
  - `route_set_project_config_name`
  - `route_set_section_name`
  - `route_set_code_obj_name`

## Migration / Existing Invalid Names
- Choose a hard error strategy:
  - If invalid names exist in persisted projects, throw a clear error on load
    and instruct users to rename.
- Optional auto-migration: append a suffix (ex: `name_2`) to make valid. This is
  more invasive; only do if we explicitly want auto-repair.

## File Touch List (Expected)
- Backend:
  - `backend/setta/utils/name_validation.py` (new)
  - `backend/setta/types/helpers_lvl2.py`
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/routers/projects.py`
  - `backend/setta/routers/project_manager.py`
- Frontend:
  - `frontend/src/components/Panes/Overview/ProjectOverview/ProjectName.tsx`
  - `frontend/src/components/Section/Header/SectionTitle.tsx`
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`

## Open Questions
- Should `settings` be fully reserved for projects even in share mode, or should
  share deployments namespace it separately?
- Should we also reserve `home`, `settings`, and `index` for section names to
  avoid confusion, or keep them scoped to projects/routes only?
- Should view mode names also be validated (likely yes, but low priority)?
- If Python codegen is disabled, do we still enforce Python-identifier rules for
  params? (Proposal: no, only enforce when codegen is enabled.)

## Rollout Order
1. Backend validation + errors first.
2. Frontend pre-validation + error messaging.
3. Tests for validation rules and API flows.
4. Optional migration script if we decide to auto-fix legacy data.
