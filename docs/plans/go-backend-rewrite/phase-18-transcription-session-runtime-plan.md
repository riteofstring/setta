# Phase 18 Transcription Session Runtime Plan

## Purpose

This doc records the next bounded Phase 18 slice after the landed managed-chat
follow-ons.

The remaining adjacent direct-frontend AI gap is no longer managed chat. It is
the provider transcription session surface behind:

- `POST /startTranscriptionSession`
- `POST /appendTranscriptionAudio`
- `POST /stopTranscriptionSession`
- `POST /cancelTranscriptionSession`

## Why This Slice Exists

Repo inspection on 2026-03-09 found:

- the frontend still directly calls the four transcription session routes from
  `frontend/src/state/actions/ai.ts`
- current frontend tests still cover those calls in
  `frontend/src/state/actions/aiTranscribeChatAudio.test.ts`
- Python still owns the route and runtime surface in:
  - `backend/setta/routers/ai.py`
  - `backend/setta/llm/transcription_sessions.py`
- Go already owns the adjacent prerequisites:
  - IDE auth/session runtime
  - `internal/llmconfig` config plus API-key runtime
  - `internal/transcriptionprofiles` profile storage plus validation
  - thin `internal/httpapi` route registration in IDE mode

The missing dependency is a Go-owned transcription session runtime over those
existing config/profile/session boundaries.

## Current Status

Already landed in Phase 18:

- Go-owned managed chat send/hydrate/stop transport
- Go-owned managed live chat runtime and bounded provider execution
- Go-owned bounded managed MCP tool execution, preview parity, and AI-follow
  result parity

Still Python-owned before this slice:

- transcription session route transport
- transcription session in-memory lifecycle owner
- file-mode provider upload execution
- route-level typed transcription error mapping

Landed during Slice 1:

- `internal/transcriptionsessions` now owns scoped in-memory transcription
  session lifecycle for IDE mode
- Go now owns file-mode buffered PCM16 validation, WAV conversion, stop-time
  provider upload, and TTL cleanup
- `internal/transcriptionprofiles.Service` now exposes an explicit
  `Resolve(...)` boundary so session start does not read raw stores directly
- `internal/httpapi` now owns thin Go routes for:
  - `POST /startTranscriptionSession`
  - `POST /appendTranscriptionAudio`
  - `POST /stopTranscriptionSession`
  - `POST /cancelTranscriptionSession`
- the real IDE app now wires those routes through the auth session scope, the
  landed LLM runtime, and the new transcription-session cleanup loop

## Scope

This slice should land the first bounded Go-owned transcription surface:

- explicit in-memory transcription session ownership for IDE mode
- file-mode transcription session buffering and stop-time provider upload
- thin Go AI routes for start / append / stop / cancel
- typed frontend-facing error mapping for:
  - missing profile
  - missing session
  - missing API key
  - invalid request
  - audio payload too large
  - provider failure

## Deliberate Slice Boundary

This is a clean-break bounded landing, not a Python parity dump.

Slice 1 should:

- support `transportMode=file`
- resolve `transportMode=auto` to file for now
- return an explicit runtime-unavailable error for `transportMode=realtime`

That keeps the direct provider-dictation surface usable for the default and
currently exercised file-mode flows without pretending the Go runtime already
has realtime session ownership.

## Non-Goals

- implementing realtime transcription session transport in the same landing
- reproducing Python's auto `realtime -> file` fallback logic before the Go
  runtime has a realtime owner
- introducing LiteLLM-shaped provider abstractions
- broadening beyond the direct frontend transcription routes
- heuristic parsing of provider errors beyond structured response fields

## Design

### 1. Keep transport thin

The HTTP layer should:

- validate and decode request payloads
- resolve the current IDE session scope
- delegate lifecycle work to the runtime service
- translate typed service errors into the existing frontend-facing error shape

It should not own buffered PCM state or provider request construction.

### 2. Reuse the existing config and profile sources of truth

Do not build a transcription-only config stack.

The runtime should consume:

- `internal/transcriptionprofiles.Service` for profile lookup
- `internal/llmconfig.Runtime` for resolved config and API keys

This keeps config validity and key resolution on the already-landed Go
boundaries.

### 3. Start with explicit file-mode provider support

The first provider slice should use one bounded OpenAI-compatible
`/audio/transcriptions` upload path:

- build WAV bytes from buffered PCM16
- send multipart form-data over stdlib `net/http`
- extract transcript text from structured JSON response
- fail explicitly for unsupported providers or missing API keys

Do not hide unsupported transports or providers behind generic compatibility
claims.

### 4. Keep session ownership explicit

The runtime should own:

- session scope binding to the current IDE session id
- buffered PCM16 bytes and sample-rate/channel invariants
- TTL-based cleanup for inactive sessions
- stop/cancel lifecycle removal

This state belongs in an explicit Go runtime service, not in route globals or
websocket transport.

## Implementation Plan

1. Add a focused `internal/transcriptionsessions` runtime package with:
   - typed errors
   - profile resolution result input
   - buffered file-mode session engine
   - explicit session scope ownership
2. Add thin AI routes for the four transcription endpoints and wire them into
   `internal/httpapi.RegisterAIRoutes`.
3. Wire the runtime into the real IDE app with the existing auth session,
   LLM runtime, and transcription profile service.
4. Add targeted tests for:
   - file-mode session lifecycle
   - size and sample-rate/channel invariants
   - typed route error mapping
   - real app request flow through a test provider server
5. Update the Phase 18 docs with completed scope, decisions, open questions,
   and the next recommended step.

## Open Questions

- whether the next slice after file-mode ownership should be true realtime
  session runtime or broader `auto` semantics once realtime exists
- whether any active caller still depends on typed provider-failure message
  extraction beyond structured provider JSON error payloads

## Decisions Made

- land file-mode transcription first because it covers the default seeded
  profile and the current direct caller-backed surface
- keep `auto` explicit and temporary by resolving it to file until realtime
  actually lands in Go
- reject realtime transport honestly as a runtime gap instead of pretending it
  is an unsupported model when the config may in fact support it
- keep config and API-key resolution on `internal/llmconfig` and
  `internal/transcriptionprofiles` instead of inventing a parallel runtime

## Verification

- `./scripts/go.sh test ./internal/transcriptionprofiles ./internal/transcriptionsessions ./internal/httpapi ./internal/app -run 'Test(Service|RegisterAIRoutes|AppServes(FileModeTranscriptionSessionRoutes|ManagedChatSendThroughManagedExecutor|ManagedChatThinkingUnsupportedWithoutExplicitProviderConfig))' -count=1`

## Progress Notes

- 2026-03-09: repo inspection confirmed the active adjacent direct-frontend AI
  gap is the transcription session runtime, not another managed-chat slice.
- 2026-03-09: Python inspection confirmed the transport is thin and that the
  highest-leverage first Go landing is file-mode session ownership over the
  already-landed profile and LLM config services.
- 2026-03-09: scoped Slice 1 to file-mode session ownership, temporary
  `auto -> file`, and explicit realtime runtime-unavailable behavior rather
  than bundling realtime session transport into the same landing.
- 2026-03-09: landed the explicit `internal/transcriptionprofiles.Resolve`
  boundary so the new runtime consumes hydrated profile/config state instead
  of raw store reads.
- 2026-03-09: landed Go-owned file-mode transcription session ownership,
  route transport, typed error mapping, and real app wiring through the
  current IDE session scope.
- 2026-03-09: kept realtime transport explicit by returning
  `503 transcription_runtime_unavailable` for realtime profiles rather than
  smuggling in a partial or misleading fallback.

## Next Recommended Step

Implement the bounded realtime transcription session owner if the active
caller still needs incremental provider dictation; otherwise keep the landed
file-mode surface and temporary `auto -> file` rule as the bounded Go-owned
provider-dictation path.
