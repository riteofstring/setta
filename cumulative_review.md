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

## 2026-02-17T00:27:12Z

Status: Implemented

Accepted findings fixed in this batch:
- Fixed in-pane streaming preview immutability by using deep-cloned preview snapshots and eliminating shared nested references.
- Fixed hidden app-generation engine routing to prefer the active chat engine and force a fresh chat when engine fallback changes context.
- Added backend-error detail surfacing for failed stream-generation responses (message/detail fallback) instead of status-only text.
- Removed eager AI bootstrap fetches from App Config mount for json-render mode and deferred them to chat-backed modes / hidden generation execution.
- Hardened revealPathInOsFileExplorer with an allowlist rooted to workspace, active setta_files, and discovered skill roots.
- Removed dead prompt-builder no-op line and removed redundant backend app-generation mode normalization shim.
- Removed unnecessary string/null fallback branches in Skills/MCP viewer where route types are already strict strings.

Test and verification coverage added/updated:
- Added frontend unit tests for hidden-generation engine selection, preview-clone isolation, and stream error-message extraction.
- Added backend integration tests for reveal-path allowlist acceptance/rejection behavior.
- Updated backend AI mode-helper tests to reflect strict typed mode handling without normalization shim.
- Added Playwright coverage for stream error detail UX and lazy AI bootstrap behavior in App Config.
- Updated MCP-mode Playwright assertion to the canonical hidden prompt contract.
- CDP visual verification completed for App Config mode transitions and visible UI state.
