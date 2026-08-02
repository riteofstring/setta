# Managed Chat History Lazy-Load Perf Log

## 2026-02-17
Scenario: Reload `great_true` with a managed Chat section mounted and section History closed.

Baseline:
- Trace file: `perf/chat_history_lazy_mount_baseline.trace.json`
- LCP (DevTools trace): `1924 ms`
- Instrumented fetch count on reload before opening section History: `GET /api/getAgentRuns = 1`

After refactor:
- Trace file: `perf/chat_history_lazy_mount_after.trace.json`
- LCP (DevTools trace): `1759 ms`
- Instrumented fetch count on reload before opening section History: `GET /api/getAgentRuns = 0`
- Instrumented fetch count immediately after opening section History: `GET /api/getAgentRuns = 1`

Result: managed section chat no longer loads run history while History is closed; history requests now begin only when the panel is opened.
