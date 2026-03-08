# openai-go

- Module: `github.com/openai/openai-go/v3`
- Local status: selected follow-on candidate; not pinned in `go.mod`
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
- needed to replace current hand-rolled OpenAI transport in managed chat and
  transcription code
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
- Responses API support for the managed-chat migration path
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
  - current managed-chat OpenAI transport is hand-rolled
- `internal/transcriptionsessions/service.go`
  - current file transcription path posts multipart audio directly
- `internal/transcriptionsessions/realtime_engine.go`
  - current realtime transcription path owns the WebSocket/session protocol

## Gotchas

- current repo behavior is still shaped around older hand-rolled transport and
  event parsing, so migration is not a drop-in import swap
- the rewrite must preserve current Setta event contracts even if the SDK
  prefers different request/response shapes upstream
- exact Go method names beyond the Libraries-page example should be verified
  from pinned local module source once the dependency is added
