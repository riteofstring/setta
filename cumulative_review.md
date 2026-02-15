## 2026-02-18 23:04:05 PST

- Implemented MCP runtime status correctness fixes:
  - Tightened external status parsing so non-MCP Claude/system events do not create phantom servers.
  - Prevented fallback `unknown` statuses from overwriting concrete non-`unknown` runtime states.
- Implemented frontend correctness and performance fixes:
  - Added queued/latest-params MCP runtime refresh logic to avoid stale context updates during in-flight requests.
  - Included `disabled` in the MCP status summary line for consistency with computed status totals.
  - Optimized active-skill resolution using a precomputed identifier index map instead of repeated full-list scans.
- Updated automated coverage:
  - Backend tests for non-MCP payload rejection and unknown-overwrite prevention.
  - Backend route test for disabled external-runner behavior.
  - Frontend Vitest updates for status summary, root-priority activity mapping, and performance scaling guardrails.
  - Playwright MCP viewer spec updated to mock/assert `POST /api/mcpServerRuntimeStatus` directly.
- Verification run:
  - Targeted backend pytest: pass.
  - Targeted frontend Vitest: pass.
  - Targeted Playwright MCP viewer suite: pass.
