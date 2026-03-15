# Project Chat Slash Commands View Extraction

## Context

- Date: 2026-03-15
- Goal: move the slash-command engine tabs, native-command polling, and custom
  slash-command draft state out of
  `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  without changing the slash-view behavior.
- Code paths:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsView.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.ts`

## Scenario

- Open `Project AI Chat`.
- Open `Project AI Settings`.
- Switch from `AI Settings` to `Slash Commands`.

## Before (baseline)

- DevTools inline trace summary for the tab switch:
  - INP (observed): `244ms`
  - CLS: `0.00`
- Notes:
  - This was captured before the extraction using the same
    `AI Settings -> Slash Commands` interaction.
  - No persisted trace artifact was kept for this slice; the baseline here comes
    from the DevTools summary output.

## After

- DevTools inline trace summary for the same tab switch:
  - INP (observed): `140ms`
  - CLS: `0.00`
- Interpretation:
  - The post-refactor run came in lower than the baseline, so this slice did
    not regress the tab-switch interaction.
  - Treat the lower INP as a "no regression" signal rather than a definitive
    improvement claim because this was a single rerun on a live dev surface.

## Behavior Checks

- CDP verified that entering a custom slash command and prompt still enabled the
  `Add slash command` action.
- CDP verified that the unsaved slash-command draft still survived
  `Slash Commands -> Skills -> Slash Commands`, which was the main state
  persistence risk introduced by the extraction.

## Automated Guardrails

- `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.perf.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerSkillUpsert.integration.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts --grep "project ai chat can open slash commands in a dedicated side view|project ai chat keeps custom slash commands available without engine configs|project ai chat only fetches agent runs for slash commands"`
