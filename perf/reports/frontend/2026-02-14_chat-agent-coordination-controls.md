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

## Update (Composer Compaction + Slash Menu Placement)

- Change set:
  - compacted chat bubble spacing/line density and composer control sizing
  - moved slash suggestions above the input by default with bounded height
  - enabled single-Enter slash execution for exact command matches
  - moved starter/quick slash controls to Project Chat pane and hid them in section chat
- Measurement method:
  - automated perf tests:
    - `frontend/src/components/Chat/chatComposerControls.perf.test.ts`
    - `frontend/src/components/Panes/Overview/ProjectOverview/aiActivity.perf.test.ts`
  - DevTools MCP trace:
    - `performance_start_trace` / `performance_stop_trace`
    - insight set: `NO_NAVIGATION`
- Trace metrics (compaction run):
  - INP: `56ms`
  - Longest interaction (`pointerdown`) breakdown:
    - Input delay: `0.9ms`
    - Processing: `13ms`
    - Presentation delay: `43ms`
  - CLS: `0.00`
- Observations:
  - Project-pane slash suggestion menu remained visible above the input near viewport bottom.
  - Section chat composer rendered permission-only footer controls with reduced vertical footprint.

## Additional Raw Artifacts (local-only)

- `perf/artifacts/2026-02-14-chat-composer-compact-pane-section.png`
- `perf/artifacts/2026-02-14-chat-composer-compactness-trace.json`

## Verification Rerun (CDP)

- Date: 2026-02-14
- Scenario:
  - Opened project chat and section chat on `http://127.0.0.1:3059/sending_keeping`
  - Triggered slash suggestions in both composers (`/res`, `/resume`)
  - Captured short no-navigation trace while interacting with both inputs
- Trace artifact:
  - `perf/artifacts/2026-02-14-chat-pane-controls-refresh-trace.json`
- Metrics:
  - INP: `303ms`
  - CLS: `0.00`
- Notes:
  - This run intentionally included active typing and suggestion rendering in two chat composers, so it is not directly comparable to the earlier compactness run.
  - Visual verification confirmed project pane keeps starter/quick controls and section chat keeps permission-only footer controls.

## Follow-up Update (Adaptive Slash Placement + Centered Starter Actions)

- Date: 2026-02-14
- Change set:
  - slash suggestion placement now defaults to `auto` (below unless viewport space is tight, then above)
  - section chat composer wrapped with horizontal padding to keep input/footer controls off card edges
  - project chat starter actions moved to center empty-state pane (`Create Project`, `Summarize Codebase`, `Plan Next Steps`)
  - removed visible `Skills` toggle button from chat composer footer controls
  - slash dropdown enforces hidden horizontal overflow
- Automated perf tests:
  - `frontend/src/components/Chat/chatComposerControls.perf.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectOverview/aiActivity.perf.test.ts`
- DevTools MCP trace artifact:
  - `perf/artifacts/2026-02-14-chat-pane-adaptive-placement-trace.json`
- Trace metrics:
  - INP: `227ms`
  - CLS: `0.00`
- Visual artifact:
  - `perf/artifacts/2026-02-14-chat-pane-adaptive-placement-and-center-prompts.png`
