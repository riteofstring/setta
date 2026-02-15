# App Config App-Generation Modes Trace

Date: 2026-02-14
Area: frontend
Code paths touched:
- frontend/src/components/Panes/Overview/App/AppConfigPane.tsx
- frontend/src/components/Panes/Overview/App/appGenerationModes.ts
- frontend/tests/e2e/overview/app-config-json-render-mode.spec.ts
- frontend/tests/e2e/overview/app-config-generate-prompt.spec.ts
- frontend/tests/e2e/overview/app-config-mcp-mode.spec.ts

## Goal
Validate that the new App Config mode controls and skills/MCP browser interactions stay responsive after adding mode routing, hidden-chat generation wiring, and additional UI sections.

## Scenario
- Entry point: `http://127.0.0.1:3000/making_bay`
- Steps:
  - Open App Config pane.
  - Switch modes `JSON + Image -> MCP Server -> JSON Render`.
  - Type into Skills filter (`"skill"`).
- Browser + OS:
  - Chrome DevTools MCP (headed Chrome)
  - macOS
- Notes:
  - No CPU throttling
  - No network throttling

## Before (baseline)
No pre-change trace was captured for this specific mode-switch flow in this worktree.

## After
Measurement method:
- Chrome DevTools MCP Performance trace + INP insight analysis.

Key metrics:
- INP: **100 ms**
- CLS: **0.00**
- Longest interaction type: **keypress**
- INP phase breakdown for longest interaction:
  - Input delay: **0.4 ms**
  - Processing duration: **32 ms**
  - Presentation delay: **67 ms**

Observations:
- Interaction responsiveness for the new App Config controls remains within "good" INP range (<200 ms).
- No major interaction stalls were observed during mode switching and filter input.

## Conclusion
- What improved: Added functionality (mode switching, MCP/skills browser, hidden-chat routing) without degrading interaction responsiveness in the measured scenario.
- What regressed: None observed in this trace.
- Follow-ups: Re-run the same trace against a large project graph to validate behavior under heavier DOM pressure.

## Automated Perf Tests
- Vitest:
  - `frontend/src/components/Panes/Overview/App/appGenerationModes.perf.test.ts`
  - `frontend/src/utils/fileBrowserFilter.perf.test.ts`
- Budget assertions:
  - prompt builder loop under 150 ms for large section summaries
