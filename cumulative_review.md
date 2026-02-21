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

## 2026-02-18 23:57:21 PST

- Implemented external MCP runtime status durability and parsing fixes:
  - Persisted external MCP runtime status snapshots into run outputs and made status reads fall back to persisted snapshots after run cleanup.
  - Removed broad dict-of-dicts parsing heuristics outside explicit MCP containers to prevent phantom MCP server rows from non-MCP payloads.
  - Normalized single-object MCP status rows with `id` fallback into canonical `serverId` so valid rows are no longer dropped.
- Implemented MCP startup latency protections for external adapters:
  - Codex app-server `mcpServerStatus/list` probe now uses a short bounded timeout and no longer uses full request timeout.
  - OpenCode server-mode `/mcp` status probe now uses a short bounded HTTP timeout.
- Implemented active-skill badge correctness fix in the MCP/skills viewer:
  - Replaced broad substring matching with strict skill tool recognition (`skill`, `skill/<id>`) after optional MCP namespace stripping.
  - Prevented false-positive active badges from unrelated tool names such as `mcp__repo__skillful_search`.
- Updated automated coverage:
  - Backend pytest additions for nested non-MCP dict rejection, single-object MCP id fallback preservation, and persisted status snapshot retrieval.
  - Adapter tests validating short MCP probe timeouts and non-blocking startup behavior when probes fail/timeout.
  - Frontend Vitest additions for namespaced skill path detection and false-positive suppression.
  - Playwright e2e addition asserting no `Active` badge for non-skill tool-name substring matches.
- Verification run:
  - Targeted backend pytest: pass (`13 + 33 + 5` tests across updated suites).
  - Targeted frontend Vitest: pass (`13 passed`).
  - Targeted Playwright MCP viewer suite: pass (`12 passed`).
