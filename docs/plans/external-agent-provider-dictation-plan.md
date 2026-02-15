# External-Agent Provider Dictation Plan

## Investigation Summary
- `route_transcribe_chat_audio` currently hard-rejects non-`setta_llm` engines with a 400 (`backend/setta/routers/ai.py`).
- `resolve_engine_config` only resolves `transcription_llm_config` for `setta_llm`; external engines always return `None` for transcription config (`backend/setta/agentic/engine_resolver.py`).
- Frontend provider-dictation availability is explicitly gated to managed LLM engines (`engineType === setta_llm`) in both Project Chat and Chat sections.
- Frontend currently omits the provider transcription callback for external engines (`isExternalEngine ? undefined : handleProviderDictationTranscribe`), so provider dictation cannot start even if backend were changed.
- `Transcription Config` selectors are only shown for `setta_llm` engines in settings UIs, so external engines cannot be configured for provider transcription from the current UX.

## Target State
- Provider dictation/transcription works for **any engine type** (`setta_llm` and `external_agent`) when `transcriptionLlmConfigId` resolves to a valid LLM config.
- External-agent chat can use provider transcription independently (example: Claude SDK chat + OpenAI Whisper transcription).
- Dictation mode semantics remain:
  - `auto`: prefer provider transcription when available, else browser fallback.
  - `browser`: browser only.
  - `provider`: provider only, explicit error when unavailable.
- No backward compatibility layer for managed-only transcription restrictions.

## Non-Goals
- No return to `transcriptionModel`/`transcription_*` chat-config overrides.
- No dual path that keeps managed-only and cross-engine behaviors in parallel.

## Implementation Plan

### 1) Backend: Resolve transcription config independent of chat engine type
- Update `resolve_engine_config` to resolve `transcription_llm_config` from `engine_config.transcriptionLlmConfigId` for both engine types.
- Keep chat completion resolution unchanged:
  - `setta_llm` still resolves `llm_config` from `settaLlmConfigId` (+ existing fallback behavior).
  - `external_agent` still keeps `llm_config=None` and resolves only external agent runtime config for chat execution.

### 2) Backend: Remove managed-only gate in transcription route
- In `route_transcribe_chat_audio`:
  - Remove `engineType != setta_llm` rejection.
  - Keep `resolved.transcription_llm_config` as the only transcription config source.
  - Keep explicit 400 when transcription config is missing/invalid (`transcriptionLlmConfigId` not set or unresolved).
- Keep multipart limits, API-key handling, and provider error mapping as-is.

### 3) Frontend: Unblock provider dictation for external engines
- In Project Chat and managed Chat section containers:
  - Compute provider availability from resolved transcription config presence/validity, not from `engineType`.
  - Remove managed-only unavailable copy and replace with config-driven copy.
  - Always pass provider transcription callback when an engine is selected (remove `isExternalEngine` callback suppression).

### 4) Frontend: Expose transcription config selection for external engines
- In both settings surfaces:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
- Show `Transcription Config` selector for engines that support dictation (both `setta_llm` and `external_agent`).
- Keep `LLM Config` selector scoped to `setta_llm` only.

### 5) API/Schema impact
- No new API fields required; `transcriptionLlmConfigId` already exists on `EngineConfig`.
- `/api/transcribeChatAudio` request/response shape stays unchanged.

### 6) Tests
- Backend (`tests/routers/test_ai_agent_run_chats.py`):
  - Add: external engine + valid `transcriptionLlmConfigId` succeeds and calls transcription provider.
  - Add: external engine + missing/invalid `transcriptionLlmConfigId` returns expected 400.
  - Replace/remove: current test that asserts external engines are always rejected.
- Frontend Vitest:
  - Add/update tests asserting external engines can report provider dictation availability when transcription config is valid.
  - Add/update tests for settings visibility: `Transcription Config` shown for external engines.
  - Add/update tests to ensure provider callback is wired for external engines.
  - Keep/extend dictation mode behavior tests for `auto` fallback and `provider` explicit error.
- Playwright:
  - Add a UI regression for external-engine managed chat settings showing `Transcription Config` and dictation mode behavior text/state.

### 7) Documentation updates
- Update `docs/reference/chat-sections.md` to remove the statement that provider dictation is restricted to managed LLM engines.
- Document cross-engine pattern explicitly:
  - chat engine type and transcription provider are independent.
  - example config: external Claude SDK chat + OpenAI Whisper transcription.

## Cutover Policy
- No backward compatibility and no migration shim.
- After cutover, external engines are first-class for provider transcription if and only if `transcriptionLlmConfigId` is configured and valid.
