# Remote Terminal Latency Phase 3 Backend Stream

**Date:** 2026-07-11

**Phase status:** Complete. Phase 4 has not started.

## Scope

Phase 3 implements the backend half of the protocol defined in Phase 2. The
backend protocol version is 13. First-party desktop and web clients still use
the existing HTTP input and SSE output paths until their coordinated Phase 4
migration; removing those paths now would break production clients.

## Authentication and connection lifecycle

- `POST /terminals/stream/ticket` requires an authenticated device session and
  mints a cryptographically random 30-second ticket.
- Tickets are stored only as SHA-256 keys, consumed once before validation, and
  bound to the issuing device session, runtime identity, and stable client
  stream ID.
- The WebSocket upgrade consumes the ticket, verifies that the bound device has
  not been revoked, retains the existing same-origin policy, disables
  compression, and continues the normal revocation sweep for the connection.
- A newer connection for the same client stream replaces the older connection
  explicitly.

## Ordering, replay, and backpressure

Each connection has one WebSocket reader, one serialized input worker, one
terminal-event worker, and one WebSocket writer. Input is bounded to 256 KiB;
output is bounded to 4 MiB. Queue exhaustion is never treated as success:
input closes with `input_backpressure`, while an output queue that cannot keep
up closes with retryable `output_backpressure`.

PTY writes are serialized per terminal session. A stable client stream keeps
the highest contiguous input sequence and a bounded digest history. Repeated
sequence/byte pairs are acknowledged without a second PTY write; gaps and
conflicting bytes produce specific protocol errors. Resume reports the server
acknowledgement state so the client can replay only unacknowledged input.

Server output subscribes to the existing terminal event hub at the supplied
stream cursor. Retained events replay in order, and the existing
`terminal.bufferTruncated` outcome is emitted as the explicit
`terminal.stream.replayTruncated` frame.

## Recorder safety

The runtime emits structured JSON records for frame receipt, completed PTY
writes, event emission, and disconnect. Records contain correlation IDs,
message kind, sequence, byte count, code, and reason. The recorder contract has
no field for input or output payload bytes.

## Generated contracts and dependency

The Go-owned error-code value set gained `output_backpressure`, so the backend
protocol was bumped from 12 to 13 and the generated TypeScript contracts and
schema snapshot were regenerated. No generated artifact was edited manually.

The WebSocket server uses the exactly pinned `github.com/coder/websocket`
`v1.8.15` dependency. Module and pnpm metadata were refreshed with
`./update_dependencies.sh`; the release-age policies passed.

## Verification

- Focused and full `internal/httpapi` and `internal/terminal` tests passed.
- Focused runtime server tests passed.
- Deterministic stream integration tests passed through the registered HTTP
  routes, authenticated ticket flow, real WebSocket upgrade, terminal manager,
  event hub, and PTY test handle. Coverage includes start/readiness, replay,
  ordered input, acknowledgement, gaps, reconnect/resume, duplicate
  suppression, conflicts, single-use tickets, expiry/runtime binding, and
  typed output backpressure.
- Desktop typecheck and production build passed with the regenerated protocol
  13 surface.
- The production Electron terminal workflow passed through renderer, preload,
  main, authenticated HTTP/SSE, backend terminal manager, real PTY, and xterm.
  This is the intended Phase 3 regression boundary; switching that client to
  the stream belongs to Phase 4.
- `./check_quality.sh --all` completed its full run. Go vet, the changed Go
  packages, formatting, lint/complexity, desktop typecheck, all 996 desktop
  unit tests, production build, dead-code checks, and the terminal,
  terminal-profile, and terminal-backend-crash Electron workflows passed. The
  overall gate remains red for unrelated repository issues: two pre-existing
  planning documents exceed the file-length policy; the orchestrator
  trajectory pagination test timed out under broad load; four live Codex tests
  reject the provider's newly advertised `max` reasoning effort; and the
  workspace-ultrawide workflow could not find its test debug hook.
- `./scripts/check_supply_chain.sh` passed dependency metadata and release-age
  checks, then reported the pre-existing GO-2026-5856 advisory in the
  repository-pinned Go 1.26.4 standard library, fixed in Go 1.26.5.

Phase 3 stops here. Phase 4 will implement the runtime-scoped desktop and web
stream clients, then remove the old HTTP input and SSE output paths in the same
protocol change once no first-party client depends on them.
