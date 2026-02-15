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

## 2026-02-18 23:27:06 PST

- Implemented MCP runtime status correctness fixes:
  - Tightened status payload extraction so non-MCP system/error envelopes are ignored and do not produce phantom MCP server rows.
  - Kept `id`/`name` fallback server-id normalization only for explicit MCP containers.
  - Resolved `connected=false + status=disabled` as `disabled` (explicit status/state now takes precedence before connected-fallback classification).
- Updated Codex skills discovery docs contract (no backward-compatibility root re-add):
  - Replaced stale `~/.codex/skills` wording with current runtime discovery roots and env-based additions (`AGENTS_HOME/skills`, `CODEX_HOME/skills`).
- Updated automated coverage:
  - Added backend unit/integration tests for non-MCP payload rejection, MCP-container id fallback, and disabled-state resolution.
  - Added Playwright MCP viewer assertion that disabled external runtime servers are surfaced in summary/server rows.
- Verification run:
  - Targeted backend pytest: pass (`10 passed`).
  - Targeted frontend Vitest: pass (`11 passed`).
  - Targeted Playwright MCP viewer suite: pass (`11 passed`).
