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
  - `frontend/src/components/Chat/ChatMessages.tsx` at about 3920 lines
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` at about 3414 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` at about 3328 lines
  - `frontend/src/components/Chat/ChatInput.tsx` at about 3121 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` at about 2721 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` at about 2478 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` at about 2444 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` at about 2379 lines
- Many lower-level seams already exist and should be treated as stable enough:
  - `frontend/src/components/Chat/chatAssistantActivity.ts` now owns assistant activity or timeline derivation, thought-summary labels, activity-only grouping checks, and assistant tool-copy text builders for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatStructuredOutput.tsx` now owns structured output payload inference, diff classification, formatted tool-result text extraction, and the resizable structured-output surface for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatAttachmentPreviewUrls.ts` now owns message attachment collection, attachment URL lookup, stale refresh policy, and preview URL caching for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatAttachmentPreviews.tsx` now owns attachment list rendering, preview dialog/media-carousel branching, and attachment text-preview fetch state for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatMessageContent.tsx` now owns markdown/code rendering, inline markdown labels, streaming markdown animation wrappers, and conversation-search highlight helpers for `ChatMessages.tsx`
  - `frontend/src/components/Chat/chatMessageRuntime.tsx` now owns idle-spinner timing, run-duration persistence, timestamps, count-badge animation, activity-label scrambling, ISO timestamp parsing, and activity thought-preview scroll behavior for `ChatMessages.tsx`
  - `frontend/src/components/ChatWindowing/projectChatWindowShortcuts.ts` now owns dock-specific keyboard shortcut parsing, editable-target gating, and keydown listener wiring for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockLayout.ts` now owns dock strip reservation math, visible dock-window selection, width-fitting, and minimized-pill display-mode calculations for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatDockResize.ts` now owns dock preview width/height state, stale-preview pruning, and dock-resize pointer-session handling for `ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatFloatingInteractions.ts` now owns floating preview bounds state, snap-preview state, viewport guardrails, and floating drag/resize or snap-resize pointer-session handling for `ProjectChatBottomDock.tsx`
  - feature-local `ProjectLevelAI` helpers such as `projectChatHydrationAuthority.ts`, `projectChatFocusUtils.ts`, and starter/slash-command helpers
  - chat action families such as `aiHydration*.ts`, `aiChatSubmission*.ts`, `aiChatStreaming*.ts`, `chatHistory*.ts`, and `chatBranch*.ts`
  - project chat windowing modules such as `projectChatWindowingDefaultBounds.ts`, `projectChatWindowingSelectors.ts`, `projectChatWindowingInstanceCreation.ts`, `projectChatWindowingInstanceUpdates.ts`, `projectChatWindowingWrite*.ts`, and related command modules
- Future cleanup in this domain should default to simplifying the giant render-heavy files above instead of creating more facade-only state modules.

## Current Problems

- `ChatMessages.tsx` still mixes message-row composition and interaction shells even after assistant activity/timeline derivation moved into `chatAssistantActivity.ts`, structured-output/tool-call rendering moved into `chatStructuredOutput.tsx`, attachment/media preview handling moved into `chatAttachmentPreviewUrls.ts` plus `chatAttachmentPreviews.tsx`, markdown/search-highlight rendering moved into `chatMessageContent.tsx`, and timers/streaming runtime wiring moved into `chatMessageRuntime.tsx`.
- `ChatInput.tsx` mixes composer state, attachment handling, slash commands, dictation/transcription, execution settings, and presentational controls.
- `ProjectChat.tsx`, `ProjectChatCore.tsx`, and `ProjectChatHistory.tsx` mix surface orchestration, layout rules, chat-history derivation, hydration authority, and auxiliary-pane state.
- `ProjectChatBottomDock.tsx` still combines animation state, tracked git-pane behavior, focus/placement commands, and render shells even after dock keyboard shortcut parsing moved into `projectChatWindowShortcuts.ts`, dock layout math moved into `projectChatBottomDockLayout.ts`, dock-resize state moved into `projectChatDockResize.ts`, and floating drag/resize or snap-preview state moved into `projectChatFloatingInteractions.ts`.
- The state layer under these surfaces is already more decomposed than the UI layer, so additional state-only slices often add debug hops without materially improving agent legibility.

## Cleanup Principles

1. Start from the giant render surface, then extract feature-local helpers around it.
2. Prefer local view-model helpers, render subcomponents, and command adapters over generic abstractions.
3. Only take a lower-level chat/windowing state split when it is a direct prerequisite for simplifying a remaining large UI file in this domain.
4. Treat thin compatibility facades as acceptable transitional surfaces. Do not spend a slice extending them unless doing so removes mixed responsibilities from a top hotspot.
5. Keep render-heavy behavior measurable: large message lists, docked/floating windows, and project-chat history surfaces should remain at least as fast as before.

## Plan

1. Continue splitting `ChatMessages.tsx` by rendering responsibility

- Keep the extracted local owners for:
  - assistant activity or timeline derivation
  - structured output and tool-call rendering
  - attachment/media preview handling
  - markdown/code rendering wrappers
  - timers and animation hooks
- Extract the next feature-local seams for:
  - message-row composition helpers and interaction shells
- Keep the top-level component focused on list assembly and row composition.

2. Split `ChatInput.tsx` by composer responsibility

- Extract:
  - composer state and draft helpers
  - attachment selection/upload helpers
  - slash-command and engine-resolution adapters
  - dictation/transcription controls
  - presentational controls and menus

3. Simplify the project-AI surfaces around `ProjectChat.tsx`

- Keep `ProjectChat.tsx` as the surface coordinator.
- Move chat-history derivation, aux-view persistence, engine/config selection, and large render branches into clearly named feature-local helpers or subcomponents.
- Keep `ProjectChatCore.tsx`, `ProjectChatHistory.tsx`, `ProjectChatSkillsMcpViewer.tsx`, and `ProjectAISettings.tsx` on explicit local seams instead of forcing cross-feature utilities.

4. Simplify `ProjectChatBottomDock.tsx` from the UI outward

- Separate:
  - layout math
  - pointer drag/resize state
  - snap and maximize/minimize behavior
  - animation bookkeeping
  - dock/window render shells
- Reuse the existing windowing command and selector seams instead of re-splitting them first.

5. Add local ownership docs once a hotspot stabilizes

- For any stabilized chat/project-AI/windowing root, add a short local `README.md` describing:
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
