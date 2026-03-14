# UI Polish, Dev Browser, And Chat Runtime Plan

Plan status:

- This plan is closed.
- The reconciled checklist below is the retained source-of-truth record for the completed work.

Historical baseline captured when this plan was first created
(kept for context; no longer the current product state):

- `.env` is hidden because `backend/setta/routers/artifact.py` currently suppresses all dotfiles unless `includeHidden`, and also ignores `.git`, `node_modules`, `.venv`, `dist`, `build`, and `__pycache__`.
- The git pane in `frontend/src/components/Panes/Overview/Git/GitPane.tsx` only renders status today; the only worktree UI already present is the header hint, so the worktree-list item likely needs a new typed backend payload.
- The overview tab labeled "Project AI Chat" is no longer the main chat surface; the actual chat UI lives in the reusable project chat surfaces and bottom dock, while the overview tab acts more like a chat-window manager.

Primary implementation surfaces:

- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- `frontend/src/components/Section/Layouts/BrowserArea.tsx`
- `frontend/src/components/Utils/PaneContainer.tsx`
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- `frontend/src/components/Chat/ChatMessages.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
- `backend/setta/routers/git.py`

## Reconciled Checklist Status

This section is the authoritative status view as of `2026-03-13`.

Status values:

- `done`: the original requirement has direct code + test evidence.
- `open`: still needs work or a dedicated regression to prove closure.

Original checklist reconciliation:

- `UI-001` `done` Duplicate top-right "make into window / show in canvas" control.
  Dedicated regressions now prove floating section windows suppress the normal canvas section controls and keep only the window-owned restore/show-in-canvas action visible. Evidence: `frontend/src/components/Section/Container/SectionWindowSurface.test.tsx`, `frontend/tests/e2e/overview/layout/window-control-quick-info.spec.ts`.
- `UI-002` `done` Show dev-relevant dotfiles like `.env` by default while still hiding explicit noisy roots.
  Evidence: `backend/setta/routers/artifact.py`, `tests/routers/test_file_browser_routes.py`, `frontend/tests/e2e/file-browser/browser-path-navigation.spec.ts`.
  Notes: default suppression is name/root based (`.git`, `node_modules`, `.venv`, `dist`, `build`, `__pycache__`, plus actual Setta internal roots). There is no extra extension-based hiding policy to unwind right now.
- `UI-003` `done` Show the current file/folder path clearly in the left pane browser, matching the section browser.
  Evidence: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`, `frontend/src/components/Utils/FileBrowserPathControls.tsx`, `frontend/tests/e2e/file-browser/browser-path-navigation.spec.ts`.
- `UI-004` `done` Support "go up one level" plus ancestor/breadcrumb navigation in both the pane browser and the section browser.
  Evidence: `frontend/src/utils/fileBrowserNavigation.ts`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`, `frontend/src/components/Section/Layouts/BrowserArea.tsx`, `frontend/tests/e2e/file-browser/browser-path-navigation.spec.ts`.
- `UI-005` `done` Paint the callable args control strip background through the rounded corners and stop list-item bleed-through.
  Evidence: `frontend/src/components/Section/SectionParts/kwargsControlsStyles.ts`, `frontend/src/components/Section/SectionParts/KwargsControls.tsx`, `frontend/src/components/Section/SectionParts/kwargsControlsStyles.test.ts`, `frontend/tests/e2e/editor/section-style-colors.spec.ts`.
- `UI-006` `done` Expose Q quick info on all window buttons, React Flow controls, and related chrome controls.
  The remaining section-header chrome controls are now wired into the shared floating tooltip contract, and the browser audit covers React Flow zoom controls plus the window-management surfaces. Evidence: `frontend/src/components/Section/Header/AttachedTerminalControls.tsx`, `frontend/src/components/Section/Header/LockPositionButton.tsx`, `frontend/src/components/Section/Header/MinimizeButton.tsx`, `frontend/src/components/Section/Header/DeleteOrHideButton.tsx`, `frontend/src/components/Section/Header/SectionHeader.tsx`, `frontend/src/components/Section/Header/SectionHeader.test.tsx`, `frontend/tests/e2e/overview/layout/window-control-quick-info.spec.ts`, `frontend/tests/e2e/overview/layout/app-chrome-window-layering.spec.ts`.
- `UI-007` `done` Use braille loading spinners for AI/chat/runtime loading states.
  Evidence: `frontend/src/components/Utils/BrailleSpinner.tsx`, `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`, `frontend/src/components/Section/Layouts/ChatArea.tsx`.
- `UI-008` `done` Make minimized thinking previews scroll to the real bottom, pause there, and resume only when more text arrives.
  Evidence: `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx`, `frontend/tests/e2e/chat/chat-activity-thought-preview.spec.ts`.
- `UI-009` `done` Make thought titles appear as soon as authoritative summary/title metadata exists.
  Evidence: `frontend/src/state/actions/chatMergeUtils.ts`, `frontend/src/state/actions/chatMergeUtils.test.ts`, `frontend/tests/e2e/chat/chat-thought-title-timing.spec.ts`.
- `UI-010` `done` Keep the overview "More" menu above the sidebar and app chrome.
  Evidence: `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/src/components/Panes/Overview/Overview.test.tsx`, `frontend/tests/e2e/overview/layout/app-chrome-window-layering.spec.ts`.
- `UI-011` `done` Show active background terminals as tool-call-like rows with a terminal icon and expandable read-only terminal content.
  Evidence: `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Chat/ChatMessages.test.tsx`, `frontend/tests/e2e/chat/chat-tool-calls.spec.ts`.
- `UI-012` `done` Show active subagents as tool-call-like rows with a subagent icon and expandable self-talk/details.
  Evidence: `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Chat/ChatMessages.test.tsx`, `frontend/tests/e2e/chat/chat-tool-calls.spec.ts`.
- `UI-013` `done` Clear Follow AI highlights immediately when streams stop, drop, or are interrupted.
  Evidence: `frontend/src/state/actions/aiFollow.ts`, `frontend/src/state/actions/ai.ts`, `frontend/src/state/actions/aiStopProjectChat.test.ts`, `frontend/tests/e2e/chat/follow-ai-highlight-cleanup.spec.ts`.
- `UI-014` `done` Render git worktrees in the Git pane as a scrollable accordion that defaults open when extra worktrees exist and disappears when they do not.
  Evidence: `backend/setta/types/git.py`, `backend/setta/routers/git.py`, `tests/routers/test_git_routes.py`, `frontend/src/components/Panes/Overview/Git/GitPane.tsx`, `frontend/src/components/Panes/Overview/Git/GitPane.test.tsx`, `frontend/tests/e2e/git/git-pane-worktrees.spec.ts`.

## Remaining Work To Fully Close The Original Checklist

- No original checklist items remain open in code/test terms. If a future chat needs fresh visual reconfirmation, it should rerun the relevant CDP checks once `chrome-devtools-mcp` is healthy again.

## Historical Note

The old phase-by-phase checkbox list was removed from this file on `2026-03-13` because it had drifted out of sync with the actual shipped work. This plan now acts as the retained source-of-truth checklist for the finished scope.
