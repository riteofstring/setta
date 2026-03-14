# Branch Intent Summary

This summary is based on `git diff --name-status main...HEAD` and `git diff $(git merge-base main HEAD)..HEAD`. It describes committed branch intent only.

## Features

1. Dev-facing file browsing now shows useful dotfiles by default and adds direct path navigation.
What changed: the backend file-browser route no longer blanket-hides dotfiles, so files like `.env` and `.gitignore` appear without an explicit hidden-files toggle. The overview file browser and browser sections now expose a shared path field, breadcrumbs, and a "go up one level" control instead of forcing all navigation through tree expansion alone.
Why intentional: `backend/setta/routers/artifact.py` explicitly removes the old `item.name.startswith(".")` suppression, and the frontend adds shared navigation helpers/components plus backend, Vitest, and Playwright coverage for the new behavior.
Files/endpoints/components involved: `backend/setta/routers/artifact.py`, `tests/routers/test_file_browser_routes.py`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`, `frontend/src/components/Section/Layouts/BrowserArea.tsx`, `frontend/src/components/Utils/FileBrowserPathControls.tsx`, `frontend/src/utils/fileBrowserNavigation.ts`, `frontend/tests/e2e/file-browser/browser-path-navigation.spec.ts`.
Default-value changes / relocated logic: the default changed from "hide all dotfiles unless `includeHidden`" to "show normal dotfiles, but still hide explicit noisy roots and internal Setta roots". Folder-path UI was extracted into the shared `FileBrowserPathControls` helpers.
Reviewer guardrail: do not restore blanket dotfile hiding or remove breadcrumb/up navigation unless there is a new explicit product decision. The home-page file browser intentionally passes `showPathNavigation={false}` to stay simpler than the overview/section browsers; do not "fix" that by re-enabling the new controls there by default.

2. The Git pane is now worktree-aware instead of status-only.
What changed: `getGitStatus` now returns typed worktree metadata, and the Git pane renders a dedicated worktree accordion that opens by default when extra worktrees exist. Entries show display name, branch or detached state, abbreviated HEAD commit, "Current" state, and "Prunable" warnings.
Why intentional: the backend adds a new `GitWorktreeEntry` type plus a dedicated `git worktree list --porcelain -z` parser, and both backend tests and Playwright coverage verify the typed payload and the UI behavior.
Files/endpoints/components involved: `backend/setta/types/git.py`, `backend/setta/routers/git.py`, `tests/routers/test_git_routes.py`, `frontend/src/utils/generatedTypes.ts`, `frontend/src/components/Panes/Overview/Git/GitPane.tsx`, `frontend/src/components/Panes/Overview/Git/GitPane.test.tsx`, `frontend/tests/e2e/git/git-pane-worktrees.spec.ts`.
Default-value changes / relocated logic: `GetGitStatusResponse` now carries a `worktrees` array defaulting to `[]`, and the frontend no longer treats worktree awareness as a header hint only.
Reviewer guardrail: do not remove the backend `worktrees` field or collapse the pane back to repo-status-only output. The accordion is intentionally hidden when there are no additional worktrees, and intentionally open when there are.

3. The Overview "Project AI Chat" tab is now the real chat surface, while chat-window management moved into the bottom dock.
What changed: the overview tab no longer renders the old manager-only surface. It now shows the actual `ProjectChat` experience, including the composer and thread view, while the bottom dock exposes a persistent manager menu beside the create-chat button for focusing, reopening, hiding, floating, docking, or moving chat windows to canvas.
Why intentional: `Overview.tsx` swaps `ProjectChatManager` out for `ProjectChat`, `ProjectChatManager` gains menu-oriented variants, and `ProjectChatBottomDock.tsx` embeds that manager behind a persistent trigger. Dedicated tests and e2e specs lock in the new split of responsibilities.
Files/endpoints/components involved: `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx`, `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, `frontend/tests/e2e/overview/project-ai/project-chat-overview-pane.spec.ts`, `frontend/tests/e2e/overview/project-ai/project-chat-manager-menu.spec.ts`.
Moved/renamed UX flows: the overview tab is intentionally back to being a usable chat surface, and window management is intentionally centralized in the dock manager menu instead of being the overview tab's primary purpose.
Reviewer guardrail: do not swap the overview tab back to manager-only copy, and do not make the dock manager trigger conditional on collapsed-pill mode again. The manager menu is supposed to stay available beside the create button.

4. Narrow desktop home-page pane toggles now open focused full-width panes.
What changed: on medium desktop widths, clicking the left or right home rail opens just the selected side pane at near-full width and closes the opposite pane, instead of trying to keep both side panes partially open and cramped. The rails stay visually above the panes so they remain clickable while a pane is expanded.
Why intentional: `paneLayout.ts` adds dedicated home-pane full-width logic keyed off the compact breakpoint plus the home pane minimum width, and Playwright coverage verifies the persisted widths and rail layering.
Files/endpoints/components involved: `frontend/src/components/Pages/Home/HomePage.tsx`, `frontend/src/components/Panes/paneLayout.ts`, `frontend/src/components/Pages/Home/HomePage.test.tsx`, `frontend/tests/e2e/home/home-file-manager.spec.ts`.
Default-value changes / relocated logic: home-pane toggles now route through shared `togglePaneVisibility`, and opening behavior changes below the narrow-desktop threshold from "restore remembered split widths" to "focus one pane at full available width".
Reviewer guardrail: do not revert this to a two-pane cramped layout on medium-width desktops. The one-focused-pane behavior is intentional.

5. Window controls now share a unified quick-info / tooltip contract, and the overview More menu sits on the elevated app-menu layer.
What changed: holding the quick-info key (`Q`) now surfaces consistent copy for section-window buttons, dock/window actions, section-header controls, placeholder actions, and related chrome, instead of a mix of missing labels and ad hoc titles. The overview More menu also moved to the shared high z-index app-menu layer so it stays above panes and windows.
Why intentional: the branch adds a central `windowControlQuickInfo.ts` helper, wires it through the relevant controls, and adds e2e coverage that checks tooltip text against `aria-label` plus layering above the dock/window stack.
Files/endpoints/components involved: `frontend/src/components/Utils/windowControlQuickInfo.ts`, `frontend/src/components/Section/Header/SectionWindowToggleButton.tsx`, `frontend/src/components/Section/Header/DeleteOrHideButton.tsx`, `frontend/src/components/Section/Header/LockPositionButton.tsx`, `frontend/src/components/Section/Header/MinimizeButton.tsx`, `frontend/src/components/Section/Header/AttachedTerminalControls.tsx`, `frontend/src/components/Section/Container/SectionWindowPlaceholder.tsx`, `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/tests/e2e/overview/layout/window-control-quick-info.spec.ts`, `frontend/tests/e2e/overview/layout/app-chrome-window-layering.spec.ts`.
Moved/renamed UX flows: quick-info text is intentionally centralized instead of being scattered across local titles/labels.
Reviewer guardrail: keep the shared quick-info wording and elevated menu layering intact. Do not drift back to mixed per-button titles or a low `z-20` overview menu.

6. Chat/runtime loading indicators now use the shared braille spinner across surfaces.
What changed: chat waiting states, activity rows, thread working indicators, approval cards, todo cards, and other runtime surfaces now use a shared animated braille spinner rather than a mix of `gg-spinner` instances.
Why intentional: the branch adds a dedicated `BrailleSpinner` component, updates the relevant chat/runtime surfaces to use it, and adds focused tests for the shared spinner.
Files/endpoints/components involved: `frontend/src/components/Utils/BrailleSpinner.tsx`, `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`, `frontend/src/components/Section/Layouts/ChatArea.tsx`, `frontend/src/components/Chat/ApprovalCard.tsx`, `frontend/src/components/Chat/TodoListCard.tsx`, `frontend/src/components/Utils/BrailleSpinner.test.tsx`.
Reviewer guardrail: do not reintroduce the old spinner mix on these surfaces unless a new design decision replaces the braille spinner everywhere.

7. Project-chat conversation search now navigates individual matches, highlights text ranges, and supports Enter-to-advance.
What changed: search no longer advances by whole message only. It counts individual term occurrences inside matching messages, highlights the matched ranges in rendered chat/thinking content, scrolls the active match into view, and treats Enter / Shift+Enter in the filter box as next / previous match navigation.
Why intentional: the branch adds range-finding/counting helpers, threads occurrence indices through `ProjectChat` and `ProjectChatCore`, and adds unit/e2e coverage that checks match counts, active-target highlighting, and Enter-based stepping.
Files/endpoints/components involved: `frontend/src/utils/conversationSearch.ts`, `frontend/src/utils/conversationSearch.test.ts`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-threads.spec.ts`.
Moved/renamed UX flows: the search counter now tracks occurrence index rather than matched-message index, and the active highlighted term is an explicit target inside the message.
Reviewer guardrail: do not collapse this back to message-level search or remove Enter-to-advance. Reviews on follow-up branches should preserve per-occurrence targeting and highlighting.

## Bug Fixes

1. Project-chat drafts now survive reloads and remain scoped to the owning project config, and waiting threads rehydrate their full history while still streaming.
What changed: unsent draft text moved out of component-local state into persisted local storage keyed by `projectConfigId`, so reloads and multi-surface navigation no longer drop the draft. Waiting threads also rehydrate while `waitingForResponse` is still true, which restores the full thread transcript instead of leaving only the latest optimistic fragment visible after reload.
Why intentional: the branch adds `projectChatDraftMessageByProjectConfigId` persistence, removes the hydration/provenance guards that skipped rehydration while waiting, and adds integration and Playwright coverage around standalone reloads and waiting-thread history restoration.
Files/endpoints/components involved: `frontend/src/state/definitions.ts`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationAuthority.ts`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx`, `frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts`.
Default-value changes / relocated logic: draft ownership is now persisted by project config instead of living only inside `ProjectChatSurface`, and waiting-thread hydration is no longer short-circuited just because the thread is still running.
Reviewer guardrail: do not move draft state back into component-local memory and do not reintroduce `waitingForResponse` checks that block selected-thread hydration or provenance fallback.

2. Standalone `/chat` routing is now stable across same-tab SPA navigation and visually matches the shared project-chat frame.
What changed: same-tab standalone navigation no longer reloads project state just because React Router generated a new `location.key`, and the standalone project-chat route now uses the shared `ProjectChatWindowSurface` frame instead of a visually divergent shell. The standalone remount key is scoped to the actual thread id instead of remounting on unrelated navigation churn.
Why intentional: `useLoadProjectConfig` drops `location.key` from its load key, `UnifiedChatSurface` adjusts its remount key for standalone chat threads, and `StandaloneProjectSurfacePage.tsx` wraps the standalone chat surface in the shared frame with `showHeader={false}`. Tests explicitly cover same-tab route recovery, draft isolation, and frame parity.
Files/endpoints/components involved: `frontend/src/state/hooks/project.ts`, `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx`, `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`, `frontend/src/components/ChatWindowing/ProjectChatWindowSurface.tsx`, `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`, `frontend/src/components/ChatWindowing/UnifiedChatSurface.remount.test.tsx`, `frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts`.
Reviewer guardrail: do not restore `location.key`-based reloads/remounts for standalone routes, and do not unwrap standalone `/chat` from the shared project-chat frame without a new UX decision.

3. Streaming markdown now renders smoothly as markdown while it is arriving, instead of waiting for completion or reanimating the whole block.
What changed: assistant markdown renders during streaming, complete lines are committed as normal markdown, and only the unfinished tail characters get the subtle streaming animation. The animation no longer uses vertical translation when content grows, which avoids the old jumpy feel during multiline expansion.
Why intentional: the branch adds dedicated `streamingMarkdown` helpers, updates `ChatMessages.tsx` to render committed markdown plus an animated tail, adds CSS for line/tail reveal classes, and includes focused animation tests.
Files/endpoints/components involved: `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Chat/streamingMarkdown.ts`, `frontend/src/components/Chat/streamingMarkdown.test.ts`, `frontend/src/components/Chat/useTypewriterEffect.ts`, `frontend/src/index.css`, `frontend/src/components/Chat/ChatMessages.streamingAnimation.test.tsx`, `frontend/tests/e2e/chat/chat-streaming-resize.spec.ts`.
Reviewer guardrail: do not revert to plain-text streaming, whole-block reanimation, or height-growth transforms that bring back the old jitter.

4. Chat content now stays readable in narrow windows and light mode instead of overflowing or collapsing awkwardly.
What changed: long user and assistant markdown wraps correctly in narrow chat windows, code blocks can wrap lines inside chat bubbles, rich tables/code stay constrained within the bubble width, and expanded tool-result panels use a deliberately lighter surface in light mode instead of retaining the older heavy styling.
Why intentional: `ChatMessages.tsx` now passes `wrapLines` through the shared code block, `TextBlock.tsx` constrains code-block width and allows wrapped rendering where requested, and dedicated tests cover narrow panes, constrained rich content, and the light-mode tool surface.
Files/endpoints/components involved: `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Section/Layouts/TextBlock.tsx`, `frontend/src/components/Chat/ChatMessages.lightModeToolCallSurface.test.tsx`, `frontend/tests/e2e/chat/chat-tool-calls.spec.ts`.
Reviewer guardrail: do not revert to overflowing tables/code blocks, narrow-column bubble collapse, or the older darker light-mode tool-result panel styling.

5. Assistant activity previews and accordions were corrected for both behavior and performance.
What changed: collapsed thought previews now scroll all the way to the actual bottom and stay pinned there when streaming ends; they only resume scrolling when new content extends the preview. Parent previews remain visible until the referenced thought row is opened, parent titles use stable labels like `Thinking`, `Reasoning`, or `Thoughts` instead of echoing raw thought text, and parent rows keep a fixed-height stacked preview lane under the header. Nested accordion slide animations were removed, metadata moved into hover overlays, and focusing an already-topmost chat window became a no-op, which cuts interaction lag.
Why intentional: this behavior is locked in by new unit tests, multiple e2e specs, and perf writeups that specifically call out the old accordion lag, preview reset-to-top bug, and resize fan-out.
Files/endpoints/components involved: `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx`, `frontend/src/components/Chat/ChatMessages.test.tsx`, `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, `frontend/src/state/actions/projectChatWindowing.ts`, `frontend/tests/e2e/chat/chat-activity-thought-preview.spec.ts`, `frontend/tests/e2e/chat/chat-thought-title-timing.spec.ts`, `frontend/tests/e2e/chat/chat-tool-calls.spec.ts`, `perf/reports/frontend/2026-03-12_chat-runtime-follow-up-accordion-and-standalone-chat.md`, `perf/reports/frontend/2026-03-13_chat-thought-preview-and-resize-follow-up.md`.
Reviewer guardrail: do not reintroduce reset-to-top preview behavior, raw thought-sentence parent titles, accordion slide transitions, extra focus churn on already-topmost windows, or per-row global `window.resize` listeners for thought measurement.

6. Hydration now preserves message timestamps and chat app-generation provenance instead of silently degrading them.
What changed: chat messages now carry `createdAt`, local user/assistant messages are stamped when they are created, and hydration/merge logic preserves that timestamp rather than dropping it on replacement. The hydrated app-generation details are now rebuilt from the reconciled message list, which keeps submit/edit follow-up flows working after hydration instead of losing message-to-generation linkage.
Why intentional: the branch updates the backend and generated frontend message schemas, adds merge helpers that preserve `createdAt`, and adjusts hydration so app-generation state is derived after local/backend reconciliation.
Files/endpoints/components involved: `backend/setta/types/chat_messages.py`, `frontend/src/utils/generatedTypes.ts`, `frontend/src/state/actions/ai.ts`, `frontend/src/state/actions/chatMergeUtils.ts`, `frontend/src/components/Chat/ChatMessages.tsx`.
Default-value changes / relocated logic: `createdAt` is now a first-class message field with a default schema value of `0`, but branch code intentionally stamps meaningful values on local messages and preserves prior timestamps when hydrated updates omit them.
Reviewer guardrail: do not strip `createdAt` on merge/hydration, and do not move app-generation reconstruction back to the pre-reconciled incoming payload.

7. Follow AI highlight cleanup is now immediate on local stop/completion instead of waiting for a websocket echo.
What changed: when a project or section chat is stopped, when a message-stop chunk arrives, or when hydration resolves that the chat is complete, the stored follow-tool-argument ids are cleared locally right away so highlighted sections fade out promptly. If a stop fails but hydration proves the chat is still running, the highlight snapshot is restored instead of being lost.
Why intentional: the branch adds snapshot/restore helpers in `aiFollow.ts`, threads them through stop/hydration paths in `ai.ts`, and adds unit/e2e coverage for both immediate cleanup and rollback on failure.
Files/endpoints/components involved: `frontend/src/state/actions/aiFollow.ts`, `frontend/src/state/actions/ai.ts`, `frontend/src/state/actions/aiStopProjectChat.test.ts`, `frontend/tests/e2e/chat/follow-ai-highlight-cleanup.spec.ts`.
Reviewer guardrail: do not revert to "clear only after backend follow websocket echo" behavior.

8. Activity/tool-row chrome and thread-list chrome were intentionally cleaned up to reduce clutter.
What changed: terminal and subagent runs now render as tool-call-like activity rows with their own icons/details, activity-only assistant groups use row-level timestamps instead of a separate footer timestamp, lone ungrouped thread sections no longer render extra chrome, and thread rows now use the leading slot for unread/working status until hover reveals the drag handle.
Why intentional: the branch adds dedicated tests for terminal/subagent rows, timestamps, and thread-row behavior, and the implementation clearly moves the status marker and drag affordance into separate hover-driven states.
Files/endpoints/components involved: `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`, `frontend/tests/e2e/chat/chat-tool-calls.spec.ts`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-threads.spec.ts`.
Reviewer guardrail: do not reintroduce always-visible drag handles, footer timestamps under activity-only assistant groups, or the old extra ungrouped-list chrome.

9. Callable kwargs controls now paint cleanly through rounded corners instead of bleeding underlying content through.
What changed: the callable kwargs strip now uses centralized background/border logic with `overflow-hidden` and `isolate`, which fixes the earlier rounded-corner bleed-through and keeps section-style backgrounds visually continuous.
Why intentional: the branch extracts the class computation into `kwargsControlsStyles.ts` and adds tests that verify the intended color/overflow behavior.
Files/endpoints/components involved: `frontend/src/components/Section/SectionParts/KwargsControls.tsx`, `frontend/src/components/Section/SectionParts/kwargsControlsStyles.ts`, `frontend/src/components/Section/SectionParts/kwargsControlsStyles.test.ts`, `frontend/tests/e2e/editor/section-style-colors.spec.ts`.
Reviewer guardrail: keep the overflow/background isolation unless the whole callable-args strip is being redesigned intentionally.

## Intentional Behavior Changes To Preserve

1. Preserve the new file-browser default: normal dotfiles such as `.env` and `.gitignore` should stay visible without an explicit hidden-files toggle, while explicit noisy roots like `.git`, `.venv`, `node_modules`, and Setta internal roots should stay hidden.

2. Preserve the shared file-browser path workflow: overview and browser-section file browsers should keep the direct path field, breadcrumb jumps, and go-up button. Do not collapse navigation back to tree-only expansion.

3. Preserve the typed `worktrees` payload on `getGitStatus` and the Git-pane accordion behavior. The worktree list is intentionally hidden when there is only the current repo, and intentionally open when extra worktrees exist.

4. Preserve the Project AI tab / dock split: the overview tab is intentionally the real chat surface again, and the dock is intentionally the place where chat-window management actions live. Later reviews should not "simplify" this back into a manager-only overview tab.

5. Preserve the narrow-desktop home behavior where one side pane opens full-width and closes the opposite pane. That focused single-pane flow is intentional, not a temporary layout hack.

6. Preserve the shared window-control quick-info contract and elevated overview More-menu layer. Later polish work should reuse `windowControlQuickInfo.ts` rather than adding one-off titles/tooltips.

7. Preserve the braille spinner rollout across chat/runtime surfaces unless a new global loading-indicator decision replaces it everywhere.

8. Preserve per-occurrence conversation search. The active match counter, highlighted ranges, targeted active mark, and Enter / Shift+Enter stepping are all intentional behavior changes.

9. Preserve persisted project-chat drafts by project config and the ability to rehydrate selected waiting threads while they are still running. Reviews should not reintroduce local-only draft state or hydration guards that bail out when `waitingForResponse` is true.

10. Preserve standalone `/chat` same-tab stability and shared frame parity. Do not reintroduce `location.key`-driven remounts/reloads or a custom standalone shell that drifts from the project-chat window frame.

11. Preserve the streaming-markdown rendering strategy: committed markdown lines plus an animated unfinished tail, with no height-growth translation effect. Also preserve wrapped/constrained code and table rendering inside chat bubbles.

12. Preserve the assistant activity semantics: stable `Thinking` / `Reasoning` / `Thoughts` labels, fixed-height stacked preview lane, parent preview visible until the referenced child thought row is actually open, hover-only row metadata, and fast accordion toggles without the old slide animation.

13. Preserve timestamp and provenance continuity. `createdAt` is intentionally carried through hydration/merge so message timestamps and activity-row timestamps remain stable, and hydrated app-generation state should continue to be rebuilt from reconciled messages.

14. Preserve immediate Follow AI highlight cleanup on local stop/completion. Follow highlights should clear as soon as the local stop/completion path resolves, with rollback only when hydration proves the chat is still actively running.
