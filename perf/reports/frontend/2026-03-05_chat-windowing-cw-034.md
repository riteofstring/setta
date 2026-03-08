# Chat Windowing Project Chat Load Trace

Date: 2026-03-05
Area: frontend
Branch/Commit: `chat-windowing` / baseline `8037bd0bb`, after `8037bd0bb` + local CW-028/CW-029/CW-032/CW-035 worktree changes
Related PR: n/a

Code paths touched:
- `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx`
- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx`

## Goal

Capture a CDP before/after trace for the chat-windowing project-chat load path so
the remaining v1 closeout work (`CW-028`, `CW-029`, `CW-032`, `CW-035`) has an
append-only perf checkpoint in repo history.

## Scenario

- Entry point: fresh project route with `overviewTab=ProjectAIChat` and
  `overviewVis=true`
- Steps to reproduce:
  1. Bootstrap the app through `__setta__/bootstrap`
  2. Create a new project via `POST /api/createProjectConfig`
  3. Persist `ProjectAIChat` as the overview tab in `localStorage`
  4. Navigate to the new project route
  5. Record a DevTools Performance trace during the project route load
- Data set / project used:
  - Baseline: empty generated project `giving_finding`
  - After: empty generated project `round_sitting`
- Browser + OS: Chrome DevTools MCP on macOS
- Notes:
  - Dev build (`pnpm startr`)
  - No CPU throttling
  - No network throttling
  - Both runs rendered the same visible chat-windowing shape: Project AI Chat
    manager in the overview pane plus two bottom-docked project chat windows

## Before (baseline)

- Measurement method: Chrome DevTools MCP Performance trace with trace export
- Key metrics:
  - LCP: `6673 ms`
  - LCP TTFB: `29 ms`
  - LCP render delay: `6643 ms`
  - CLS: `0.01`
- Observations:
  - The load is dominated by render delay, not network latency.
  - DevTools flagged `ForcedReflow`, `LCPBreakdown`, and `CLSCulprits`.

## After

- Key metrics:
  - LCP: `8493 ms`
  - LCP TTFB: `50 ms`
  - LCP render delay: `8443 ms`
  - CLS: `0.01`
- Observations:
  - The same hot-path shape remains: render delay dominates and `ForcedReflow`
    is still flagged.
  - This closeout work was not render-path focused, so this run should be read
    as a verification snapshot, not as evidence of a performance optimization.
  - A second manual reload trace artifact was captured, but DevTools MCP closed
    its transport while stopping that trace; the comparable metrics above come
    from the first saved after-trace summary.

## Conclusion

- What improved:
  - No material improvement claim from this closeout pass.
- What regressed (if any) + why it is acceptable:
  - The after-trace LCP was slower by `1820 ms` in this dev-mode run.
  - Because the remaining work here was backend/tooling/test-surface cleanup
    rather than render-path changes, the result is best treated as a recorded
    checkpoint plus a signal that chat-windowing load remains render-delay
    bound.
- Follow-ups:
  - If perf work resumes, investigate the `ForcedReflow` insight on project
    chat load and reduce the large render-delay portion of LCP.
  - Re-run the same scenario in a production bundle if a release-facing budget
    is needed.

## Raw Artifacts (local-only)

- `perf/artifacts/2026-03-05_chat-windowing_baseline.trace.json`
- `perf/artifacts/2026-03-05_chat-windowing_after.trace.json`
- `perf/artifacts/2026-03-05_chat-windowing_after_reload.trace.json`

## Automated Perf Tests

- Playwright spec(s): `frontend/tests/e2e/chat/chat-composer-controls.spec.ts`
- Vitest test(s) / bench(es): `frontend/src/components/ChatWindowing/UnifiedChatSurface.test.tsx`
- Budgets/assertions added: none in this closeout pass
