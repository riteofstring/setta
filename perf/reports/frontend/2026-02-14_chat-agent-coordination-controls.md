# Chat Agent Coordination Controls + Overview Activity

Date: 2026-02-14
Area: frontend
Branch/Commit: chat-agent-coordination @ 8b98af7e (plus uncommitted overview/docs updates)

## Goal

- Add chat orchestration controls and overview AI-activity badges without introducing interaction lag.
- Add stable automated performance guardrails for large command/run datasets.

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3059/sending_keeping`
- Steps to reproduce:
  1. Trigger a chat run and confirm overview row shows the AI badge.
  2. Stop/complete the run and confirm badge clears.
  3. Toggle footer controls (`Search`, `Skills`) and switch permission mode (`minimal <-> yolo`).
  4. Type in the chat composer while controls are updating.
- Data set / project used: local `sending_keeping` worktree page
- Browser + OS: Chrome via chrome-devtools-mcp on macOS
- Notes: no CPU/network throttling

## Before (baseline)

- Measurement method (automated guardrails):
  - `frontend/src/components/Chat/chatComposerControls.perf.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectOverview/aiActivity.perf.test.ts`
- Key metrics/budgets:
  - Slash suggestion lookup budget:
    - 6,000 commands, 200 repeated lookups must finish under `350ms`.
  - Active section extraction budget:
    - 12,000 runs, 120 repeated scans must finish under `500ms`.

## After

- Measurement method (DevTools MCP):
  - `performance_start_trace` / `performance_stop_trace`
  - Insight set: `NO_NAVIGATION`
- Key metrics:
  - INP: `157ms` (good range, <200ms)
  - Longest interaction: `pointerdown`
    - Input delay: `9ms`
    - Processing: `109ms`
    - Presentation delay: `39ms`
  - CLS: `0.00`
- Observations:
  - Overview AI badge transitions were immediate in the traced interaction window.
  - Footer toggles and permission-mode menu interactions stayed responsive.
  - No layout-shift regressions observed while controls were toggled.

## Conclusion

- What improved:
  - Added explicit performance guardrails for large slash-command and run lists.
  - Added real-time overview activity signaling with acceptable interaction responsiveness.
- What regressed (if any) + why it is acceptable:
  - None observed in this scenario.
- Follow-ups:
  - Track INP over broader multi-section workloads if polling interval changes.

## Raw Artifacts (local-only)

- `perf/artifacts/2026-02-14-chat-composer-overview-active.png`
- `perf/artifacts/2026-02-14-chat-composer-overview-idle.png`
- `perf/artifacts/2026-02-14-chat-controls-overview-trace.json`

## Automated Perf Tests

- Playwright spec(s):
  - `frontend/tests/e2e/chat/chat-composer-controls.spec.ts`
  - `frontend/tests/e2e/overview/overview-ai-activity-indicator.spec.ts`
- Vitest test(s) / bench(es):
  - `frontend/src/components/Chat/chatComposerControls.perf.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectOverview/aiActivity.perf.test.ts`
- Budgets/assertions added:
  - slash suggestions under `350ms` for 6,000-command dataset
  - active section extraction under `500ms` for 12,000-run dataset
