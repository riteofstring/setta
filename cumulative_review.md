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
