# Transcription/LLM Config Decoupling Plan

## Investigation Summary
- Engine configs only store one managed LLM reference today: `settaLlmConfigId` (`backend/setta/types/agentic.py`).
- Dictation upload (`/api/transcribeChatAudio`) resolves that same engine config and passes its resolved LLM config into transcription (`backend/setta/routers/ai.py`).
- Transcription currently depends on chat LLM config internals by reading `other_params` keys like `transcriptionModel` and `transcription_*` (`backend/setta/llm/transcription.py`).
- Frontend managed-chat settings expose one LLM selector that writes `settaLlmConfigId` (not a separate transcription config) (`frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`, `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`).

This confirms transcription is coupled to chat LLM config shape and provider/model selection.

## Target State
- Managed engines have two independent config references:
  - `settaLlmConfigId` for chat completions.
  - `transcriptionLlmConfigId` for audio transcription.
- `route_transcribe_chat_audio` uses `transcriptionLlmConfigId` resolution, not transcription overrides embedded in chat config.
- A user can run Claude for chat and Whisper for transcription by setting:
  - `settaLlmConfigId = claude-*`
  - `transcriptionLlmConfigId = openai-whisper-*`
- Dictation mode is explicitly selectable in UI:
  - `auto`: prefer provider transcription when configured, otherwise use browser dictation.
  - `browser`: always use browser dictation.
  - `provider` (force AI): always use provider transcription and show explicit config error when unavailable.

## Implementation Plan

### 1) Extend Engine Config Schema
- Add `transcriptionLlmConfigId: str | None = None` to:
  - `EngineConfig` in `backend/setta/types/agentic.py`
  - `CreateEngineConfigRequest` in `backend/setta/routers/agentic.py`
- Regenerate frontend types/endpoints so `EngineConfig` includes the new field (`source activate.sh && cd frontend && pnpm generate`).
- Keep `/api/transcribeChatAudio` request shape unchanged (`engineConfigId`, `file`, `language`).

### 2) Split Engine Resolution for Chat vs Transcription
- Extend `ResolvedEngineConfig` in `backend/setta/agentic/engine_resolver.py` to carry both:
  - `llm_config` (chat config)
  - `transcription_llm_config` (transcription config)
- Resolver behavior for `EngineType.setta_llm`:
  - Resolve chat config from `settaLlmConfigId` (existing fallback behavior for default config can remain).
  - Resolve transcription config from `transcriptionLlmConfigId`.
  - If `transcriptionLlmConfigId` is missing/invalid, fail fast (400) for dictation transcription requests.

### 3) Decouple Transcription Execution from Chat Overrides
- Update `backend/setta/llm/transcription.py` so transcription is driven by the resolved transcription config itself.
- Remove `transcriptionModel`, `transcription`, and `transcription_*` handling entirely.
- Keep API key resolution tied to the transcription config’s `api_key_env`.
- Update `route_transcribe_chat_audio` in `backend/setta/routers/ai.py` to pass `resolved.transcription_llm_config`.

### 4) Frontend Settings: Add Transcription Config Selection
- Add a managed-engine `Transcription Config` selector in:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
- `updateEngineConfig` writes `transcriptionLlmConfigId` independently of `settaLlmConfigId`.
- Keep `transcribeChatAudio(engineConfigId, audioBlob)` unchanged; backend resolution handles split config lookup.

### 5) Dictation Mode UX (Auto / Browser / Provider)
- Add a `Dictation Mode` control in AI settings (not in the composer) for:
  - Project Chat AI settings popover (`frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`)
  - Managed Chat Section AI settings panel (`frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`)
- Control options:
  - `auto`
  - `browser`
  - `provider`
- Wire mode to `ChatInput` `dictationMode` prop (currently defaults to `auto` when not provided).
- Surface-specific persistence:
  - Project Chat: persist selected dictation mode in AI UI state.
  - Managed Chat Section: persist selected mode in section settings.
- Preserve current external-agent restriction for provider dictation unless separately scoped.

### 6) Dictation Availability and Fallback Rules
- Provider dictation is considered available only when:
  - engine type is managed LLM, and
  - `transcriptionLlmConfigId` resolves to a valid LLM config.
- Required behavior:
  - Missing/invalid `transcriptionLlmConfigId` + `auto` mode => fall back to browser dictation.
  - Missing/invalid `transcriptionLlmConfigId` + `provider` mode => explicit error (no fallback).
  - `browser` mode => never call provider transcription route.

### 7) Cutover Policy
- No backward compatibility layer and no automatic migration.
- Existing managed engines must explicitly set `transcriptionLlmConfigId` to use provider dictation/transcription.
- Any existing `transcriptionModel`, `transcription`, or `transcription_*` keys in chat LLM config are ignored/unsupported after cutover.

### 8) Test Plan
- Backend tests:
  - `route_transcribe_chat_audio` uses `transcriptionLlmConfigId` when present.
  - Claude chat + OpenAI transcription works end-to-end at resolver/transcription call boundary.
  - Missing transcription API key returns the expected 400 error.
  - Missing `transcriptionLlmConfigId` returns the expected 400 error.
- Frontend Vitest:
  - Engine settings persist `transcriptionLlmConfigId`.
  - Dictation mode selector persists and drives `ChatInput` mode.
  - `auto` mode falls back to browser dictation when provider transcription config is missing.
  - `browser` mode never calls provider transcription.
  - `provider` mode shows explicit provider-unavailable error when transcription config is missing.
- Update existing transcription route tests (`tests/routers/test_ai_agent_run_chats.py`, `tests/routers/test_multipart_route_limits.py`) to assert new config resolution semantics.

### 9) Documentation Follow-ups
- Update `docs/reference/chat-sections.md` dictation section to describe separate transcription config.
- Document dictation modes (`auto`, `browser`, `provider`) and fallback behavior.
- Update any config reference docs that currently imply transcription is configured via chat LLM `other_params`.
