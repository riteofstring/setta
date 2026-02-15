## 2026-02-17 08:26:35 PST

### Summary
Implemented the review findings across backend and frontend, explicitly avoiding backward-compatibility shims.

### Implemented fixes
- Completion guard now avoids conversational `ready` false positives and resolves verification status newest-first.
- External agent stream chunk preparation is applied exactly once per delivered chunk path.
- Removed deprecated `skillsEnabled` surface from chat request/state/update paths and regenerated generated types/endpoints.
- Removed implicit app-generation mode inference from `appSpecStreamingEnabled` when `appGenerationMode` is unset.
- Switched `/transcribeChatAudio` from base64 JSON to multipart binary upload with payload-size limits and clearer errors.
- Added client-side dictation size guard and `FormData` upload path.
- Reduced overview polling scope to section-relevant running runs and deduped in-flight `loadAgentRuns` calls.
- Avoided unnecessary `ResizeObserver` setup for assistant messages without reasoning cards.

### Test and verification status
- Backend pytest: targeted suites passed (completion guard, external runner, AI chat routes, helper/type tests).
- Frontend Vitest: targeted suites passed (chat rendering, AI resource load guards, submit/transcribe actions, overview activity).
- Playwright: targeted e2e suites passed (`agentic-scope`, `app-config-generate-prompt`, `app-config-mcp-mode`).
- CDP visual verification completed against a live app session.

## 2026-02-17 08:55:25 PST

### Summary
Implemented the next review cycle fixes across backend and frontend, excluding backward-compatibility shims and removing top-level review docs.

### Implemented fixes
- Completion guard now scopes to the active create/scaffold task window so stale history cannot incorrectly block or unblock completion.
- Transcription now forwards the full provider request payload from `build_llm_params()` (excluding transcription-config-only keys) and applies transcription options consistently.
- MCP reconnect retry behavior now retries only read-only tools, preventing duplicate side effects for write/structural tools.
- Replaced `submitMessage` positional compatibility overload with an explicit options object API and migrated callsites.
- Project AI chat now lazily performs workspace-root Python detection only in empty state and reuses a session cache.
- Provider dictation now negotiates supported recorder MIME types, derives blob/file type correctly, and falls back to browser dictation in `auto` mode when provider setup fails.
- Removed dead/redundant code paths in AI routing and prompt composition, and removed the unused `hasRunningAgentRuns` helper.

### Test and verification status
- Backend pytest: targeted suites passed (`tests/agentic/test_completion_guard.py`, `tests/mcp/test_multi_mcp_client.py`, transcription-focused cases in `tests/routers/test_ai_agent_run_chats.py`).
- Frontend Vitest: targeted suites passed (`aiSubmitMessage`, `aiTranscribeChatAudio`, `dictation`, `aiActivity`).
- Playwright: new targeted e2e suites passed (`chat-dictation-fallback`, `project-ai-chat-root-scan`).
- Ruff on changed backend/test files passed.
- ESLint targeted run not executable in this environment due missing `@eslint/js` resolution.
- CDP visual verification completed in Project AI Chat (composer controls/mic behavior visible after changes).

## 2026-02-17 09:28:23 PST

### Summary
Implemented the latest review-cycle fixes across chat UX, dictation reliability, optimistic update correctness, and backend completion/transcription semantics, without adding backward-compatibility shims.

### Implemented fixes
- Added a shared `resolvePermissionModeArg` parser in `chatComposerControls` and reused it across section chat and project chat to remove duplicate slash-command parsing logic.
- Fixed optimistic chat section settings updates to pass `frontendOpId` so pending optimistic operations are completed correctly.
- Updated managed chat history behavior to refresh runs immediately when History opens and poll every 5 seconds while visible.
- Removed dead `ChatInput` starter-prompt props/branches (`starterPrompts`, `showPythonStarterPrompts`) from the production input component API.
- Enforced disabled-state consistency in `ChatInput` by disabling permission/search/mic controls and guarding dictation toggles when composer input is disabled.
- Hardened provider dictation cleanup so recorder/stream/chunks/source are always reset on recorder construction failure, recorder error, start failure, and unmount.
- Tightened completion guard pass detection by removing overly broad `clean` pass matching.
- Updated transcription route error mapping: missing local API-key config now returns HTTP 400, while provider/runtime failures remain HTTP 502.

### Test and verification status
- Frontend Vitest: targeted suites passed (`ChatInput`, `chatComposerControls`).
- Backend pytest: targeted suites passed (`completion_guard`, transcription route behavior in `test_ai_agent_run_chats`).
- Playwright: targeted e2e suites passed (`chat-composer-controls`, `chat-dictation-fallback`).
- CDP visual verification completed in the running app session (Project AI Chat composer/control surface).
