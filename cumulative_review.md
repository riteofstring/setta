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

## 2026-02-25 23:15:30 PST

### Consolidated Findings
- Codex MCP import/write paths still allowed non-canonical table shape persistence and non-authoritative fallback behavior.
- Bootstrap completion markers could be written on failed/empty imports, preventing deterministic retry after source config repair.
- Managed API-key corruption handling was incomplete for malformed JSON payloads.
- Context usage telemetry parsing could raise on non-finite numbers and break chat hydration.
- Stop reconciliation could leave stale optimistic interruption markers when backend returned a successful stop without `stoppedMessageId`.

### Implemented Fixes (No Backward Compatibility Layer)
- Made `CODEX_HOME` authoritative for Codex MCP config resolution and removed fallback-to-home behavior when env is set.
- Canonicalized Codex settings persistence to `mcp_servers` and removed dual-key persistence paths.
- Gated Codex bootstrap marker writes on successful non-Setta import presence and preserved retryability after failed reads/parses.
- Centralized managed API-key parse handling in typed status reads and mapped malformed JSON/empty payload to explicit corrupt status.
- Hardened context usage parsing to ignore non-finite numeric values (`NaN`, `Inf`, `-Inf`) without raising.
- Reconciled stop interruption state to restore optimistic snapshot when backend omits `stoppedMessageId` on successful stop.

### UX/DX Before -> After
- Codex config resolution: env-scoped runs could still import from fallback home -> env-scoped resolution is deterministic to one root.
- Codex config persistence: repeated writes could introduce snake/camel MCP table conflicts -> writes are idempotent and canonical.
- Bootstrap migration: transient source parse errors could permanently suppress import -> fixed source now re-imports automatically.
- API key corruption path: malformed managed-key JSON could throw through startup/preflight/watchers -> corruption is explicit and recoverable through normal save flow.
- Chat telemetry: malformed/non-finite usage fields could produce hydration failures -> telemetry degrades to unavailable/partial without breaking chat load.
- Stop badge consistency: successful stop without message id could keep stale interruption labels -> interruption labels now match backend-confirmed outcome semantics.

### Verification
- `pnpm -C frontend gcf`: completed successfully.
- Backend targeted pytest set: `137 passed` (`tests/llm/test_api_keys.py`, `tests/llm/test_config.py`, `tests/agentic/test_external_agent_settings.py`, `tests/agentic/test_external_agent_preflight.py`, `tests/agentic/test_context_usage.py`, `tests/routers/test_ai_agent_run_chats.py`, `tests/routers/test_llm_api_key_routes.py`).
- Additional backend reruns after API-key empty-payload hardening: `14 passed` and `24 passed`.
- Frontend targeted Vitest: `20 passed` (`src/state/actions/aiStopProjectChat.test.ts`).
- Playwright targeted regression: `1 passed` (`frontend/tests/e2e/chat/chat-stop-reconciliation.spec.ts`).
- CDP visual verification: stop-response reconciliation confirmed in Project AI chat with backend response `{ alreadyStopped: false, stoppedMessageId: null }`.

## 2026-02-26 00:20:10 PST

### Consolidated Findings
- Managed API-key writes were full-snapshot and non-linearizable across concurrent editors, with inconsistent corruption behavior across route/watcher/runtime paths.
- MCP runtime health identity collapsed on `serverId` only, allowing Setta and external statuses to overwrite each other when IDs matched.
- Codex MCP header aliases (`headers` vs `http_headers`) accepted conflicting values with silent precedence.
- Context telemetry coercion accepted/truncated non-integer values into plausible token counts.
- Git decoration fallback could replace valid decorations with partial data when fallback ref scans were truncated.

### Implemented Fixes (No Backward Compatibility Layer)
- Introduced strict revisioned managed-key store contract (`{ revision, apiKeys }`) with CAS writes (`expectedRevision`) and typed `409` errors for revision conflict/corruption.
- Unified managed-key runtime sync into one fail-closed path for watchers: corruption now applies empty runtime keys and broadcasts empty snapshots deterministically.
- Updated frontend API-key persistence to serialized mutation queue with `409` conflict refresh/retry and explicit corruption handling.
- Promoted MCP runtime status identity to `(source, serverId)` throughout runtime map creation and status resolution/rendering.
- Added hard conflict rejection for Codex MCP `headers`/`http_headers` alias mismatches; equal aliases canonicalize cleanly.
- Tightened backend/frontend context telemetry parsing to accept only finite non-negative integers.
- Hardened git decoration fallback to avoid partial-overwrite regressions under truncated fallback output.
- Regenerated endpoint/type bindings and updated frontend callers/tests to the new managed-key contract.

### UX/DX Before -> After
- API-key saves: out-of-order writes could silently drop unrelated keys -> stale saves now fail explicitly (`409`) and frontend retries from authoritative snapshot.
- Corruption handling: route/watcher/runtime could diverge -> one fail-closed behavior across all consumers with actionable typed errors.
- MCP diagnostics: duplicate IDs across sources could show wrong status chips -> each source/server pair now resolves independently.
- Config debugging: conflicting header aliases were silently accepted -> conflicts fail fast with deterministic remediation.
- Context trust: malformed telemetry could look valid (e.g., coerced to `0`) -> invalid telemetry is unavailable instead of fabricated.
- Git refs display: decorations could disappear intermittently on large refs -> fallback preserves existing decorations unless complete valid fallback data is available.

### Verification
- `pnpm -C frontend gcf`: completed successfully.
- Backend targeted pytest: `120 passed` (`tests/llm/test_api_keys.py`, `tests/routers/test_llm_api_key_routes.py`, `tests/llm/test_config.py`, `tests/agentic/test_context_usage.py`, `tests/routers/test_git_routes.py`, `tests/routers/test_share_policy_routes.py`).
- Frontend targeted Vitest: `31 passed` (`aiSaveLLMApiKeys`, `aiResourceLoadGuards`, `contextTelemetry`, `projectChatSkillsMcpViewerUtils`, `llmConfigUtils`).
- Playwright targeted e2e: `31 passed` (project-ai settings/MCP viewer + related app-config/misc specs).
- CDP visual verification: Project AI settings and Skills/MCP viewer exercised; runtime crash path in `buildLLMConfigGroups` no longer reproduces.

## 2026-02-26 09:23:46 PST

### Consolidated Findings
- Managed API-key websocket updates were values-only, dropping revision/corruption metadata and causing avoidable conflict churn.
- External-agent preflight/runtime credential resolution still treated `.env` as an active fallback source after managed-key migration.
- Selected-thread chat provenance could hydrate into ambiguous execution state instead of hard-blocking on missing/mismatched provenance.
- Project AI panes used direct `localStorage` calls without a shared fail-open adapter.
- Managed key read-path canonicalization accepted whitespace-only values, diverging from write-path normalization.

### Implemented Fixes (No Backward Compatibility Layer)
- Promoted websocket API-key updates to a typed revisioned snapshot contract (`apiKeys`, `revision`, `corrupt`, `errorCode`, `message`) and unified runtime push/pull reducers on that snapshot shape.
- Removed `.env` fallback from external-agent env assembly and preflight; credential presence now comes from process env + managed keys only, with whitespace-aware normalization.
- Added typed chat hydration terminal error codes (`engine_config_missing`, `engine_type_mismatch`, `llm_config_missing`) and enforced deterministic Project AI blocked-mode UX for selected blocked threads.
- Added a shared `safeLocalStorage` fail-open adapter and migrated Project AI local persistence callsites to it.
- Aligned managed key normalization across read/write pathways and rejected whitespace-only secrets as corrupt/missing where applicable (including transcription API-key resolution).
- Regenerated generated endpoint/type artifacts and updated frontend websocket/hydration consumers to the new contracts.

### UX/DX Before -> After
- API-key sync semantics: values-only websocket updates could leave stale revisions and hidden corruption state -> realtime updates now stay revision/corruption-aware and deterministic.
- Secret source-of-truth: clearing managed keys could still leave stale `.env` credentials active -> clearing managed keys now deterministically affects runtime/preflight behavior.
- Thread continuation safety: selected historical threads could proceed without explicit provenance guarantees -> blocked threads now surface explicit reasons and disable send controls.
- Storage resilience: localStorage restrictions could break Project AI render/effects -> persistence degrades to in-memory fallback without crashing the pane.
- Invalid secret material: whitespace-only key values could appear present and fail later -> invalid key material now fails fast with explicit missing/corrupt semantics.

### Verification
- `pnpm -C frontend gcf`: completed successfully.
- Backend targeted pytest: `29 passed` (`tests/llm/test_api_keys.py`, `tests/llm/test_api_key_runtime_sync.py`, `tests/llm/test_transcription_sessions.py`, targeted external-agent env tests, targeted typed hydration route tests).
- Frontend targeted Vitest: `77 passed` (`safeLocalStorage`, API-key websocket/snapshot reducers, hydration outcome typing, project-chat blocked-mode helpers).
- Playwright targeted e2e: `5 passed` (`frontend/tests/e2e/overview/project-ai/project-ai-chat-hydration-provenance.spec.ts`).
- CDP visual verification: blocked-thread banner and disabled composer/send controls confirmed in Project AI chat.

## 2026-02-26 10:24:46 PST

### Consolidated Findings
- Repository cleanup/generation needed to be rerun from workspace package context (`frontend/`) for this worktree.
- Consolidated review history is maintained in `cumulative_review.md`; top-level `review*.md` files are transient inputs and should be removed after consolidation.

### Implemented Fixes (No Backward Compatibility Layer)
- Ran `pnpm -C frontend gcf` to regenerate, prune, and format generated/frontend/backend artifacts.
- Appended this cumulative review entry as the canonical top-level review record.
- Removed top-level review docs (`review1.md`, `review2.md`, `review3.md`) from the workspace.

### UX/DX Before -> After
- Review records: multiple transient top-level review files -> single cumulative audit trail in `cumulative_review.md`.
- Cleanup workflow: stale generated/pruned state risk -> synchronized generated outputs and formatting after `gcf`.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).

## 2026-02-26 11:25:39 PST

### Consolidated Findings
- Project chat thread compatibility could be evaluated before chat provenance was authoritative, producing premature blocked states.
- Provider dictation availability could be derived from non-authoritative API key snapshots.
- Managed API-key unavailable/corrupt handling did not keep authoritative state aligned across load, snapshot, and save paths.
- Codex trusted-project TOML serialization could alter project keys through quoting normalization.
- Missing external-agent run chat hydration returned an untyped 404 detail.

### Implemented Fixes (No Backward Compatibility Layer)
- Added authoritative `chatProvenanceByChatId` store state derived from agent runs and used authoritative gating in selected-thread compatibility checks.
- Synced chat provenance immediately after submit/edit chat creation and triggered run refresh to keep thread visibility deterministic.
- Required authoritative API-key snapshots when resolving provider dictation availability in both Project AI and managed chat surfaces.
- Unified managed API-key unavailable/corrupt state handling around deterministic key clearing and explicit `apiKeysAuthoritative` transitions.
- Refactored `safeLocalStorage` to a deterministic namespace overlay adapter model for read-after-write/remove behavior when persistence throws.
- Removed Codex trusted-project key quoting heuristics and added strict TOML round-trip key validation.
- Standardized missing external-agent chat hydration to typed `chat_not_found` route errors.
- Added/updated backend, Vitest, and Playwright coverage for these paths.

### UX/DX Before -> After
- Thread compatibility: selected threads could be blocked while provenance was still loading -> compatibility remains unknown until authoritative provenance is available.
- Dictation controls: availability could appear valid from stale key snapshots -> availability now requires authoritative key state.
- Key-store failure semantics: unavailable/corrupt paths could leave stale state -> state now converges deterministically across load/save/realtime updates.
- External-agent config generation: trusted project keys could drift on serialization -> keys now round-trip exactly with validation.
- Chat hydration handling: missing runs returned generic 404 detail -> typed not-found errors provide deterministic frontend handling.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- Targeted Vitest suite: passed (`72 passed`).
- Targeted backend pytest: passed.
- Targeted Playwright e2e scenarios for project chat hydration/provenance: passed.

## 2026-02-26 21:36:20 PST

### Consolidated Findings
- Selected-thread hydration could still proceed before authoritative provenance metadata settled, and stale hydration cache decisions could persist across metadata changes.
- Hydration merge behavior could retain local-only ghost messages after backend snapshots when streaming was no longer active.
- Skills/MCP activity detection relied on prompt token heuristics (`$Skill`) instead of structured invocation metadata.
- Managed API-key write route used a route-local runtime update path instead of the canonical sync-and-broadcast mechanism.

### Implemented Fixes (No Backward Compatibility Layer)
- Enforced authoritative selected-thread provenance gating in Project AI hydration, removed selected-thread fallback execution resolution while provenance is unknown, and introduced metadata-revision-driven hydration cache invalidation/trim behavior.
- Added backend-authoritative hydration reconciliation to replace local message state on hydrate when stream overlays are inactive, while preserving local-only overlays only for active streams.
- Removed prompt-token skill heuristics and derived skill activity from structured tool metadata only, including explicit `Unknown` activity states when metadata is unavailable.
- Updated `route_set_llm_api_keys` to use canonical managed-key runtime sync/broadcast immediately after successful writes and event logging.
- Added/updated targeted backend pytest, frontend Vitest (unit/integration/perf), and Playwright e2e coverage for provenance gating, hydration reconciliation, skills activity derivation, and API-key snapshot propagation.

### UX/DX Before -> After
- Thread hydration authority: selected historical threads could hydrate from ambiguous state -> hydration now waits for authoritative provenance and reevaluates cleanly on metadata revision changes.
- Transcript consistency: stale local-only assistant artifacts could survive hydrate -> backend snapshots now deterministically replace inactive-stream state.
- Skill visibility trust: prompt text could imply false skill activity -> skill indicators now reflect actual structured tool activity or explicit unknown state.
- API-key propagation path: runtime updates were split between route-local and canonical sync flows -> one canonical sync+broadcast path now drives runtime and websocket snapshots.

### Verification
- `pnpm gcf` equivalent run in package context (`source activate.sh && cd frontend && pnpm gcf`): completed successfully (`exit 0`).
- Frontend targeted Vitest suites for updated hydration/merge/skills paths: passed.
- Backend targeted pytest (`tests/routers/test_llm_api_key_routes.py`): passed.
- Targeted Playwright e2e for Project AI hydration provenance and skills viewer paths: passed.
- CDP visual verification: Project AI settings and Skills/MCP viewer flows validated.

## 2026-02-26 22:26:38 PST

### Consolidated Findings
- Cleanup and generation for this worktree must run from `frontend/` package context.
- Top-level `review*.md` files are transient reviewer inputs and should be removed after consolidating into `cumulative_review.md`.

### Implemented Fixes (No Backward Compatibility Layer)
- Ran `source activate.sh && cd frontend && pnpm gcf` to regenerate/prune/format artifacts.
- Appended this timestamped cumulative entry as the canonical consolidated review record.
- Removed top-level review docs (`review1.md`, `review2.md`, `review3.md`) from the workspace.

### UX/DX Before -> After
- Review workflow: separate transient top-level review docs -> single cumulative review ledger.
- Cleanup state: possible stale generated/pruned artifacts -> refreshed, synchronized generated and formatted outputs after `gcf`.

### Verification
- `source activate.sh && cd frontend && pnpm gcf`: completed successfully (`exit 0`).

## 2026-02-27 08:29:30 PST

### Consolidated Findings
- Project AI chat hydration/execution settings still had split authority across parallel flags and fallback branches, creating repeated patch points.
- Managed API-key unavailable/corrupt handling remained duplicated across frontend save/load/update paths.
- Codex MCP table canonicalization existed in multiple backend paths and could drift.
- The `pnpm gcf` wrapper script uses `/dev/fd` process substitution, which is blocked by this sandbox.

### Implemented Fixes (No Backward Compatibility Layer)
- Added the execution plan at `docs/plans/fault-line-contract-consolidation-plan.md` and implemented the listed consolidation work.
- Introduced `projectChatHydrationAuthority.ts` and rewired `ProjectChat` + `ProjectChatCore` to consume one hydration authority contract instead of parallel booleans.
- Unified managed API-key unavailable/corrupt mapping in frontend AI actions and reused that path from save-related flows.
- Centralized Codex MCP canonicalization in `backend/setta/mcp/codex_config.py` and reused it from external-agent settings.
- Added/updated targeted Vitest, backend pytest, and Playwright coverage for hydration provenance and stale-thread behavior.
- Ran the `pnpm gcf` equivalent sequence with env activation (`pnpm generate`, `pnpm full-cleanup`, `pnpm f`) and captured output in `gcf.log`.
- Removed top-level `review*.md` files (no files matched in this worktree).

### UX/DX Before -> After
- Hydration authority: fragmented per-flag branching -> one typed authority object with deterministic precedence.
- API-key failure handling: repeated callsite-specific branches -> one explicit corruption/unavailable pathway.
- Codex config normalization: duplicated canonicalization behavior -> single source-of-truth helper.
- Cleanup execution under sandbox: wrapper failure on `/dev/fd` -> equivalent deterministic cleanup flow executed successfully.

### Verification
- `source activate.sh && cd frontend && (pnpm generate && pnpm full-cleanup && pnpm f)`: completed successfully (`exit 0`), output captured to `gcf.log`.
- Targeted frontend Vitest suite from this consolidation set: passed (`65 passed`).
- Targeted backend pytest sets: passed (`16 passed`, `14 passed`).
- Targeted Playwright provenance suite: passed (`12 passed`).
- CDP visual verification: Project AI pane/chat/settings flow checked after hydration-authority consolidation with no visual regression observed.

## 2026-02-27 09:29:11 PST

### Consolidated Findings
- Managed API-key store reads could surface untyped decode failures and break route/runtime sync guarantees.
- External-agent preflight availability could be blocked by managed-store unavailability even when required process env vars were already present.
- Persisted AI store retained a legacy `viewHistory` hydration path alongside canonical `viewThreads`.
- Dead paths remained in backend/frontend (`iter_codex_config_paths`, `apply_api_key_updates`, chat heuristic modules no longer used by runtime).

### Implemented Fixes (No Backward Compatibility Layer)
- Hardened managed API-key read/write flows to map invalid UTF-8 and malformed payloads to typed corrupt/unavailable contracts, while preserving explicit repair-on-save semantics for `expectedRevision=0`.
- Updated external-agent preflight issue handling so managed-store-unavailable diagnostics are non-blocking when env requirements are already satisfied and blocking only when unresolved vars remain.
- Removed legacy `viewHistory` hydration shim and kept canonical `viewThreads` persistence behavior only.
- Removed dead code paths: backend helpers and unused frontend heuristic modules/tests.
- Ran `pnpm -C frontend gcf` successfully to regenerate/prune/format after changes.

### UX/DX Before -> After
- Managed key failures: potential decode exception/500 surfaces -> deterministic typed corruption/unavailable outcomes.
- Preflight availability: false-negative unavailable states with valid process env -> availability now matches runtime executability.
- Persisted thread visibility: dual-key hydration ambiguity -> single canonical key behavior.
- Maintenance surface: unused heuristic/dead helper drift risk -> reduced active code surface and clearer ownership.

### Verification
- Backend pytest (targeted suites): passed (`64 passed`).
- Frontend Vitest (targeted suites): passed (`8 passed` + `5 passed`).
- Playwright targeted e2e (`project ai ignores legacy viewHistory in persisted ai store`): passed (`1 passed`).
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- CDP visual check: completed (validated canonical `setta_ai_data` persistence behavior after project load).

## 2026-02-27 09:49:25 PST

### Consolidated Findings
- Codex MCP parsing still accepted non-string scalar fields by coercing or defaulting values instead of rejecting malformed typed input.
- External-agent preflight availability still diverged from runtime executability for managed key-store corruption cases.
- Managed API-key persistence still exposed a parallel non-CAS write contract.
- Frontend dictation code retained an orphan session-handler implementation that was not used at runtime.

### Implemented Fixes (No Backward Compatibility Layer)
- Enforced strict scalar typing for Codex MCP server fields (`transport`, `command`, `url`, `cwd`, `encoding`) and skipped invalid servers with explicit parse warnings.
- Unified managed-store issue gating in external-agent preflight so corruption/unavailable diagnostics remain visible but only block availability when required env vars are unresolved.
- Removed legacy `write_managed_api_keys` and kept CAS-only writes via `write_managed_api_keys_with_expected_revision`.
- Removed dead frontend hook implementation from `useProviderTranscriptionSessionHandlers.ts` while preserving active helper behavior.
- Added/updated regression tests for strict Codex scalar rejection, Codex bootstrap marker behavior with invalid-only imports, preflight corruption/env parity, and API-key writer contract removal.

### UX/DX Before -> After
- MCP config validation: malformed scalar input could silently mutate behavior -> malformed scalar input is rejected deterministically with field-specific diagnostics.
- External-agent readiness: engines could be flagged unavailable even when runtime env satisfied requirements -> preflight availability now tracks actual executability while still surfacing managed-store warnings.
- Managed key writes: multiple write contracts with different conflict behavior -> single CAS contract with deterministic revision semantics.
- Dictation maintenance: misleading dead alternate path -> single authoritative runtime path and reduced maintenance surface.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- Backend targeted pytest: `117 passed` (`tests/llm/test_config.py`, `tests/agentic/test_external_agent_preflight.py`, `tests/agentic/test_external_agent_settings.py`, `tests/llm/test_api_keys.py`, `tests/routers/test_llm_api_key_routes.py`).
- Backend targeted env parity pytest: `5 passed` (`tests/agentic/test_external_agent_runner.py -k env`).
- Frontend targeted Vitest: `2 passed` (`useProviderTranscriptionSessionHandlers.test.ts`).
- CDP visual check: done (validated app page load and console-clean state at `/home`).

## 2026-02-27 10:20:30 PST

### Consolidated Findings
- Canonical Codex MCP server ID normalization still allowed silent overwrite on collisions (`"foo"` vs `" foo "`), violating deterministic import invariants.
- Frontend transcription refactor residue remained (`useProviderTranscriptionSessionHandlers.ts` and its orphan test-only call path).
- Transcription error module included an unused exported type alias (`TranscriptionErrorCode`) and lacked active-path assertions for null append/stop deltas in provider dictation flow.

### Implemented Fixes (No Backward Compatibility Layer)
- Updated Codex MCP parsing to detect canonical-ID collisions after normalization, skip all colliding entries for that canonical ID, and emit explicit collision warnings with canonical/raw IDs.
- Added backend regression coverage for collision fail-closed behavior in LLM bootstrap and external-agent Codex settings bootstrap.
- Removed orphan frontend transcription session helper module and its isolated test.
- Removed the unused `TranscriptionErrorCode` alias from frontend transcription error contracts.
- Added active-runtime transcription unit coverage to assert `ProviderTranscriptionError` on null append and null stop deltas.
- Added Playwright coverage for chat-section dictation behavior when provider transcription stop returns a null delta (auto mode stays on browser fallback path).
- Ran `pnpm -C frontend gcf` from package context and kept the resulting repo state synchronized.

### UX/DX Before -> After
- MCP imports: ambiguous server IDs could silently pick a winner -> colliding canonical IDs are rejected deterministically with actionable logs.
- Transcription code ownership: orphan helper implied a live runtime path -> only active dictation/transcription paths remain.
- Error contract clarity: unused alias and partial runtime assertions -> tighter transcription error surface with active-flow guard coverage.
- Dictation fallback confidence: null-stop edge case behavior was implicit -> explicit e2e guardrail on browser fallback continuity in auto mode.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- Backend targeted pytest: `58 passed` (`tests/llm/test_config.py`, `tests/agentic/test_external_agent_settings.py`).
- Frontend targeted Vitest: `23 passed` (`src/state/actions/aiTranscribeChatAudio.test.ts`, `src/utils/transcriptionErrors.test.ts`, `src/components/Chat/dictationPolicy.test.ts`).
- Targeted Playwright e2e: `1 passed` (`frontend/tests/e2e/chat/chat-dictation-fallback.spec.ts`, grep: `chat section falls back to browser dictation when provider transcription stop returns no delta`).

## 2026-02-27 11:02:43 PST

### Consolidated Findings
- Managed API-key CAS write paths could still leak untyped filesystem failures during save/repair writes.
- MCP runtime status route and setta-home route exposed different `activeSettaFilesLocation` semantics for custom `setta_files` roots.
- Frontend Skills/MCP utilities retained legacy runtime-status parser code paths that were no longer used at runtime.
- Skills/MCP local storage hydration still accepted a legacy array-shaped payload for agent-native slash commands.

### Implemented Fixes (No Backward Compatibility Layer)
- Hardened managed API-key write-path error mapping to return typed `store_unavailable` outcomes for all write branches.
- Unified backend `activeSettaFilesLocation` normalization (`None -> "custom"`) and reused it across both status endpoints.
- Removed legacy MCP runtime-status parser functions and kept typed runtime mapper resolution as the only active path.
- Removed legacy array-shape slash-command hydration fallback and kept canonical object-shape hydration only.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for these behaviors.
- Ran cleanup/generation via package-context `pnpm -C frontend gcf`.

### UX/DX Before -> After
- API-key save failures: generic/untyped write-path failures possible -> deterministic typed unavailable contract across read/write/repair paths.
- Custom root labeling: route-dependent semantics -> consistent "custom" provenance across status endpoints and MCP viewer labels.
- Runtime status parsing: dead compatibility path in production module -> single typed runtime ingestion path aligned with runtime behavior.
- Slash command hydration: dual storage semantics -> one canonical persisted shape with clearer failure/debug behavior.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- Backend targeted pytest: `37 passed` (`tests/llm/test_api_keys.py`, `tests/routers/test_llm_api_key_routes.py`, `tests/routers/test_mcp_server_runtime_status_route.py`).
- Frontend targeted Vitest: `21 passed` (`projectChatSkillsMcpViewerUtils.test.ts`, `projectChatSkillsMcpViewerUtils.perf.test.ts`, `ProjectChatSkillsMcpViewer.test.ts`).
- Targeted Playwright e2e: `14 passed` (`frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts`).
- CDP visual check: done (Skills/MCP viewer rendered `ACTIVE CUSTOM SETTA_FILES ROOT` under runtime-status custom location payload).

## 2026-02-27 11:49:04 PST

### Consolidated Findings
- Top-level `review*.md` files were temporary reviewer inputs and should not remain in the repository after consolidation.
- Final repo hygiene checkpoint was needed before commit to keep generated/cleanup outputs in sync.

### Implemented Fixes (No Backward Compatibility Layer)
- Ran `pnpm -C frontend gcf` to execute generation, cleanup, and formatting workflows from the package context.
- Appended this cumulative record entry with a timestamped heading.
- Removed all top-level `review*.md` files from the worktree.

### UX/DX Before -> After
- Review artifact handling: temporary review files persisted at repo root -> review outcomes now preserved only in `cumulative_review.md`.
- Finalization flow: cleanup status implicit before commit -> explicit `gcf` checkpoint recorded in cumulative history.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- `find . -maxdepth 1 -type f -name 'review*.md'`: no matches after cleanup.

## 2026-02-27 13:32:17 -0800

### Consolidated Findings
- Session-scoped Codex config persistence was gated on bootstrap/canonicalization flags, so canonical config creation varied by host `CODEX_HOME` content.
- `test_codex_home_config_is_written` could fail on hosts without bootstrapable Codex MCP servers because canonical config was not always written.

### Implemented Fixes (No Backward Compatibility Layer)
- Updated `build_codex_settings_file` to always persist canonical managed Codex config when generating runtime session output for non-explicit settings modes.
- Updated Codex runner integration tests to explicitly seed `CODEX_HOME` for the bootstrap-positive contract and assert imported server persistence.
- Added empty-bootstrap deterministic coverage (`CODEX_HOME` unset + isolated `HOME`) in both runner and settings test suites to assert canonical config creation without import marker.
- Ran `pnpm -C frontend gcf` and kept resulting generated/cleanup formatting outputs synchronized.

### UX/DX Before -> After
- Managed Codex runtime sessions: canonical config file could appear/disappear by machine state -> canonical config is always present for managed runtime sessions.
- Test determinism: host `~/.codex` state could influence pass/fail outcomes -> tests now fully control bootstrap source and are host-independent.
- Persistence debugging: conditional canonical writes obscured expected artifact layout -> deterministic canonical/runtime split with explicit marker semantics.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- Backend focused pytest: `3 passed` (`tests/agentic/test_external_agent_runner.py -k "codex_home_config_is_written or codex_runtime_config_persists_canonical_config_without_bootstrap_source or codex_runtime_home_respects_canonical_bootstrap_marker"`).
- Backend module pytest: `119 passed` (`tests/agentic/test_external_agent_settings.py tests/agentic/test_external_agent_runner.py`).
- Backend broader regression subset: `207 passed` (`tests/llm/test_api_keys.py tests/routers/test_llm_api_key_routes.py tests/agentic/test_external_agent_preflight.py tests/agentic/test_external_agent_runner.py tests/mcp/test_base_tools.py tests/routers/test_git_routes.py`).
- Ruff targeted check: passed for touched Python files.

## 2026-02-27 13:58:47 PST

### Consolidated Findings
- `CODEX_HOME` authority was not fail-closed for empty/whitespace env values; loader could still import MCP servers from `~/.codex/config.toml`.
- Runtime Codex session setup could persist canonical config in read-only/no-edit modes, violating settings edit authority and risking startup failures on non-writable canonical files.

### Implemented Fixes (No Backward Compatibility Layer)
- Updated Codex MCP config loading to treat presence of `CODEX_HOME` as authoritative: empty/whitespace values now fail closed (`{}`) and never trigger fallback-home import.
- Unified runtime canonical-persistence authority with managed settings edit authority in `build_codex_settings_file`; canonical writes are now skipped when edits are disallowed.
- Added backend unit/integration regression coverage for:
  - empty/whitespace `CODEX_HOME` fail-closed behavior,
  - runtime no-edit canonical byte immutability,
  - runner-level empty-`CODEX_HOME` no-fallback behavior,
  - runner-level read-only/no-edit startup success with non-writable canonical config.
- Ran `pnpm -C frontend gcf` to keep generated/cleanup outputs synchronized.

### UX/DX Before -> After
- `CODEX_HOME` intent: empty env could silently resurrect home MCP servers -> env-key presence now deterministically controls source selection and fails closed when invalid.
- Read-only/no-edit runtime contract: canonical files could be mutated or block startup on write errors -> canonical files remain untouched and runtime sessions are generated from session output safely.
- Debuggability: mixed write-authority paths for runtime bootstrap -> single authority gate for canonical write behavior.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- `source activate.sh && ruff check backend/setta/mcp/codex_config.py backend/setta/agentic/external_agent_settings.py tests/llm/test_config.py tests/agentic/test_external_agent_settings.py tests/agentic/test_external_agent_runner.py`: passed.
- `source activate.sh && pytest tests/llm/test_config.py tests/agentic/test_external_agent_settings.py tests/agentic/test_external_agent_runner.py -q`: `160 passed`.

## 2026-02-27 14:19:27 PST

### Consolidated Findings
- Managed-local/no-edit Codex runtime could still create canonical config on first run when canonical config was absent, because canonical write authority depended on file existence.
- API key test write-failure stubs used unused varargs and failed strict Ruff `ARG001` checks.

### Implemented Fixes (No Backward Compatibility Layer)
- Split Codex settings authority in `build_codex_settings_file` into:
  - runtime payload mutation authority, and
  - canonical persistence authority.
- Added `_allow_canonical_settings_persistence` as a pure policy gate for canonical writes (managed modes + `settingsAllowSettaEdits=true` only).
- Added backend regression coverage for no-edit managed-local runtime with missing canonical config:
  - unit coverage in `tests/agentic/test_external_agent_settings.py`,
  - integration coverage in `tests/agentic/test_external_agent_runner.py`.
- Updated API key test failure stubs to typed underscore-prefixed varargs (`*_args: object, **_kwargs: object`) to satisfy strict linting.
- Ran `pnpm -C frontend gcf` and kept the repository state synchronized.

### UX/DX Before -> After
- No-edit managed-local runtime: first run could silently create canonical Codex config depending on filesystem state -> canonical config remains absent while runtime session config is still generated.
- Write-authority behavior: mixed policy + file-existence gate -> explicit policy-only gate for canonical persistence.
- Test hygiene: strict Ruff checks reported `ARG001` in touched API key tests -> strict Ruff checks pass cleanly for those tests.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- `source activate.sh && ruff check backend/setta/agentic/external_agent_settings.py tests/agentic/test_external_agent_settings.py tests/agentic/test_external_agent_runner.py tests/llm/test_api_keys.py`: passed.
- `source activate.sh && pytest -q tests/agentic/test_external_agent_settings.py tests/agentic/test_external_agent_runner.py`: `125 passed`.
- `source activate.sh && pytest -q tests/llm/test_api_keys.py`: `13 passed`.

## 2026-02-27 14:43:00 PST

### Consolidated Findings
- Selected-thread hydration authority treated missing engine config as compatible when engine-config metadata was still non-authoritative, allowing premature hydrate calls.
- Existing provenance Playwright coverage still asserted the old behavior of hydrating while engine-config metadata remained non-authoritative.
- Top-level `review*.md` files were temporary review artifacts and should be removed after consolidation.

### Implemented Fixes (No Backward Compatibility Layer)
- Updated `resolveProjectChatThreadBlockedErrorCodeForSelectedChat` to return `unknown` (not `compatible`) when persisted engine config is missing and engine-config metadata is non-authoritative.
- Added frontend unit/integration coverage for:
  - non-authoritative engine-config authority -> `unknown`,
  - authoritative missing engine config -> `blocked(engine_config_missing)`,
  - cross-module hydration cache-key gating behavior while authority is unresolved.
- Added/updated Playwright provenance coverage for delayed engine-config authority and aligned stale expectation tests with the new invariant (defer hydration until authoritative metadata is ready).
- Ran `pnpm -C frontend gcf` and removed top-level temporary `review*.md` files from the worktree.

### UX/DX Before -> After
- Selected-thread hydration: metadata-loading window could trigger premature hydrate requests -> hydration now waits for authoritative engine-config resolution.
- E2E authority guardrails: one scenario encoded stale permissive behavior -> authoritative gating contract is now covered consistently.
- Repo hygiene: temporary review docs remained at root -> outcomes are preserved in cumulative history and transient review artifacts are removed.

### Verification
- `pnpm -C frontend gcf`: completed successfully (`exit 0`).
- `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/projectChatThreadVisibility.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationAuthority.integration.test.ts`: `59 passed`.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-hydration-provenance.spec.ts`: `14 passed`.

## 2026-02-27 17:42:57 PST

### Consolidated Findings
- LLM API key persistence had regressed from `.env` auto-detection behavior and required explicit managed-store writes in some flows.
- The old JSON key-store path was no longer desired; key persistence needed to be `.env`-only while retaining CAS/revision conflict handling and runtime synchronization semantics.
- Test isolation for `.env` handling was insufficient in one path and could mutate the repo-root `.env` during backend tests.

### Implemented Fixes (No Backward Compatibility Layer)
- Removed JSON-store assumptions from backend LLM key persistence and standardized managed-key persistence on `.env`.
- Added deterministic content-hash revisions for managed key snapshots to preserve optimistic concurrency conflict detection.
- Preserved unrelated `.env` entries while managing LLM key updates, and tracked managed key ownership with metadata in `.env`.
- Split key resolution paths:
  - runtime update path uses configured provider keys only,
  - API/snapshot path surfaces effective keys for settings UX.
- Updated startup/watcher/preflight/error-message paths to `.env` semantics.
- Rewrote backend tests (`tests/llm/*`, `tests/routers/test_llm_api_key_routes.py`, `tests/agentic/test_external_agent_preflight.py`) to `.env` contracts and fixed `.env` isolation to temp paths.
- Executed `gcf` workflow from `frontend` package context (`pnpm generate`, `pnpm full-cleanup`, `pnpm f`) because root `pnpm gcf` is not available without a root importer.

### UX/DX Before -> After
- API key sourcing: inconsistent with `.env` expectations -> configured `.env` keys are recognized and synchronized again.
- Persistence model: split JSON + env behavior -> single `.env` source of truth with conflict-safe writes.
- Runtime key updates: mixed visibility/runtime intent -> explicit runtime-filtered application with effective snapshot reporting.
- Test reliability: potential workspace `.env` mutation -> isolated temp `.env` test behavior.

### Verification
- Backend focused tests passed:
  - `tests/llm/test_api_keys.py`
  - `tests/llm/test_api_key_runtime_sync.py`
  - `tests/routers/test_llm_api_key_routes.py`
  - `tests/agentic/test_external_agent_preflight.py`
- Ruff targeted checks passed for touched backend/test files.
- `gcf` workflow completed successfully from frontend package context.
