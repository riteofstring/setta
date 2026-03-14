# Frontend State And Shared Infrastructure Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make shared frontend infrastructure legible by separating read models, mutation commands, optimistic sync helpers, and DOM interaction utilities.

## Scope

- In scope:
  - `frontend/src/state/**`
  - cross-cutting infrastructure under `frontend/src/components/Utils/**`
  - non-generated shared helpers in `frontend/src/utils/**`
- Out of scope:
  - generated endpoints/types
  - deep cleanup inside `frontend/src/forks/**`, which is tracked in [frontend-forks-cleanup-plan.md](./frontend-forks-cleanup-plan.md)
  - chat-specific cleanup already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)

## Status Refresh (2026-03-14)

- Unlike the later `clean-code` branch, this branch still has a shared `frontend/src/state/definitions.ts` index, but AI/chat store ownership now lives in `frontend/src/state/stores/aiStores.ts`, app runtime state now lives in `frontend/src/state/stores/appStores.ts`, session/share state now lives in `frontend/src/state/stores/sessionStores.ts`, browser state now lives in `frontend/src/state/stores/fileBrowserStores.ts`, search state now lives in `frontend/src/state/stores/searchStores.ts`, feedback state now lives in `frontend/src/state/stores/feedbackStores.ts`, project-status state now lives in `frontend/src/state/stores/projectStatusStores.ts`, layout interaction state now lives in `frontend/src/state/stores/layoutInteractionStores.ts`, UI preference/config state now lives in `frontend/src/state/stores/uiPreferenceStores.ts`, editor diagnostics state now lives in `frontend/src/state/stores/editorDiagnosticsStores.ts`, and shared persist fallback logic lives in `frontend/src/state/storePersistStorage.ts`.
- `frontend/src/state/actions/aiHydration.ts`, `frontend/src/state/actions/aiAgentRuns.ts`, `frontend/src/state/actions/aiConfiguration.ts`, `frontend/src/state/actions/aiTranscription.ts`, `frontend/src/state/actions/aiChatSubmission.ts`, `frontend/src/state/actions/aiChatControls.ts`, `frontend/src/state/actions/aiChatState.ts`, `frontend/src/state/actions/aiPendingChatState.ts`, `frontend/src/state/actions/aiInterruptedAssistantMessages.ts`, and `frontend/src/state/actions/aiChatStreaming.ts` now carry the hydration, agent-run, config/catalog, transcription, submission, chat-control, chat-detail, pending-draft, interruption-tracking, and streaming behavior that previously lived in `frontend/src/state/actions/ai.ts`; future cleanup should keep extending those seams instead of merging behavior back.
- `frontend/src/state/actions/projectChatWindowing.ts` already delegates some logic to `projectChatWindowingAuthoritative.ts` and `projectChatWindowingEphemeral.ts`; future cleanup should build on those seams.
- `frontend/src/state/actions/sectionProjectStateSync.ts` now owns backend
  project-state reconciliation, active-section sync, viewport updates, and
  project-chat windowing coordination that previously lived in
  `frontend/src/state/actions/sectionInfos.ts`; future cleanup should keep
  importers on the dedicated sync entrypoint instead of routing snapshot
  handling back through the query/mutation surface.
- `frontend/src/state/actions/projectStateCommands.ts` now owns shared
  project-state command entrypoints for section delete/group flows, param
  selection, viewport persistence, and all-project-metadata updates that
  previously lived in `frontend/src/state/actions/sectionInfos.ts`.
- `frontend/src/state/actions/projectStateOptimisticUpdates.ts` now owns the
  pending-operation queue plus optimistic project-state mutation scaffolding
  that previously lived in `frontend/src/state/actions/sectionInfos.ts`.
- `frontend/src/state/actions/topLevelSectionLayouts.ts` now owns active-view
  top-level layout selection plus top-level layout snapshot building, and
  `frontend/src/state/actions/topLevelLayoutPersistence.ts` now owns pending-op
  reconciliation plus debounced backend persistence for top-level section
  layout writes that previously lived in `frontend/src/state/actions/sectionInfos.ts`.
- `frontend/src/state/actions/sectionEffectiveImpls.ts` now owns effective
  section/code-object resolution, typed current-section/code-object selectors,
  and in-place impl mutation helpers that previously lived in
  `frontend/src/state/actions/sectionInfos.ts`; future cleanup should keep new
  effective-impl reads and local impl writes on that dedicated surface instead
  of adding them back to the remaining metadata/query file.
- `frontend/src/state/actions/windowSpacePersistence.ts` now owns saved
  window-space sort/name/delete/create mutations plus optimistic persistence,
  and `frontend/src/state/actions/windowSpaceSnapshots.ts` now owns floating
  snapshot building plus conversion back into project-chat windowing state that
  previously lived in `frontend/src/state/actions/windowSpaces.ts`.
- `frontend/src/state/actions/uiSettingReveal.ts` is now a 360-line orchestration
  entrypoint; `uiSettingRevealMutations.ts` owns reveal mutation leases and
  rollback, `uiSettingRevealActivation.ts` owns pane/accordion activation
  writes, `uiSettingRevealDom.ts` owns anchor lookup and highlighting, and
  `uiSettingRevealShared.ts` owns execution-context/status helpers.
- `frontend/src/utils/constants.ts` is still unsplit on this branch, so shared-infrastructure cleanup is still high leverage.
- Shared infrastructure cleanup will still cross fork boundaries at times, but if a slice becomes primarily about code under `frontend/src/forks/**` it should use the more specific companion plan instead of expanding this one.

## Current State (Observed)

- `frontend/src/state` plus shared infrastructure files in `components/Utils` and `utils` total about 83.6k lines of authored code in the sampled directories.
- The biggest shared-state hotspots are:
  - `frontend/src/state/actions/websocketReceive.ts` at 1023 lines
  - `frontend/src/state/actions/uiSettingRevealMutations.ts` at 771 lines
  - `frontend/src/state/hooks/terminals/terminal.ts` at 752 lines
  - `frontend/src/state/actions/windowSpaces.ts` at 695 lines
  - `frontend/src/state/actions/sectionInfos.ts` at 678 lines
  - `frontend/src/utils/focusManager.ts` at 657 lines
  - `frontend/src/state/actions/sectionEffectiveImpls.ts` at 649 lines
- `definitions.ts` now defines 14 local `use*` stores and re-exports the extracted AI/chat, app runtime, session/share, browser, search, feedback, project-status, layout-interaction, UI-preference, and editor-diagnostics stores, which is much closer to a thin index but still leaves project-state publication, artifact data, and realtime helper ownership mixed together.
- `sectionEffectiveImpls.ts` now owns:
  - effective-impl derivation and caching
  - typed current-section and current-code-object selectors
  - in-place impl mutation helpers for section/code-object writes
  - terminal attachment and section-orientation helpers that depend on
    effective impl resolution
- `sectionInfos.ts` currently mixes:
  - streaming chat merge behavior
  - section metadata and layout queries
  - displayed-child tree derivation and tool-preview cleanup
- `sectionProjectStateSync.ts` now owns:
  - backend snapshot reconciliation
  - active-section sync from authoritative project state
  - viewport application during backend updates
  - project-chat windowing authoritative and ephemeral coordination
- `projectStateCommands.ts` now owns:
  - shared section delete/group/ungroup commands
  - param selection and unselect-all command entrypoints
  - viewport persistence dispatch
  - all-project-metadata updates from realtime snapshot handlers
- `projectStateOptimisticUpdates.ts` now owns:
  - pending-operation queue registration, acknowledgement, and removal
  - optimistic project-state dispatch with project guards
  - rollback and replay of later pending operations after failed requests
- `topLevelSectionLayouts.ts` now owns:
  - active-view top-level layout selection
  - top-level layout snapshot building from current node internals
- `topLevelLayoutPersistence.ts` now owns:
  - top-level layout pending-op reconciliation after backend snapshots
  - debounced backend layout persistence and optimistic layout snapshot writes
- `uiSettingReveal.ts` and adjacent helpers now split into:
  - `uiSettingReveal.ts` for reveal orchestration and plugin fallback flow
  - `uiSettingRevealMutations.ts` for reveal mutation leases, snapshots, and rollback
  - `uiSettingRevealActivation.ts` for pane-opening and accordion/chat-aux activation writes
  - `uiSettingRevealDom.ts` for anchor lookup, scrolling, and highlight timing
  - `uiSettingRevealShared.ts` for execution-context mismatch and status builders
- `windowSpacePersistence.ts` now owns:
  - saved window-space sort/name/delete/create mutations
  - optimistic persistence and layout-mutation rollback
- `windowSpaceSnapshots.ts` now owns:
  - floating window-space snapshot building
  - conversion from saved window-space state back into project-chat windowing state
- `windowSpaces.ts` now owns:
  - workspace restore orchestration
  - restored-instance remapping and merge policy
  - saved chat-thread rebound flow after layout restore
- `focusManager.ts` at 657 lines mixes:
  - tab-scope registration
  - keyboard navigation policy
  - section focus behavior
  - canvas-specific pane movement
- `constants.ts` at 301 lines is a grab bag for:
  - routes
  - pane/tab enums
  - z-indexes
  - DOM class names
  - measurement key builders
- Shared UI infrastructure like `PaneContainer.tsx`, pane layout helpers, floating-box helpers, and focus management currently span multiple cross-cutting concerns, which makes edits feel riskier than they should.

## Cleanup Principles

1. Separate reads from writes.
   Selectors/query helpers should be distinct from mutation commands.

2. Separate domain state from cross-domain plumbing.
   Optimistic sync, websocket reconciliation, and DOM interaction helpers should not hide inside feature query files.

3. Make store ownership explicit.
   New code should depend on the smallest store surface possible.

4. Keep shared infrastructure small and layered.
   Routing constants, layout constants, measurement keys, and interaction-class names do not belong in one catch-all module.

## Plan

1. Split store definitions by domain

- Break `definitions.ts` into domain-owned store modules or thin domain re-export modules.
- Group stores by areas such as:
  - project state
  - UI chrome/layout
  - AI/chat state
  - temporary measurement state
  - share/session state
- Keep a minimal index only if it improves discovery without hiding ownership.

2. Split `sectionInfos.ts` into query and command layers

- Extract:
  - effective impl/read helpers
  - section metadata selectors
  - top-level layout persistence helpers
- Keep naming explicit so agents can tell whether they are calling a read helper or a mutating command.

3. Normalize optimistic mutation infrastructure

- Create a consistent pattern for optimistic frontend mutations used by:
  - section mutations
  - window spaces
  - related layout/state features
- Continue routing new optimistic write paths through
  `projectStateOptimisticUpdates.ts` instead of rebuilding queue or rollback
  helpers inside feature query modules.
- Reuse seams that already exist in `projectChatWindowingAuthoritative.ts` and `projectChatWindowingEphemeral.ts` where they fit instead of introducing parallel patterns.
- Avoid each domain hand-rolling slightly different optimistic update scaffolding.

4. Split cross-cutting interaction utilities

- Break `focusManager.ts` into smaller modules for:
  - tab-scope registry
  - keyboard navigation
  - section focus helpers
  - canvas-specific focus movement
- Split `constants.ts` into domain constants:
  - routes
  - panes/tabs
  - DOM interaction classes
  - measurement key builders
  - app chrome z-index/layout constants

5. Tighten shared component infrastructure

- Keep `PaneContainer`, pane layout helpers, floating-box helpers, and similar utilities small and composable.
- Make it obvious which layer owns:
  - viewport sizing
  - persisted pane state
  - DOM resize wrappers
  - focus behavior

6. Add domain READMEs and import guidance

- Document:
  - where new store state belongs
  - when to add a selector vs a command
  - when `utils/` is appropriate vs feature-local helpers
- Prefer explicit module imports over “just import from whichever mega-file already has something close”.

## Risks And Mitigations

- Risk: moving shared infrastructure causes widespread import churn.
  - Mitigation: split APIs first, then move files after callers depend on the new boundaries.
- Risk: over-normalizing state patterns makes simple features harder to implement.
  - Mitigation: keep abstractions minimal and only standardize what is already repeated.
- Risk: optimistic update helpers become too generic to understand.
  - Mitigation: retain domain-specific command entry points even if shared helpers exist underneath.

## Verification

- Add or update Vitest coverage for:
  - query helpers/selectors
  - optimistic mutation scaffolds
  - focus/navigation helpers
  - constants/key-builder behavior
- Run relevant UI tests where shared infrastructure changes affect panes, section focus, or layout persistence.
- Use CDP verification when infrastructure refactors affect visible pane/layout behavior.

## Acceptance Criteria

- Contributors can identify the owner of a piece of shared state or UI infrastructure quickly.
- Read helpers and mutation commands are no longer mixed inside the same giant modules by default.
- Shared infrastructure files are smaller and grouped by actual responsibility.
- Cross-cutting utilities stop being default dumping grounds for unrelated frontend behavior.
