# Provider-Agnostic Realtime + File Transcription Plan

## Goal
- Support both realtime and non-realtime transcription for chat dictation.
- Work with OpenAI and arbitrary LiteLLM-compatible providers.
- Keep transcription configuration decoupled from chat engine configuration.
- Remove legacy one-shot dictation behavior rather than keeping compatibility shims.

## Requirements
- A transcription profile must be able to explicitly select transport behavior.
- `auto` mode must select the best available transport for the selected provider/model.
- Dictation must produce incremental text updates while recording.
- Providers without realtime support must still stream-like update the composer with low latency.
- No legacy fallback code paths should remain after migration.

## Current State
- Frontend records chunks with `MediaRecorder` and posts each chunk to `Route.TRANSCRIBE_CHAT_AUDIO`.
- Backend transcription path is one endpoint + one call: `litellm.atranscription(...)` in `backend/setta/llm/transcription.py`.
- `TranscriptionProfile` only stores `transcriptionLlmConfigId`.
- There is no explicit transport mode (`file` vs `realtime`) and no provider capability routing.

## High-Level Design
Implement a session-based transcription pipeline with pluggable transport engines.

- `file` engine:
  - Uses chunked audio windows and `litellm.atranscription` on each finalized window.
  - Produces incremental deltas by diffing against prior transcript.
- `realtime` engine:
  - Uses provider-specific realtime adapter where available.
  - Sends audio frames continuously and returns partial/final transcript deltas.
- `auto` mode:
  - Chooses `realtime` if the selected provider/model has a registered realtime adapter.
  - Falls back to `file` engine otherwise.

## Target Data Model
### Transcription profile schema
Update `TranscriptionProfile` (backend + generated frontend types):

- `transportMode: "auto" | "file" | "realtime"`
- `chunkMs: int` (default 1200, used by file engine and frame batching)
- `language: str | null` (optional default language hint)

Keep existing fields:
- `id`
- `name`
- `transcriptionLlmConfigId`

### Notes
- No backward compatibility layer: old profiles without these fields are invalid after refactor.
- Seed data must include explicit `transportMode` values.

## Backend Architecture
### 1) Transcription capability resolver
Add a resolver module that returns:
- `supports_file: bool`
- `supports_realtime: bool`
- `preferred_transport: "file" | "realtime"`
- `reason_if_unavailable: str | null`

Inputs:
- Resolved `LLMConfig` (`provider`, `model`, `base_url`, `other_params`)
- Registered realtime adapters

Behavior:
- File support is treated as available for all LiteLLM transcription-capable providers.
- Realtime support is true only if a realtime adapter exists for provider/model.

### 2) Session manager
Add an in-memory `TranscriptionSessionManager` under backend server runtime:
- Creates and tracks dictation sessions keyed by `sessionId`.
- Holds selected engine instance (`file` or `realtime`) and transcript state.
- Applies idle TTL cleanup and forced close on disconnect.

### 3) Engine interface
Define a shared interface:
- `start(...)`
- `append_audio(...) -> TranscriptDeltaResult`
- `stop(...) -> TranscriptDeltaResult`
- `close()`

Where `TranscriptDeltaResult` contains:
- `appendText: str`
- `fullText: str`
- `isFinal: bool`

### 4) File transcription engine
- Accept raw PCM16 frames from frontend.
- Build short WAV windows (e.g. every `chunkMs`) server-side.
- Send each window via `litellm.atranscription`.
- Compute append-only delta against previous normalized transcript.

This avoids invalid partial WebM container uploads and works for arbitrary LiteLLM transcription providers.

### 5) Realtime transcription engine
- Uses adapter abstraction:
  - `OpenAIRealtimeTranscriptionAdapter`
  - `AzureRealtimeTranscriptionAdapter`
  - `GeminiRealtimeTranscriptionAdapter`
  - Optional `LiteLLMProxyRealtimeAdapter` when proxy exposes realtime route
- Adapter responsibilities:
  - Open provider session
  - Send audio frames
  - Read provider transcript events
  - Normalize events into `TranscriptDeltaResult`

## API Contract Changes
Replace single-shot upload flow with session endpoints.

Add routes in `Route` enum:
- `START_TRANSCRIPTION_SESSION`
- `APPEND_TRANSCRIPTION_AUDIO`
- `STOP_TRANSCRIPTION_SESSION`
- `CANCEL_TRANSCRIPTION_SESSION`

### Request/response shapes
`START_TRANSCRIPTION_SESSION`
- Input: `transcriptionProfileId`, optional `language`
- Output: `sessionId`, `resolvedTransportMode`, `chunkMs`

`APPEND_TRANSCRIPTION_AUDIO`
- Input: `sessionId`, PCM16 audio payload (+ sample rate/channels metadata)
- Output: `appendText`, `fullText`, `isFinal=false`

`STOP_TRANSCRIPTION_SESSION`
- Input: `sessionId`
- Output: final `appendText`, `fullText`, `isFinal=true`

`CANCEL_TRANSCRIPTION_SESSION`
- Input: `sessionId`
- Output: `ok`

## Frontend Architecture
### 1) Capture pipeline
Refactor provider dictation capture in `ChatInput`:
- Replace `MediaRecorder` chunk upload behavior with Web Audio capture to PCM16 frames.
- Maintain one active backend transcription session while mic is active.
- Send frames periodically according to `chunkMs`.

### 2) Dictation state machine
Client flow:
1. Start mic -> call `START_TRANSCRIPTION_SESSION`.
2. Stream frames via `APPEND_TRANSCRIPTION_AUDIO`.
3. Insert `appendText` from each response immediately.
4. Stop mic -> call `STOP_TRANSCRIPTION_SESSION`, apply final delta, set idle.
5. On cancel/error -> call `CANCEL_TRANSCRIPTION_SESSION`, set error/idle as appropriate.

### 3) UI settings
In Project AI Settings transcription profile editor:
- Add transport mode selector (`auto`, `file`, `realtime`).
- Add optional language default and chunk size controls.
- Show availability hint for current provider/model.

## Error Handling
- `realtime` mode + unsupported provider => deterministic 400 with actionable message.
- `auto` mode + realtime init failure => fallback to file engine within same session start.
- Provider/API errors should be surfaced as user-facing dictation feedback.
- Missing API key behavior remains explicit and immediate.

## Migration
- Breaking schema update for transcription profiles.
- Update seed config and example config to include new profile fields.
- Remove legacy endpoint usage from frontend dictation flow.
- Remove obsolete chunk-queue code tied to old one-shot endpoint assumptions.

## Test Plan
### Backend
- Unit tests for capability resolver (`auto` selection matrix by provider/model).
- Unit tests for file engine delta computation and chunk windowing.
- Integration tests for session lifecycle: start, append, stop, cancel, TTL cleanup.
- Integration tests for error paths: unsupported realtime, provider failures, missing key.

### Frontend
- Vitest for dictation session state machine transitions.
- Vitest for append-text merge behavior and stop/cancel behavior.

### Playwright
- File transport scenario: incremental transcript appears before mic stop.
- Realtime transport scenario: incremental transcript appears before mic stop.
- Auto mode fallback scenario: realtime unavailable -> file transport still streams.
- Error scenario: provider failure shows controlled feedback and cleans up session.

## Performance + Verification
This refactor changes hot-path dictation behavior and must include before/after measurements.

Before implementation:
- Capture baseline dictation metrics with `chrome-devtools-mcp`:
  - CPU usage while recording
  - Main thread long tasks
  - Network request count/size
  - Time-to-first-transcript
- Save baseline report under `perf/`.

After implementation:
- Re-run same scenario and capture the same metrics.
- Save results under `perf/` and document deltas.
- Run focused Vitest + Playwright suites.
- Run CDP visual check of mic flow and feedback transitions.

## Rollout Phases
1. Schema and generated types update.
2. Backend capability resolver + session manager + file engine.
3. Frontend session-based file transport capture.
4. Realtime adapter interface + first adapters.
5. `auto` routing + settings UI transport controls.
6. Legacy path cleanup and test/perf finalization.

## Definition of Done
- Dictation supports `file`, `realtime`, and `auto` modes per transcription profile.
- Arbitrary LiteLLM-compatible providers work in `file` mode without custom adapter code.
- Realtime-capable providers work through adapters in `realtime` mode.
- Auto selection picks the best available transport and degrades cleanly.
- Old one-shot-only dictation path is removed.
- Tests, perf reports, and CDP verification are complete.
