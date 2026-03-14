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
- `frontend/src/state/actions/projectChatWindowing.ts` now delegates pure
  windowing normalization and selection to `projectChatWindowingSelectors.ts`,
  in-state reducers to `projectChatWindowingState.ts`, and still delegates
  write coordination to `projectChatWindowingWrites.ts`,
  `projectChatWindowingAuthoritative.ts`, and
  `projectChatWindowingEphemeral.ts`; future cleanup should keep building on
  those seams.
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
- `frontend/src/state/actions/websocketIncomingMessages.ts` now owns frontend
  websocket payload dispatch, project/app snapshot routing, and
  `UISettingReveal` ACK handling that previously lived in
  `frontend/src/state/actions/websocketReceive.ts`; future cleanup should keep
  new incoming websocket event handlers on that dedicated module instead of
  mixing them back into socket transport and outbound realtime send logic.
- `frontend/src/state/actions/windowSpacePersistence.ts` now owns saved
  window-space sort/name/delete/create mutations plus optimistic persistence,
  and `frontend/src/state/actions/windowSpaceSnapshots.ts` now owns floating
  snapshot building plus conversion back into project-chat windowing state that
  previously lived in `frontend/src/state/actions/windowSpaces.ts`.
- `frontend/src/state/actions/projectChatWindowingSelectors.ts` now owns pure
  windowing normalization, selection, and default-bounds helpers that
  previously lived in `frontend/src/state/actions/projectChatWindowingState.ts`.
- `frontend/src/state/actions/projectChatWindowingState.ts` now owns in-state
  reducers that previously lived in
  `frontend/src/state/actions/projectChatWindowing.ts`.
- `frontend/src/state/actions/projectChatWindowingWrites.ts` now owns layout
  write permissions, optimistic windowing mutation dispatch, authoritative
  publish flow, and sync helpers that previously lived in
  `frontend/src/state/actions/projectChatWindowing.ts`.
- `frontend/src/state/actions/uiSettingReveal.ts` is now a 360-line orchestration
  entrypoint; `uiSettingRevealMutations.ts` now owns the mutation lock plus
  high-level reveal orchestration, `uiSettingRevealMutationOwnership.ts` owns
  lease sequence and touched-field ownership, `uiSettingRevealMutationSnapshots.ts`
  owns snapshot capture and rollback application, `uiSettingRevealActivation.ts`
  owns pane/accordion activation writes, `uiSettingRevealDom.ts` owns anchor
  lookup and highlighting, and `uiSettingRevealShared.ts` owns
  execution-context/status helpers.
- `frontend/src/state/actions/keyActivations.ts` is now a 284-line listener
  orchestration entrypoint; `keyShortcutRegistrations.ts` owns grouped shortcut
  registration, `keyShortcutUtils.ts` owns shortcut parsing, event-code
  normalization, and input-ignore policy, and `keyActivationHandlers.ts` owns
  `Tab`/`Escape`, section-selection, and React Flow key-mode handlers.
- `frontend/src/state/hooks/terminals/terminal.ts` is now a 248-line React hook
  orchestration layer; `terminalSessions.ts` owns cached websocket session
  reuse and transport wiring, and `terminalFit.ts` owns xterm
  fit/fallback/reflow behavior.
- `frontend/src/utils/constants.ts` is still unsplit on this branch, so shared-infrastructure cleanup is still high leverage.
- Shared infrastructure cleanup will still cross fork boundaries at times, but if a slice becomes primarily about code under `frontend/src/forks/**` it should use the more specific companion plan instead of expanding this one.

## Current State (Observed)

- `frontend/src/state` plus shared infrastructure files in `components/Utils`
  and `utils` total about 89.1k lines of authored code in the sampled
  directories.
- The largest remaining authored state surfaces are:
  - `frontend/src/state/actions/aiChatStreaming.ts` at 1349 lines
  - `frontend/src/state/actions/projectChatThreads.ts` at 895 lines
  - `frontend/src/state/actions/git.ts` at 805 lines
  - `frontend/src/state/actions/projectChatWindowingState.ts` at 718 lines
  - `frontend/src/state/actions/aiConfiguration.ts` at 700 lines
- The biggest shared-infrastructure hotspots in this companion-plan domain are:
  - `frontend/src/state/actions/windowSpaces.ts` at 697 lines
  - `frontend/src/state/actions/sectionInfos.ts` at 678 lines
  - `frontend/src/state/actions/sectionEffectiveImpls.ts` at 649 lines
  - `frontend/src/state/actions/projectChatWindowingWrites.ts` at 571 lines
  - `frontend/src/state/actions/stateMachineEdgeConnections.ts` at 520 lines
  - `frontend/src/state/actions/websocketLifecycle.ts` at 498 lines
  - `frontend/src/state/actions/uiSettingRevealMutationSnapshots.ts` at 426 lines
  - `frontend/src/state/actions/keyShortcutRegistrations.ts` at 416 lines
  - `frontend/src/components/Utils/Resizable/useCustomResizableBehavior.ts` at 325 lines
- `websocketReceive.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `websocketLifecycle.ts` now owns:
  - websocket transport lifecycle and reconnect behavior
  - auth-refresh polling and auth-loss recovery
  - share-session recovery plus listener-coverage or project-state bootstrap
- `websocketRealtime.ts` now owns:
  - outbound realtime dependency events and section literal updates
  - binary realtime sends plus oversize upload fallback
- `websocketRuntime.ts` now owns:
  - active websocket instance and generation tracking
  - low-level JSON and binary send helpers shared by lifecycle and realtime owners
- `stateMachineEdges.ts` now owns:
  - compatibility re-exports for workflow edge callers that have not moved yet
- `stateMachineEdgeConnections.ts` now owns:
  - workflow handle normalization and shared-chat workflow port canonicalization
  - section-type and machine-group reads used to validate candidate connections
  - machine-group merge snapshot capture or apply or restore helpers
  - workflow edge construction from a validated connection
- `stateMachineEdgeMutations.ts` now owns:
  - workflow edge creation plus merge-aware optimistic persistence
  - workflow edge selection, deletion, and replace commands
- `CustomResizable.tsx` now owns:
  - resize-surface composition and `ResizableWithScale` wiring
  - share-capability gating and active-handle state bridging into handle chrome
- `useCustomResizableBehavior.ts` now owns:
  - resize lifecycle and double-click tracking
  - auto-size promotion, auto-clamp, and optimistic section-size persistence
  - resize event emission into shared layout-interaction state
- `customResizableSizing.ts` now owns:
  - pure clamp and auto-clamp sizing helpers
  - resize-end emission decisions that can be tested without React
- `customResizableChrome.ts` now owns:
  - resize-handle direction lookup from DOM targets
  - handle enablement, hit-area sizing, and MetaControl or attached-terminal chrome
- `definitions.ts` now defines 14 local `use*` stores and re-exports the extracted AI/chat, app runtime, session/share, browser, search, feedback, project-status, layout-interaction, UI-preference, and editor-diagnostics stores, which is much closer to a thin index but still leaves project-state publication, artifact data, and realtime helper ownership mixed together.
- `sectionEffectiveImpls.ts` now owns:
  - effective-impl derivation and caching
  - typed current-section and current-code-object selectors
  - in-place impl mutation helpers for section/code-object writes
  - terminal attachment and section-orientation helpers that depend on
    effective impl resolution
- `websocketIncomingMessages.ts` now owns:
  - frontend websocket payload parsing and feature-specific dispatch
  - project/app snapshot routing for inbound websocket updates
  - `UISettingReveal` ACK validation and failure-status construction
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
  - `uiSettingRevealMutations.ts` for reveal mutation lock and high-level orchestration
  - `uiSettingRevealMutationOwnership.ts` for lease sequence and touched-field ownership
  - `uiSettingRevealMutationSnapshots.ts` for snapshot capture and rollback application
  - `uiSettingRevealActivation.ts` for pane-opening and accordion/chat-aux activation writes
  - `uiSettingRevealDom.ts` for anchor lookup, scrolling, and highlight timing
  - `uiSettingRevealShared.ts` for execution-context mismatch and status builders
- `keyActivations.ts`, `keyShortcutRegistrations.ts`, `keyShortcutUtils.ts`,
  and `keyActivationHandlers.ts` now split into:
  - `keyActivations.ts` for global key-listener wiring and pressed-key bookkeeping
  - `keyShortcutRegistrations.ts` for grouped shortcut registration tables
  - `keyShortcutUtils.ts` for shortcut parsing, event-code normalization, and input-ignore policy
  - `keyActivationHandlers.ts` for `Tab`/`Escape`, section-selection, and React Flow key-mode handlers
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
- `projectChatWindowingWrites.ts` now owns:
  - layout write permissions and current-windowing store access
  - optimistic mutation dispatch, rollback, and serialized write barriers
  - authoritative publish flow and explicit sync helpers
- `projectChatWindowingSelectors.ts` now owns:
  - pure windowing normalization and section-binding selectors
  - default floating and docked bounds helpers for UI readers and reducers
- `projectChatWindowingState.ts` now owns:
  - in-state reducers for window placement, focus, bounds, titles, chat ids,
    and section/canvas transitions
- `terminal.ts`, `terminalSessions.ts`, and `terminalFit.ts` now split into:
  - `terminal.ts` for React mount, ready/focus wiring, and resize observation
  - `terminalSessions.ts` for cached websocket session reuse, stdin gating, and resize transport
  - `terminalFit.ts` for xterm fit-addon fallback logic and widen-reflow patching
- `focusManager.ts`, `focusManagerRegistry.ts`, `focusManagerElements.ts`,
  `focusManagerNavigation.ts`, and `focusManagerSections.ts` now split into:
  - `focusManager.ts` as the thin compatibility entrypoint
  - `focusManagerRegistry.ts` for tab-scope registration and focus tracking
  - `focusManagerElements.ts` for focusable-element normalization and canvas ordering helpers
  - `focusManagerNavigation.ts` for generic scope traversal and `Tab` movement
  - `focusManagerSections.ts` for section-targeted and canvas-adjacent focus movement
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
- Reuse seams that already exist in `projectChatWindowingSelectors.ts`, `projectChatWindowingState.ts`, `projectChatWindowingWrites.ts`, `projectChatWindowingAuthoritative.ts`, and `projectChatWindowingEphemeral.ts` where they fit instead of introducing parallel patterns.
- Avoid each domain hand-rolling slightly different optimistic update scaffolding.

4. Split cross-cutting interaction utilities

- Keep `focusManager.ts` as a thin re-export only, and route new tab-scope
  registration, navigation policy, and section/canvas focus work into
  `focusManagerRegistry.ts`, `focusManagerNavigation.ts`,
  `focusManagerSections.ts`, or `focusManagerElements.ts` instead of rebuilding
  a monolith.
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
