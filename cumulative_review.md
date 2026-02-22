## 2026-02-25 18:03:21 PST

### Consolidated Findings
- Global undo order was non-chronological because local thread-delete undo intercepted backend undo.
- LLM API-key routes/watchers exposed `.env`-sourced values beyond explicit managed keys.
- Historical chat context usage could drift because it depended on mutable live config instead of run metadata.
- Runtime activity and dictation fallback relied on brittle string/regex heuristics.
- Codex MCP bootstrap could silently lose semantics for richer server definitions.

### Implemented Fixes (No Backward Compatibility Layer)
- Removed local thread-undo interception from global undo; backend undo/redo is now authoritative.
- Added explicit thread/group restore action in Project AI Chat toolbar (`Restore Delete`).
- Moved API-key persistence/read/watch flows to managed runtime key storage and updated preflight/runtime readers accordingly.
- Switched internal/external chat context usage resolution to persisted run metadata snapshots.
- Added structured transcription error codes and frontend code-based fallback handling.
- Replaced suffix-based runtime activity inference with explicit tool-ID classification.
- Extended MCP bootstrap/client support for HTTP headers and explicit rejection/warning on unsupported Codex MCP fields.

### UX/DX Before -> After
- Undo behavior: inconsistent cross-domain undo -> deterministic backend timeline + explicit restore control.
- Secret boundary: broad `.env` surface risk -> explicit managed key boundary only.
- Historical context telemetry: drift after config edits -> stable values tied to each run snapshot.
- Dictation fallback/activity indicators: heuristic and fragile -> typed/structured and deterministic.
- MCP import fidelity: partially working silent degradation -> preserved semantics or explicit warning/skip.

## 2026-02-25 18:36:12 PST

### Consolidated Findings
- Home pane storage keys and pane-layout identities drifted, causing invalid defaults and unsupported pane behavior.
- Project chat hydration route selection was coupled to current engine selection instead of selected-thread provenance.
- MCP runtime-status init tool used stale client/status APIs and could throw at runtime.
- LLM config example seeding wrote seeded data but could return stale pre-seed payload in the same call.
- Transcription `unsupported_model` classification depended on message text matching.
- Codex MCP parsing/bootstrap logic was duplicated across LLM/external paths and could silently coerce invalid transport declarations.

### Implemented Fixes (No Backward Compatibility Layer)
- Canonicalized Home pane state onto `homeWorkspacePane*` and `homeSelectedProjectPane*`, then unified Home panes into shared `paneLayout`/`PaneContainer` behavior with explicit pane IDs.
- Added provenance-driven project-chat hydration routing so selected thread `runType` controls `getExternalAgentChat` vs `getLLMChat`.
- Updated MCP init runtime-status tool to use `MultiMCPClient.get_server_runtime_statuses()` and canonical status fields (`toolCount`, `lastError`, `missingEnvVar`).
- Made `load_llm_config` deterministic by always returning the seeded example payload in the same invocation when sentinel-empty raw config is detected.
- Introduced typed transcription session errors (`TranscriptionSessionError`, `UnsupportedTranscriptionModelError`) and mapped router error codes from typed metadata.
- Extracted a shared Codex MCP loader/parser (`setta.mcp.codex_config`) and reused it from both LLM bootstrap and external-agent settings bootstrap with strict transport-shape validation.

### UX/DX Before -> After
- Home panes: mismatched keys/unsupported pane names -> deterministic pane visibility/width behavior with shared layout logic.
- Thread hydration: selectable historical thread could hydrate via wrong endpoint -> hydration route always matches selected thread provenance.
- MCP runtime status: init tool could fail hard -> stable status output from canonical runtime-status schema.
- LLM seeding: first load could show empty models despite persisted seed -> seeded models available immediately and consistently.
- Transcription fallback: wording changes could break fallback classification -> stable typed `unsupported_model` semantics.
- Codex MCP imports: internal/external paths could diverge or silently coerce transport -> same parser, same accepted server set, explicit skip/warning for invalid entries.

### Verification
- Backend targeted pytest set: 84 passed.
- Frontend targeted Vitest set: 49 passed.
- Playwright targeted checks: updated Home pane behavior test passed; new chat hydration provenance test passed.

## 2026-02-25 19:23:53 PST

### Consolidated Findings
- Interrupted-message flags in project chat were not run-scoped and stop rollback did not restore interruption state.
- Context telemetry rendering still fell back to frontend heuristics when backend context usage was missing.
- Hydration dedupe for selected project chat threads was not success-aware and ignored provenance endpoint changes.
- MCP runtime-status mapping dropped actionable diagnostics (`missingEnvVar`, tool count details).
- AI follow default mode regressed from opt-in to always-on.
- API key mutation normalization in UI diverged from backend trim/empty canonicalization.
- Codex MCP bootstrap could re-import previously removed servers on subsequent loads.

### Implemented Fixes (No Backward Compatibility Layer)
- Made interruption marking run-scoped to current assistant `message_start`, added interruption snapshot restore on stop rollback paths, and cleared stop-eligible IDs on lifecycle boundaries.
- Removed frontend context-usage heuristics from project chat telemetry and rendered explicit unavailable state when backend context data is incomplete.
- Replaced one-shot hydration guard with success-aware `(chatId, runType)` cache status (`in_flight`, `succeeded`, `failed`, `retry_scheduled`) and retry behavior.
- Extended MCP runtime-status frontend mapping to preserve `missingEnvVar` and include lossless diagnostic quick info (error/tool-count/env-var context).
- Restored AI follow default mode to `off`.
- Added API key value normalization (trim + empty handling) before optimistic update and persistence for add/edit flows.
- Added one-time codex MCP bootstrap migration marker (`codexMcpImportedAt`) so post-bootstrap user removals remain authoritative.

### UX/DX Before -> After
- Stop/interrupt labels: prior completed assistant responses could be marked interrupted -> interruption labels now map to the actual current stopped run and rollback leaves no stale marks.
- Context badge: estimated token/window values could be shown as if authoritative -> badge now shows backend-authored values or explicit `CONTEXT UNAVAILABLE`.
- Thread hydration: transient hydrate failures or late provenance resolution could strand selected chats -> hydration retries and converges automatically per endpoint provenance.
- MCP runtime diagnostics: status chips could hide missing-env/tool-count details -> UI now surfaces actionable diagnostics directly.
- Follow behavior: viewport-follow could activate without explicit user intent -> follow remains opt-in by default.
- API key saves: whitespace-only values could appear to save then disappear -> client behavior now matches backend canonicalization immediately.
- Codex MCP lifecycle: removed imported servers could reappear after reload -> one-time import migration preserves user removals.

### Verification
- Frontend targeted Vitest set: 90 passed.
- Backend targeted pytest set (`tests/llm/test_config.py`): 24 passed.
- Playwright targeted checks (`project-ai-chat-hydration-provenance.spec.ts`): 2 passed.
- CDP visual verification: context-unavailable badge rendering confirmed in project chat composer.

## 2026-02-25 20:19:53 PST

### Consolidated Findings
- Chat provenance for hydration/engine correction was derived from history projection that excludes branch chats.
- Hydration retry state used per-key status plus a global timer, allowing `retry_scheduled` keys to get stranded after timer cancellation.
- Internal stop could mark messages interrupted even when backend stop was a no-op.
- External-agent Codex MCP bootstrap could re-import previously removed servers.
- Managed API key parsing accepted falsy non-object payloads as valid empty state.
- Thread/group delete tooltips still referenced Cmd/Ctrl+Z despite restore moving to explicit `Restore Delete`.

### Implemented Fixes (No Backward Compatibility Layer)
- Added canonical chat provenance indexing from `agentRuns` (including branches) and used it for engine provenance and hydration route selection.
- Replaced hydration retry gating with per-cache-key retry state/timer ownership, including explicit re-hydration eligibility after cancellation.
- Updated stop API to return authoritative outcome metadata (`alreadyStopped`, `stoppedRunId`, `stoppedMessageId`) and reconciled frontend interruption state from response semantics.
- Added durable external-agent Codex MCP import marker (`codexMcpImportedAt`) so one-time bootstrap does not resurrect user-removed servers.
- Made managed key parser fail closed for non-object JSON payloads by validating all present payload roots as objects.
- Updated delete recovery copy to point users to `Restore Delete` and removed stale keyboard-undo guidance.

### UX/DX Before -> After
- Provenance routing: hidden-branch filtering could change runtime hydration behavior -> runtime provenance is now sourced from canonical run metadata, independent of history visibility.
- Hydration retries: chat switches could strand selected threads in non-hydrated state -> retries are deterministic per hydration key and recover after cancellation/switching.
- Stop state trust: interruption badges could persist after no-op stop -> interruption labels now reflect backend-confirmed stop outcomes only.
- MCP bootstrap intent: removed servers could silently reappear -> user removals remain authoritative across rebuilds.
- Secret-store robustness: malformed falsy payloads could masquerade as empty valid state -> invalid payloads now fail loudly and avoid silent state wipe behavior.
- Recovery affordance clarity: users were told to use Cmd/Ctrl+Z for thread restore -> UI now consistently points to explicit `Restore Delete`.

### Verification
- Frontend targeted Vitest set: 50 passed.
- Backend targeted pytest set: 9 passed.
- Playwright targeted checks (`project-ai-chat-hydration-provenance.spec.ts`, `project-ai-chat-restore.spec.ts`): 4 passed.
- CDP visual verification: `Restore Delete` visible in Project AI chat threads panel and no `Cmd/Ctrl+Z` recovery text present.

## 2026-02-25 21:46:46 PST

### Consolidated Findings
- Managed and scriptable section chat context badges still fell back to frontend token/window estimates when backend telemetry was missing/partial.
- Stop outcome for managed chat could derive `stoppedMessageId` from merged history and re-mark historical assistant messages.
- Provider dictation pipeline uploaded one-shot PCM and forwarded source sample rates directly, violating realtime 24kHz/chunk transport contracts.
- Transcription router error-code mapping still depended on `KeyError` message text.
- Codex MCP parsing silently dropped invalid IDs/non-object entries without diagnostics.
- Runtime Codex settings bootstrap stored import migration marker only in session output instead of canonical config.

### Implemented Fixes (No Backward Compatibility Layer)
- Added shared authoritative context telemetry resolver and removed section-chat estimate fallbacks; missing/partial backend telemetry now renders explicit unavailable state.
- Made stop message resolution run-scoped to assistant messages produced by active run outputs only; frontend stop reconciliation now ignores backend IDs when no local stop-eligible assistant exists.
- Reworked provider dictation flow to transport-aware chunked append with realtime resampling to 24kHz mono PCM16 and payload-bounded chunk sizing.
- Introduced typed transcription missing-resource exceptions and routed error codes by exception type (`profile_not_found`, `session_not_found`) with no message parsing.
- Hardened Codex MCP parser to explicitly reject/log invalid IDs and non-object entries; removed silent-drop paths.
- Persisted Codex bootstrap migration state to canonical config before writing runtime session overlays, and fail fast if canonical persistence cannot complete.

### UX/DX Before -> After
- Context badge trust: estimated-looking numbers shown without backend telemetry -> explicit authoritative values or `CONTEXT UNAVAILABLE`.
- Stop labeling: immediate stop could mark old replies interrupted -> interruption labels stay bound to active run messages only.
- Provider dictation reliability: realtime mode could fail from sample-rate mismatch; long recordings hit one-shot payload limits -> deterministic realtime/file transport behavior with chunked uploads.
- Error-code stability: copy edits could change API error classification -> stable type-driven contract.
- MCP import diagnosability: invalid servers vanished silently -> explicit warning reasons per rejected server.
- Codex bootstrap durability: removed imported servers could reappear on later runtime sessions -> canonical migration marker preserves user intent across sessions.

### Verification
- Backend targeted pytest set (`tests/routers/test_ai_agent_run_chats.py -k "stop_llm_chat or transcription"`): 15 passed.
- Backend targeted pytest set (`tests/agentic/test_external_agent_settings.py -k "codex"`): 10 passed.
- Backend targeted pytest set (`tests/agentic/test_external_agent_runner.py -k "codex_home_config_is_written or codex_runtime_home_respects_canonical_bootstrap_marker"`): 2 passed.
- Backend targeted pytest set (`tests/llm/test_config.py -k "codex"`): 6 passed.
- Frontend targeted Vitest set: 53 passed.
- Playwright targeted checks (`chat-composer-controls.spec.ts`, context badge scenarios): 3 passed.
- CDP visual verification: project chat composer renders `CONTEXT UNAVAILABLE` for missing telemetry.

## 2026-02-25 22:45:31 PST

### Consolidated Findings
- Managed LLM API-key store corruption could break preflight/startup/watch flows and make repair difficult.
- Codex MCP config loading and parsing still allowed ambiguous fallback/coercion paths under invalid config shapes.
- External stop semantics and project-chat hydration retries could leave interruption state inconsistent and retry loops unbounded.
- Context telemetry and composer submit contracts still had ambiguity when authoritative backend data/contracts were missing.

### Implemented Fixes (No Backward Compatibility Layer)
- Added managed-key typed read status with explicit corruption reporting, made key writes canonical authoritative overwrites, and aligned frontend settings writes to full-key payloads.
- Hardened Codex MCP loading/parsing with authoritative `CODEX_HOME` behavior, strict snake/camel table conflict handling, and strict nested args/env/encoding validation.
- Reworked stop/hydration behavior to rely on confirmed backend cancellation outcomes, added typed hydration outcomes (`success`, `transient_failure`, `terminal_failure`), and bounded retries with capped exponential backoff.
- Switched context usage resolution to persisted run payloads only and tightened `ChatInput` `onSubmit` to strict boolean semantics.

### UX/DX Before -> After
- Managed API key handling: corrupt store could cascade into unrelated failures -> corruption is isolated and explicitly actionable while repair/save remains available.
- Codex MCP ingest: invalid or conflicting config shapes could degrade silently -> invalid shapes are rejected deterministically with explicit failure behavior.
- Stop/hydration: interruption markers and retries could diverge from backend truth -> interruption state now follows confirmed stop outcomes and retry scheduling is bounded/terminal-aware.
- Context/composer contract: UI could imply inferred telemetry and permissive submit behavior -> telemetry is authoritative-only and submit contract is explicit.

### Verification
- `pnpm gcf` (run from `frontend/`): completed successfully.
- Frontend targeted Vitest set: 83 passed.
- Backend targeted pytest set: 122 passed.
- Playwright targeted checks (`project-ai-chat-hydration-provenance.spec.ts`): 4 passed.
- CDP visual verification: Project AI chat pane and settings dialog rendered correctly with no console errors.
