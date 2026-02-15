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

## 2026-02-17T00:58:47Z

Status: Implemented

Accepted findings fixed in this batch:
- Fixed hidden app-generation first-run correctness by reading fresh AI store state after async resource preloads.
- Hardened hidden engine selection to require external-agent preflight health (`available` + `supported`) before selecting external engines.
- Reset hidden-generation patch counters at request start so non-json hidden status messaging never reuses stale in-pane patch counts.
- Refactored App Config save flow to a single shared save+hydrate path used by both manual save and generated-spec persistence.
- Reduced App Config rerender churn by applying `shallow` equality to object selectors from local storage and AI store.
- Fixed skills browser refresh determinism by guarding list fetches with request sequencing and forcing selected markdown reloads on refresh.
- Added explicit user feedback for copy/reveal path actions (success notice for copy, actionable error notices on failure).
- Added `/getLLMResponse` reference-image URL/notes length guards to match `streamAppSpec` contract limits.
- Optimized skills description extraction to stream `SKILL.md` lines and stop at first usable description line.
- Removed unused `/settaHomeInfo.activeSettaFilesRoot` response field and aligned frontend/tests to the leaner contract.

Test and verification coverage added/updated:
- Frontend unit coverage for hidden-generation external-engine health gating and selection outcomes.
- Backend unit coverage for reference-image normalization and explicit length guard failures.
- Backend route coverage for streamed skill-description extraction behavior and updated setta-home response contract.
- Playwright coverage for skills refresh content reload, stale-list race handling, reveal-path error feedback, and hidden-mode stale patch-count regression.
- CDP visual verification completed for Project AI Skills/MCP viewer refresh/copy feedback and App Config hidden generation flow.
