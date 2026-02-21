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

## 2026-02-19 00:37:55 PST

- Completed the remaining MCP runtime and Skills/MCP viewer fixes from the review batch (excluding uuid churn):
  - External runtime status parsing now ignores non-MCP generic payloads and treats generic `servers` containers as trusted only for seeded providers.
  - Persisted external status snapshots now tolerate malformed rows without breaking valid row recovery.
  - Disabled runtime state now clears stale failure metadata, and missing-env runtime failures no longer move into `retrying`.
  - Codex active-skill detection now keys off explicit `$skill` user tokens instead of tool-call-only inference.
- Added/updated automated coverage:
  - Backend unit/integration tests for trusted-container parsing, malformed persisted snapshot tolerance, disabled-metadata reset, and missing-env no-retry behavior.
  - Frontend Vitest coverage for Codex token-driven active-skill behavior and associated performance fixture updates.
  - Playwright e2e coverage for Codex `$skill` activation in the Skills/MCP viewer.
- Verification run:
  - Backend pytest suite for touched areas: pass (`90 passed`).
  - Frontend Vitest targeted suites: pass (`14 passed`).
  - Playwright targeted suite: pass (`13 passed`).

## 2026-02-19 08:40:32 PST

- Implemented remaining review fixes (excluding generated UUID churn and excluding backward-compatibility additions):
  - Fixed Claude SDK stream ordering so `SystemMessage` payloads are still emitted after partial streaming has started.
  - Removed unreachable OpenCode empty-payload fallback from external status parsing and kept empty-payload behavior explicit.
  - Expanded status-payload extraction to include nested `data` envelopes used by Claude SDK `SystemMessage` payloads.
  - Tightened Codex active-skill token detection to avoid shell/code false positives (escaped/code span/fenced code handling + context gating).
  - Replaced per-token candidate sort in active-skill resolution with single-pass best-candidate selection.
  - Trimmed MCP viewer list-entry shape to fields currently consumed by rendering.
- Added/updated automated coverage:
  - Backend test for `StreamEvent -> SystemMessage` MCP status capture continuity.
  - Backend test locking OpenCode empty-payload no-fabrication behavior.
  - Frontend Vitest additions for shell-variable and code-block token false-positive suppression.
  - Playwright e2e addition asserting Codex shell-style `$variables` do not mark skills as `Active`.
- Verification run:
  - Backend pytest targeted: pass (`1 + 4 + 19` selected tests across touched suites).
  - Frontend Vitest targeted suites: pass (`16 passed`).
  - Playwright targeted skills/MCP viewer scenarios: pass (`3 passed`).

## 2026-02-19 09:34:56 PST

- Implemented follow-up review fixes (excluding generated UUID churn, without backward-compatibility additions):
  - External MCP error parsing now treats only explicit error fields (`lastError`/`error`, including nested objects) as failures; informational `message` text no longer forces `error`.
  - External MCP status capture from raw stream payloads now includes Codex in addition to Claude, so delayed Codex status payloads are still applied.
  - Terminal external-run paths now avoid redundant persistence writes by snapshotting status into the in-flight run and saving once per terminal transition.
  - Missing-env MCP connection failures now stop retry-loop churn (no retrying/sleep loop for static env-var misconfiguration).
  - Skills viewer now recognizes multi-token Codex prompts more reliably (`Use: $a, then $b.`) and normalizes trailing punctuation on tokens.
  - MCP row detail now surfaces missing env-var guidance alongside last error text when both are present.
- Added/updated automated coverage:
  - Backend tests for message-only status rows remaining `unknown`, nested error object extraction, Codex raw status capture, and snapshot persist-without-immediate-save behavior.
  - MCP client test asserting missing-env failures do not transition to retrying or sleep-loop retries.
  - Frontend Vitest coverage for multi-token Codex activation in one prompt line.
  - Playwright e2e updates for multi-token Codex active badges and missing-env MCP detail rendering.
- Verification run:
  - Backend pytest targeted suites: pass (`94 passed`).
  - Frontend Vitest targeted suite: pass (`14 passed`).
  - Playwright targeted Skills/MCP viewer suite: pass (`15 passed`).
  - CDP visual verification: pass (Project AI Chat -> View Skills and MCP, runtime row/detail rendering verified).

## 2026-02-19 10:08:14 PST

- Solidified Codex active-skill token parsing to avoid repeated mixed-line false-positive regressions:
  - Replaced line-level activation carry-over with token-scoped activation decisions in `extractSkillTokensFromText`.
  - Added explicit list-continuation parsing between accepted tokens (punctuation/connectors only) so follow-on `$...` tokens are accepted only in the same skills list context.
  - Prevented mixed prompt/shell lines like `Use $readme, then run echo $HOME` from activating unrelated skills (`home`) while preserving intended skill activation (`readme`).
- Added/updated automated coverage:
  - Frontend Vitest regression for mixed `skill token + shell variable` lines.
  - Playwright e2e regression for mixed Codex skill + shell variable prompts in Skills/MCP viewer.
- Verification run:
  - Frontend Vitest targeted suites: pass (`18 passed`).
  - Playwright targeted Skills/MCP viewer scenarios: pass (`3 passed`).
  - CDP visual verification: not run (chrome-devtools-mcp unavailable in this session).
