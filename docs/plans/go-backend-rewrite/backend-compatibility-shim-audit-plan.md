# Backend Compatibility Shim Audit Plan

Date: 2026-03-24
Branch: `go-rewrite` (`f64e48c2e`)

## Goal

Do a systematic sweep of the backend codebase and identify any remaining
compatibility / repair / backfill / legacy-shape handling that exists to tolerate
old persisted state, old payload contracts, or stale derived documents.

This audit is not trying to flag ordinary validation, canonicalization, or
environment fallbacks. The target is code that keeps old behavior or old data
working instead of requiring the current contract.

## Scope

- Go backend runtime and transports under `internal/` and `cmd/`
- Retained Python/backend package surface under `backend/setta/`
- Production code only for findings
- Tests may be used as evidence for intent, but test-only compatibility helpers do
  not count as production shims

## Classification Rules

Count as a compatibility shim when production code does one or more of these:

- repairs or backfills missing persisted fields
- accepts legacy field names or legacy payload shapes
- preserves stale derived-project state instead of rebuilding or rejecting it
- detects "outdated" persisted documents and upgrades them in place
- silently rewrites old values into current values during load or refresh

Do not count these as compatibility shims:

- strict validation of current inputs
- canonicalization of current-format values (trim, dedupe, sort, clamp)
- runtime environment fallbacks unrelated to old persisted app data
- internal defaults for newly created current-format documents

## Search Method

### Phase 1. Broad keyword sweep

Search backend production code for:

- `compat`
- `repair`
- `backfill`
- `legacy`
- `outdated`
- `deprecated`
- `migrate`
- `upgrade`
- `normalize`
- `fallback`

The point of this phase is recall, not precision.

### Phase 2. High-signal narrowing

Prioritize files and symbols that mention:

- persisted documents
- load / refresh / bootstrap flows
- settings projects
- project shell rebuilds
- route payload decoding
- startup / launcher preflight

Ignore obvious false positives where the code is clearly doing current-contract
validation or generic runtime fallback behavior.

### Phase 3. Manual classification

For each candidate:

- read the production implementation
- read nearby tests only if intent is unclear
- decide whether it is true compatibility logic, a non-compatibility fallback, or
  ordinary normalization/validation

### Phase 4. Deliverable

Produce:

- a list of confirmed remaining compatibility shims, with file references
- a list of notable false positives that looked suspicious but are not actually
  compatibility behavior
- recommended removal order if confirmed shims remain

## Execution Notes

- Prefer `rg` for breadth, then targeted `sed`/`rg -n` for inspection.
- Keep the audit evidence grounded in current production code paths.
- Do not change production behavior as part of the audit unless a separate
  implementation step is requested.

## Execution Results

The audit is complete.

The main remaining compatibility / repair logic is not in settings anymore. It is
now concentrated in generic project-state load normalization, plus a smaller old
field-name compatibility path around code file bindings.

## Confirmed Remaining Compatibility Shims

### 1. Go project-state load repair

The Go project runtime still repairs persisted project documents on load instead
of failing closed.

- `internal/projectstate/project_graph.go`
  `Project.Normalized()` calls load-time repair-style helpers before final
  validation:
  - `normalizeViewModesOnLoad()`
  - `pruneStaleSectionIDs(...)`
  - `ReconcileCodeSectionBindings()`
  - `ReconcileGeneratedSectionBindings()`
- `internal/projectstate/view_modes.go`
  `normalizeViewModesOnLoad()` still:
  - creates a default view mode if none exist
  - fills missing `visibilityBySectionID` entries
  - removes stale section ids from visibility/top-level layout
  - copies current top-level layout into view modes when missing
  - compacts duplicate sort indices
  - resets invalid active view mode ids
- `internal/projectstate/project_chat_windowing.go`
  `normalizeProjectChatWindowingState(...)` and `normalizeWindowSpaces(...)`
  still:
  - default missing placement/mode values
  - clear invalid chat ids for non-project-ai modes
  - drop references to missing sections
  - clear titles on section-bound windows
  - dedupe multiple windows bound to the same section
  - rebuild order arrays from surviving ids
- `internal/projectstate/project_graph.go`
  `pruneStaleSectionIDs(...)` silently removes stale `activeIds` references on
  load.

By the audit rules, these count as compatibility behavior because they silently
repair persisted state rather than rejecting it.

### 2. Store-level post-load repair for duplicate window-space sort indices

There is an explicit repair step after document normalization:

- `internal/projectstate/store.go`
  `Load()` calls `repairLoadedWindowSpaceSortIndices(...)`.
- `internal/projectstate/store.go`
  `repairLoadedWindowSpaceSortIndices(...)` rewrites duplicate
  `WindowSpaceConfig.SortIndex` values based on persisted JSON object order.

This is clearly compatibility / repair logic.

### 3. Old key-shape compatibility for code file bindings

Code file bindings still accept older payload keys instead of requiring the
current canonical shape.

- `internal/projectstate/code_section_bindings.go`
  `effectiveCodeFileBinding(...)` accepts either:
  - `canonical_path` or old `path`
  - `access_mode` or old `accessMode`
- `internal/projectstate/code_updates.go`
  `effectiveCodeSectionBindingAccessMode(...)` still reads old `accessMode`.
- `internal/projectstate/readable_export.go`
  `readableCodeFilePath(...)` still reads old `path` if `canonical_path` is
  absent.

This is a true legacy-payload shim.

### 4. Small caller-contract compatibility path in state-machine mutations

- `internal/projectstate/state_machine.go`
  Non-gate sections explicitly ignore an incoming `GateType` "to preserve the
  existing caller contract."

This is not persisted-state repair, but it is compatibility behavior at the API
contract layer.

### 5. Legacy plugin-scope surface still exposed in route parsing

- `internal/httpapi/plugin_routes.go`
  `normalizePluginInstallScope(...)` still accepts `setta_files`, and the error
  message explicitly describes it as the legacy environment scope.

Whether to remove this depends on whether you still want that scope at all, but
it is still part of a legacy compatibility surface.

### 6. Retained Python package still contains analogous repair logic

The retained Python boundary is not the active Go request path, but it still has
the same compatibility style:

- `backend/setta/types/project_state.py`
  `validate_code_file_bindings()` rebuilds / fills bindings.
- `backend/setta/types/project_state.py`
  `validate_view_modes()` repairs missing view modes, stale section references,
  duplicate sort indices, and invalid active ids.
- `backend/setta/types/project_state.py`
  `validate_window_spaces()` drops stale section bindings, rebuilds order, and
  compacts duplicate sort indices.
- `backend/setta/types/project_chat_windowing.py`
  `normalize_project_chat_windowing(...)` drops stale section bindings and
  rebuilds order.

If the goal is "no backward compatibility anywhere in repo-owned backend logic,"
these Python paths still qualify.

## Notable False Positives

- `internal/uisettings/section_ui_editor_tab_compatibility.go`
  Despite the filename, this is a UI tab availability table, not persisted-state
  compatibility logic.
- `internal/projectstate/change_param_impl.go`
  `migrateChangedParamValue(...)` is user-action value conversion during a type
  switch, not old-data tolerance.
- `internal/httpapi/launcher_management_routes.go` and `internal/settacmd/launcher.go`
  `repairLauncher` is launcher maintenance, not app/project backward
  compatibility.
- Generic `normalize*` helpers that trim, sort, clamp, or validate current-shape
  values were inspected but not counted when they did not preserve old persisted
  documents.

## Recommended Removal Order

### Phase 1. Remove Go project-state load repair

Tighten these first:

- `internal/projectstate/view_modes.go`
- `internal/projectstate/project_chat_windowing.go`
- `internal/projectstate/project_graph.go`
- `internal/projectstate/store.go`

This is the biggest remaining repair cluster and the closest analogue to the
settings compatibility code that was already removed.

Status: completed on 2026-03-24.

Execution result:

- `internal/projectstate/store.go` now validates persisted project documents
  before normalization and fails closed when load-time repair would have been
  required.
- `internal/projectstate/view_modes.go`,
  `internal/projectstate/project_chat_windowing.go`, and
  `internal/projectstate/project_graph.go` now participate in strict persisted
  load validation instead of silently accepting repair-needing persisted shapes.
- duplicate window-space sort indices now fail closed instead of being repaired
  post-load.
- current canonical persisted JSON produced by the saver is still accepted; the
  strict check compares persisted JSON shape rather than in-memory nil-vs-empty
  differences.

Verification run:

- `./scripts/go.sh test ./internal/projectstate -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(SettingsProjectStartupRejectsMissingVisibleSectionLayoutInPersistedDocument|ShutdownClosesSettingsStateEvenWhenRuntimeShutdownFails)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterArtifactRoutesShareMode(BlocksImportFiles|UpdatesAndLoadsOverlay|RejectsCachedLoadsOutsideAllowedRoots|RejectsPolicyDenied)|TestRegisterProjectRoutesProjectChatWindowingMutationsRespectDeploymentPolicy|TestRegisterProjectRoutesProjectChatWindowChatIDRespectsDeploymentLLMPolicy' -count=1`

### Phase 2. Remove old code-file-binding key fallbacks

Tighten these next:

- `internal/projectstate/code_section_bindings.go`
- `internal/projectstate/code_updates.go`
- `internal/projectstate/readable_export.go`

Require the canonical `canonical_path` / `access_mode` shape only.

Status: completed on 2026-03-24.

Execution result:

- `internal/projectstate/code_section_bindings.go` no longer reads legacy
  `codeFileBinding.path` or `codeFileBinding.accessMode`.
- `internal/projectstate/code_updates.go` no longer treats legacy
  `accessMode` as authoritative for effective access mode.
- `internal/projectstate/readable_export.go` no longer reads legacy
  `codeFileBinding.path`.
- `internal/projectstate/project_graph.go` now rejects persisted section payloads
  that still use legacy code-file-binding keys instead of silently tolerating
  them.

Verification run:

- `./scripts/go.sh test ./internal/projectstate -run 'Test(StoreLoadRejectsLegacyCodeFileBindingPayloadKeys|EffectiveCodeFileBindingIgnoresLegacyPayloadKeys|EffectiveCodeSectionBindingAccessModeIgnoresLegacyPayloadKey|ReadableCodeFilePathIgnoresLegacyPayloadPath)' -count=1`
- `./scripts/go.sh test ./internal/projectstate -count=1`
- `./scripts/go.sh test ./internal/app ./internal/httpapi ./internal/launcher ./internal/projectshell -run '^$' -count=1`

### Phase 3. Remove smaller API compatibility surfaces

Review whether to drop:

- `internal/projectstate/state_machine.go` extra-field tolerance
- `internal/httpapi/plugin_routes.go` legacy `setta_files` wording / behavior

### Phase 4. Clean up retained Python compatibility paths if repo-wide strictness is desired

If the policy applies to the retained Python boundary too, remove the analogous
repair logic in:

- `backend/setta/types/project_state.py`
- `backend/setta/types/project_chat_windowing.py`

## Audit Conclusion

Yes, there are still compatibility shims outside settings.

The highest-value remaining cleanup is the Go `projectstate` load path, which
still normalizes and repairs persisted documents instead of failing closed.
