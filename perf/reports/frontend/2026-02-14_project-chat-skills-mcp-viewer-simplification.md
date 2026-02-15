# Project Chat Skills/MCP Viewer Simplification

## Context
- Date: 2026-02-14
- Goal: simplify Skills/MCP viewer UX, remove warning-card noise, group skills by directory path, keep skill list + preview together.
- Code paths:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts`
  - `backend/setta/routers/app_gen_extensions.py`

## Scenario
- Open `Project AI Chat`.
- Open `View Skills and MCP`.
- Type `skill` in skill filter.
- Type `setta` in MCP tool filter.
- Select a skill.

## Before (baseline)
- DevTools trace artifact: `perf/artifacts/skills-mcp-viewer-before-trace.json`
- INP (observed): `54ms` (keypress)
  - Input delay: `0.1ms`
  - Processing: `15ms`
  - Presentation: `39ms`
- Viewer subtree DOM nodes (snapshot count): `45`
- Warning cards in viewer subtree: `1`

## After
- DevTools trace artifacts:
  - `perf/artifacts/skills-mcp-viewer-after-trace.json`
  - `perf/artifacts/skills-mcp-viewer-after-trace-rerun.json`
- INP (observed): `97ms` and `103ms` (keypress); still in "good" (<200ms) range.
- Viewer subtree DOM nodes (snapshot count): `56`
- Warning cards in viewer subtree: `0`
- Tradeoff: DOM node count increased due directory-group headers, but warning-card/UI-noise nodes were removed and interaction remains within good INP bounds.

## Automated perf guardrails
- `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.perf.test.ts`
  - Pass (`2` perf assertions)

## Notes
- This refactor prioritizes clearer information hierarchy over raw node-count reduction. Future optimization target: reduce keypress presentation delay in the viewer when large skill previews are visible.
