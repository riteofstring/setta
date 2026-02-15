# Skills/MCP Request And Discovery Stability

## Context
- Date: 2026-02-16
- Goal: remove avoidable request churn and filesystem traversal overhead introduced in Skills/MCP browsing flows.
- Code paths:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  - `backend/setta/routers/app_gen_extensions.py`
  - `frontend/tests/e2e/overview/project-ai-chat-skills-mcp-viewer.spec.ts`
  - `tests/routers/test_app_gen_extensions_routes.py`

## Scenario
- Open `Project AI Chat`.
- Open `View Skills and MCP`.
- Select multiple skills in sequence.
- Refresh skills in a tree containing skip directories (for example `node_modules`).

## Before (baseline)
- Frontend request coupling:
  - `refreshSkillsBrowser` captured `selectedSkillId`.
  - `useEffect(..., [refreshSkillsBrowser])` reran after every selection.
  - Expected behavior: selecting a skill triggers at least one extra `/api/getAppGenSkills` fetch.
- Backend discovery traversal:
  - `rglob("SKILL.md")` walked full subtree, then filtered paths containing skip segments.
  - Expected behavior: large skipped directories still incur traversal I/O.

## After
- Frontend request stability:
  - `refreshSkillsBrowser` is stable and no longer depends on `selectedSkillId`.
  - Selection is preserved with functional state updates.
  - Playwright verification (`project ai chat keeps skills list stable during selection and ignores stale markdown responses`):
    - Captured baseline count after initial load.
    - After skill selection, `/api/getAppGenSkills` count remained unchanged.
- Backend traversal pruning:
  - Discovery uses top-down `os.walk` with in-place `dirnames` pruning against `_SKIP_SEGMENTS`.
  - Unit verification (`test_skips_ignored_directories_during_walk`):
    - `node_modules` was removed from `dirnames` before descent.
    - Only expected kept skill directories were visited/listed.

## Automated perf guardrails
- `./scripts/run-playwright-e2e.sh tests/e2e/overview/project-ai-chat-skills-mcp-viewer.spec.ts`
  - Pass (`4` tests), including fetch-count stability + stale-response guard.
- `source activate.sh && pytest tests/routers/test_app_gen_extensions_routes.py`
  - Pass (`5` tests), including traversal pruning assertion.

## Notes
- This report uses structural performance metrics (request count stability and traversal pruning) for reproducibility and flake resistance, aligned with repo guidance to prefer automated guardrails.
