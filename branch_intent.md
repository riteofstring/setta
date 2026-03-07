# Branch Intent Summary (`main...HEAD`)

Merge-base analyzed: `1a2f277ac712befd238ed383f696b91e3149131b`.

## Features

1. **Custom skill authoring path (backend + frontend) is now first-class**
What changed (before -> after): Skills were effectively read-only from the UI. This branch adds create/update support for `SKILL.md` via `POST /upsertAppGenCustomSkill`, plus skills-side controls to create a custom skill and save edited markdown.
Why this appears intentional: The change adds a dedicated request/response model, route enum entry, generated frontend endpoint/types, backend validation helpers, and both route-level and unit tests.
Files/endpoints/components involved: `backend/setta/routers/app_gen_extensions.py`, `backend/setta/types/routes.py`, `frontend/src/utils/generatedEndpoints.ts`, `frontend/src/utils/generatedTypes.ts`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`, `tests/routers/test_app_gen_extensions_routes.py`.
Any default-value/moved/relocated logic: New-skill root selection has explicit priority (`agents_home_skills` -> `user_agents_skills` -> `workspace_agents_skills`) and only custom roots are editable.
Reviewer guardrail: Do not revert this to read-only behavior or loosen path/root restrictions unless there is a new product/security decision.

2. **Project AI tools are split into explicit aux views (Skills, MCP, Slash Commands, AI Settings)**
What changed (before -> after): The prior single "Open Skills/MCP" entry is replaced by distinct tool actions and dedicated aux views. When an aux view is open, in-pane aux tabs stay visible so users can switch between Skills/MCP/Slash Commands/AI Settings without returning to chat first.
Why this appears intentional: The header state model was expanded to `projectChatAuxView`, new tab state/UI was added, and E2E tests were rewritten around the new flow.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts`.
Any default-value/moved/relocated logic: AI settings access is relocated into Project AI chat aux tabs; the standalone Overview "Project AI Settings" tab is no longer a primary destination.
Reviewer guardrail: Do not collapse back to the previous monolithic Skills/MCP flow or remove persistent aux-tab switching behavior.

3. **Skills view got a major UX/editor upgrade**
What changed (before -> after): Skills are now shown in a dedicated skills view with a refresh action, custom-skill creation input, root-path visibility/open action, a resizable split between list and markdown, and markdown view-mode toggle (`Rendered`/`Raw text`). Raw mode supports in-place editing for editable roots and save.
Why this appears intentional: The previous resizable helper was replaced with a custom pointer-resize flow, markdown rendering was added with `react-markdown`, and new test coverage validates mode switching, refresh, and create/save behavior.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts`.
Any default-value/moved/relocated logic: Markdown view mode is persisted (`rendered` default unless explicitly switched to raw); markdown-pane open state is persisted.
Reviewer guardrail: Do not remove rendered markdown mode, resize split behavior, or custom-skill create/save controls as incidental cleanup.

4. **Slash command system now includes app-mode commands and per-project custom commands**
What changed (before -> after): Managed slash commands now include app-generation mode commands (`/app-json`, `/app-image`, `/app-prompt`, `/app-mcp`). Users can also add/remove per-project custom slash commands with stored prompt templates; execution submits template + args as a chat message.
Why this appears intentional: Command/action enums were expanded, parser/normalization logic was added, managed command execution gained app-mode handlers, Project AI slash-command UI was built, and tests were added across parser/executor/E2E.
Files/endpoints/components involved: `frontend/src/components/Chat/chatComposerControls.ts`, `frontend/src/components/Chat/chatComposerControls.test.ts`, `frontend/src/components/Chat/ChatInput.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`, `frontend/src/state/definitions.ts`.
Any default-value/moved/relocated logic: Custom slash commands live in local storage under `customProjectChatSlashCommandsByProjectConfigId` and are normalized/collision-checked against managed and discovered native commands.
Reviewer guardrail: Do not revert to the old command set or drop collision/normalization checks that protect command namespace integrity.

5. **Runtime activity counters became inspectable activity menus**
What changed (before -> after): Composer runtime counters now support detailed dropdowns listing active background terminals/subagents, including user-meaningful labels (`command`/`profileId`) and tool identifiers.
Why this appears intentional: Runtime activity resolution now has a detailed data path plus a count path, ChatInput was updated to render dropdowns conditionally, and tests validate detailed rendering.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts`, `frontend/src/components/Chat/ChatInput.tsx`, `frontend/src/components/Chat/ChatInput.test.tsx`.
Any default-value/moved/relocated logic: Counter badges remain visible for activity counts, but become menu triggers when detailed entries exist.
Reviewer guardrail: Do not regress this back to opaque count-only indicators; the detail-level visibility is intentional.

6. **Watch Code settings were relocated from Overview tab to React Flow controls portal**
What changed (before -> after): Watch Code is no longer a dedicated Overview rail tab. A watch-code control in the flow controls opens an anchored popover/portal containing `WatchCodePane`.
Why this appears intentional: Controls gained portal state/positioning/caret logic, WatchCode pane got an in-popover mode, and E2E tests now target portal interactions.
Files/endpoints/components involved: `frontend/src/forks/xyflow/controls/Controls.tsx`, `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`, `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx`, `frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`, `frontend/src/components/Panes/Overview/Overview.tsx`.
Any default-value/moved/relocated logic: Watch-code flow is explicitly relocated to controls; overview watch-code tab presence is intentionally removed.
Reviewer guardrail: Do not reintroduce the old rail-tab model without a deliberate UX decision; follow-up work should keep portal behavior functional.

7. **Overview rail/navigation was reorganized for a "More"-menu workflow**
What changed (before -> after): `Plugins`, `App Gen`, and `Custom Runs` were moved off the primary icon rail into a `More` menu. Run button dropdown now includes a direct `Custom Runs...` jump. Notifications now precede More as the final explicit rail control.
Why this appears intentional: Multiple Overview and AppHeader files changed with test updates asserting tab order, presence/absence, and menu routing.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/src/components/Panes/Overview/Overview.test.tsx`, `frontend/tests/e2e/overview/layout/overview-rail-chat-order.spec.ts`, `frontend/src/components/AppHeader/RunButton.tsx`.
Any default-value/moved/relocated logic: UX flows for App/Plugins/Custom Runs are relocated into `More` and Run dropdown shortcut.
Reviewer guardrail: Do not "fix" this by restoring old direct tabs unless product direction changes.

8. **Notifications pane now contains both Notifications and Logs sub-tabs**
What changed (before -> after): Backend logs are folded into the notifications pane as a sub-tab (`Logs`) alongside `Notifications`, instead of a separate top-level pane.
Why this appears intentional: New local-storage state/type constants were introduced, migration logic was added for old persisted tabs, and tests cover both migration and behavior.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/NotificationsArea.tsx`, `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/src/utils/constants.ts`, `frontend/src/state/definitions.ts`, `frontend/src/state/actions/localStorage.test.ts`, `frontend/tests/e2e/overview/misc/backend-logs-columns-resize-copy.spec.ts`.
Any default-value/moved/relocated logic: `overviewNotificationsPaneTab` defaults to `notifications`; persisted legacy `BackendLogs` tab values are migrated to `Notifications + backend_logs` sub-tab.
Reviewer guardrail: Do not split logs back out as a separate tab accidentally; preserve migration behavior for existing users.

## Bug Fixes

1. **Hydration now preserves local-only chat messages consistently**
What changed (before -> after): Hydration previously dropped local-only messages in non-streaming cases. It now always preserves local-only message rows during merge/hydration.
Why this appears intentional: Explicit code comment ties the change to preserving thought/tool ordering; tests were renamed and updated to assert local-message retention.
Files/endpoints/components involved: `frontend/src/state/actions/ai.ts`, `frontend/src/state/actions/aiSectionStateSync.test.ts`, `frontend/src/state/actions/aiWaitingForResponse.test.ts`.
Any default-value/moved/relocated logic: `preserveLocalOnlyMessages` changed from conditional to unconditional (`true`) in hydration merge paths.
Reviewer guardrail: Do not reintroduce conditional dropping of local-only messages without proving ordering/activity regressions are addressed another way.

2. **Composer draft is preserved across inline-thread resize/remount transitions**
What changed (before -> after): Draft text used to reset when chat core remounted during inline-thread layout changes. Draft state is now owned by `ProjectChat` and injected into `ProjectChatCore`.
Why this appears intentional: State ownership was explicitly lifted; E2E coverage verifies draft text survives resizing/fullscreen transitions.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-threads.spec.ts`.
Any default-value/moved/relocated logic: Draft-message state relocated from child component local state to parent scope.
Reviewer guardrail: Do not move draft state back into remount-prone child scope.

3. **Narrow-pane overflow/wrapping regressions were fixed in Project AI chat**
What changed (before -> after): Horizontal overflow and cramped/wrapped header behavior in narrow/medium widths were addressed with stricter `min-w-0`/`overflow-x-hidden` handling and updated grid breakpoints.
Why this appears intentional: Structural class updates span chat container, message list, and header layout with matching E2E geometry assertions.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-threads.spec.ts`.
Any default-value/moved/relocated logic: Conversation-search placement now stays on top row at medium widths and wraps only at very narrow sizes.
Reviewer guardrail: Do not remove `min-w-0`/overflow constraints or older breakpoint assumptions that caused horizontal clipping/overflow.

4. **Backend-log unread tracking was corrected for the new notifications/logs layout**
What changed (before -> after): High-severity log unread counts previously keyed off the old standalone Backend Logs tab. Visibility checks now correctly treat `Notifications` + `Logs` sub-tab as “logs visible.”
Why this appears intentional: Visibility helper logic was rewritten and dedicated tests were added for both new and legacy states.
Files/endpoints/components involved: `frontend/src/state/actions/backendLogEvents.ts`, `frontend/src/state/actions/backendLogEvents.test.ts`, `frontend/src/components/Panes/Overview/NotificationsArea.tsx`.
Any default-value/moved/relocated logic: Legacy `overviewTab === BackendLogs` remains recognized for compatibility while migration is in place.
Reviewer guardrail: Do not regress unread-count semantics by assuming only top-level tab visibility.

5. **Thread-list context badge false-positive was suppressed**
What changed (before -> after): “context unavailable” could appear in thread-list context where no active conversation context should be shown. Empty-state rendering now suppresses that badge.
Why this appears intentional: Conditional logic now forces `contextUsageUnavailable` off when chat empty-state is shown; E2E test explicitly asserts absence.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-hydration-provenance.spec.ts`.
Any default-value/moved/relocated logic: Context-unavailable indicator behavior is now scoped to active conversation content.
Reviewer guardrail: Do not restore global badge rendering that leaks unavailable-state into non-conversation UI.

6. **Interaction bugs from missing pointer/cursor affordances were cleaned up**
What changed (before -> after): Several controls now explicitly advertise clickability and avoid accidental canvas gestures (`cursor-pointer`, `nopan`, `nowheel`), including accordion triggers and watch-code toggles.
Why this appears intentional: Multiple targeted style fixes with tests were added to lock in these affordances.
Files/endpoints/components involved: `frontend/src/components/Panes/Common/PaneAccordion.tsx`, `frontend/src/components/Panes/Common/PaneAccordion.test.tsx`, `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx`, `frontend/src/components/Utils/PaneContainer.tsx`.
Any default-value/moved/relocated logic: None.
Reviewer guardrail: Do not remove these classes as superficial styling; they resolve real interaction regressions.

## Intentional Behavior Changes To Preserve

1. **Follow AI default mode changed from `off` to `all`**
What changed (before -> after): New projects now start with Follow AI active by default.
Why this appears intentional: Store default changed directly and tests were updated to assert active default mode.
Files/endpoints/components involved: `frontend/src/state/definitions.ts`, `frontend/src/state/actions/aiFollow.test.ts`, `frontend/src/components/AppHeader/FollowAIToggleButton.test.tsx`.
Any default-value/moved/relocated logic: Default-value change only.
Reviewer guardrail: Do not silently switch default back to `off` in follow-up cleanup.

2. **Legacy Overview tab routing is intentionally mapped to new destinations**
What changed (before -> after): Persisted/legacy tab states (`BackendLogs`, `ProjectAISettings`) are mapped into current UX targets (`Notifications` logs sub-tab, `ProjectAIChat`).
Why this appears intentional: Explicit migration/fallback logic and tests cover these legacy states.
Files/endpoints/components involved: `frontend/src/state/definitions.ts`, `frontend/src/state/actions/localStorage.test.ts`, `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/src/components/Panes/Overview/Overview.test.tsx`.
Any default-value/moved/relocated logic: Legacy routes intentionally redirected instead of preserved as standalone tabs.
Reviewer guardrail: Preserve migration paths; do not drop compatibility handling without an explicit migration cutover plan.

3. **Project AI empty-thread UX intentionally became actionable**
What changed (before -> after): “No threads yet” passive text became a styled empty state with `Start a new thread` CTA that creates a draft thread inline.
Why this appears intentional: New handler wiring and E2E coverage verifies CTA behavior and draft creation.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-threads.spec.ts`.
Any default-value/moved/relocated logic: New-thread entry flow is now available directly from empty state.
Reviewer guardrail: Do not revert to static placeholder text-only empty state.

4. **Run-instructions and custom-run controls were intentionally flattened/compacted**
What changed (before -> after): Custom run rows moved from stacked controls to a compact single-row interaction model; pane spacing was reduced and content inset logic simplified.
Why this appears intentional: Class constants/layout were refactored and tied to specific styling commits/tests.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/RunInstructions.tsx`.
Any default-value/moved/relocated logic: Control layout relocated from two-line per-row to one-line per-row presentation.
Reviewer guardrail: Avoid reintroducing the previous stacked row layout as “cleanup”.

5. **Worktree and Git rail iconography update is intentional**
What changed (before -> after): Git tab icon switched to branch icon, and worktree hint now includes branch glyph for stronger branch/worktree affordance.
Why this appears intentional: Coordinated icon changes landed in both rail and header hint components.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/src/components/AppHeader/WorktreeHint.tsx`.
Any default-value/moved/relocated logic: Visual-only, but tied to branch/worktree mental model.
Reviewer guardrail: Do not revert icon changes unless design direction changes.

6. **Project AI tool rows intentionally avoid border-heavy container styling**
What changed (before -> after): Tool/settings rows in the Project AI settings popover and related panes use flatter background-focused styling over border-heavy card treatment.
Why this appears intentional: Multiple files removed or reduced border emphasis, and AGENTS guidance was updated in-branch to avoid border-heavy defaults.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/src/components/Utils/PaneContainer.tsx`, `AGENTS.md`.
Any default-value/moved/relocated logic: Styling direction change (not behavioral).
Reviewer guardrail: Do not re-add generic border wrappers around every row/container during refactors.

7. **Branch review workflow now expects `branch_intent.md` alignment**
What changed (before -> after): Prompt guidance now treats `branch_intent.md` as a source of truth for intentional branch behavior during cumulative reviews.
Why this appears intentional: Prompt docs were explicitly updated for review policy.
Files/endpoints/components involved: `useful_prompts.md`.
Any default-value/moved/relocated logic: Review process expectation changed.
Reviewer guardrail: Follow-up reviews should not “fix back” behavior documented here without new evidence/decision.
