# UI Polish, Dev Browser, And Chat Runtime Plan

Execution log:

- Append-only progress and handoff notes live in `docs/plans/ui-polish-dev-browser-chat-runtime-log.md`.
- Each implementation chat should append a dated entry with: scope touched, tests added/updated first, code changed, verification run, blockers, and next recommended slice.

Current behavior worth locking down before code changes:

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

## Engineering Bar

- [ ] Start every workstream with failing tests first, then implement production code, then re-run the targeted tests.
- [ ] Keep the solution typed and source-of-truth driven; do not expand heuristic matching when a real runtime/backend contract can be added.
- [ ] Prefer shared helpers over duplicated JSX/state logic, keep DOM shallow, and avoid compatibility shims unless they are truly necessary.
- [ ] Treat CDP visual verification as a hard gate for every UI change, with resizable-extremes checks where panes/windows are involved.

## Phase 0: Baseline

- [ ] Capture current behavior in characterization tests before changing anything: hidden files, browser navigation, window-button rendering, tooltip coverage, thinking preview/title timing, follow-AI cleanup, git-pane rendering, and chat-window management access paths.
- [ ] Record a CDP baseline for the affected surfaces: section header/window controls, overview rail and "More" menu, file browser pane, browser section, callable args strip, chat activity rows, bottom dock controls/menu, and git pane.
- [ ] Confirm where each bug lives so ownership is explicit and changes stay local instead of spreading across unrelated components.

## Phase 1: Tests First

- [ ] Add or extend Vitest coverage for pure helpers and render-state logic in file browser visibility/navigation, window-control dedupe, kwargs theming, thinking-title derivation, and follow-AI interruption cleanup.
- [ ] Add or extend backend pytest coverage for file-browser visibility policy and any new git worktree contract.
- [ ] Add or extend Playwright coverage for `.env` visibility, path/breadcrumb navigation, tooltip presence, "More" menu layering, chat runtime rows, bottom-dock window-manager menu behavior, follow-highlight cleanup, and git worktree accordion behavior.
- [ ] Keep the new tests narrow and explicit so they read as product requirements, not implementation snapshots.

## Phase 2: File Visibility And Browser Navigation

- [ ] Change the default file-browser visibility policy to lean toward showing dev-relevant files, especially dotfiles like `.env`, while still hiding Setta internal roots and explicitly deciding which heavy/noisy folders remain suppressed.
- [ ] Make the left pane browser show the current file path/folder path with the same clarity the section browser already has.
- [ ] Add "go up one level" and ancestor/breadcrumb navigation to both the pane browser and the section browser.
- [ ] Reuse one shared path-navigation helper/state model so pane and section browsers cannot drift again.
- [ ] Preserve root sandboxing, path completion, and large-folder performance.

## Phase 3: Window Chrome, Tooltips, And Layering

- [ ] Fix the duplicate "turn window into section/canvas" control by centralizing which host is allowed to render that action in each state and verifying that the icon/action mapping is unique.
- [ ] Fix the home page left sidebar rail so its icons and sidebar surfaces remain visible and usable instead of disappearing.
- [ ] Offset right-side pane titles far enough to reserve clear space for the fullscreen button, and add regression coverage so title/button collisions do not return.
- [ ] Audit all window buttons, floating-window controls, overview rail actions, and React Flow controls so they all expose Q quick info through the shared tooltip system.
- [ ] Fix the overview "More" menu layering so Custom Runs/App Gen/Plugins render above the sidebar and other app chrome.
- [ ] Add regression coverage for z-index and visibility, not just clickability.

## Phase 4: Callable Args Control Polish

- [ ] Make the callable args control strip paint its full background through the bottom rounded corners, using the section style color when themed.
- [ ] Ensure list items underneath can never visually bleed into the control strip.
- [ ] Add themed and non-themed regression tests so this does not regress when section styling changes later.

## Phase 5: Chat And AI Runtime UX

- [ ] Move the project chat manager affordance out of the overview pane and into the bottom dock as a popout menu/list next to the create-chat button.
- [ ] Make that bottom-dock popout the canonical place to list existing chat windows and expose focus/reopen/manage actions.
- [ ] Remove or repurpose the overview "Project AI Chat" pane once the bottom-dock menu fully covers the management workflow.
- [ ] Replace AI/chat loading spinners with braille-style Unicode animations based on the frames from `unicode-animations`.
- [ ] Make minimized thinking previews auto-scroll through the real text until they reach the bottom, then pause, and resume only when more text arrives.
- [ ] Fix thought-title timing so titles appear as soon as structured summary/title metadata exists; if the metadata arrives too late, fix the upstream/state path rather than inventing a heuristic client summary.
- [ ] Render active background terminals as tool-call-like rows with a terminal icon and an expandable read-only terminal preview.
- [ ] Render active subagents as tool-call-like rows with a subagent icon and expandable self-talk/details.
- [ ] Clear Follow AI highlights immediately when a stream is stopped, interrupted, or drops unexpectedly.

## Phase 6: Git Worktrees

- [ ] Add a typed worktree list contract on the backend if git status does not already expose one.
- [ ] Render git worktrees in the git pane as a scrollable accordion that defaults open when worktrees exist.
- [ ] Hide that accordion entirely when no worktrees exist.
- [ ] Keep the existing active-worktree hint behavior consistent with the new pane data so there is one canonical notion of "current worktree".

## Phase 7: Verification And Cleanup

- [ ] Run targeted Vitest, pytest, and Playwright after each phase, not only at the end.
- [ ] Run CDP visual verification after each visual phase and explicitly check small/large sizes for panes, windows, and chat surfaces.
- [ ] Verify responsive pane behavior at narrow widths: on narrow viewports, clicking side-pane icons should default the pane to fullscreen while still keeping the home page sidebar icons visible and reachable.
- [ ] Profile the file browser and chat activity changes in DevTools to make sure the new UX does not add unnecessary render/scroll work.
- [ ] Do a final readability pass: simplify helpers, remove duplication, tighten naming, and leave only comments that explain non-obvious logic.
