# openai-go

- Module: `github.com/openai/openai-go/v3`
- Local status: pinned in `go.mod`; active for the managed-chat OpenAI chat-completions transport and file-mode transcription uploads
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
- now used by the managed-chat OpenAI chat-completions transport
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
- Responses API support for future managed reasoning-output and richer provider
  parity work
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
  - active managed-chat chat-completions transport now uses `openai-go`
  - future follow-on, if needed, is explicit Responses/reasoning-output
    convergence rather than more bespoke transport growth
- `internal/transcriptionsessions/service.go`
  - file-mode transcription uploads now use `openai-go`
  - bounded adapter keeps Setta-owned auth/base-URL/config semantics intact
- `internal/transcriptionsessions/realtime_engine.go`
  - current realtime transcription path owns the WebSocket/session protocol

## Gotchas

- remaining repo behavior is still shaped around older hand-rolled transport
  and event parsing in the realtime transcription surface, so migration is not
  a drop-in import swap
- the rewrite must preserve current Setta event contracts even if the SDK
  prefers different request/response shapes upstream
- managed chat currently stays on chat-completions streaming because that is
  the bounded fit for the current Setta tool/event contract; any shift to the
  Responses API should be an explicit parity decision rather than an
  opportunistic rewrite
