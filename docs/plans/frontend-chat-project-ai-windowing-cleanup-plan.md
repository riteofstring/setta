# Frontend Chat, Project AI, And Windowing Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make shared chat rendering, project-AI orchestration, and project chat windowing easy to navigate by separating render surfaces, commands, interaction math, and other clearly named local owners.

## Scope

- In scope:
  - `frontend/src/components/Chat/**`
  - `frontend/src/components/ChatWindowing/**`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/**`
  - chat/project-AI/windowing state modules only when they are direct prerequisites for simplifying those UI surfaces
- Out of scope:
  - generic store extraction work that no longer changes these surfaces directly
  - file-browser, page-shell, section-layout, or fork cleanup outside shared chat/windowing behavior

## Status Refresh (2026-03-16)

- The largest unresolved frontend hotspots are still concentrated here:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` is now about 1185 lines after the local settings, engine-selection, inline-thread layout, aux-surface content, surface chrome/body, conversation-search, and thread-session extraction
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` is now about 1019 lines after the local hydration-runtime, slash-command-authority, execution-settings, conversation-model, and hydration-session extractions and is now a follow-through coordinator in this domain
- `frontend/src/components/Chat/ChatMessages.tsx` is now about 528 lines after the local bubble-shell, action-rail, and per-message surface extraction and is no longer a blocking top hotspot in this domain.
- `frontend/src/components/Chat/ChatInput.tsx` is now about 999 lines after the local composer meta-controls extraction plus the local draft-session and queued-draft-stack extraction and is no longer a blocking top-size hotspot in this domain.
- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` is now about 1197 lines after the local docked/floating/maximized surface extraction plus the local window lifecycle extraction and is no longer the blocking top hotspot in this domain.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` is now about 912 lines after the local skills browser, markdown viewer, path-group header, and skills view-model extraction and is no longer the blocking top hotspot in this domain.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` is now about 914 lines after the local history-panel, folder-shell, and thread-row extraction and is no longer the blocking front-door hotspot in this domain.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` is now about 64 lines after delegating accordion section routing and settings-manager ownership into sharp local owners, so it is no longer a blocking front-door hotspot in this domain.
- The next default work in this domain should continue from the remaining
  large chat/project-AI surfaces a contributor still opens first:
  - `ProjectChat.tsx`
  - `ProjectChatCore.tsx`
- `ProjectChatBottomDock.tsx`, `ProjectChatSkillsMcpViewer.tsx`,
  `ProjectChatCore.tsx`, `ProjectChatHistory.tsx`, and
  the extracted `ProjectAISettings` manager owners still matter, but they are
  now follow-through slices unless they directly simplify those entry surfaces
  or one of the already-extracted helper files becomes its own
  mixed-responsibility hotspot.
- Many lower-level seams already exist and should be treated as stable enough:
  - `frontend/src/components/Chat/chatAssistantActivity.ts` now owns assistant activity or timeline derivation, thought-summary labels, activity-only grouping checks, and assistant tool-copy text builders for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatStructuredOutput.tsx` now owns structured output payload inference, diff classification, formatted tool-result text extraction, and the resizable structured-output surface for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatAttachmentPreviewUrls.ts` now owns message attachment collection, attachment URL lookup, stale refresh policy, and preview URL caching for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatAttachmentPreviews.tsx` now owns attachment list rendering, preview dialog/media-carousel branching, and attachment text-preview fetch state for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatMessageContent.tsx` now owns markdown/code rendering, inline markdown labels, streaming markdown animation wrappers, and conversation-search highlight helpers for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatMessageRuntime.tsx` now owns idle-spinner timing, run-duration persistence, timestamps, count-badge animation, activity-label scrambling, ISO timestamp parsing, and activity thought-preview scroll behavior for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatAssistantActivityCard.tsx` now owns the assistant activity card shell, timeline row rendering, open-all coordination, and activity-item copy wiring for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatCopyText.ts` now owns the shared clipboard-notification helper used by `ChatMessages.tsx` and `chatAssistantActivityCard.tsx`
  - `frontend/src/components/Chat/chatMessageBubbles.tsx` now owns assistant/user/system bubble shells and action-anchor placement for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatMessageActions.tsx` now owns copy/edit/redo/branch-switch controls for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatMessageSurface.tsx` now owns per-message assistant/user/system render branching, editor swap handling, and action-bar composition for `ChatMessages.tsx`
  - `frontend/src/components/Chat/ChatInputMetaControls.tsx` now owns the
    composer footer/meta row controls, context-left badge formatting and toggle
    behavior, runtime activity counter/dropdown shells, and
    permission/thinking/search controls for `ChatInput.tsx`
  - `frontend/src/components/Chat/chatInputSubmission.ts` now owns slash-command parsing, queued-draft replay snapshots, queued-draft replay signatures, and the submit or replay state machine for `ChatInput.tsx`
  - `frontend/src/components/Chat/chatInputDraftSession.ts` now owns queued-draft session state, submitted-history selection, escape clear/restore state, and queued replay continuity for `ChatInput.tsx`, while `frontend/src/components/Chat/ChatInputQueuedDraftStack.tsx` now owns the queued-draft rail shell plus row-level restore and keyboard selection behavior
  - `frontend/src/components/Chat/useChatInputDictation.ts` now owns browser/provider dictation availability, recorder lifecycle, provider fallback policy, transcript insertion, and dictation state for `ChatInput.tsx`
  - `frontend/src/components/ChatWindowing/projectChatWindowShortcuts.ts` now owns dock-specific keyboard shortcut parsing, editable-target gating, and keydown listener wiring for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockLayout.ts` now owns dock strip reservation math, visible dock-window selection, width-fitting, and minimized-pill display-mode calculations for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatDockResize.ts` now owns dock preview width/height state, stale-preview pruning, and dock-resize pointer-session handling for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatFloatingInteractions.ts` now owns floating preview bounds state, snap-preview state, viewport guardrails, and floating drag/resize or snap-resize pointer-session handling for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockPillStrip.tsx` now owns minimized-pill strip responsiveness, cycle state, manager-menu shell, and strip layout animation bookkeeping for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.tsx` now owns shared dock-window action-spec builders, placement animation classes, and shared dock/floating/maximized style helpers for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatDockedWindowsSurface.tsx`, `frontend/src/components/ChatWindowing/ProjectChatFloatingWindowsLayer.tsx`, and `frontend/src/components/ChatWindowing/ProjectChatMaximizedWindowSurface.tsx` now own the docked, floating, and maximized render shells for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockWindowLifecycle.ts` now owns dock window create/open/minimize/close/dock/maximize/restore commands, dock-cycle focus behavior, and enter/exit animation bookkeeping for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatWindowShell.tsx` now owns shared section/project window shell rendering, `UnifiedChatSurface` vs `GitGraphWindowContent` body selection, and header-action adaptation for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.ts` now owns grouped history derivation, master-search filtering/counts, thread ordering, agent badge labels, and placeholder text for `ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.ts` now owns project-chat history DnD ids, pointer geometry, drop-target resolution, and thread/group reorder math for `ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.ts` now owns the shared delete/undo tooltip copy, `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadEntry.tsx` now owns thread rows plus row-level action/drop-zone rendering, `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadFolders.tsx` now owns grouped/ungrouped folder shells plus inline group rename, and `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.tsx` now owns the toolbar/header shell, empty state, and grouped/ungrouped panel composition for `ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.ts` now owns preferred-engine selection, selected-thread engine reconciliation, engine-switch continuation guards, and LLM-unavailable messaging for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSettingsPopover.tsx` now owns the project-chat settings popover shell, dictation source options, tool quick-links, and activity-default toggles for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatInlineThreadsLayout.ts` now owns inline-thread breakpoint visibility rules, stored-width parsing, viewport/max-width clamping, and resize-transition decisions for `ProjectChat.tsx` and `useProjectChatInlineThreadsLayout.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatInlineThreadsLayout.ts` now owns overview/chat-container width observation, inline-thread visibility sync, header-host sizing, and resize persistence for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceViewModel.ts` now owns aux-tab descriptors, tooltip copy, and conversation-search counter/index helpers for the extracted `ProjectChat.tsx` surface owners
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatConversationSearch.ts` now owns project-chat conversation-search text, match-count/index sync, query reset, and next/previous stepping for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceChrome.tsx` now owns the project-chat header shell, inline-thread header host, aux tabs, settings-popover placement, and conversation-search UI for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatAuxViewContent.tsx` now owns Project AI settings vs skills/MCP/slash-command aux-surface routing for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceBody.tsx` now owns the engine-switch banner plus inline-thread/history/aux/core render branching for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatThreadSession.ts` now owns per-surface draft-thread lifecycle, selected thread-group reconciliation, engine-switch continuation state, and pending-chat continuity for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEmptyState.tsx` now owns workspace-root polling, python-signal probing, create-project starter prompt adaptation, and the empty-chat shell for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.ts` now owns project-chat hydration cache keys, managed/external runtime fetches, retry scheduling, and retry-cache pruning for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatCoreHydrationSession.ts` now owns selected-thread hydration retry state, timer cleanup, and blocked-code orchestration for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.ts` now owns default permission-mode selection, blocked-thread copy, submit preflight/readiness helpers, and provider-dictation gating for `ProjectChat.tsx` and `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandAuthority.ts` now owns runtime native slash-command discovery, authority gating, and recognized/executable slash-command set assembly for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatConversationModel.ts` now owns conversation-search filtering, submitted prompt history, runtime activity derivation, retained-image checks, latest-chat selection, and branch-source prompt helpers for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.ts` now owns custom slash-command draft reconciliation, namespace-authority gating, and native-command status text, while `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsView.tsx` now owns slash-command engine tabs, native-command polling, custom-command draft state, and the slash-command form/list shell for `ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsViewModel.ts` now owns skill preview fallback copy, raw-markdown/save gating, selected-skill draft hydration, and root-path grouping or save-state derivation for `ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillMarkdownViewer.tsx` now owns the skill markdown accordion shell, raw-vs-rendered preview toggle, save/reset affordances, and CodeMirror preview/edit surface for `ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsBrowser.tsx` now owns grouped skills search/filter rendering, selection row chrome, split-pane composition, and the extracted markdown-viewer wiring for `ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpPathGroupHeader.tsx` now owns the per-root path header shell used by the extracted skills browser
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsSections.tsx` now owns Project AI settings accordion section routing, deployment-mode LLM gating, and the `PaneAccordion` shell for `ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsGuardrails.tsx` now owns completion-guard draft state, save dispatch, and error rendering for `ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsAgentProfiles.tsx` now owns agent-profile draft hydration, validation messaging, create or save flows, and delete wiring for `ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsTranscriptionProfiles.tsx` now owns transcription-profile draft hydration, chunk-size validation, create or save flows, and delete wiring for `ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsPromptTemplates.tsx` now owns prompt-template draft hydration, JSON validation, create or save flows, and delete wiring for `ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.tsx` now owns external-agent config selection state, tool-type/run-mode reconciliation, Claude/OpenCode validation, and the external-agent form shell for `ProjectAISettings.tsx`
  - feature-local `ProjectLevelAI` helpers such as `projectChatHydrationAuthority.ts`, `projectChatFocusUtils.ts`, and starter/slash-command helpers
  - chat action families such as `aiHydration*.ts`, `aiChatSubmission*.ts`, `aiChatStreaming*.ts`, `chatHistory*.ts`, and `chatBranch*.ts`
  - project chat windowing modules such as `projectChatWindowingDefaultBounds.ts`, `projectChatWindowingSelectors.ts`, `projectChatWindowingInstanceCreation.ts`, `projectChatWindowingInstanceUpdates.ts`, `projectChatWindowingWrite*.ts`, and related command modules
- Future cleanup in this domain should default to simplifying the giant
  render-heavy files above instead of creating more facade-only state modules or
  moving mixed responsibilities into new 1000+ local helper files.
- Once one of the roots above stabilizes, prefer domain subfolders in
  `ProjectLevelAI/`, `Chat/`, or `ChatWindowing/` over any new directory
  `README.md` files. Do not spend a slice on docs-only work while those front
  doors remain large.

## Current Problems

- `ChatMessages.tsx` is much smaller now, but it still coordinates grouped activity-only row iteration, search-match scrolling, edit-mode session state, and placeholder-assistant row wiring over `chatMessageSurface.tsx`, `chatMessageActions.tsx`, and `chatMessageBubbles.tsx`. Follow-through here should continue only when it shortens one of those remaining coordinator paths instead of reopening the extracted render owners by default.
- `ChatInput.tsx` is smaller now, but it still mixes slash suggestion layout,
  attachment handling, and the remaining composer render shell even after
  slash-command parsing plus queued-draft replay moved into
  `chatInputSubmission.ts`, queued-draft or submitted-history session state
  plus escape clear/restore moved into `chatInputDraftSession.ts`, the
  queued-draft rail shell moved into `ChatInputQueuedDraftStack.tsx`,
  dictation lifecycle moved into `useChatInputDictation.ts`, and the
  footer/meta controls moved into `ChatInputMetaControls.tsx`.
- `ProjectChat.tsx` is smaller now, but it still mixes surface orchestration,
  controlled/global chat-id resolution, hydration authority, engine sync, and
  notification side effects even after engine/model/config selection moved into
  `projectChatEngineSelection.ts`, the project-chat settings popover moved into
  `projectChatSettingsPopover.tsx`, inline-thread layout or resize ownership
  moved into `projectChatInlineThreadsLayout.ts` plus
  `useProjectChatInlineThreadsLayout.ts`, conversation-search state moved into
  `useProjectChatConversationSearch.ts`, aux-surface routing moved into
  `projectChatAuxViewContent.tsx`, and the header/body render shells moved into
  `projectChatSurfaceChrome.tsx` plus `projectChatSurfaceBody.tsx`, and
  thread-session plus pending-chat continuity moved into
  `projectChatThreadSession.ts`.
- `ProjectChatCore.tsx` is much smaller now, but it still mixes store selection, slash-command refresh dispatch, submission/edit/redo handlers, and the final chat-surface render branches even after hydration retry policy moved into `projectChatHydrationRuntime.ts`, selected-thread hydration retry state plus blocked-code orchestration moved into `useProjectChatCoreHydrationSession.ts`, slash-command authority moved into `projectChatSlashCommandAuthority.ts`, execution/submit guard logic moved into `projectChatExecutionSettings.ts`, and conversation/filter/history/runtime derivation moved into `projectChatConversationModel.ts`.
- `ProjectAISettings` follow-through now lives mostly in
  `projectAISettingsSections.tsx`, `projectAISettingsGuardrails.tsx`,
  `projectAISettingsAgentProfiles.tsx`,
  `projectAISettingsTranscriptionProfiles.tsx`,
  `projectAISettingsPromptTemplates.tsx`, and
  `projectAISettingsExternalAgents.tsx`; future work there should continue from
  whichever extracted settings owner becomes the clearer mixed-responsibility
  hotspot rather than re-expanding the root coordinator.
- `ProjectChatSkillsMcpViewer.tsx` is much smaller now, but it still
  coordinates skills/MCP/slash-command routing, async skill load/create/save
  flows, and MCP runtime grouping over the extracted skills browser and
  markdown-viewer owners.
- `ProjectChatBottomDock.tsx` is much smaller now, but it still combines
  viewport or tracked-git-pane state, floating restore/snap orchestration, and
  the final dock/floating/maximized surface composition even after dock
  keyboard shortcut parsing moved into `projectChatWindowShortcuts.ts`, dock
  layout math moved into `projectChatBottomDockLayout.ts`, dock-resize state
  moved into `projectChatDockResize.ts`, floating drag/resize or snap-preview
  state moved into `projectChatFloatingInteractions.ts`, minimized-pill strip
  responsiveness plus menu/animation ownership moved into
  `projectChatBottomDockPillStrip.tsx`, shared project-vs-section shell
  rendering plus body selection moved into `projectChatWindowShell.tsx`, the
  docked/floating/maximized render shells moved into
  `ProjectChatDockedWindowsSurface.tsx`,
  `ProjectChatFloatingWindowsLayer.tsx`,
  `ProjectChatMaximizedWindowSurface.tsx`, and
  `projectChatBottomDockSurfaceHelpers.tsx`, and window lifecycle commands plus
  animation bookkeeping moved into `projectChatBottomDockWindowLifecycle.ts`.
- `ProjectChatHistory.tsx` is much smaller now, but it still coordinates polling, search navigation, thread/group commands, and history DnD over the new local render owners. Follow-up work here should only continue when it shortens the path from this coordinator into one remaining mixed responsibility rather than re-splitting the freshly extracted render shells.
- More chat/windowing files are acceptable if the root entrypoint stays obvious.
  The real risk in this domain is generic or mixed-purpose extracted files, not
  file count by itself.
- Some extracted helpers are still coarse enough to be cleanup targets in their
  own right, especially when they hide multiple concerns behind a single new
  file. Do not keep pushing more behavior into `chatAssistantActivityCard.tsx`
  or `projectChatFloatingInteractions.ts`; split them further only when doing so
  shortens the path from a top-level surface to the real owner.
- The state layer under these surfaces is already more decomposed than the UI layer, so additional state-only slices often add debug hops without materially improving agent legibility.

## Cleanup Principles

1. Start from the giant render surface, then extract feature-local helpers around it.
2. Prefer local view-model helpers, render subcomponents, and command adapters over generic abstractions.
3. Prefer specific domain names such as `projectChatHistoryDnd` or `chatInputSubmission` over generic buckets such as `helpers`, `shared`, `runtime`, or `viewModel` unless the file truly owns that one narrow cross-feature concern.
4. When `ProjectLevelAI/`, `Chat/`, or `ChatWindowing/` becomes too flat to scan quickly, prefer stable domain subfolders such as `history/`, `surface/`, `settings/`, `skills-mcp/`, or `windowing/` over piling on more ambiguous siblings.
5. If a chat/windowing root still needs local explanation after naming cleanup, use a short top-of-file ownership comment in the code instead of local docs.
6. Only take a lower-level chat/windowing state split when it is a direct prerequisite for simplifying a remaining large UI file in this domain.
7. Treat thin compatibility facades as acceptable transitional surfaces. Do not spend a slice extending them unless doing so removes mixed responsibilities from a top hotspot in the same turn.
8. Do not replace one giant file with another giant helper. Prefer a coordinator plus several narrow local owners over a coordinator plus one new 1200-line “helper”.
9. Keep render-heavy behavior measurable: large message lists, docked/floating windows, and project-chat history surfaces should remain at least as fast as before.

## Plan

1. Simplify the main project-chat entry surfaces first

- `ProjectChat.tsx` has already had its large surface-shell and thread-session
  extraction.
- `ChatInput.tsx` has already had its composer meta-controls, draft-session,
  and queued-draft-stack extraction.
- Default next in this domain to `ProjectChat.tsx` or `ChatMessages.tsx`,
  whichever same-turn slice shortens the first-hop read path more directly than
  the remaining windowing or aux-view follow-through coordinators.
- Treat `ProjectChatCore.tsx` as adjacent follow-through work when a same-turn
  slice directly shortens the remaining `ProjectChat.tsx` hydration/engine-sync
  path or when one of its new
  local helper owners becomes the clearest remaining blocker.
- Keep those files as the obvious entry surfaces, but move clearly named
  responsibilities out of them:
  - chat-id selection and coordinator-level store adaptation
  - hydration-authority adaptation
  - selected-chat engine sync and external-engine notifications
  - workspace/runtime preflight checks
  - large render branches and toolbar shells
- A good slice in this phase removes one major responsibility from one of these
  files and makes the new owner obvious from the caller.

2. Continue into the remaining project-AI roots before chat follow-through owners

- After `ProjectChat.tsx`, default next to `ProjectChatCore.tsx`; treat
  `ChatMessages.tsx`, `ChatInput.tsx`, `ProjectChatBottomDock.tsx`,
  `ProjectChatSkillsMcpViewer.tsx`, and the extracted `ProjectAISettings`
  manager owners as follow-through unless a same-turn cut directly shortens
  one of those remaining project-AI coordination paths.
- Keep pushing clearly named responsibilities out of those files:
  - assistant or user/system bubble shells and message-level action wiring
  - slash-suggestion layout and attachment handling when a same-turn cut still
    shortens `ChatInput.tsx`
  - tracked window focus/placement lifecycle
  - floating-bounds or snap/viewport orchestration
  - remaining skills/MCP route coordination only when it shortens the
    project-AI aux-view path
- Treat `ProjectChatBottomDock.tsx` as a windowing follow-through root now;
  continue there only when the same slice shortens the remaining tracked-pane
  or floating-snap path more directly than `ChatInput.tsx` or
  `ProjectChat.tsx`.

3. Simplify `ProjectChatBottomDock.tsx` and `ProjectChatHistory.tsx` only where they shorten the main path

- Keep the existing history view-model, history render-owner, DnD, dock-layout,
  resize, pill-strip, floating-interaction, and window-shell seams.
- Continue only where the remaining top-level files still mix:
  - polling or command orchestration
  - selection/focus/placement state
  - large shell render branches
  - tracked git-pane behavior
- If the real next problem is an extracted helper such as
  `projectChatFloatingInteractions.ts`, split that helper only when it reduces
  the number of files a contributor must traverse from `ProjectChatBottomDock.tsx`.

4. Treat `ChatInput.tsx` and the remaining smaller chat coordinators as follow-through cleanup, not default starting points

- Keep the existing chat-local owners for activity derivation, structured
  output, attachments, markdown rendering, runtime hooks, submission, draft
  session, queued-draft stack, and dictation.
- Only continue splitting these files when:
  - a remaining responsibility is still broad enough to deserve a named owner,
    or
  - the change directly simplifies `ProjectChat.tsx`, `ProjectChatCore.tsx`, or
    another higher-priority entry surface.

5. Add subfolders only when a stabilized dense directory still needs them

- For any stabilized chat/project-AI/windowing root, add a small domain
  subfolder only when it reduces the number of plausible first hops from the
  parent directory.
- Prefer folders like:
  - `history/`
  - `surface/`
  - `settings/`
  - `skills-mcp/`
  - `windowing/`
- Do not take a structure-only slice in this domain while front-door hotspots remain unless the move directly shortens future navigation.

## Verification

- Add or update Vitest coverage for extracted pure derivation, selector, and interaction helpers.
- Add or update Playwright coverage when chat or windowing user flows change materially.
- Use `chrome-devtools-mcp` for visual verification and performance profiling when a slice changes message rendering, docking/windowing, or interaction-heavy behavior.
- Record meaningful before/after performance notes under `perf/reports/frontend/` for high-impact refactors.

## Acceptance Criteria

- The next contributor can identify the ownership boundary for chat rendering, chat composition, project-AI orchestration, and project chat windowing without opening a large chain of unrelated files.
- New cleanup slices in this domain default to large UI surfaces first, not to smaller state-only modules.
- The top-level chat and windowing components become coordinators rather than mixed rendering/state/transport monoliths.
