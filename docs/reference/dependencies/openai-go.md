# openai-go

- Module: `github.com/openai/openai-go/v3`
- Local status: pinned in `go.mod`; active for the managed-chat OpenAI transport boundary (chat-completions for standard turns plus Responses streaming for thinking-enabled reasoning output), the bounded Azure OpenAI API-key standard-turn path via the SDK's `azure` package, and file-mode transcription uploads
- Retrieved: 2026-03-10
- Actual downloaded upstream files: `docs/reference/dependencies/openai-go-src/`
- Official OpenAI Libraries doc: https://developers.openai.com/api/docs/libraries/
- Official Speech to text guide: https://developers.openai.com/api/docs/guides/speech-to-text
- Official Realtime WebSocket guide: https://developers.openai.com/api/docs/guides/realtime-websocket
- Official Realtime transcription guide: https://developers.openai.com/api/docs/guides/realtime-transcription
- Relevant model pages:
  - https://developers.openai.com/api/docs/models/whisper-1
  - https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
  - https://developers.openai.com/api/docs/models/gpt-realtime

## Why It Exists In This Rewrite

- selected provider-edge boundary for any Go-owned OpenAI API interaction
- now used by the managed-chat OpenAI transport boundary
- now used by the file-mode transcription upload path
- still needed to replace the remaining bespoke OpenAI transport in realtime
  transcription
- aligned with the rewrite rule that OpenAI API interactions should go through
  `openai-go` rather than bespoke HTTP or WebSocket clients

## Official Guidance Captured Locally

- the OpenAI Libraries page lists a Go SDK, marks it beta, and shows the
  current import path pattern with `github.com/openai/openai-go/v3`,
  `option`, and `responses`
- the same page uses the Responses API as the basic Go example surface; treat
  that as the first upstream shape to evaluate when designing adapters
- the Speech to text guide documents `v1/audio/transcriptions` and
  `v1/audio/translations` as the core file-audio endpoints
- the Speech to text guide shows that `whisper-1` still matters for file-mode
  transcription and translations, and that `timestamp_granularities[]` is only
  supported for `whisper-1`
- the Speech to text guide also distinguishes the newer transcribe models:
  `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` support `json` or `text`
  responses and allow prompts and logprobs
- the Realtime transcription guide documents `audio.input.transcription.model`
  values including `whisper-1`, `gpt-4o-transcribe-latest`,
  `gpt-4o-mini-transcribe`, and `gpt-4o-transcribe`
- the Realtime transcription guide uses a `session.update` message to set
  input audio format and transcription configuration
- the Realtime transcription guide notes an important event-shape difference:
  `whisper-1` emits full-turn transcript content in `delta`, while
  `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` stream incremental deltas
- the `gpt-realtime` model page confirms the Realtime API is a first-class
  OpenAI surface with WebRTC, WebSocket, or SIP transport options

## API Surface To Evaluate First

- client construction and option wiring from the Libraries page example
- Responses API support for the landed managed OpenAI reasoning-output path and
  future richer provider parity work
- audio transcription and translation surfaces needed for
  `internal/transcriptionsessions`
- realtime session/transcription support for the current
  `internal/transcriptionsessions/realtime_engine.go` behavior
- custom base URL and auth/header configuration needed for OpenAI-compatible
  deployments and local test servers

## Usage Rules For This Repo

- keep SDK usage behind internal OpenAI adapter packages; do not let SDK types
  become repo-wide domain types
- use `openai-go` for Go-owned OpenAI REST and realtime edges
- do not add new bespoke OpenAI HTTP or WebSocket clients in Go by default
- if a required OpenAI surface is missing or awkward in the SDK, stop and make
  that an explicit planning decision instead of silently widening raw transport
  code

## Repo-Local Migration Targets

- `internal/managedllm/executor.go`
  - active managed-chat OpenAI transport now uses `openai-go`
  - standard turns stay on chat-completions streaming
  - explicit Azure OpenAI API-key configs now use the SDK's `azure`
    endpoint/API-version request options for standard turns
  - thinking-enabled turns now use Responses streaming so reasoning
    summary/content stays inside the current Setta websocket/message contract
  - the Responses stream now also treats explicit `response.incomplete`
    events as provider failures instead of silently succeeding with truncated
    reasoning output, and still stops/finalizes any partial assistant message
    so the live waiting state clears on provider failure
  - already-complete streamed tool calls now also survive Responses failure
    turns instead of being dropped before result persistence
  - `response.function_call_arguments.done` now also drives the live
    tool-call delta / preview path when the final arguments extend the known
    streamed prefix and earlier argument deltas were omitted
  - the Responses reducer now also honors `response.content_part.added` plus
    `response.reasoning_summary_part.added` / `.done` with explicit
    `summary_index` ordering, preserves early answer text when the first
    reasoning item arrives later in the same turn, and authoritative finalized
    reasoning/text content from `response.content_part.done`, the specific
    `*_done` events, `response.output_item.done`, and `response.completed` now
    replaces partial or missing earlier reasoning/text deltas
  - the completed-response fallback now also recovers final function-call
    items when the stream omits earlier tool-call delta events
- `internal/transcriptionsessions/service.go`
  - file-mode transcription uploads now use `openai-go`
  - bounded adapter keeps Setta-owned auth/base-URL/config semantics intact
- `internal/transcriptionsessions/realtime_engine.go`
  - current realtime transcription path now uses the SDK's realtime
    transcription session/audio config models and the current `session.update`
    request shape
  - the repo-owned startup path now drains immediate setup events after
    `session.update` so explicit provider rejection events fail
    `StartSession` instead of surfacing only on the first audio append
  - the repo-owned websocket event loop now also preserves explicit non-normal
    websocket close reasons instead of collapsing them to a generic provider
    failure
  - the repo-owned event loop now also uses
    `input_audio_buffer.committed.previous_item_id` ordering metadata so
    late completion events still rebuild full transcripts in speech-turn order
  - the websocket transport and event loop remain repo-owned because the
    pinned SDK still does not expose a realtime websocket runtime/event client
    for this surface

## Gotchas

- the remaining bespoke part of realtime transcription is the websocket
  transport/event loop and event parsing; the SDK now covers the session/audio
  request typing but still does not replace the runtime client surface
- the Realtime transcription docs explicitly call out
  `input_audio_buffer.committed.previous_item_id` as the ordering source of
  truth across speech turns; the repo-owned event loop should continue to
  prefer that metadata over raw completion-event arrival order
- the rewrite must preserve current Setta event contracts even if the SDK
  prefers different request/response shapes upstream
- managed chat now splits the OpenAI path on purpose: standard turns stay on
  chat-completions, while thinking-enabled turns use Responses to surface
  reasoning output without changing the Setta caller contract
- the landed Azure OpenAI slice is intentionally bounded to explicit API-key
  configs with explicit endpoint plus `api_version`; managed Azure thinking is
  still fail-closed until an Azure reasoning-output path is caller-proven
