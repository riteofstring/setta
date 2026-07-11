# Remote Terminal Latency Phase 2 Protocol Definition

**Date:** 2026-07-11

**Phase status:** Complete. Phase 3 has not started.

## Scope

Phase 2 defines the authenticated duplex terminal wire protocol without
implementing ticket storage, WebSocket upgrade, connection loops, or client
transport. The existing HTTP input and SSE output paths remain the active
production data plane. The two new routes return the explicit
`terminal_stream_not_implemented` error until Phase 3.

The backend protocol version is 12.

## Registered endpoints

| Name | Method | Path | Contract |
| --- | --- | --- | --- |
| `CreateTerminalStreamTicket` | POST | `/terminals/stream/ticket` | Authenticated request/response; binds a stable client stream ID to a 30-second ticket |
| `TerminalStream` | GET | `/terminals/stream` | Authenticated duplex endpoint with Go-owned client and server message unions |

Tickets are defined as short-lived and single-use. The ticket replaces the
long-lived device token during the WebSocket handshake; Phase 3 owns issuance,
one-time consumption, expiry, and device/runtime binding.

## Frame contract

Client frames:

| Kind | Purpose |
| --- | --- |
| `terminal.stream.start` | Starts a client stream with its stable ID and terminal event cursor |
| `terminal.stream.resume` | Resumes the same client stream with event cursor and per-session acknowledgement state |
| `terminal.stream.input` | Carries base64 terminal bytes with a per-session input sequence |

Server frames:

| Kind | Purpose |
| --- | --- |
| `terminal.stream.ready` | Confirms client/server stream identity, cursor, session acknowledgement state, protocol version, and byte limits |
| `terminal.stream.inputAck` | Acknowledges the highest contiguous input sequence written to a session PTY |
| `terminal.stream.event` | Carries the existing `TerminalEvent` contract |
| `terminal.stream.replayTruncated` | Carries the existing `terminal.bufferTruncated` event as an explicit replay outcome |
| `terminal.stream.error` | Reports a typed protocol failure with retryability and optional session/sequence correlation |

Generated TypeScript variants have literal `kind` fields, making both unions
exhaustively discriminated. The generated decoder rejects unknown fields,
unknown kinds, and a variant whose literal kind does not match its payload.

## Ordering, replay, and backpressure

- Input sequence starts at 1 independently for each terminal session.
- The backend must serialize writes per session. Acknowledgement advances only
  after the highest contiguous sequence has been written to the PTY.
- Repeating an accepted sequence with identical bytes is deduplicated. Reusing
  it with different bytes produces `input_sequence_conflict`; skipping the next
  expected value produces `input_sequence_gap`.
- Clients retain unacknowledged frames. After reconnect, they resume the stable
  client stream, reconcile the server's per-session acknowledgement state, and
  replay only later frames.
- A backend restart may reject the old stream identity with
  `event_cursor_unavailable`, matching the existing PTY lifetime.
- Server output reuses the existing terminal event stream ID, sequence, event
  ID, cursor, replay buffer, and `terminal.bufferTruncated` semantics.
- An input frame is capped at 64 KiB. Queued input is capped at 256 KiB per
  connection. Queue exhaustion produces `input_backpressure`; input is never
  silently dropped.

Other explicit errors cover malformed frames, unsupported kinds, input before
readiness, identity mismatch, missing sessions, oversized input, unavailable
event cursors, and internal failure.

## Generated artifacts

The endpoint registry is the only endpoint source. The contract generator now
collects duplex client/server types from that registry and emits:

- protocol 12 metadata and schema hash;
- `TerminalStreamClientMessage` and `TerminalStreamServerMessage` unions;
- strict variant and value-set decoders;
- terminal stream kind and error-code value sets;
- ticket request/response types and client method;
- `/terminals/stream` through `backendEndpoints`; and
- `backendDuplexProtocols.TerminalStream`, associating the endpoint with both
  message decoders.

The generated web application assets were rebuilt from this surface.

## Verification

- Focused `internal/terminal`, `internal/httpapi`, and contract-generator tests
  passed.
- Desktop typecheck and 15 focused generated-client/runtime decoder tests
  passed.
- The production Electron terminal workflow passed through renderer, preload,
  main, protocol-12 Go HTTP handlers, real PTY, SSE, and xterm.
- `./scripts/format.sh`, generator file-length and complexity checks, and
  `git diff --check` passed.
- The broad desktop lint, complexity, typecheck, 996-test unit suite,
  production build, dead-code check, and deterministic chat workflow passed.
- `./check_quality.sh --all` was run after the final source edit. Its overall
  result remains red for unrelated repository issues: four live Codex tests
  reject the newly advertised `max` reasoning effort, and timing-sensitive
  chat/orchestrator or runtime-picker checks intermittently time out under the
  broad concurrent load. Both chat checks and runtime-picker passed immediately
  in isolation. The orchestrator pagination test passed after the first broad
  run and timed out after the second.
- `./scripts/check_supply_chain.sh` was run and reports GO-2026-5856 in the
  repository-pinned Go 1.26.4 standard library, fixed in Go 1.26.5. Phase 2 did
  not add or update dependencies.

Phase 2 stops here. Phase 3 will implement ticket lifecycle and the backend
stream against these contracts.
