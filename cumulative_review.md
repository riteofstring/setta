## 2026-02-17T00:02:09Z

Status: Implemented

Accepted findings fixed in this batch:
- Removed app-generation mode inference from arbitrary chat text; only explicit `appGenerationMode` is honored.
- Stabilized Skills/MCP list refresh so skill selection no longer refetches the full skills list.
- Added stale-response protection for skill markdown fetches to prevent out-of-order overwrite.
- Removed silent 200-item cap in the skills list.
- Ensured app spec generation seeds are detached clones to avoid mutating persisted state by reference.
- Removed duplicate hidden-chat delivery/tool instructions and kept those rules in backend system prompt guidance.
- Switched app-gen skill discovery to top-down directory walking with skip-directory pruning.
- Updated generated type export filtering to exclude private set constants.
- Removed backward-compat route-missing guidance shim in the Skills/MCP panel.

Test and verification coverage added/updated:
- Backend router unit/integration tests for explicit app-generation mode behavior and traversal pruning.
- Frontend unit/perf tests for hidden prompt construction and detached `buildSpecSeed` behavior.
- Playwright regression coverage for skills-list stability and stale markdown response handling.
- CDP visual verification completed for the updated Skills/MCP panel behavior.
