# Remote Terminal Latency Phase 4 Client Migration

**Date:** 2026-07-11

**Phase status:** Complete. Phase 5 has not started.

## Outcome

Desktop and browser/PWA terminals now use the Phase 3 duplex WebSocket stream
as their only terminal data plane. The backend protocol version is 14.
`POST /terminals/input` and `GET /terminals/events` were removed from the
Go-owned endpoint registry, their handlers and contracts were deleted, and the
generated TypeScript and web assets no longer expose them.

## Shared stream client

`desktop/src/shared/terminal-stream-client.ts` owns the behavior used by both
first-party clients:

- short-lived authenticated ticket creation and WebSocket startup;
- one stable client stream identity per device/runtime;
- one connection per active runtime, multiplexed by terminal session ID;
- monotonically sequenced input with a byte-bounded unacknowledged queue;
- acknowledgement cleanup and replay of unacknowledged input after reconnect;
- start/resume negotiation across client or backend restart;
- event cursor advancement, replay deduplication, and truncation delivery; and
- typed connecting, ready, reconnecting, backpressure, error, and stopped
  statuses.

## Desktop path

Renderer input now crosses preload through `ipcRenderer.send`; it does not
allocate or discard a promise per character. Electron main owns the ordered
stream queue and forwards terminal events through the existing typed terminal
event IPC. Stream status events use a separate typed IPC boundary and surface
backpressure or protocol failures in terminal pane status UI.

The stream starts and stops with the existing active-runtime event-stream
lifecycle. Terminal pane unmount does not create a connection, and multiple
panes share the same runtime stream. Renderer reload keeps the main-process
stream alive and reattaches the existing terminal sessions.

## Browser/PWA path

The same shared state machine is instantiated behind `createWebSettaAPI` with
the authenticated generated ticket client and the browser WebSocket API. Its
stable stream ID is scoped to the paired device and runtime in local storage.
Terminal listeners share one connection, and input and output use the same
multiplexed stream as desktop.

## Verification

- Go HTTP API and terminal tests pass with protocol 14 and the legacy endpoints
  absent from the registry and generated contract snapshot.
- Shared client tests cover ordered sends, acknowledgement, reconnect/resume,
  replay of unacknowledged input, duplicate event suppression, and bounded
  backpressure.
- Browser adapter tests cover bearer-authenticated ticket creation, WebSocket
  startup, ordered input, and terminal event delivery.
- Preload and terminal surface tests cover one-way input IPC, typed stream
  status subscription, and existing pane behavior.
- Desktop typecheck and production builds pass. The generated production web
  bundle was rebuilt from the protocol 14 surface.
- The deterministic production Electron terminal workflow passes through
  renderer, preload, one-way IPC, Electron main, authenticated ticket creation,
  WebSocket, Go terminal manager/event hub, real PTY, renderer reload/reattach,
  and xterm.
- The deterministic terminal backend-crash workflow passes with the new ticket
  path used to discover and restart the backend.
- The final broad desktop unit run passed all 997 tests. An earlier run
  encountered one unrelated
  timing failure in `backend-supervisor.test.ts`; its focused 11-test rerun
  passed.
- `./check_quality.sh --all` completed all stages. The overall result remains
  red for unrelated repository issues: four live Codex tests reject the
  provider's newly advertised `max` reasoning effort; timing-sensitive chat
  and orchestrator tests failed under broad concurrent load; the
  workspace-ultrawide workflow could not find its test debug hook; and two
  pre-existing planning documents exceed the file-length policy. The gate's
  terminal, terminal-profile, and terminal-backend-crash workflows all passed.

Phase 4 stops here. Renderer output scheduling and scroll-follow changes remain
reserved for Phase 5 and require fresh before/after performance measurements.
