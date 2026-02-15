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

## 2026-02-17T02:11:08Z

Status: Implemented

Accepted findings fixed in this batch:
- Hidden app-generation now preserves and surfaces actionable backend error detail from `/getLLMResponse` instead of collapsing to a generic failure.
- `revealPathInOsFileExplorer` now enforces allowlisted roots before existence checks and returns a consistent disallowed-root error message.
- App Config now runtime-validates persisted `appGenerationMode`, falls back to `json_render` for invalid values, and self-heals local storage.
- Hidden generation now clears pending chat details after successful force-new-chat submit, preventing stale pending-state leakage.
- Removed redundant `skillPath` from app-gen skill list payloads and regenerated frontend/backend contracts accordingly.
- Skills/MCP refresh now blocks redundant concurrent rescans by guarding in-flight refresh and disabling the refresh button while loading.
- Removed redundant deep clone on json-render generation startup by reusing the already-detached spec seed.
- Removed unused hidden-generation `promptOverride` path to reduce API surface and maintenance overhead.

Test and verification coverage added/updated:
- Added backend route tests for consistent disallowed reveal-path error behavior and updated app-gen-skill contract expectations.
- Added frontend unit tests for app-generation mode coercion/validation and submit-message backend-detail propagation behavior.
- Updated skills viewer unit/perf tests and Playwright mocks for the leaner skill entry payload (without `skillPath`).
- Added Playwright coverage for hidden-generation error-detail UX, invalid persisted mode fallback/self-heal, and refresh-button loading lockout behavior.
- CDP visual verification completed for App Config mode fallback behavior and Project AI Skills refresh disablement during in-flight loads.

## 2026-02-17T02:54:34Z

Status: Implemented

Accepted findings fixed in this batch:
- Enforced strict reference-image mode isolation so image URL/notes are only included for `json_render_with_image` across App Config prompt building, hidden-chat generation payloads, and backend AI mode prompting.
- Removed misleading in-pane JSON streaming toggle exposure by showing `Streaming mode` only for chat-backed modes where it has behavioral effect.
- Added explicit vision-capability gating for `/streamAppSpec` image mode and now return a clear 400 guidance message when the selected model cannot accept image inputs.
- Routed `/revealPathInOsFileExplorer` through launcher origin to align with setta-home/status launcher-routed behavior in multi-origin/dev override setups.
- Refactored skill-root discovery into a shared utility module and removed cross-router imports of private helpers.
- Added server-side bounded `SKILL.md` preview loading with truncation metadata (`truncated`, `originalSizeBytes`) to prevent unbounded memory/UI load from oversized skill docs.
- Updated Skills/MCP viewer to mount CodeMirror only when accordion is open, display truncation notices, and replace `"Unavailable"` magic-path sentinel logic with nullable config-path state.
- Reduced App Tabs hot-path render work by replacing recursive renderability scans with memoized tab resolution and cheaper children-availability heuristics.

Test and verification coverage added/updated:
- Added backend route/unit coverage for non-vision image-mode rejection, non-image-mode reference-image ignoring, non-image-mode AI prompt behavior, and large skill-content truncation metadata.
- Added frontend unit coverage for non-image hidden prompt isolation, launcher reveal-route URL routing, and nullable MCP config-path grouping behavior.
- Added Playwright coverage for JSON-mode streaming-toggle visibility rules, stale reference-image non-leakage into Prompt Builder, and lazy markdown mount + truncation notice behavior in Skills/MCP viewer.
- Re-ran targeted backend pytest suites, frontend Vitest suites, and Playwright overview suites; all passing.
- CDP visual verification completed for App Config mode control visibility and Skills/MCP markdown viewer lazy-mount behavior.

## 2026-02-17T03:27:46Z

Status: Implemented

Accepted findings fixed in this batch:
- Fixed a React hook-order correctness bug in App `Tabs` by making hooks unconditional and handling empty-tab rendering after hook execution.
- Moved filesystem-heavy app-gen extension route execution off the event loop by switching those handlers to synchronous FastAPI routes.
- Hardened `/revealPathInOsFileExplorer` success semantics by checking command exit status and surfacing explicit backend errors on launch/exit failures.
- Unified `/getLLMResponse` reference-image validation semantics with `streamAppSpec` by always normalizing/size-validating URL/notes, then applying them only in image mode.
- Removed redundant typed-response compatibility fallback parsing in the Skills/MCP viewer and now rely directly on strict generated route types.

Test and verification coverage added/updated:
- Added backend regression coverage asserting app-gen extension handlers remain synchronous for threadpool filesystem isolation.
- Updated backend reveal-path tests to cover checked subprocess behavior and explicit non-zero-exit error mapping.
- Added backend `/getLLMResponse` route tests for oversized reference-image URL/notes rejection outside image mode.
- Added Playwright coverage for App `Tabs` transitions between non-empty and empty definitions to guard against hook-order regressions.
- Re-ran targeted backend pytest, frontend Vitest, and Playwright suites; all passing.
- CDP visual verification completed for App Preview tab-state transitions and Skills/MCP viewer behavior.

## 2026-02-17T04:03:34Z

Status: Implemented

Accepted findings fixed in this batch:
- Fixed hidden app-generation resource preload determinism by explicitly waiting for initial AI resource load completion before engine selection.
- Aligned hidden managed-engine usability with Project Chat by allowing `settaLlmConfigId: null` engines to fall back to the default LLM config id.
- Removed unreachable hidden-generation reference-image plumbing from prompt-builder/MCP hidden-chat execution paths.
- Fixed Skills/MCP refresh failure behavior to preserve the last-known-good skill list/selection/preview and show inline error feedback instead of clearing state.
- Reduced unnecessary skills markdown backend calls by gating content fetch to markdown-viewer-open state and caching per selected skill/revision.
- Hardened `/revealPathInOsFileExplorer` against stalled OS openers with a bounded subprocess timeout and explicit timeout error mapping.
- Cleaned `/getAppGenSkillContent` `KeyError` HTTP detail formatting to remove extra quote characters in client-facing error messages.

Test and verification coverage added/updated:
- Added frontend unit coverage for hidden-generation default-managed-config fallback selection behavior.
- Added backend router coverage for reveal-path timeout handling and plain (unquoted) missing-skill error detail responses.
- Added Playwright coverage for hidden-generation in-flight preload waiting/default fallback behavior in App Config prompt-builder mode.
- Added Playwright coverage that markdown content is not fetched while the Skills markdown viewer is collapsed.
- Added Playwright coverage that skills refresh failures preserve prior visible skill/preview state while surfacing inline error feedback.
- Re-ran targeted frontend Vitest, backend pytest router suites, and Playwright overview specs; all passing.

## 2026-02-17T04:33:03Z

Status: Implemented

Accepted findings fixed in this batch:
- Made `mcp_server` app-generation prompt guidance honor the streaming toggle with a single deterministic persistence tool path.
- Centralized reference-image URL/notes limits in shared router constants and applied the same contract across `/getLLMResponse` and `/streamAppSpec`.
- Hardened app-gen skills listing so malformed UTF-8 in `SKILL.md` descriptions no longer fails the entire response.
- Cached reveal-path allowlist roots by workspace/home/env context to avoid recomputing root normalization on every request.
- Unified frontend app-generation mode literals into one shared `AppGenerationMode` type used by app-mode helpers, local-storage state, and message submit payloads.
- Removed unreachable hidden-generation null-chat-id error branch after `submitMessage`.
- Simplified Skills/MCP refresh concurrency handling to a single in-flight refresh guard.
- Fixed the remaining stale markdown race when the skills viewer is collapsed by invalidating in-flight requests on close, clearing preview state, and gating response apply by both sequence and selected skill id.
- Made the skills markdown accordion close state explicitly controlled (`\"\"` when closed) for deterministic collapse/reopen behavior.

Test and verification coverage added/updated:
- Added backend unit coverage for `mcp_server` prompt persistence-tool selection under streaming enabled/disabled states.
- Added backend route integration coverage for `/getLLMResponse` MCP-mode prompt guidance honoring `appSpecStreamingEnabled`.
- Added backend route coverage ensuring invalid-UTF8 `SKILL.md` description files are tolerated in skill listing.
- Added backend reveal-path route coverage for cached allowlist root reuse across repeated requests.
- Added frontend unit coverage that `submitMessage` forwards app-generation mode and reference-image context payloads.
- Added Playwright regression coverage for stale markdown suppression after collapsing the Skills viewer during an in-flight markdown request.
- Re-ran targeted backend pytest router suites, frontend Vitest suites, and Playwright Skills/MCP viewer coverage; all passing.
- CDP visual verification completed for Project AI Skills/MCP viewer collapse/reopen and markdown content behavior.

## 2026-02-17T04:57:12Z

Status: Implemented

Accepted findings fixed in this batch:
- Applied app-generation mode system-prompt guidance consistently across managed and external-agent chat runs.
- Removed app-generation prompt injection when `appGenerationMode` is unset, even if streaming is enabled, so normal chat no longer inherits app-spec tool guidance.
- Added in-flight request deduplication for App Config AI bootstrap calls to avoid duplicate `llm/config` and `llm/apiKeys` fetches.
- Removed unused hidden-generation `chatId` binding in App Config submit flow.

Test and verification coverage added/updated:
- Added backend route coverage for explicit no-mode/no-injection behavior and external-agent app-generation prompt propagation.
- Added backend helper coverage for the explicit `mode=None` prompt contract.
- Added frontend unit coverage for normal-chat streaming-flag gating and in-flight dedupe of LLM bootstrap loaders.
- Updated Playwright App Config prompt-builder coverage to assert no duplicate LLM bootstrap calls during blocked in-flight loads.
- Re-ran targeted backend pytest suites, frontend Vitest suites, and Playwright overview App Config suite; all passing.
- CDP visual verification completed for App Config prompt-builder flow and generated in-pane status messaging.
