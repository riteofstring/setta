# Frontend Cleanup Plan Index

This index groups the frontend cleanup work into smaller domain plans so Codex agents can start in the right place instead of scanning the whole tree.

These plans describe the intended cleanup direction, but the exact hotspot sizes and helper boundaries can drift as refactors land. Treat the current tree as the source of truth for exact file ownership, and refresh these docs when a cleanup slice materially changes that map.

## Core Plan

- [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)
  - Shared principles, hotspot summary, and the chat/project-AI/windowing/browser/runtime tracks.

## Companion Plans

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

1. Read [frontend-cleanup-plan.md](./frontend-cleanup-plan.md) for the overall direction.
2. Pick the companion plan that matches the feature you are changing.
3. If a change crosses multiple domains, prefer the tighter domain boundary and only pull in the second plan if necessary.
4. Re-check the current tree before acting on any exact file-size or hotspot claim in these docs.

## Coverage Notes

- Chat, project-AI, project chat windowing, browser/file-management hotspots, and app/plugin runtime are already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).
- The companion plans cover the rest of the authored frontend surface so the cleanup roadmap is distributed rather than concentrated in one document.
