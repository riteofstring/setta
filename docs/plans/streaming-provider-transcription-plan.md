# Streaming Provider Transcription Plan

## Goal
- Make provider dictation feel realtime by transcribing while recording, not only after mic stop.
- Keep current endpoint contract (`/api/transcribeChatAudio`) and reuse existing transcription profile resolution.

## Current State
- Provider dictation records one blob and uploads once in `MediaRecorder.onstop`.
- Transcript appears only after recording stops.
- Browser dictation already updates incrementally through Web Speech API events.

## Target Behavior
- Provider dictation uploads short audio chunks during recording.
- Each successful chunk transcript is inserted into the composer immediately.
- Pressing stop:
  - stops microphone capture,
  - flushes queued chunk transcriptions,
  - then returns composer dictation state to idle.

## Scope
- Frontend dictation runtime (`ChatInput`) only.
- No backend API changes and no schema changes.
- No backward compatibility shims.

## Implementation

### 1) Chunked Provider Capture
- Start `MediaRecorder` with a fixed timeslice (for example ~1.5s) so `ondataavailable` emits repeatedly.
- Replace single final-blob flow with a chunk queue.
- Enqueue every non-empty chunk blob.

### 2) Sequential Chunk Transcription
- Process queued chunks serially (one request at a time) via existing `onProviderDictationTranscribe(blob)`.
- Insert each non-empty transcript as soon as it resolves.
- Ignore empty transcripts for silent chunks.
- Guard async responses with session/version tracking so stale responses from canceled sessions are discarded.

### 3) Stop + Flush Semantics
- `Stop Mic` should stop recorder immediately, then continue transcribing remaining queued chunks.
- Keep UI in `transcribing` state while flushing.
- When flush completes:
  - if at least one transcript chunk was inserted, return to `idle` with no feedback;
  - otherwise show `No speech was detected.`

### 4) Error Handling
- Preserve existing unavailable/fallback behavior for `auto`/`provider` mode selection.
- For provider chunk transcription failures:
  - surface current provider error feedback,
  - stop current provider capture session cleanly.

## Tests

### Playwright
- Extend `frontend/tests/e2e/chat/chat-dictation-fallback.spec.ts` with a provider-streaming scenario:
  - mock `MediaRecorder` to emit multiple chunks while recording,
  - mock `/api/transcribeChatAudio` responses per chunk,
  - assert composer text updates before user presses stop.

### Vitest
- Keep existing `ChatInput` dictation-mode tests green.
- Add/adjust focused assertions if helper behavior changes are introduced.

## Verification
- Run focused frontend unit tests for `ChatInput`.
- Run focused Playwright dictation spec.
- Perform CDP visual validation of Project AI Chat mic flow:
  - `Mic` -> `Stop Mic` while listening,
  - feedback/status changes during flush,
  - incremental transcript insertion visible before stop.
