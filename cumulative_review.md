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
