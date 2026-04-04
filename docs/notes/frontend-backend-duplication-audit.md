# Frontend/Backend Duplication Audit

## Scope and exclusion rule

- Audited handwritten logic under `frontend/src` against Go runtime code under `internal/` and `cmd/`.
- Excluded generated endpoint/type/route bindings unless they pull in handwritten frontend logic that materially changes behavior.
- Not listed below when the duplication is explicitly documented as UI-only and backed by a shared contract. The main example is local name validation for instant feedback, which is called out in [`docs/reference/name-validation.md`](../reference/name-validation.md) and mirrored by a shared Go fixture test in `internal/projectstate/name_validation_frontend_fixtures_test.go`.
- I treated a duplicate as unjustified when the duplicated rule is canonical routing identity, mutation semantics, or normalization behavior, and there is no shared generator/fixture/contract keeping the two sides aligned.

## Unjustified findings

### 1. Canonical standalone slug derivation is implemented twice

Frontend evidence:

- `frontend/src/utils/sectionSlugPaths.ts:91-214` rebuilds the canonical section full-path format, slug index, descendant traversal, and standalone section resolution.
- `frontend/src/utils/windowSpacePaths.ts:29-90` rebuilds window-space slug indexes, standalone resolution, and standalone route construction.

Backend evidence:

- `internal/projectstate/section_names.go:194-279` computes the canonical active section full path and slug map.
- `internal/projectstate/code_section_bindings.go:222-234` defines the canonical section slug sanitizer.
- `internal/projectstate/python_codegen.go:241-257` defines the canonical project/window-space slug sanitizer.
- `docs/reference/urls-and-routes.md:38-42` explicitly documents separate backend and frontend formulas for section slugs.

Why this is not justified:

- These slugs are route identities, not just presentation helpers.
- The frontend is reproducing the exact path-shape rules (`["Child"]`, `[idx]`) plus slug sanitization instead of consuming backend-computed slug fields.
- Unlike name validation, there is no shared fixture file or cross-boundary contract test keeping the routing logic aligned.

Risk:

- Deep-link breakage or ambiguous standalone-route matching when path-shape or sanitization rules change on one side only.

Suggested owner:

- Backend should emit canonical section/window-space slug fields in project state, or the repo should generate a shared slug contract/fixture consumed by both sides.

### 2. View mode ordering and delete-fallback semantics are duplicated in the optimistic UI and the backend

Frontend evidence:

- `frontend/src/state/actions/viewModes.ts:5-46` validates a full deduplicated order payload and rewrites `sortIndex`.
- `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx:47-59` re-sorts and compacts `sortIndex`.
- `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx:688-718` re-implements delete fallback semantics, including next-active selection and top-level layout/viewport carryover.

Backend evidence:

- `internal/projectstate/view_modes.go:402-429` validates the full order payload and rewrites `SortIndex`.
- `internal/projectstate/view_modes.go:453-485` re-implements delete fallback semantics, including next-active selection and layout/viewport carryover.
- `internal/projectstate/view_modes.go:724-739` defines the canonical comparator used for fallback and compaction.
- `docs/reference/view-modes.md:41-54` documents this as canonical view-mode behavior.

Why this is not justified:

- This is canonical project-state mutation behavior, not a UI-only preview.
- The frontend optimistic layer is replaying the backend mutation instead of consuming a backend-produced ordered list or normalized post-mutation snapshot.
- There is no shared helper or contract test for the comparator, compaction, and next-active fallback rules.

Risk:

- Optimistic state can pick a different next active view mode or compaction order than persisted Go state.

Suggested owner:

- Backend should return the normalized ordered view-mode list or full project snapshot after these mutations, or the ordering rules should be generated/shared from one source.

### 3. Window-space ordering and delete compaction are duplicated in the optimistic UI and the backend

Frontend evidence:

- `frontend/src/state/actions/windowSpaces.ts:79-94` defines the comparator used for UI ordering.
- `frontend/src/state/actions/windowSpaces.ts:177-230` validates a full deduplicated order payload and rewrites `sortIndex`.
- `frontend/src/state/actions/windowSpaces.ts:208-219` compacts `sortIndex` values.
- `frontend/src/state/actions/windowSpaces.ts:263-284` re-implements delete-time compaction locally.

Backend evidence:

- `internal/projectstate/project_chat_windowing_writes.go:321-348` validates the full order payload and rewrites `SortIndex`.
- `internal/projectstate/project_chat_windowing_writes.go:379-392` re-implements delete-time compaction.
- `internal/projectstate/project_chat_windowing_writes.go:722-737` defines the canonical comparator.

Why this is not justified:

- Just like view modes, this is canonical persisted ordering behavior, not merely a transient list sort for rendering.
- The frontend is simulating backend mutation semantics instead of applying a minimal optimistic reorder and then accepting the backend-normalized result.
- There is no shared contract test keeping the comparators and compaction rules aligned.

Risk:

- Divergent optimistic ordering, especially if comparator or delete-compaction rules change in Go.

Suggested owner:

- Backend should remain the single owner of ordering/compaction semantics and return normalized state, or the comparator and compaction logic should be generated/shared.

### 4. Window-space automatic name generation is duplicated, and the generators are different

Frontend evidence:

- `frontend/src/state/actions/windowSpaces.ts:162-175` generates a candidate window-space name locally and loops until its slug is unique.
- `frontend/src/state/actions/windowSpaces.ts:1449-1456` sends that explicit generated name to `/api/createWindowSpace`.
- `frontend/src/utils/idNameCreation.ts:33-40` uses `unique-names-generator` with adjective/color dictionaries.

Backend evidence:

- `docs/reference/urls-and-routes.md:170-173` documents `createWindowSpace` as accepting an optional `name`.
- `internal/projectstate/project_chat_windowing_writes.go:423-433` already owns the "no name supplied" path and generates the default name server-side.
- `internal/projectstate/memorable_names.go:412-457` uses a different Go-owned memorable-name generator.

Why this is not justified:

- The backend route already supports omitting the name and generating the canonical default itself.
- The frontend duplicates both candidate generation and uniqueness probing without needing to.
- The two generators are different, so default names already diverge depending on which side generates them.

Risk:

- Inconsistent default names across entrypoints and unnecessary duplicate uniqueness logic.

Suggested owner:

- Stop sending `name` when the user did not explicitly choose one and use the backend-generated name returned from `createWindowSpace`.

### 5. Project-chat windowing normalization and section-binding arbitration are duplicated even though the docs say backend normalization is authoritative

Frontend evidence:

- `frontend/src/state/actions/projectChatWindowing.ts:399-500` normalizes order and z-index layering locally.
- `frontend/src/state/actions/projectChatWindowing.ts:518-594` selects the authoritative section-bound window using placement, visibility, z-index, focus time, and id tie-breaks.
- `frontend/src/state/actions/projectChatWindowing.ts:1513-1665` rebuilds pending snapshots by replaying local mutations over `authoritativeWindowing`.

Backend evidence:

- `docs/reference/project-chat-windowing.md:26-59` says backend normalization is authoritative and lists the canonical invariants.
- `internal/projectstate/project_chat_windowing_writes.go:439-568` enforces thread-binding restrictions and normalizes project-chat windowing state for writes.
- `internal/projectstate/project_chat_windowing_writes.go:761-790` implements the same section-binding winner selection logic.

Related duplicate in saved window-space section binding:

- `frontend/src/state/actions/windowSpaces.ts:377-430` locally picks the winning saved section binding by `zIndex` and id.
- `internal/projectstate/project_chat_windowing.go:300-356,643-656` applies the same winner-selection rule when normalizing saved window spaces.

Why this is not justified:

- This is authoritative ownership and validation logic, not just view projection.
- The frontend is carrying a second handwritten implementation of the same normalization/arbitration rules even though the repo documentation already declares the backend authoritative.
- There is no shared generated normalizer or cross-boundary fixture ensuring the arbitration rules stay identical.

Risk:

- Section owner mismatches, optimistic states that look valid locally but are rejected remotely, and replay drift when pending local mutations are re-applied over backend state.

Suggested owner:

- Backend should return normalized windowing snapshots for layout mutations, or the normalization/arbitration logic should be generated/shared from one source and used by both sides.
