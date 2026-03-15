# Frontend Chat, Project AI, And Windowing Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make shared chat rendering, project-AI orchestration, and project chat windowing easy to navigate by separating render surfaces, view models, commands, and interaction math.

## Scope

- In scope:
  - `frontend/src/components/Chat/**`
  - `frontend/src/components/ChatWindowing/**`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/**`
  - chat/project-AI/windowing state modules only when they are direct prerequisites for simplifying those UI surfaces
- Out of scope:
  - generic store extraction work that no longer changes these surfaces directly
  - file-browser, page-shell, section-layout, or fork cleanup outside shared chat/windowing behavior

## Status Refresh (2026-03-15)

- The largest unresolved frontend hotspots are still concentrated here:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` is now about 2091 lines after the local settings and engine-selection extraction
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` is now about 1661 lines after the local slash-command extraction
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` is now about 1658 lines after the local docked/floating/maximized surface extraction
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` is now about 1471 lines after the local external-agent extraction
  - `frontend/src/components/Chat/ChatInput.tsx` is now about 1606 lines after the local composer meta-controls extraction
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` is now about 1225 lines after the local hydration-runtime, slash-command-authority, execution-settings, and conversation-model extractions and is no longer a blocking top-size hotspot in this domain
  - `frontend/src/components/Chat/ChatMessages.tsx` is now about 1237 lines after the local chat-owner extractions and is no longer a top-size hotspot
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` is now about 914 lines after the local history-panel, folder-shell, and thread-row extraction and is no longer the blocking front-door hotspot in this domain.
- The next default work in this domain should continue from the remaining
  large chat/project-AI surfaces a contributor still opens first:
  - `ProjectChat.tsx`
  - `ProjectChatSkillsMcpViewer.tsx`
  - `ProjectChatBottomDock.tsx`
- `ProjectAISettings.tsx` is the next project-AI settings root after those.
- `ProjectChatCore.tsx`, `ProjectChatHistory.tsx`, `ChatInput.tsx`, and `ChatMessages.tsx` still
  matter, but they are now follow-through slices unless they directly simplify
  those entry surfaces or one of the already-extracted helper files becomes its
  own mixed-responsibility hotspot.
- Many lower-level seams already exist and should be treated as stable enough:
  - `frontend/src/components/Chat/chatAssistantActivity.ts` now owns assistant activity or timeline derivation, thought-summary labels, activity-only grouping checks, and assistant tool-copy text builders for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatStructuredOutput.tsx` now owns structured output payload inference, diff classification, formatted tool-result text extraction, and the resizable structured-output surface for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatAttachmentPreviewUrls.ts` now owns message attachment collection, attachment URL lookup, stale refresh policy, and preview URL caching for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatAttachmentPreviews.tsx` now owns attachment list rendering, preview dialog/media-carousel branching, and attachment text-preview fetch state for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatMessageContent.tsx` now owns markdown/code rendering, inline markdown labels, streaming markdown animation wrappers, and conversation-search highlight helpers for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatMessageRuntime.tsx` now owns idle-spinner timing, run-duration persistence, timestamps, count-badge animation, activity-label scrambling, ISO timestamp parsing, and activity thought-preview scroll behavior for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatAssistantActivityCard.tsx` now owns the assistant activity card shell, timeline row rendering, open-all coordination, and activity-item copy wiring for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatCopyText.ts` now owns the shared clipboard-notification helper used by `ChatMessages.tsx` and `chatAssistantActivityCard.tsx`
  - `frontend/src/components/Chat/ChatInputMetaControls.tsx` now owns the
    composer footer/meta row controls, context-left badge formatting and toggle
    behavior, runtime activity counter/dropdown shells, and
    permission/thinking/search controls for `ChatInput.tsx`
  - `frontend/src/components/Chat/chatInputSubmission.ts` now owns slash-command parsing, queued-draft replay snapshots, queued-draft replay signatures, and the submit or replay state machine for `ChatInput.tsx`
  - `frontend/src/components/Chat/useChatInputDictation.ts` now owns browser/provider dictation availability, recorder lifecycle, provider fallback policy, transcript insertion, and dictation state for `ChatInput.tsx`
  - `frontend/src/components/ChatWindowing/projectChatWindowShortcuts.ts` now owns dock-specific keyboard shortcut parsing, editable-target gating, and keydown listener wiring for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockLayout.ts` now owns dock strip reservation math, visible dock-window selection, width-fitting, and minimized-pill display-mode calculations for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatDockResize.ts` now owns dock preview width/height state, stale-preview pruning, and dock-resize pointer-session handling for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatFloatingInteractions.ts` now owns floating preview bounds state, snap-preview state, viewport guardrails, and floating drag/resize or snap-resize pointer-session handling for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockPillStrip.tsx` now owns minimized-pill strip responsiveness, cycle state, manager-menu shell, and strip layout animation bookkeeping for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.tsx` now owns shared dock-window action-spec builders, placement animation classes, and shared dock/floating/maximized style helpers for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatDockedWindowsSurface.tsx`, `frontend/src/components/ChatWindowing/ProjectChatFloatingWindowsLayer.tsx`, and `frontend/src/components/ChatWindowing/ProjectChatMaximizedWindowSurface.tsx` now own the docked, floating, and maximized render shells for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatWindowShell.tsx` now owns shared section/project window shell rendering, `UnifiedChatSurface` vs `GitGraphWindowContent` body selection, and header-action adaptation for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.ts` now owns grouped history derivation, master-search filtering/counts, thread ordering, agent badge labels, and placeholder text for `ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.ts` now owns project-chat history DnD ids, pointer geometry, drop-target resolution, and thread/group reorder math for `ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.ts` now owns the shared delete/undo tooltip copy, `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadEntry.tsx` now owns thread rows plus row-level action/drop-zone rendering, `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadFolders.tsx` now owns grouped/ungrouped folder shells plus inline group rename, and `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.tsx` now owns the toolbar/header shell, empty state, and grouped/ungrouped panel composition for `ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.ts` now owns preferred-engine selection, selected-thread engine reconciliation, engine-switch continuation guards, and LLM-unavailable messaging for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSettingsPopover.tsx` now owns the project-chat settings popover shell, dictation source options, tool quick-links, and activity-default toggles for `ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEmptyState.tsx` now owns workspace-root polling, python-signal probing, create-project starter prompt adaptation, and the empty-chat shell for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.ts` now owns project-chat hydration cache keys, managed/external runtime fetches, retry scheduling, and retry-cache pruning for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.ts` now owns default permission-mode selection, blocked-thread copy, submit preflight/readiness helpers, and provider-dictation gating for `ProjectChat.tsx` and `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandAuthority.ts` now owns runtime native slash-command discovery, authority gating, and recognized/executable slash-command set assembly for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatConversationModel.ts` now owns conversation-search filtering, submitted prompt history, runtime activity derivation, retained-image checks, latest-chat selection, and branch-source prompt helpers for `ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.ts` now owns custom slash-command draft reconciliation, namespace-authority gating, and native-command status text, while `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsView.tsx` now owns slash-command engine tabs, native-command polling, custom-command draft state, and the slash-command form/list shell for `ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.tsx` now owns external-agent config selection state, tool-type/run-mode reconciliation, Claude/OpenCode validation, and the external-agent form shell for `ProjectAISettings.tsx`
  - feature-local `ProjectLevelAI` helpers such as `projectChatHydrationAuthority.ts`, `projectChatFocusUtils.ts`, and starter/slash-command helpers
  - chat action families such as `aiHydration*.ts`, `aiChatSubmission*.ts`, `aiChatStreaming*.ts`, `chatHistory*.ts`, and `chatBranch*.ts`
  - project chat windowing modules such as `projectChatWindowingDefaultBounds.ts`, `projectChatWindowingSelectors.ts`, `projectChatWindowingInstanceCreation.ts`, `projectChatWindowingInstanceUpdates.ts`, `projectChatWindowingWrite*.ts`, and related command modules
- Future cleanup in this domain should default to simplifying the giant
  render-heavy files above instead of creating more facade-only state modules or
  moving mixed responsibilities into new 1000+ local helper files.
- Local `README.md` files in `ProjectLevelAI/`, `Chat/`, or `ChatWindowing/`
  are useful only after one of the roots above stabilizes. Do not spend a
  slice on docs-only work while those front doors remain large.

## Current Problems

- `ChatMessages.tsx` is much smaller now, but it still mixes assistant/user/system bubble shells, grouped activity-only row iteration, and message-level action wiring even after assistant activity/timeline derivation moved into `chatAssistantActivity.ts`, the activity card moved into `chatAssistantActivityCard.tsx`, structured-output/tool-call rendering moved into `chatStructuredOutput.tsx`, attachment/media preview handling moved into `chatAttachmentPreviewUrls.ts` plus `chatAttachmentPreviews.tsx`, markdown/search-highlight rendering moved into `chatMessageContent.tsx`, and timers/streaming runtime wiring moved into `chatMessageRuntime.tsx`.
- `ChatInput.tsx` is smaller now, but it still mixes composer state, slash
  suggestion layout, attachment handling, queued draft/history restore, and
  the remaining composer render shells even after slash-command parsing plus
  queued-draft replay moved into `chatInputSubmission.ts`, dictation lifecycle
  moved into `useChatInputDictation.ts`, and the footer/meta controls moved
  into `ChatInputMetaControls.tsx`.
- `ProjectChat.tsx` is smaller now, but it still mixes surface orchestration, layout rules, hydration authority, auxiliary-pane state, and conversation-search coordination even after engine/model/config selection moved into `projectChatEngineSelection.ts` and the project-chat settings popover moved into `projectChatSettingsPopover.tsx`; remaining work in this path should still start there before reopening smaller follow-through files beneath it.
- `ProjectChatCore.tsx` is much smaller now, but it still mixes store selection, hydration effect orchestration, slash-command refresh dispatch, submission/edit/redo handlers, and the final chat-surface render branches even after hydration retry policy moved into `projectChatHydrationRuntime.ts`, slash-command authority moved into `projectChatSlashCommandAuthority.ts`, execution/submit guard logic moved into `projectChatExecutionSettings.ts`, and conversation/filter/history/runtime derivation moved into `projectChatConversationModel.ts`.
- `ProjectAISettings.tsx` is smaller now, but it still mixes accordion composition, deployment-mode gating, guardrail persistence, and manager routing even after external-agent config selection, tool-type/run-mode reconciliation, Claude/OpenCode validation, and settings-block assembly moved into `projectAISettingsExternalAgents.tsx`.
- `ProjectChatSkillsMcpViewer.tsx` is smaller now, but it still mixes skills
  filtering or selection, skill-content loading plus markdown edit shells, and
  MCP runtime grouping even after slash-command engine tabs, native-command
  polling, and custom-command draft state moved into
  `projectChatSlashCommandsView.tsx` plus
  `projectChatSlashCommandsViewState.ts`.
- `ProjectChatBottomDock.tsx` is smaller now, but it still combines viewport or tracked-git-pane state, animation lifecycle, focus/placement commands, and floating-bounds or snap orchestration even after dock keyboard shortcut parsing moved into `projectChatWindowShortcuts.ts`, dock layout math moved into `projectChatBottomDockLayout.ts`, dock-resize state moved into `projectChatDockResize.ts`, floating drag/resize or snap-preview state moved into `projectChatFloatingInteractions.ts`, minimized-pill strip responsiveness plus menu/animation ownership moved into `projectChatBottomDockPillStrip.tsx`, shared project-vs-section shell rendering plus body selection moved into `projectChatWindowShell.tsx`, and the docked/floating/maximized render shells moved into `ProjectChatDockedWindowsSurface.tsx`, `ProjectChatFloatingWindowsLayer.tsx`, `ProjectChatMaximizedWindowSurface.tsx`, and `projectChatBottomDockSurfaceHelpers.tsx`.
- `ProjectChatHistory.tsx` is much smaller now, but it still coordinates polling, search navigation, thread/group commands, and history DnD over the new local render owners. Follow-up work here should only continue when it shortens the path from this coordinator into one remaining mixed responsibility rather than re-splitting the freshly extracted render shells.
- Some extracted helpers are still coarse enough to be cleanup targets in their
  own right, especially when they hide multiple concerns behind a single new
  file. Do not keep pushing more behavior into `chatAssistantActivityCard.tsx`
  or `projectChatFloatingInteractions.ts`; split them further only when doing so
  shortens the path from a top-level surface to the real owner.
- The state layer under these surfaces is already more decomposed than the UI layer, so additional state-only slices often add debug hops without materially improving agent legibility.

## Cleanup Principles

1. Start from the giant render surface, then extract feature-local helpers around it.
2. Prefer local view-model helpers, render subcomponents, and command adapters over generic abstractions.
3. Only take a lower-level chat/windowing state split when it is a direct prerequisite for simplifying a remaining large UI file in this domain.
4. Treat thin compatibility facades as acceptable transitional surfaces. Do not spend a slice extending them unless doing so removes mixed responsibilities from a top hotspot in the same turn.
5. Do not replace one giant file with another giant helper. Prefer a coordinator plus several narrow local owners over a coordinator plus one new 1200-line “helper”.
6. Keep render-heavy behavior measurable: large message lists, docked/floating windows, and project-chat history surfaces should remain at least as fast as before.

## Plan

1. Simplify the main project-chat entry surfaces first

- Start with `ProjectChat.tsx`.
- Treat `ProjectChatCore.tsx` as adjacent follow-through work when a same-turn
  slice directly shortens the `ProjectChat.tsx` path or when one of its new
  local helper owners becomes the clearest remaining blocker.
- Keep those files as the obvious entry surfaces, but move clearly named
  responsibilities out of them:
  - aux-view persistence and routing
  - engine/model/config selection adapters
  - hydration-authority adaptation
  - workspace/runtime preflight checks
  - large render branches and toolbar shells
- A good slice in this phase removes one major responsibility from one of these
  files and makes the new owner obvious from the caller.

2. Continue into the next project-AI roots, not the follow-through coordinators

- After `ProjectChat.tsx`, default next to
  `ProjectChatSkillsMcpViewer.tsx`, `ProjectChatBottomDock.tsx`, and
  `ProjectAISettings.tsx`.
- Keep pushing clearly named responsibilities out of those files:
  - deployment-mode gating and guardrail persistence
  - manager routing and accordion composition
  - skill selection/filtering and skill-content loading
  - MCP runtime grouping and aux-view routing
- Treat `ProjectChatBottomDock.tsx` as the next windowing root only after the
  main project-AI front doors above are materially smaller, unless the same
  slice directly shortens their path.

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

4. Treat `ChatInput.tsx` and `ChatMessages.tsx` as follow-through cleanup, not default starting points

- Keep the existing chat-local owners for activity derivation, structured
  output, attachments, markdown rendering, runtime hooks, submission, and
  dictation.
- Only continue splitting these files when:
  - a remaining responsibility is still broad enough to deserve a named owner,
    or
  - the change directly simplifies `ProjectChat.tsx`, `ProjectChatCore.tsx`, or
    another higher-priority entry surface.

5. Add local ownership docs once a root surface stabilizes

- For any stabilized chat/project-AI/windowing root, add a short local
  `README.md` describing:
  - the main entry surfaces
  - the owning selectors/commands
  - generated endpoint dependencies
  - the most relevant tests

## Verification

- Add or update Vitest coverage for extracted pure derivation, selector, and interaction helpers.
- Add or update Playwright coverage when chat or windowing user flows change materially.
- Use `chrome-devtools-mcp` for visual verification and performance profiling when a slice changes message rendering, docking/windowing, or interaction-heavy behavior.
- Record meaningful before/after performance notes under `perf/reports/frontend/` for high-impact refactors.

## Acceptance Criteria

- The next contributor can identify the ownership boundary for chat rendering, chat composition, project-AI orchestration, and project chat windowing without opening a large chain of unrelated files.
- New cleanup slices in this domain default to large UI surfaces first, not to smaller state-only modules.
- The top-level chat and windowing components become coordinators rather than mixed rendering/state/transport monoliths.
