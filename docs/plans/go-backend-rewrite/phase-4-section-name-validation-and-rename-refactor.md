# Phase 4 Section Name Validation And Rename Refactor

## Purpose

This doc narrows the next missing Go-owned IDE project-state mutation slice
after the completed layout/presentation, view-mode/layout, and auto-layout
transport work.

The repeatedly deferred gap is `setSectionName`. It is not just another thin
project route. The current product flow also depends on:

- backend-authoritative section-name validation
- rename-refactor mode lookup from settings
- pending/completed frontend op tracking in project-state hydrate responses
- websocket delivery of rename-refactor prompts
- follow-up accept/decline routes keyed by `frontendOpId`

That makes this a focused cross-cutting slice instead of a small handler patch.

## Status

Current repo status as of 2026-03-07:

- the focused Phase 4 layout/presentation transport doc is complete
- the focused Phase 4 view-mode/top-level-layout doc is complete
- the focused Phase 4 auto-layout doc is complete
- Go already owns:
  - authoritative `getLatestProjectState` hydrate transport
  - project-state runtime mutation/save ownership
  - runtime-scoped `frontendOpId` pending/completed tracking in the Go
    project-state path
  - authoritative `completedOpIds` / `pendingOpIds` hydrate envelope data
  - narrow backend settings lookup for `renameRefactorMode`
  - frontend websocket delivery infrastructure
  - Python codegen export and Python dependency-graph ownership in Go
  - narrow settings-runtime storage and targeted backend-setting readers
- Go does not yet own:
  - `setSectionName`
  - `acceptRenameRefactor`
  - `declineRenameRefactor`
  - backend-authoritative section-name validation
  - rename-refactor prompt websocket emission

## Scope

This focused plan covers:

- Go-owned section-name validation and mutation semantics
- Go-owned project mutation op tracking needed by optimistic frontend rename
  flows
- settings-backed rename-refactor mode lookup
- websocket rename-refactor prompt delivery and pending-result storage
- IDE-only `setSectionName`, `acceptRenameRefactor`, and
  `declineRenameRefactor` transport
- focused Go tests for validation, op tracking, prompt delivery, and
  accept/decline behavior

## Non-Goals

- project-config name, view-mode name, code-object name, or param-name
  migration in the same slice
- broad project-state websocket push for all IDE mutations
- heuristic string search/replace for rename refactors
- share/app mode rename flows
- broad settings transport beyond the one rename mode needed here

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-auto-layout-top-level-sections.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/utils/name_validation.py`
- `backend/setta/types/settings_state.py`
- `tests/project_state/test_rename_refactor_broadcast.py`
- `tests/routers/test_name_validation_routes.py`
- `frontend/src/components/Section/Header/SectionTitle.tsx`
- `frontend/src/state/actions/sectionInfos.ts`
- `frontend/src/state/actions/renameRefactors.ts`
- `frontend/src/state/actions/websocketReceive.ts`

## Current Frontend And Python Behavior

The current `setSectionName` flow is larger than a rename mutation:

1. the frontend applies an optimistic section-name update and sends a
   `frontendOpId`
2. Python validates the normalized section name against:
   - format/path rules
   - duplicate sibling names
   - top-level Python identifier conflicts after sanitization
   - descendant full-path slug conflicts
3. Python mutates the section name and invalidates cached section slugs
4. during the broadcast path, Python consults
   `settings.backend.renameRefactorMode`
5. Python compares old/new dependency graphs to compute changed node values
6. `ALWAYS_RENAME` applies those changes immediately
7. `ALWAYS_ASK` stores pending results by `frontendOpId` and broadcasts
   `ReturnRenameRefactorResults`
8. the frontend waits until that op id appears in `completedOpIds` before
   opening the rename modal
9. `acceptRenameRefactor` applies the pending changed values and rebroadcasts
   project state
10. `declineRenameRefactor` clears the pending result without applying changes

The important rewrite implication is simple: a Go `setSectionName` route is not
correct unless the op-tracking and rename-prompt flow exists around it.

## Dependency Finding

The missing work falls into four source-of-truth concerns:

1. section-name validation and mutation ownership
2. mutation op tracking for `frontendOpId` pending/completed state
3. rename-refactor mode lookup from settings
4. rename prompt/result ownership across websocket + accept/decline routes

The second concern is the key hidden dependency. Current Go project routes
already accept `frontendOpId`, and `getLatestProjectState` already returns
`completedOpIds` / `pendingOpIds`, but those arrays are still always empty on
the Go side. The rename prompt flow cannot be correct until Go owns that
tracking boundary.

## Working Decisions

- keep validation authoritative in `internal/projectstate`
  - frontend prevalidation remains a UX optimization only
- keep the current frontend rename-prompt shape
  - reuse `ReturnRenameRefactorResults` over websocket
  - reuse `acceptRenameRefactor` / `declineRenameRefactor`
  - do not invent a one-off response payload just for this slice
- keep op tracking explicit and shared
  - project mutation completion should not be inferred from HTTP success alone
  - `completedOpIds` / `pendingOpIds` stay the authoritative hydrate path
- keep settings access narrow
  - resolve only `settings.backend.renameRefactorMode`
- keep frontend op tracking runtime-scoped
  - `frontendOpId` lifecycle metadata is not persisted project state
  - successful ids are exposed once through hydrate and then consumed
- prefer a Go-owned graph-based rename result
  - compute changed node values from authoritative dependency/value graph data
  - do not implement handler-local or regex-based rewrites
- keep share/app mode blocked
  - rename routes and rename prompts stay IDE-only in this slice

## Proposed Go Boundaries

### `internal/projectstate`

Own:

- section-name validation
- section-name mutation
- project-scoped pending/completed op tracking
- pending rename-result storage keyed by `frontendOpId`
- applying accepted rename changed values

Do not own:

- websocket framing
- HTTP decoding
- settings transport

### `internal/codegen`

Own:

- authoritative dependency/value graph inputs used to compute rename result
  changed values

Do not own:

- websocket prompt policy
- persisted rename-result storage

### `internal/httpapi`

Own:

- IDE-only `setSectionName`, `acceptRenameRefactor`, and
  `declineRenameRefactor` routes
- request decoding and error mapping
- `getLatestProjectState` envelope wiring for real pending/completed op ids

Do not own:

- validation rules
- rename changed-value computation
- pending rename-result storage

### `internal/realtime` / `internal/wsapi` / `internal/app`

Own:

- websocket delivery of `ReturnRenameRefactorResults`
- app wiring from project mutation services into websocket broadcasts

Do not own:

- rename result computation
- HTTP route policy

## Implementation Slices

### Slice 1: Op Tracking And Rename Mode Foundation

Deliver:

- Go-owned project mutation op tracking keyed by `frontendOpId`
- authoritative `completedOpIds` / `pendingOpIds` in
  `getLatestProjectState`
- narrow settings reader for `backend.renameRefactorMode`
- focused tests for op lifecycle and settings defaults/overrides

Acceptance:

- optimistic frontend project mutations can clear pending ops through the Go
  hydrate path
- rename flows no longer depend on placeholder empty op-id arrays

Status:

- complete

Completed:

- `internal/projectstate` runtime now tracks pending and completed
  `frontendOpId` values for successful save-backed mutations
- `getLatestProjectState` now returns authoritative `pendingOpIds` and
  one-shot `completedOpIds`
- `internal/projectstate` now reads
  `settings.backend.renameRefactorMode` with `ALWAYS_ASK` defaulting and
  invalid-value rejection
- focused tests cover:
  - pending/completed frontend op lifecycle
  - hydrate consumption of completed ids
  - rename-refactor mode default, override, and invalid settings cases

Verification:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/httpapi -count=1 -timeout 180s`

### Slice 2: Section Name Validation And Rename Result Computation

Deliver:

- projectstate section-name validation and mutation helpers
- authoritative validation parity for:
  - format/path rules
  - duplicate sibling names
  - top-level identifier conflicts after sanitization
  - descendant slug conflicts
- Go-owned changed-value computation for rename refactors using authoritative
  graph/value data
- focused tests for validation and rename changed-value planning

Acceptance:

- no route-local name validation exists
- rename result planning does not rely on heuristic string search

Status:

- complete

Completed so far:

- Go-owned section-name validation now lives in `internal/projectstate`
- Go-owned `SetSectionName` document/runtime/project mutation helpers now
  exist for later transport wiring
- validation now covers:
  - format/path rules
  - duplicate sibling names
  - top-level identifier conflicts after sanitization
  - descendant full-path slug conflicts across the renamed subtree
- shared active section full-path resolution now comes from one projectstate
  helper instead of duplicating path logic in validation and code binding code

Remaining in this slice:

- none

Verification so far:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 180s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/codegen ./internal/projectstate -count=1 -timeout 180s`

Completed in the graph/planner half:

- Go Python dependency graphs now retain parser-backed reference positions for
  undefined `state.*` attribute expressions instead of only a ref-name set
- rename changed-value planning now computes replacement values from:
  - old/new authoritative graph full-path names
  - parser-extracted reference positions in the new graph
- the planner updates repeated references in one value deterministically
- lambda-shadowed `state` parameters are excluded from rename planning via the
  scope-aware parser walk

### Slice 3: IDE Transport And Prompt Flow

Deliver:

- `setSectionName`, `acceptRenameRefactor`, and `declineRenameRefactor`
  handlers
- websocket broadcast of `ReturnRenameRefactorResults`
- error mapping for invalid names and missing pending rename entries
- focused route/app websocket tests for:
  - invalid-name rejection
  - `ALWAYS_ASK` prompt broadcast
  - accept applies pending changes
  - decline clears pending changes

Acceptance:

- the existing frontend rename modal flow works against Go-owned backend paths
- prompt delivery waits on authoritative completed-op tracking instead of HTTP

Status:

- complete

Completed:

- `internal/app` now owns rename-refactor pending state keyed by
  `frontendOpId`, rename mode policy lookup, immediate-apply vs pending-prompt
  branching, and accept/decline mutation handling
- `internal/httpapi` now exposes IDE-only `setSectionName`,
  `acceptRenameRefactor`, and `declineRenameRefactor` routes with focused
  invalid-name and missing-pending error mapping
- `internal/realtime` now owns websocket transport messages for:
  - `UpdateFrontendProjectState`
  - `ReturnRenameRefactorResults`
- section-root callable renames now use an explicit projectstate helper instead
  of overloading broader callable mutation APIs
- focused route tests cover invalid-name and missing-pending responses
- focused app tests cover the `ALWAYS_ASK` flow end to end:
  - section rename route succeeds
  - completed op id appears in the websocket project-state update
  - rename prompt websocket payload carries the planned changed value

Decisions Made:

- keep pending rename prompt storage in the app-owned rename service
  - it is runtime-scoped frontend interaction state, not persisted project
    state
- reuse the existing frontend websocket flow by broadcasting:
  - authoritative project-state update first
  - rename prompt second when `ALWAYS_ASK` and planned changes exist
- keep rename error sentinels in `internal/projectstate`
  - both app and transport layers need them without creating a package cycle
- treat the real app rename websocket test as a save-backed Python project flow
  - it must prepare the app LSP fixture the same way other Python save tests do

Verification:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/codegen ./internal/projectstate ./internal/httpapi ./internal/realtime -count=1 -timeout 180s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestRenameRefactorService|TestAppSetSectionNameRouteBroadcastsRenamePromptAndProjectStateUpdate' -count=1 -timeout 180s`

Notes:

- a broad `./internal/app` run still has unrelated existing failures caused by
  package-wide tests that save Python projects without preparing the app LSP
  fixture first (`lsp: initialize failed (0): EOF`). The rename slice is
  covered by the focused app tests above.

## Open Questions

- none for this slice

## Next Recommended Step

- Return to `go-backend-rewrite-plan.md` and pick the next uncovered focused
  Phase 4 backend slice outside section rename.
- Keep this doc closed unless later frontend integration finds a concrete gap
  in rename prompt behavior.
