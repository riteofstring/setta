# Frontend Cleanup Plan Index

This index groups the frontend cleanup work into smaller domain plans for the few dense areas where the current tree is still hard to scan quickly.

These plans describe the intended cleanup direction, but the exact hotspot sizes and helper boundaries can drift as refactors land. Treat the current tree, grep results, nearby tests, and any file-level ownership comments as the source of truth for exact file ownership. Use these plans for branch-level prioritization and refresh them when a cleanup slice materially changes that map.

## Foundation Docs

- [frontend-cleanup-execution-log.md](./frontend-cleanup-execution-log.md)
  - Append-only log of completed cleanup slices on this branch.

## Core Plan

- [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)
  - Shared principles, hotspot summary, and cross-domain prioritization rules.

## Companion Plans

- [frontend-chat-project-ai-windowing-cleanup-plan.md](./frontend-chat-project-ai-windowing-cleanup-plan.md)
  - Shared chat rendering, project-AI surfaces, and project chat windowing hotspots.
- [frontend-pages-shell-cleanup-plan.md](./frontend-pages-shell-cleanup-plan.md)
  - Routing, app shell composition, home/launcher/share pages, and standalone project surfaces.
- [frontend-panes-and-authoring-cleanup-plan.md](./frontend-panes-and-authoring-cleanup-plan.md)
  - Overview pane, UI editor, app generation pane, view-mode/project-config authoring, and pane composition boundaries.
- [frontend-sections-and-params-cleanup-plan.md](./frontend-sections-and-params-cleanup-plan.md)
  - Section chrome, param rendering, shared layout/measurement infrastructure, and section-level authoring surfaces.
- [frontend-state-and-shared-infrastructure-cleanup-plan.md](./frontend-state-and-shared-infrastructure-cleanup-plan.md)
  - Zustand store boundaries, state command/query layering, cross-cutting interaction utilities, and shared UI infrastructure.
- [frontend-forks-cleanup-plan.md](./frontend-forks-cleanup-plan.md)
  - Additional guidance when a cleanup slice directly touches code under `frontend/src/forks/**`.

## Suggested Reading Order

1. Read [frontend-cleanup-plan.md](./frontend-cleanup-plan.md) for the overall direction and current prioritization pivot.
2. Re-check the current tree with grep and nearby tests before acting on any exact file-size or hotspot claim in these docs.
3. Read [frontend-cleanup-execution-log.md](./frontend-cleanup-execution-log.md) for recent slices, but treat older "next slice" notes as historical context rather than automatic instructions.
4. Pick the companion plan that matches the highest-value front-door surface you are changing.
5. If grep and naming already make the ownership boundary obvious, use only the relevant docs instead of over-reading the whole plan set.
6. If a change crosses multiple domains, prefer the tighter domain boundary and only pull in the second plan if necessary.

## Current Default Starting Points (2026-03-16)

- The highest-value unresolved front-door hotspots are:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Chat/ChatInput.tsx`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
- Already-improved coordinators and smaller follow-through surfaces such as
  `runtime.ts`, `RunInstructions.tsx`, `ChatArea.tsx`,
  `ProjectChatBottomDock.tsx`, `ProjectChatSkillsMcpViewer.tsx`,
  `ProjectChatCore.tsx`,
  `ProjectChatHistory.tsx`, `TaskBoardArea.tsx`, and `appRegistry.tsx` are now
  second-order work unless the same slice directly shortens one of the entry
  surfaces above.
- Once a root surface stabilizes, prefer domain subfolders in oversized flat
  namespaces over any new directory `README.md` files.

## Coverage Notes

- Chat, project-AI, and project chat windowing hotspots now have a dedicated companion plan in [frontend-chat-project-ai-windowing-cleanup-plan.md](./frontend-chat-project-ai-windowing-cleanup-plan.md).
- Overview and authoring hotspots, including `GitGraphOverlay.tsx`,
  `PluginsPane.tsx`, `RunInstructions.tsx`, and `FileBrowserPane.tsx`, are
  covered in [frontend-panes-and-authoring-cleanup-plan.md](./frontend-panes-and-authoring-cleanup-plan.md).
- Browser/layout surfaces such as `BrowserArea.tsx`, the now-localized
  `TaskBoardArea.tsx` owner path, and the now-localized `ChatArea.tsx` owner
  path remain covered in
  [frontend-sections-and-params-cleanup-plan.md](./frontend-sections-and-params-cleanup-plan.md).
- `ProjectChatSkillsMcpViewer.tsx` is no longer a top hotspot after delegating
  the skills browser/filter shell to
  `projectChatSkillsBrowser.tsx`, the markdown preview/edit shell to
  `projectChatSkillMarkdownViewer.tsx`, and the pure skill preview/save model
  to `projectChatSkillsViewModel.ts`; chat/project-AI follow-through should now
  start from the larger remaining front doors in
  [frontend-chat-project-ai-windowing-cleanup-plan.md](./frontend-chat-project-ai-windowing-cleanup-plan.md).
- `ProjectChatBottomDock.tsx` is no longer a top hotspot after delegating
  window lifecycle commands plus animation bookkeeping to
  `projectChatBottomDockWindowLifecycle.ts`; chat/windowing follow-through
  should now start from the larger remaining front doors in
  [frontend-chat-project-ai-windowing-cleanup-plan.md](./frontend-chat-project-ai-windowing-cleanup-plan.md).
- `GitGraphOverlay.tsx` now delegates the selected-commit summary, expanded
  commit metadata or file list, and diff viewer to
  `gitGraphOverlaySelectedCommitPane.tsx`; pane follow-through should now start
  from the larger unresolved roots in
  [frontend-cleanup-plan.md](./frontend-cleanup-plan.md) unless the same slice
  shortens the git overlay root again.
- Page-shell work remains covered in [frontend-pages-shell-cleanup-plan.md](./frontend-pages-shell-cleanup-plan.md), but it is generally behind the larger project-chat, git, pane, section-layout, runtime, and app-mode entry surfaces above.
- `HomePage.tsx` is no longer a top hotspot after the local home-page split
  into `homeProjectGallery.tsx`, `homeWorkspaceSidePanes.tsx`,
  `homeSelectedProjectDetails.tsx`, and `homeProjectNavigation.ts`; page-domain
  follow-through should now start from the standalone project/window-space
  surfaces instead of the home entry page.
- State/shared-infrastructure plans are usually secondary reading at this stage. Default to them only when a state or utility split is a direct prerequisite for shrinking a still-large UI entry surface, or when a same-turn slice still starts directly from a large shared-state front door.
- The companion plans cover the rest of the authored frontend surface so the cleanup roadmap is distributed rather than concentrated in one document.
