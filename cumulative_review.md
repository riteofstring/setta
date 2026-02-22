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
