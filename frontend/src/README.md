# Frontend Source Map

This is the shortest path to "where does this behavior live?" for authored frontend
code under `frontend/src`.

Generated modules under `frontend/src/utils/generated*` are intentionally excluded
from this map. Treat them as source-of-truth protocol outputs, then add
feature-local adapters around them when the consuming surface is non-trivial.

## Current Snapshot

- Snapshot date: `2026-03-14`
- Authored TS/TSX files under `frontend/src`: `979`
- Non-generated TS/TSX files at `1000+` lines: `43`
- Biggest current production hotspots:
  - `components/Chat/ChatMessages.tsx` (`7959`)
  - `components/ChatWindowing/ProjectChatBottomDock.tsx` (`4989`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` (`3327`)
  - `components/Chat/ChatInput.tsx` (`3121`)
  - `plugins/runtime.ts` (`2730`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` (`2723`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` (`2478`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` (`2445`)
  - `components/Panes/Overview/FileBrowser/FileBrowserPane.tsx` (`2403`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` (`2379`)
  - `state/actions/projectChatWindowing.ts` (`2326`)

## Module Map

- App entry, routing, and page shell

  - `components/Pages/router.tsx` composes the route tree.
  - `components/Pages/routeConfig.ts` owns stable route ids and patterns.
  - `components/Pages/modeRouteResolver.ts` resolves IDE/share/app/launcher mode
    routing.
  - `components/Pages/AppShell.tsx` and `components/Pages/GlobalWrapper.tsx`
    wrap shared page chrome and global providers.

- Project surfaces

  - `components/Pages/Project/*` owns the main project canvas plus standalone
    project and window-space surfaces.
  - `components/AppHeader/*` owns top-level project navigation and search chrome.

- Overview panes and authoring

  - `components/Panes/Overview/*` owns overview tabs such as App, File Browser,
    Git, Plugins, Project AI, and project overview panes.
  - `components/Panes/UiEditor/*` and `components/ProjectConfigs/*` own authoring
    and configuration editors.

- Shared chat and project AI

  - `components/Chat/*` owns shared message rendering and composer UI.
  - `components/Panes/Overview/ProjectLevelAI/*` owns project chat orchestration,
    hydration authority, starter prompts, slash command selection, skill viewers,
    and project AI settings.
  - `state/actions/aiChatStreaming.ts`, `state/actions/chat*.ts`, and
    `state/actions/projectChatThreads.ts` currently own chat streaming, tool
    preview/app-spec reconciliation, and optimistic stream update behavior.
  - `state/actions/aiHydration.ts` owns chat history fetch/reconciliation and
    hydration outcome classification for managed and external threads.
  - `state/actions/aiAgentRuns.ts` owns agent-run loading, retries, and
    single-run/update reconciliation.
  - `state/actions/aiChatSubmission.ts` owns chat submission/edit orchestration,
    backend request payload assembly, and the pending-surface promotion flow.
  - `state/actions/aiChatControls.ts` owns stop/resume behavior plus external
    agent approval/question responses.
  - `state/actions/aiChatState.ts` owns chat-detail and pending-surface detail
    writes shared across submission, hydration, and controls.
  - `state/actions/aiChatSectionState.ts` owns persisted chat-section state sync
    shared by hydration and section-state writes.
  - `state/actions/aiInterruptedAssistantMessages.ts` owns interrupted assistant
    message tracking and snapshot restoration.
  - `state/actions/aiPendingChatState.ts` owns surface-scoped pending drafts,
    pending app-generation state, and promotion into materialized chats.
  - `state/actions/aiConfiguration.ts` owns LLM config/API keys plus the AI
    settings catalogs for agent profiles, prompt templates, external agents, and
    engine configs.
  - `state/actions/aiTranscription.ts` owns provider dictation, transcription
    session transport, and transcription-profile load/CRUD behavior.

- Project chat windowing

  - `components/ChatWindowing/*` owns dock/window rendering, surface ids, snap
    layout helpers, and viewport math.
  - `state/actions/projectChatWindowing.ts` is the main mutation entry point.
  - `state/actions/projectChatWindowingAuthoritative.ts` and
    `state/actions/projectChatWindowingEphemeral.ts` already hold narrower helper
    seams and should be extended instead of recreated elsewhere.

- Section rendering and params

  - `components/Section/*` owns section containers, headers, layouts, and shared
    section chrome.
  - `components/Params/*` owns param rendering and param-specific input controls.

- Browser and file management

  - `components/Panes/Overview/FileBrowser/*` owns file browsing panes and file
    browser editors.
  - `components/Section/Layouts/BrowserArea.tsx` owns the browser section layout.
  - `utils/fileBrowser*.ts`, `utils/browserPaths.ts`, and nearby helpers own the
    pure file-browser derivation and path utilities.

- App runtime

  - `components/App/appRegistry.tsx` owns app runtime component registration,
    bindings, and renderer selection.
  - `components/Pages/App/*` owns app-mode shells and wrappers.

- Plugin runtime

  - `plugins/runtime.ts` owns plugin registration, capability gating, runtime
    transport, and host APIs.
  - `components/Section/Layouts/PluginArea.tsx` and
    `components/Panes/Overview/Plugins/*` render plugin-backed surfaces.

- Shared state

  - `state/definitions.ts` is now the shared index for the remaining
    cross-feature Zustand stores plus the atomic project-store publication
    helpers on this branch. It is down to `404` lines after moving the AI/chat,
    app runtime, session/share, browser, search, feedback/status,
    layout-interaction, UI-preference, and editor-diagnostics clusters into
    domain-owned modules.
  - `state/stores/aiStores.ts` owns the AI/chat Zustand stores and chat-specific
    store types such as `ChatDetails`, `ChatBranchInfo`, and
    `ProjectChatCustomSlashCommand`.
  - `state/stores/appStores.ts` owns app definition/config/preview state used by
    app-mode rendering, app preview, and app deployment surfaces.
  - `state/stores/editorDiagnosticsStores.ts` owns LSP waiting flags, type
    errors, LSP diagnostics, and name-validation errors shared across section
    authoring, formatting, and validation surfaces.
  - `state/stores/feedbackStores.ts` owns modal, notifications, and backend-log
    store state used across shell and overview surfaces.
  - `state/stores/fileBrowserStores.ts` owns the standalone, home-page,
    browser-section, and dropzone file-browser state surfaces.
  - `state/stores/layoutInteractionStores.ts` owns section refs, edge-handle
    registry state, temporary section measurement/preview state, and the
    ephemeral layout interaction flags shared across section dragging, sizing,
    minimap previews, and embedded project-chat git panes.
  - `state/stores/projectStatusStores.ts` owns run-control and project-loading
    status shared across run actions and route/deployment loading flows.
  - `state/stores/searchStores.ts` owns home-page search plus project search
    state used by the header search surfaces and param search highlighting.
  - `state/stores/sessionStores.ts` owns share-session, server-mode, and
    all-project-metadata state used across IDE/share/app/launcher flows.
  - `state/stores/uiPreferenceStores.ts` owns persisted UI chrome preferences
    plus shared settings state used by panes, shortcuts, minimap/grid behavior,
    and project-chat local preference surfaces.
  - `state/storePersistStorage.ts` owns the shared persisted-storage fallback
    used by the persisted store modules.
  - `state/actions/*` owns named mutation and query helpers, with shared chat
    helpers split across `aiHydration.ts`, `aiAgentRuns.ts`,
    `aiChatSubmission.ts`, `aiChatControls.ts`, `aiChatState.ts`,
    `aiChatSectionState.ts`, and `aiPendingChatState.ts`.
  - `state/actions/sectionProjectStateSync.ts` owns backend project-state
    reconciliation, active-section sync, viewport updates, and project-chat
    windowing coordination for authoritative project snapshots.
  - `state/actions/projectStateCommands.ts` owns the shared project-state
    command entrypoints for section delete/group flows, param selection,
    viewport persistence, and all-project-metadata updates.
  - `state/actions/projectStateOptimisticUpdates.ts` owns the pending-operation
    queue and optimistic project-state mutation scaffolding used by shared state
    action modules.
  - `state/actions/websocketIncomingMessages.ts` owns frontend websocket
    payload dispatch, project/app snapshot routing, and `UISettingReveal` ACK
    handling.
  - `state/actions/websocketReceive.ts` now owns socket transport lifecycle,
    auth/share-session recovery, listener-coverage bootstrap, and outbound
    realtime dependency sending.
  - `state/actions/sectionEffectiveImpls.ts` owns effective section/code-object
    resolution, typed current-section/code-object selectors, and in-place
    impl-mutation helpers that previously lived in `sectionInfos.ts`.
  - `state/actions/sectionInfos.ts` now owns streaming chat merge behavior,
    section metadata/layout queries, displayed-child tree derivation, and tool
    preview cleanup that still sits beside the remaining shared section query
    surface.
  - `state/actions/topLevelSectionLayouts.ts` owns active-view top-level layout
    selection plus layout snapshot building from current node internals.
  - `state/actions/topLevelLayoutPersistence.ts` owns pending-op reconciliation
    and debounced backend persistence for top-level section layout writes.
  - `state/actions/windowSpacePersistence.ts` owns saved window-space sort/name/
    delete/create mutations plus optimistic persistence flow.
  - `state/actions/windowSpaceSnapshots.ts` owns floating window-space snapshot
    building and conversion back into project-chat windowing state.
  - `state/actions/windowSpaces.ts` now owns workspace restore orchestration for
    saved window spaces.
  - `state/actions/keyActivations.ts` now just owns global key-listener
    orchestration; `keyShortcutUtils.ts` owns shortcut parsing/input-ignore
    policy and `keyActivationHandlers.ts` owns `Tab`/`Escape`, section
    selection, and React Flow key-mode handlers.
  - `state/actions/uiSettingReveal.ts` now just orchestrates reveal requests;
    `uiSettingRevealMutations.ts` owns the mutation lock plus high-level reveal
    orchestration, `uiSettingRevealMutationOwnership.ts` owns lease sequence and
    touched-field ownership, `uiSettingRevealMutationSnapshots.ts` owns
    snapshot capture and rollback application, `uiSettingRevealActivation.ts`
    owns pane activation writes, `uiSettingRevealDom.ts` owns DOM
    anchor/highlight behavior, and `uiSettingRevealShared.ts` owns
    execution-status helpers.
  - `state/hooks/terminals/terminal.ts` now just orchestrates terminal mount,
    ready/focus wiring, and resize observation; `terminalSessions.ts` owns
    cached terminal websocket sessions, and `terminalFit.ts` owns xterm
    fit/fallback/reflow behavior.
  - `utils/focusManager.ts` is now just the compatibility entrypoint;
    `focusManagerRegistry.ts` owns tab-scope registration plus focus tracking,
    `focusManagerNavigation.ts` owns generic scope traversal, and
    `focusManagerSections.ts` owns section/canvas focus helpers while
    `focusManagerElements.ts` owns focusable-element normalization and canvas
    ordering helpers.
  - `state/hooks/*` owns reusable hooks layered on top of stores and actions.
  - `state/types/*` and `state/utils/*` own state-local models and helper logic.

- Shared UI infrastructure

  - `components/Utils/*` owns reusable UI primitives, comboboxes, CodeMirror
    wrappers, floating/resizable helpers, and context menu infrastructure.
  - `utils/*` is reserved for low-level cross-feature helpers and protocol glue,
    not feature-specific ownership.

- Forks
  - `forks/dnd-kit/*` and `forks/xyflow/*` are vendored or adapted fork surfaces.
  - If a cleanup slice primarily lives under `frontend/src/forks/**`, use
    `docs/plans/frontend-forks-cleanup-plan.md` before expanding the slice.

## Where New Code Goes

- Keep helpers, selectors, adapters, and tests with the owning feature first. If
  a behavior only exists for `ProjectLevelAI`, it should start there rather than
  in `utils/`.
- Prefer `state/stores/*` for domain-owned Zustand modules. Only extend
  `state/definitions.ts` when the state is truly cross-feature or when a thin
  shared re-export improves discovery. Feature-local derived reads should stay
  beside the owning feature as selectors or pure helpers.
- Add named command functions for mutations. Avoid new ad hoc
  `useStore.getState()` or `setState()` reach-through from render-heavy
  components when an owning command module can hold the write path instead.
- Put non-trivial generated endpoint usage behind a feature-local adapter or
  helper instead of spreading `route_*` calls through leaf render components.
- Reserve `components/Utils/*` for reusable primitives with clear cross-feature
  ownership. Do not move feature logic there just because it is shared by two
  nearby files.
- Keep fork-specific adapters close to the fork or consuming feature instead of
  burying them in generic helpers.

## Guardrails

- Preferred size for new or refactored production files: under `500` lines.
- Review threshold: `800` lines. Crossing it should be deliberate, with helper
  seams or a follow-up cleanup path already identified.
- Prefer pure `select*`, `build*`, `resolve*`, or `compute*` helpers for heavy
  derivation so tests can run without React.
- Put tests beside the code as `*.test.ts(x)` or `*.perf.test.ts(x)`. Use
  Playwright under `frontend/tests/e2e/` for user-facing flows.
- Keep `utils/` low-level. If a helper needs project-chat semantics, store
  knowledge, or pane ownership context, it likely belongs closer to that feature.

## Likely Next Cleanup Slices

- `components/Utils/Resizable/CustomResizable.tsx` resize-surface split across
  low-level drag math, DOM event wiring, and window/pane-specific behavior
- `state/actions/stateMachineEdges.ts` edge mutation split across graph reads,
  optimistic project-state writes, and view/runtime-specific edge commands
- `state/actions/sectionInfos.ts` section metadata/display-tree split now that
  `state/actions/sectionEffectiveImpls.ts`,
  `state/actions/sectionProjectStateSync.ts`,
  `state/actions/projectStateCommands.ts`,
  `state/actions/projectStateOptimisticUpdates.ts`,
  `state/actions/topLevelSectionLayouts.ts`, and
  `state/actions/topLevelLayoutPersistence.ts` own effective-impl access,
  backend sync, shared commands, optimistic mutation infrastructure, and
  top-level layout ownership
- shared project chat surfaces under `components/Chat/*`,
  `components/Panes/Overview/ProjectLevelAI/*`, and `components/ChatWindowing/*`
