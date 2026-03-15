# Frontend Cleanup Plan Index

This index groups the frontend cleanup work into smaller domain plans so Codex agents can start in the right place instead of scanning the whole tree.

These plans describe the intended cleanup direction, but the exact hotspot sizes and helper boundaries can drift as refactors land. Treat the current tree as the source of truth for exact file ownership, and refresh these docs when a cleanup slice materially changes that map.

## Foundation Docs

- [frontend/src/README.md](../../frontend/src/README.md)
  - Current frontend module map, placement rules, and file-size guidance for
    authored code under `frontend/src`.
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

1. Read [frontend/src/README.md](../../frontend/src/README.md) for the current hotspot list, ownership map, and placement rules.
2. Read [frontend-cleanup-plan.md](./frontend-cleanup-plan.md) for the overall direction and current prioritization pivot.
3. Read [frontend-cleanup-execution-log.md](./frontend-cleanup-execution-log.md) for recent slices, but treat older "next slice" notes as historical context rather than automatic instructions.
4. Pick the companion plan that matches the highest-value front-door surface you are changing.
5. If a change crosses multiple domains, prefer the tighter domain boundary and only pull in the second plan if necessary.
6. Re-check the current tree before acting on any exact file-size or hotspot claim in these docs.

## Current Default Starting Points (2026-03-15)

- The highest-value unresolved front-door hotspots are:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/plugins/runtime.ts`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx`
  - `frontend/src/components/Pages/Home/HomePage.tsx`
- Already-improved coordinators and smaller follow-through surfaces such as
  `ProjectChatHistory.tsx`, `ProjectChatBottomDock.tsx`, `ChatInput.tsx`,
  `ChatMessages.tsx`, `FileBrowserPane.tsx`, and `BrowserArea.tsx` are now
  second-order work unless the same slice directly shortens one of the entry
  surfaces above.
- Local feature `README.md` files are useful once a root surface stabilizes,
  but they should not be the primary work item for a cleanup slice.

## Coverage Notes

- Chat, project-AI, and project chat windowing hotspots now have a dedicated companion plan in [frontend-chat-project-ai-windowing-cleanup-plan.md](./frontend-chat-project-ai-windowing-cleanup-plan.md).
- Overview and authoring hotspots, including `GitGraphOverlay.tsx`,
  `PluginsPane.tsx`, `RunInstructions.tsx`, and `FileBrowserPane.tsx`, are
  covered in [frontend-panes-and-authoring-cleanup-plan.md](./frontend-panes-and-authoring-cleanup-plan.md).
- Browser/layout surfaces such as `ChatArea.tsx`, `TaskBoardArea.tsx`, and
  `BrowserArea.tsx` remain covered in [frontend-sections-and-params-cleanup-plan.md](./frontend-sections-and-params-cleanup-plan.md).
- Page-shell work remains covered in [frontend-pages-shell-cleanup-plan.md](./frontend-pages-shell-cleanup-plan.md), but it is generally behind the larger project-chat, git, pane, section-layout, runtime, and app-mode entry surfaces above.
- State/shared-infrastructure plans are usually secondary reading at this stage. Default to them only when a state or utility split is a direct prerequisite for shrinking a still-large UI entry surface, or when the slice starts directly from `frontend/src/plugins/runtime.ts`.
- The companion plans cover the rest of the authored frontend surface so the cleanup roadmap is distributed rather than concentrated in one document.
