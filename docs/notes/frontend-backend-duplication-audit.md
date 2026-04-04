# Frontend/Backend Duplication Audit

## Scope

This note only records duplication that looks unjustified after comparing `frontend/src/` against the Go backend under `internal/`.

I reviewed the main overlap-prone areas:

- name validation and rename flows
- section slug/path derivation
- managed chat stream reduction and hydration
- view mode and window-space ordering
- server-mode / launcher boundary policy

The bar for calling duplication justified was:

- the frontend truly needs the logic locally for immediate UX or browser-only transport behavior
- the backend still remains the authoritative owner
- and there is either a shared contract/fixture locking the copies together or the duplicate logic is small and presentation-adjacent

The rename-flow findings from the original pass have now been fixed. I kept the
details below as a resolved record so the note still explains what was wrong
and what changed.

## Current Unjustified Duplications

None found in the overlap areas rechecked during the follow-up fix pass.

## Resolved Unjustified Duplications

### 1. Section rename validation reimplements backend section-name authority in the component

Status: resolved. `frontend/src/components/Section/Header/SectionTitle.tsx` now
keeps only local format validation and submits rename conflicts to the backend.

**Frontend**

- `frontend/src/components/Section/Header/SectionTitle.tsx`
- `frontend/src/utils/sectionSlugPaths.ts`

**Backend owner**

- `internal/projectstate/section_names.go`
- `internal/projectstate/name_validation.go`
- `internal/projectstate/code_section_bindings.go`

**Duplicated logic**

- sibling-name uniqueness checks (`getSiblingHasName` vs `validateSectionName`)
- top-level Python identifier collision checks (`getTopLevelPythonIdentifierConflictError` vs `sanitizeSectionPythonIdentifier` callers in backend validation)
- full-path section name reconstruction for the renamed section and its descendants (`resolveSectionFullPathName` vs `activeSectionPathFullNameWithOverrides`)
- slug recomputation and conflict detection for descendant paths (`getSectionSlugConflictError` vs `activeSectionSlugMap` / `validateSectionName`)

**Why this is unjustified**

- The backend already owns the authoritative acceptance rules for section renames, including the descendant slug-conflict behavior.
- The frontend is not just doing a cheap format precheck. It is duplicating the backend’s correctness-sensitive conflict logic.
- The shared frontend/backend fixture coverage only locks basic name-format validation. It does not lock these section-conflict rules.
- A better repo-local pattern already exists in `frontend/src/components/Panes/Overview/ProjectOverview/ProjectName.tsx`, where the frontend calls the backend rename route as the condition and surfaces backend `detail` instead of re-encoding uniqueness logic.
- Most of the rename-specific helper work in `sectionSlugPaths.ts` exists to support this client-side validation copy.

**Risk**

- false accepts or false rejects when backend conflict semantics change
- drift in descendant path handling, which is harder to notice than basic format drift
- more frontend-only code that has to stay in sync with Go-owned slug and identifier rules

**Recommended direction**

- keep only the shared format-level validation on the frontend
- move uniqueness / identifier / descendant-slug checks back behind backend authority
- either preflight through a backend call before commit or submit the rename and surface backend validation errors directly

### 2. View mode rename validation duplicates backend view-mode naming rules

Status: resolved. `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx`
now keeps only local format validation and surfaces backend rename errors
instead of rerunning slug-conflict checks in the browser.

**Frontend**

- `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx`

**Backend owner**

- `internal/projectstate/view_modes.go`
- `internal/httpapi/project_routes.go`

**Duplicated logic**

- `conditionToSetName` repeats the backend acceptance decision after `validateViewModeNameInput`
- it locally recomputes the sanitized slug and scans all existing view modes for conflicts

**Why this is unjustified**

- The backend already owns this rule set in `validateViewModeName`, including reserved-name handling, sanitization, and slug-conflict detection.
- The route layer already exposes backend validation detail through `writeViewModeMutationError`.
- Unlike the project-name flow, this widget does not delegate the final rename decision to the backend before accepting the edit.
- There is no shared fixture or contract test locking the uniqueness/conflict half of this logic to the backend implementation.

**Risk**

- rename behavior drifts when backend validation changes
- the UI can reject or accept a name for stale frontend reasons
- there is no dedicated backend-backed validation store for view-mode names, so this copy becomes the de facto inline authority

**Recommended direction**

- keep the shared format validator
- remove the local uniqueness scan
- use the backend mutation result as the authority, following the same pattern already used by `ProjectName.tsx`

### 3. Window-space rename validation duplicates backend window-space naming rules

Status: resolved. `frontend/src/components/Panes/Overview/WindowSpacesPane.tsx`
now keeps only local format validation and lets the backend own conflict
acceptance for rename attempts.

**Frontend**

- `frontend/src/components/Panes/Overview/WindowSpacesPane.tsx`

**Backend owner**

- `internal/projectstate/project_chat_windowing_writes.go`
- `internal/httpapi/project_routes.go`

**Duplicated logic**

- `canSetWindowSpaceName` reruns the backend decision after `validateWindowSpaceNameInput`
- it locally sanitizes the candidate slug and scans existing window spaces for collisions

**Why this is unjustified**

- The backend already owns this rule set in `validateWindowSpaceName`.
- The route layer already returns backend `detail` through `writeWindowSpaceMutationError`.
- As with view modes, the frontend is hand-maintaining a second copy of the acceptance logic instead of delegating the final answer to the backend.
- There is no shared fixture or contract test tying this conflict logic to the Go implementation.

**Risk**

- drift between frontend acceptance and backend acceptance
- silent UX breakage when slug rules change in one side only
- extra rename-specific code that provides no unique browser-only value

**Recommended direction**

- keep the local format precheck only
- let the backend own the uniqueness/conflict decision
- surface backend mutation detail instead of keeping a second slug-conflict implementation in the widget

## Reviewed And Excluded

These overlaps were inspected but not included above because they appear justified.

### Shared name-format validators

**Frontend**

- `frontend/src/utils/nameValidation.ts`
- `frontend/src/utils/nameValidation.test.ts`

**Backend**

- `internal/projectstate/name_validation_frontend_fixtures_test.go`
- `internal/projectstate/project_names.go`
- `internal/projectstate/section_names.go`
- `internal/projectstate/view_modes.go`
- `internal/projectstate/project_chat_windowing_writes.go`
- `internal/projectstate/code_object_names.go`

**Why excluded**

- The frontend copy is limited to immediate caller-visible format validation.
- The rules are intentionally locked to a shared fixture file: `tests/fixtures/name_validation_cases.json`.
- This is exactly the kind of duplication that is acceptable when both runtimes need the same basic UX validation and the repo already has parity tests.

### Managed chat stream and hydration reducers

**Frontend**

- `frontend/src/state/actions/chatStreamState.ts`
- `frontend/src/state/actions/aiChatStreamingContract.test.ts`
- `frontend/src/state/actions/aiHydrationAuthorityContract.test.ts`

**Backend**

- `internal/managedchat/live_runtime.go`
- `internal/managedchat/live_runtime_contract_test.go`

**Why excluded**

- Both sides genuinely need local reducer logic: the browser for optimistic streamed UI updates, the backend for authoritative live runtime state.
- The overlap is locked by shared contract fixtures under `tests/fixtures/llm/`.
- This looks deliberate and appropriately constrained.

### View-mode and window-space ordering helpers

**Frontend**

- `frontend/src/utils/viewModeOrdering.ts`
- `frontend/src/state/actions/windowSpaces.ts`

**Backend**

- `internal/projectstate/view_modes.go`
- `internal/projectstate/project_chat_windowing_writes.go`

**Why excluded**

- The frontend needs stable presentation order from unordered maps.
- The backend separately needs canonical ordering for persistence, repair, and deterministic state behavior.
- The logic is small, obvious, and presentation-adjacent enough to be acceptable.

### Param duplicate checking during debounced typing

**Frontend**

- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`

**Backend**

- `internal/projectstate/code_object_names.go`

**Why excluded**

- This does duplicate same-parent param-name conflict checks.
- I did not classify it as unjustified because this widget does debounced optimistic writes on each edit keystroke, so immediate local duplicate rejection plausibly avoids churny invalid writes and rollback noise.
- The backend still remains authoritative for final acceptance.

### Server-mode endpoint/origin policy

**Frontend**

- `frontend/src/utils/serverModeBoundaryPolicy.ts`
- `frontend/src/utils/transportUrlCore.ts`

**Backend**

- `internal/modes/policy.go`
- `internal/httpapi/httpapi.go`
- `internal/httpapi/workspace_launch_routes.go`
- `internal/httpapi/launcher_home_routes.go`
- `internal/httpapi/status_routes.go`

**Why excluded**

- There is overlap in mode knowledge, but the frontend still has a browser-owned job the backend cannot directly do: choose which origin a browser request should target.
- Route paths themselves are generated from backend specs already.
- This area looks more like transport wiring than duplicated backend business validation.

## Resolved Since Prior Audit

I also rechecked the previously committed version of this audit against the
current code before replacing it.

- The older view-mode optimistic-mutation finding is no longer current. `frontend/src/state/actions/viewModes.ts` now sends sort/delete mutations and applies the backend-returned `projectConfig` snapshot instead of replaying delete fallback semantics locally.
- The older window-space automatic-name-generation finding is no longer current. `frontend/src/state/actions/windowSpaces.ts` now calls `route_create_window_space` without a generated `name`, so the backend owns default naming again.
- The older standalone window-space slug finding is also mostly stale. `frontend/src/utils/windowSpacePaths.ts` now builds routes from backend-owned `windowSpaceSlugsById`, and standalone section/window-space resolution uses backend-owned slug maps on loaded project state.
