# Project AI Settings Accordion Refinement

Date: 2026-02-16
Area: frontend
Code paths touched:
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState.ts`
- `frontend/src/state/definitions.ts`

## Scope
- Reworked Project AI Settings into persisted accordion sections.
- Reduced border density in manager list/form wrappers.
- Default-minimized non-essential sections with project-scoped localStorage persistence.

## Baseline
- No pre-change DevTools trace captured before implementation in this worktree.
- Baseline for ongoing regression checks is provided by the new accordion-state perf guardrail.

## After
Automated perf guardrail run:
- Command:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/BackendLogEventsArea.perf.test.ts src/components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState.perf.test.ts`
- Results:
  - `projectAISettingsAccordionState.perf.test.ts`: 1 test passed, measured loop runtime under threshold (`< 2500ms`), observed test runtime `108ms`.
  - `BackendLogEventsArea.perf.test.ts`: 2 tests passed, existing guardrails still green.

## Notes
- CDP performance trace could not be captured in this session because `chrome-devtools-mcp` was unavailable (`Transport closed`).
- The new perf test guards the hot localStorage normalization path against algorithmic regressions during pane load/toggle operations.

## Addendum: Accordion Clipping Regression Fix (2026-02-16)

Scope:
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `frontend/tests/e2e/overview/project-ai-settings-agent-profiles.spec.ts`

Issue:
- When multiple Project AI sections were open, content in earlier sections could be clipped due flex shrink pressure on the stacked accordion layout.

Changes:
- Switched Project AI settings stack from flex-gap layout to non-shrinking block spacing (`space-y-*`) so open sections expand naturally and scroll at the pane level.
- Added explicit accordion item/content `data-testid` hooks for layout assertions.
- Extended Playwright coverage to:
  - seed a concrete `ANTHROPIC_API_KEY` row in LLM API keys;
  - expand sections and assert open accordion item `scrollHeight - clientHeight <= 1` to catch clipping regressions.

Verification:
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai-settings-agent-profiles.spec.ts` (pass)
- `pnpm -C frontend exec vitest run src/components/Panes/Overview/BackendLogEventsArea.perf.test.ts src/components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState.perf.test.ts` (pass)
- CDP DevTools verification still unavailable in this session (`Transport closed`).

## Addendum: Pane Scrollbar Gutter Stability (2026-02-16)

Scope:
- `frontend/index.css`
- `frontend/src/components/Panes/Overview/*` pane roots
- `frontend/src/components/Panes/UiEditor/*` primary tab scroll roots
- `frontend/tests/e2e/overview/pane-scroll-gutter.spec.ts`

Change summary:
- Added shared `.setta-pane-scroll` utility:
  - `overflow-y: scroll` (always-on vertical scroll region for stable width)
  - `scrollbar-gutter: stable`
- Applied utility to pane-level scroll containers so scrollbar reservation is stable and content does not shift as content height changes.
- Follow-up tweak: switched to symmetric inline padding (`6px` left/right, no margins) so overlay scrollbars do not touch controls while keeping perceived edge spacing balanced.

Verification:
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/pane-scroll-gutter.spec.ts frontend/tests/e2e/overview/project-ai-settings-agent-profiles.spec.ts frontend/tests/e2e/overview/pane-content-overflow.spec.ts` (pass)
- `pnpm -C frontend exec vitest run src/components/Panes/Overview/BackendLogEventsArea.perf.test.ts src/components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState.perf.test.ts` (pass)
- CDP DevTools verification unavailable in this session (`Transport closed`).
