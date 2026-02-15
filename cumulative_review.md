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

## 2026-02-17 09:51:23 PST

### Summary
Implemented the consolidated review fixes from the top-level review docs across completion-guard behavior, dictation lifecycle/error handling, workspace-root Python prompt detection, and chat rendering performance cleanup, without adding backward-compatibility shims.

### Implemented fixes
- Completion guard now keeps create/scaffold task scope active across clarification turns and only exits on explicit non-creation task switches.
- Completion guard verification parsing now resolves pass/fail by the latest signal in text and no longer misclassifies `no errors found` as failure.
- Added backend and runner regression tests for clarification-turn scoping and pass/fail phrasing edge cases.
- Project chat workspace Python detection cache is now keyed by `rootPath` rather than a single global boolean.
- Added focused unit tests for workspace Python-signal detection and per-root cache behavior.
- `ChatInput` now catches synchronous browser dictation `start()` failures and reports controlled error feedback.
- `ChatInput` now force-stops active dictation when composer state transitions to disabled.
- `ChatMessages` now limits assistant-bubble `ResizeObserver` usage to streaming messages with reasoning cards.
- Removed unused chat message renderer variable (`isSystem`).
- Added Playwright coverage for dictation start-throw handling and disable-while-listening stop behavior.

### Test and verification status
- Backend pytest: targeted completion-guard suites passed (`tests/agentic/test_completion_guard.py`, `tests/llm/test_agent_runner.py` with `-k completion_guard`).
- Frontend Vitest: targeted suites passed (`workspacePythonSignals`, `ChatInput`, `ChatMessages`).
- Playwright: targeted e2e suites passed (`chat-dictation-fallback`, `chat-streaming-resize`).
- Ruff check on changed backend/test files passed.
- `tsc --noEmit` still reports existing repo-wide TypeScript errors outside this change set.
- CDP visual verification completed in a live session (Project AI Chat composer/control surface and starter/chat layout sanity).

## 2026-02-17 11:26:01 PST

### Summary
Implemented the latest consolidated review fixes across completion-guard scoping, external-agent execution policy defaults, slash-command handling, workspace Python detection, and endpoint codegen generalization, without adding backward-compatibility shims.

### Implemented fixes
- Completion guard no longer treats leading `how/what/why` clarification turns as non-creation task switches.
- Added backend regression coverage for clarification-question completion-gate behavior in both guard-level and runner-level tests.
- Project AI chat now defaults external engines to `config_toml_custom` and preserves explicit user-selected non-config modes.
- Added backend integration coverage ensuring external runs with `permissionMode=config_toml_custom` do not inject an `approvalPolicy` override.
- Workspace Python marker detection now correctly matches `Pipfile` via lowercase normalization.
- Workspace-root Python signal scanning now re-runs on workspace identity changes while empty-state chat is active.
- Section chat Plan badge now reflects effective runtime behavior by requiring `permissionMode=config_toml_custom` in addition to external Claude plan config.
- Removed section-chat nullish fallback shims for `permissionMode` and `searchEnabled` so state/schema issues surface at source.
- Unknown or unavailable slash commands are now intercepted locally with deterministic feedback instead of being submitted to the model.
- Playwright coverage now asserts unknown slash input does not issue `getLLMResponse` requests.
- Endpoint TS generation no longer relies on route-name hardcoding for multipart wrappers; form-data wrappers are now inferred from endpoint metadata/signature.
- Added generator unit tests for multipart, upload-by-request, and non-upload request POST generation paths.

### Test and verification status
- Backend pytest: targeted suites passed (`tests/agentic/test_completion_guard.py`, `tests/llm/test_agent_runner.py`, `tests/routers/test_ai_agent_run_chats.py`, `tests/code_gen/test_convert_endpoints.py`).
- Frontend Vitest: targeted suites passed (`workspacePythonSignals`, `projectChatExecutionSettings`, `chatAreaPlanModeBadge`, `ChatInput`).
- Playwright: targeted e2e suite passed (`chat-composer-controls`).
- Ruff check on changed backend/test files passed.
- ESLint targeted run remains blocked in this environment due missing `@eslint/js` resolution from `frontend/eslint.config.js`.
- CDP visual verification completed in live app session: unknown slash command shows local feedback and does not trigger `getLLMResponse`.
