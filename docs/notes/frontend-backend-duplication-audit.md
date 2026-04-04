# Frontend/Backend Duplication Audit

Status: current as of 2026-04-02.

This note records the live frontend/backend logic duplication found during the audit. It intentionally distinguishes:

- unjustified duplication: handwritten frontend logic that re-states backend-owned behavior without a strong sync contract
- reviewed-but-justified overlap: client-side projection, local persistence hygiene, or cross-language protocol handling that still has a valid owner split
- resolved historical findings: duplication that used to exist but is no longer present in the current tree

## Scope And Method

- Reviewed handwritten logic in `frontend/src/` against backend/runtime logic in `internal/`, `cmd/`, and the retained Python package surface in `backend/setta/`.
- Excluded generated bindings such as `frontend/src/utils/generatedRoutes.ts`, `frontend/src/utils/generatedEndpoints.ts`, and `frontend/src/utils/generatedTypes.ts`.
- Counted an overlap as unjustified only when it changed user-visible behavior or authoring defaults and the frontend copy was not merely consuming backend-owned data.

## Current Unjustified Duplications

None identified in the reviewed areas after the follow-up fix.

The one live issue from this audit was the frontend’s handwritten app deployment default policy. That issue is now resolved by making the generated frontend type surface consume backend-owned Go defaults:

- `internal/deployments/policy.go`
  - `DefaultPolicy()` remains the source of truth for share deployment defaults.
  - `DefaultAppPolicy()` remains the source of truth for app deployment defaults.
- `internal/frontendbindings/converter.go`
  - `createSharePolicy()` now renders from `deployments.DefaultPolicy()` instead of a generator-local handwritten literal.
- `internal/frontendbindings/project_state_support.go`
  - exports generated `createDefaultAppPolicy()` from `deployments.DefaultAppPolicy()`.
- `frontend/src/utils/deploymentPolicies.ts`
  - now delegates to the generated helper instead of restating app-policy overrides locally.

That removes the only live unjustified duplication found during the audit pass.

## Reviewed And Not Listed As Unjustified

### Run capability and run-target policy

Previous audit versions called this out, but the current tree has mostly removed the problematic duplication.

Backend-owned capability derivation:

- `internal/projectview/single_config.go`
  - builds `SectionCapabilities`
  - builds `ProjectRunCapabilities`

Frontend consumption:

- `frontend/src/utils/runCapabilities.ts`
  - reads backend-authored `projectConfig.runCapabilities` and `sectionCapabilities`
- `frontend/src/components/Panes/Overview/runInstructionsRunnableCodeBlocks.ts`
  - now reduces to `Boolean(sectionCapabilities?.canRun)`

Verdict: resolved. The frontend is now mainly projecting backend capability data rather than re-deriving run rules from language/codegen state.

### File-browser path normalization and workspace containment

Previous audit versions also called this out, but the current split is much narrower.

Backend-owned authority:

- `internal/statefs/statefs.go`
  - `NormalizePath`
  - `EnsureWithinRoot`
  - `ResolveWithinRoot`
- `internal/filebrowser/service.go`
  - `resolvePathWithinWorkspace`
  - `ensureWithinWorkspaceRoot`
  - `resolveFolderPath`

Frontend helpers that remain:

- `frontend/src/utils/browserPaths.ts`
  - separator normalization
  - root extraction
  - split/join helpers
  - absolute-path detection
- `frontend/src/utils/fileBrowserPathRelation.ts`
  - same-path / descendant comparison for UI state
- `frontend/src/utils/fileBrowserNavigation.ts`
  - breadcrumb/parent-path helpers

Verdict: resolved enough that it no longer belongs on the unjustified list. The backend still owns real containment and canonical path resolution; the frontend helpers are now presentation/state helpers.

### Name validation

There is real overlap here, but it is deliberate and guarded.

Frontend validation:

- `frontend/src/utils/nameValidation.ts`

Backend validation:

- `internal/projectstate/project_names.go`
- `internal/projectstate/section_names.go`
- `internal/projectstate/view_modes.go`
- `internal/projectstate/project_chat_windowing_writes.go`
- `internal/projectstate/code_object_names.go`

Sync contract:

- shared fixture file: `tests/fixtures/name_validation_cases.json`
- backend fixture mirror test: `internal/projectstate/name_validation_frontend_fixtures_test.go`
- frontend fixture test: `frontend/src/utils/nameValidation.test.ts`

Verdict: justified. The frontend needs inline validation for UX, and this duplication has an explicit shared-fixture contract to keep caller-visible behavior aligned.

### Section and window-space slug resolution

This area was reviewed because slug/path logic often becomes a second source of truth. In the current tree, the frontend is consuming backend-owned slug maps rather than recomputing them.

Backend-owned slug maps:

- `internal/projectview/single_config.go`
  - sends `sectionPathSlugsByID`, `sectionIDsByPathSlug`, `windowSpaceSlugsByID`, and `windowSpaceIDsBySlug`
- `internal/projectstate/slug_views.go`
  - slug-map derivation helpers

Frontend usage:

- `frontend/src/utils/sectionSlugPaths.ts`
- `frontend/src/utils/windowSpacePaths.ts`

Guardrails:

- `frontend/src/utils/windowSpacePaths.ts` throws on a missing backend-owned slug
- tests explicitly assert that frontend resolution uses backend-owned slug maps instead of recomputing after local rename/reparenting

Verdict: justified. The backend owns route identity; the frontend is only resolving against backend-provided indexes.

### `settaFilesLocation` normalization

Frontend:

- `frontend/src/utils/settaFilesLocation.ts`
  - normalizes storage/handoff values for workspace history and launcher UI state

Backend / launcher:

- `internal/sshx/foundation.go`
  - canonical validation for remote/runtime-facing `settaFilesLocation`
- `internal/launcher/open_workspace.go`
  - `NormalizeSettaFilesLocationForLaunch`

Verdict: justified. The frontend normalization is local history/draft hygiene; launch/runtime behavior is still owned by backend/launcher code.

### Server-mode transport boundary and origin routing

Frontend:

- `frontend/src/utils/serverModeBoundaryPolicy.ts`
- `frontend/src/utils/transportUrlCore.ts`
- `frontend/src/utils/c_addresses.ts`

Backend:

- `internal/modes/policy.go`
- `internal/frontendorigins/service.go`
- launcher/home and workspace-launch route ownership under `internal/httpapi/`

Verdict: justified boundary glue. The frontend has to decide which origin to call before it can make the request at all. That is client transport routing, not a second authority over whether the backend will allow the operation. The backend still enforces server mode and trusted origin rules.

This area is still worth watching for drift, but it is not the same class of problem as the handwritten app-policy default.

### App-spec patch stream parsing and application

Frontend:

- `frontend/src/utils/appSpecPatchStream.ts`
- `frontend/src/state/appSpecPatchStreaming.ts`

Backend:

- `internal/appspec/patch_stream.go`

Verdict: justified cross-language protocol duplication. Both sides need to understand the JSONL patch stream format:

- the backend needs to parse/apply it as part of the authoritative app-definition tooling/runtime
- the frontend needs to apply it locally for live patch-preview rendering

This is a real duplicate implementation, but it is a protocol-consumer split rather than duplicated business ownership. It would benefit from shared fixtures in the future, but it does not belong in the unjustified list.

### View-mode ordering

Frontend:

- `frontend/src/utils/viewModeOrdering.ts`

Backend:

- `internal/projectstate/view_modes.go`

Verdict: justified. The frontend helper sorts backend-authored view modes for display. It is not the authority for persisted order validation or mutation acceptance.

## Bottom Line

After a broad pass across the current tree and the follow-up fix, this audit no longer has any live unjustified frontend/backend duplication findings in the reviewed areas.

The previously-audited run-policy and file-browser containment duplications are no longer current in the same form, and the handwritten app-policy default has now been removed as an active finding.
