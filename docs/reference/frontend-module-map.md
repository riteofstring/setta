# Frontend Module Map

This is the front door for authored frontend code under `frontend/src/`.

## Primary Ownership Map

| Area                               | Owns                                                                                | Start Here                                                                                   | Notes                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages and routing                  | route trees, mode wrappers, page-level loading and guards                           | `components/Pages/`                                                                          | Route assembly belongs here, not in pane or section modules.                                                                                     |
| App shell and chrome               | app registry, header, global wrappers, top-level modal containers                   | `components/App/`, `components/AppHeader/`, `components/Modals/`                             | Keep app-level composition separate from feature internals.                                                                                      |
| Overview panes and authoring panes | overview tabs, UI editor, project config/app config panes                           | `components/Panes/`                                                                          | New pane-specific helpers should usually live next to the owning pane.                                                                           |
| Chat and project AI                | shared chat UI, project-level AI panes, chat windowing                              | `components/Chat/`, `components/ChatWindowing/`, `components/Panes/Overview/ProjectLevelAI/` | This is the densest hotspot; prefer feature-local modules over shared helpers here.                                                              |
| Sections and params                | section shells, headers, layouts, param rendering, section-level controls           | `components/Section/`, `components/Params/`                                                  | Shared section infrastructure should stay policy-driven and modular.                                                                             |
| Shared UI infrastructure           | reusable layout primitives, floating boxes, resizable wrappers, context menu shells | `components/Utils/`                                                                          | Only truly cross-feature UI primitives belong here.                                                                                              |
| State commands and store wiring    | Zustand stores, command modules, subscriptions, view-model hooks                    | `state/`, especially `state/stores/`, `state/actions/`, and `state/hooks/`                   | Keep read helpers distinct from mutation commands.                                                                                               |
| Shared utilities                   | low-level pure helpers with cross-feature reuse                                     | `utils/`                                                                                     | `utils/` is not a fallback for feature code. Prefer feature-local helpers first. Split shared constants live under `utils/constants/` by domain. |
| Plugin runtime                     | plugin bootstrap/runtime integration and plugin pane icons                          | `plugins/`                                                                                   | Plugin contracts belong here, not inside generic app modules.                                                                                    |
| Generated boundaries               | generated routes/types and forked third-party code                                  | `utils/generated*`, `forks/`                                                                 | Do not hand-edit generated or forked code unless absolutely required.                                                                            |

## Where New Code Goes

- Put feature-specific helpers beside the owning feature before considering `utils/`.
- Put presentational subcomponents under the owning feature tree, not in `components/Utils/`, unless they are reused across multiple unrelated features.
- Put pure derived read-model logic in selectors/helpers that live with the owning feature or store domain.
- Put mutations behind named command functions in `state/actions/` or a feature-local command module. Avoid ad hoc `getState()` / `setState()` reach-through from UI files.
- Wrap generated endpoints/types in feature-local adapters when usage would otherwise leak into leaf UI components.
- Add tests beside the owning authored code:
  - Vitest unit/integration tests as `*.test.ts(x)` next to the module.
  - Performance guardrails as `*.perf.test.ts(x)` next to the module when the surface is render- or data-heavy.
  - Playwright coverage under `frontend/tests/e2e/` for interactive flows that materially change.

## State Ownership Rules

- `state/definitions.ts` is the current shared store entry point. New store work should move toward domain-owned store modules instead of extending one large mixed file.
- Persisted UI preferences now live in `state/stores/localStorageStore.ts`, and persisted AI/session chat state now lives in `state/stores/aiStore.ts`.
- Active selection, node internals, and atomic staged project-store publication now live in `state/stores/activeSectionStores.ts`.
- Validation and diagnostics stores now live in `state/stores/diagnosticsStores.ts`, and transient loading/connection/interaction UI state now lives in `state/stores/ephemeralUiStores.ts`.
- Shared file-browser store state now lives in `state/stores/fileBrowserStores.ts` for home, overview, browser-section, and dropzone pickers.
- Authoring workflow stores now live in `state/stores/authoringStores.ts`, runtime/run-log stores now live in `state/stores/runtimeStores.ts`, and global settings now live in `state/stores/settingsStore.ts`.
- AI follow, agentic-scope highlight, and tool-argument preview state now live in `state/stores/aiFollowStores.ts`.
- Artifact/image/chart/decoded-image/draw transform stores now live in `state/stores/artifactStores.ts`.
- Reads and writes should be easy to distinguish:
  - selectors/query helpers answer questions
  - command modules perform mutations
- If a component needs derived state in more than one place, extract a named selector instead of rebuilding the derivation inline.
- If a command mutates optimistic frontend state, keep the domain entry point explicit even if a shared helper exists underneath.

## Placement Rules

- `components/`
  - Owns render composition and feature-local UI helpers.
  - Should not parse transport payloads or own broad cross-domain mutations inline.
- `state/actions/`
  - Owns named mutation commands and state sync flows.
  - Prefer smaller domain files over adding more branches to mega-files.
- `state/hooks/`
  - Owns selector-style hooks, URL/view-model hooks, and component-facing read helpers.
- `state/types/`
  - Owns authored frontend state types that are not generated.
- `utils/`
  - Owns small, pure, cross-feature helpers and constants.
  - If a helper only makes sense inside one feature, keep it in that feature instead.
- `components/Utils/`
  - Owns reusable UI primitives and interaction shells.
  - Do not place feature-specific business rules here.

## File Size Guidance

- Preferred target for new or substantially refactored production files: under 500 lines.
- Review threshold: 800 lines.
- If a file stays above 800 lines, the owning feature should document why the boundary is still the clearest available shape.

## Allowed Patterns

- Store access:
  - Prefer hooks/selectors in render paths.
  - Prefer named commands for writes.
  - Avoid introducing fresh direct `useStore.getState()` / `useStore.setState()` calls in leaf components when a selector or command boundary can carry the behavior.
- Transport:
  - Prefer feature-local API wrappers around generated route functions.
- Tests:
  - Extract pure helpers first, then lock behavior with Vitest before moving JSX around.
  - Add Playwright coverage when a user-visible interaction flow changes materially.
- Imports:
  - Prefer explicit imports from owning modules over broad barrel files that hide ownership.

## Fast Navigation Tips

- Need a page or route change: open `components/Pages/`.
- Need Home page selection reconciliation, favorites partitioning, or side-pane layout math: open `components/Pages/Home/homeWorkspaceState.ts`.
- Need Home page selection action transitions or delete-payload shaping: open `components/Pages/Home/homeProjectSelectionState.ts`.
- Need Home page project gallery, card/list rendering, or project open/favorite/default controls: open `components/Pages/Home/HomeProjectGallery.tsx`.
- Need Home page selected-project summary UI or open-project link behavior: open `components/Pages/Home/HomeSelectedProjectDetails.tsx`.
- Need Home page side-pane rails or pane-shell composition: open `components/Pages/Home/HomeSidePanes.tsx`.
- Need Home page workspace-browser pane UI or path-entry behavior: open `components/Pages/Home/HomeWorkspaceBrowserPane.tsx`.
- Need standalone project route-target resolution, path/title helpers, or owner-key logic: open `components/Pages/Project/standaloneProjectSurfaceRouting.ts`.
- Need standalone project managed-chat authority, thread-title, or blocked/not-found guard decisions: open `components/Pages/Project/standaloneProjectSurfaceViewModel.ts`.
- Need standalone project error-state lifecycle, runtime hooks, or chat-route navigation wiring: open `components/Pages/Project/standaloneProjectSurfaceController.ts`.
- Need standalone project surface render branching or standalone shell/not-found UI: open `components/Pages/Project/StandaloneProjectSurfaceRenderer.tsx`.
- Need standalone window-space hydration, local window state, or snap-resize math: open `components/Pages/Project/standaloneWindowSpaceState.ts`.
- Need standalone window-space viewport sizing, hydration effects, or local window callback wiring: open `components/Pages/Project/useStandaloneWindowSpaceController.ts`.
- Need standalone window-space blocked/empty UI, resize-handle overlay, or per-window canvas rendering: open `components/Pages/Project/StandaloneWindowSpaceCanvas.tsx`.
- Need standalone window-space branching between section, git-graph, and floating project-chat windows: open `components/Pages/Project/StandaloneWindowSpaceWindowSurface.tsx`.
- Need App Config prompt/context formatting for generation prompts: open `components/Panes/Overview/App/appConfigPromptUtils.ts`.
- Need App Config default-spec, request-payload parsing, or preview seed helpers: open `components/Panes/Overview/App/appConfigDefinitionUtils.ts`.
- Need App Config hidden-generation engine selection or generation error helpers: open `components/Panes/Overview/App/appConfigHiddenGenerationUtils.ts`.
- Need App Config prompt-context loading, hidden-generation resource preloads, or hidden-generation AI-state shaping: open `components/Panes/Overview/App/appConfigGenerationSupport.ts`.
- Need App Config draft fields, saved-definition hydration, or preview-override syncing: open `components/Panes/Overview/App/useAppConfigDefinitionDrafts.ts`.
- Need App Config load/save/validate state or generated-spec persistence: open `components/Panes/Overview/App/useAppConfigPersistence.ts`.
- Need App Config JSON-stream generation or hidden-chat generation orchestration: open `components/Panes/Overview/App/useAppConfigGenerationController.ts`.
- Need App Config backend transport for load/save/validate/catalog requests: open `components/Panes/Overview/App/appConfigApi.ts`.
- Need pane/tab behavior: open `components/Panes/`.
- Need section chrome or param rendering: open `components/Section/` and `components/Params/`.
- Need managed section-chat history or polling behavior: open `components/Section/Layouts/ChatAreaHistoryPanel.tsx`.
- Need managed section-chat thread-controller wiring: open `components/Section/Layouts/chatAreaManagedThreadController.ts`.
- Need managed section-chat submit/edit/stop runtime behavior: open `components/Section/Layouts/chatAreaManagedRuntime.ts`.
- Need managed section-chat header, scope banners, or history/new-chat controls: open `components/Section/Layouts/ManagedChatAreaHeader.tsx`.
- Need managed section-chat config, availability, slash-command, or input-state derivation: open `components/Section/Layouts/chatAreaManagedState.ts`.
- Need section-chat realtime dependency actions: open `components/Section/Layouts/chatAreaRealtimeActions.ts`.
- Need scriptable section-chat state transitions or slash-command runtime behavior: open `components/Section/Layouts/chatAreaScriptableRuntime.ts`.
- Need section-chat thread-control helpers: open `components/Section/Layouts/chatAreaThreadControls.ts`.
- Need section-chat authoring controls for managed mode, engine selection, or transcription/dictation settings: open `components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`.
- Need section-chat authoring links, summary-cache status, or agentic-scope panel behavior: open `components/Panes/UiEditor/SectionConfig/ChatAreaAgenticLinksPanel.tsx`.
- Need section-chat authoring managed-settings view-model derivation: open `components/Panes/UiEditor/SectionConfig/chatAreaManagedSettingsState.ts`.
- Need section-chat authoring managed-settings render surface: open `components/Panes/UiEditor/SectionConfig/ChatAreaManagedSettingsPanel.tsx`.
- Need section-chat authoring managed-settings command wiring or optimistic section-update handlers: open `components/Panes/UiEditor/SectionConfig/chatAreaSettingsController.ts`.
- Need a mutation path: search in `state/actions/`.
- Need chat or project-AI commands: start in the extracted domain modules under `state/actions/ai/`.
- Need chat submit/edit or external-agent approval/question commands: open `state/actions/ai/chatCommands.ts`.
- Need streaming chunk handling or tool/app preview updates: open `state/actions/ai/chatStreaming.ts`.
- Need agent-run authority loading or engine resolution from chat history: open `state/actions/ai/agentRuns.ts`.
- Need pending chat state, chat hydration, or stop-response runtime behavior: open `state/actions/ai/chatRuntime.ts`.
- Need Project Chat hydration/slash-command/runtime helper logic: open `components/Panes/Overview/ProjectLevelAI/projectChatRuntimeUtils.ts`.
- Need Project Chat submit/edit/redo/stop/dictation composer runtime behavior: open `components/Panes/Overview/ProjectLevelAI/projectChatComposerRuntime.ts`.
- Need Project Chat slash-command, submit/edit/redo/stop, dictation, or thread-selection callback wiring: open `components/Panes/Overview/ProjectLevelAI/projectChatComposerController.ts`.
- Need Project Chat disabled-state, runtime-activity, or input-surface state derivation: open `components/Panes/Overview/ProjectLevelAI/projectChatComposerState.ts`.
- Need Project Chat execution-settings synchronization or execution-control visibility: open `components/Panes/Overview/ProjectLevelAI/projectChatExecutionControls.ts`.
- Need Project Chat thread selection, draft-thread lifecycle, or resume-latest behavior: open `components/Panes/Overview/ProjectLevelAI/projectChatThreadController.ts`.
- Need Project Chat slash-command state, authority-refresh fallback, or slash-command execution wiring: open `components/Panes/Overview/ProjectLevelAI/projectChatSlashCommands.ts`.
- Need Project Chat blocked-banner, empty-state, message-list, or chat-input rendering ownership: open `components/Panes/Overview/ProjectLevelAI/ProjectChatConversationSurface.tsx`.
- Need Project Chat message-list or chat-input prop shaping for the conversation surface: open `components/Panes/Overview/ProjectLevelAI/projectChatConversationSurfaceState.ts`.
- Need Project Chat starter-prompt availability or workspace-root probing: open `components/Panes/Overview/ProjectLevelAI/projectChatStarterPromptState.ts`.
- Need Project Chat hydration retry, blocked-state reset, or pending-prompt runtime effects: open `components/Panes/Overview/ProjectLevelAI/projectChatRuntimeController.ts`.
- Need Project Chat conversation filtering, branch info, submitted-history derivation, or history-compatibility view models: open `components/Panes/Overview/ProjectLevelAI/projectChatConversationViewModel.ts`.
- Need Project Chat conversation filtering or submitted-history helpers: open `components/Panes/Overview/ProjectLevelAI/projectChatHistoryUtils.ts`.
- Need Project Chat history display/search/grouping derivation or agent-badge view models: open `components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.ts`.
- Need Project Chat history drag ids, drop-target parsing, or thread/group reorder helpers: open `components/Panes/Overview/ProjectLevelAI/projectChatHistoryDragUtils.ts`.
- Need Project Chat history create/select/start/delete/reorder command wiring: open `components/Panes/Overview/ProjectLevelAI/projectChatHistoryController.ts`.
- Need Project Chat history toolbar search, badge toggle, undo-delete, or new-group chrome: open `components/Panes/Overview/ProjectLevelAI/ProjectChatHistoryToolbar.tsx`.
- Need Project Chat history empty-state, grouped-list composition, or page-level render branching: open `components/Panes/Overview/ProjectLevelAI/ProjectChatHistoryContent.tsx`.
- Need Project Chat history search query/navigation state or active-match scroll behavior: open `components/Panes/Overview/ProjectLevelAI/projectChatHistorySearchState.ts`.
- Need Project Chat history thread-row rendering, indicators, badges, or per-thread action chrome: open `components/Panes/Overview/ProjectLevelAI/ProjectChatHistoryThreadEntry.tsx`.
- Need Project Chat grouped-folder rendering, inline rename, or per-group action chrome: open `components/Panes/Overview/ProjectLevelAI/ProjectChatHistoryGroupFolder.tsx`.
- Need Project Chat ungrouped-folder rendering or null-group thread section composition: open `components/Panes/Overview/ProjectLevelAI/ProjectChatHistoryUngroupedFolder.tsx`.
- Need Project Chat shared thread-list drop-zone or draft/active row helpers: open `components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadListShared.tsx`.
- Need LLM config or managed API-key mutations: open `state/actions/ai/llmSettings.ts`.
- Need Project AI profiles/templates/engine/transcription resource mutations: open `state/actions/ai/projectAiResources.ts`.
- Need Project AI settings draft builders, list parsing, or external-agent JSON parsing: open `components/Panes/Overview/ProjectLevelAI/projectAISettingsDraftUtils.ts`.
- Need Project AI settings field chrome or shared manager form primitives: open `components/Panes/Overview/ProjectLevelAI/projectAISettingsFormPrimitives.tsx`.
- Need Project AI agent profile manager behavior: open `components/Panes/Overview/ProjectLevelAI/ProjectAIAgentProfilesManager.tsx`.
- Need Project AI transcription profile manager behavior: open `components/Panes/Overview/ProjectLevelAI/ProjectAITranscriptionProfilesManager.tsx`.
- Need Project AI prompt template manager behavior: open `components/Panes/Overview/ProjectLevelAI/ProjectAIPromptTemplatesManager.tsx`.
- Need Project AI external-agent config manager behavior: open `components/Panes/Overview/ProjectLevelAI/ProjectAIExternalAgentConfigsManager.tsx`.
- Need shared derived state or a component-facing hook: search in `state/hooks/`.
- Need a pure cross-feature helper: check `utils/`.
