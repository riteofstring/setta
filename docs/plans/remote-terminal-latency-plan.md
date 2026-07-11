# Remote Terminal Latency Plan

**Date:** 2026-07-10

**Status:** Phase 6 in progress. The interim remote Tailscale spot-check is
complete on protocol 15 (input round trip improved from 69/275 ms p50/p95 to
42/108 ms against the Phase 1 baseline; fast typing preserved ordering that
the HTTP path lost; details in the Phase 6 report). The scheduler's
immediate/coalesced/replay decision is recorded per output event and the
analyzer segments by it. The renderer output scheduler now also suppresses
immediate admissions while a coalesced write is still parsing and joins
same-turn immediate chunks into one xterm write. The deterministic
delay-profile workflow was built, surfaced real renderer-budget limits, and
was closed without suite registration by direction (see the checklist note).
Remaining: the rest of the Phase 6 deterministic coverage and the final live
Tailscale validation, with the interim spot-check plus live runs as the
acceptance evidence now that the deterministic matrix is closed.

## Progress

- [x] Add content-free renderer, preload, main, HTTP handler, PTY-write,
  output-forwarding, xterm-write, and next-paint timing points.
- [x] Add a stable reproduction run ID, stable renderer client ID, and a
  client/session input sequence that remains monotonic across reload.
- [x] Extend `terminal_event_forwarded` with emission time, byte count, run ID,
  and transport sequence without recording `dataBase64`.
- [x] Add and pass the local production Electron/HTTP/real-PTY workload, including
  isolated typing, fast typing, paste, arrows, backspace, Ctrl-C, sustained output,
  reload/reattach, and close.
- [x] Record the local baseline in
  `docs/reports/performance/2026-07-10-remote-terminal-latency-phase-1.md`.
- [x] Deploy protocol 11 to the Tailscale runtime and run the identical workload.
- [x] Record route-specific remote results and finish the H1-H3 evidence gate.
- [x] Register the authenticated terminal ticket and duplex stream endpoints.
- [x] Define Go-owned start, resume, input, ready, acknowledgement, terminal
  event, replay truncation, and protocol error frames.
- [x] Define stable stream identity, per-session sequence, acknowledgement,
  deduplication, gap, replay, and bounded-backpressure semantics.
- [x] Generate literal-discriminated TypeScript unions, strict codecs, value
  sets, endpoint paths, and the duplex protocol descriptor.
- [x] Verify the protocol contracts and the unchanged production terminal
  workflow; record the result in the Phase 2 report.
- [x] Implement short-lived, single-use terminal stream tickets bound to the
  authenticated device and runtime.
- [x] Implement the WebSocket reader, input, event, and writer loops with
  cancellation and byte-bounded queues.
- [x] Serialize PTY writes per session; acknowledge contiguous input and
  preserve stable-stream deduplication across reconnects.
- [x] Bridge the terminal event cursor, replay buffer, and explicit replay
  truncation frames to the duplex stream.
- [x] Add typed input/output backpressure behavior and content-free structured
  recorder hooks.
- [x] Verify the backend stream and unchanged production Electron terminal
  workflow; record the result in the Phase 3 report.
- [x] Replace the desktop terminal SSE and per-input request paths with one
  active-runtime stream client and ordered one-way input IPC.
- [x] Implement the same ticketed stream lifecycle for the browser/PWA API.
- [x] Forward stream terminal events through the existing renderer event IPC
  and expose typed stream failure/backpressure status events.
- [x] Preserve one multiplexed stream across terminal pane mount/unmount,
  reconnect, renderer reload, and runtime switching.
- [x] Remove `/terminals/input` and `/terminals/events`, regenerate protocol 14,
  and verify the production Electron and web paths.
- [x] Preserve terminal scrollback and follow output only when the viewport was
  already at the bottom.
- [x] Coalesce terminal statistics and host dataset presentation to one update
  per animation frame.
- [x] Keep interactive output immediate while coalescing sustained and replay
  output with a one-frame bound.
- [x] Profile the identical sustained-output, multi-pane workspace workload
  before and after; record the result in the Phase 5 performance report.
- [x] Run the interim remote Tailscale spot-check of the duplex stream and
  compare input-path and output-path latency against the Phase 1 remote
  baseline.
- [ ] Record the scheduler's immediate/coalesced decision per output event and
  segment interactive from bulk output in the recording analyzer.
- [x] Build the deterministic network-delay proxy and the local, 40 ms, and
  100 ms latency workflow with interactive-budget assertions. Closed without
  suite registration by direction on 2026-07-11: the workflow is expected to
  be deprecated. It remains standalone-invocable
  (`desktop/tests/electron/terminal-latency-profiles-workflow.test.mjs`). Its
  local-profile run passes the transport budgets (dispatch-to-ack p95 4 ms)
  and fails the two renderer budgets with a diagnosed cause: xterm 5.5
  parses the first post-input write synchronously but timer-defers follower
  chunks, and the continuous workspace Pixi ticker starves those timers to
  the next frame (interactive main-to-write p95 14 ms vs the 8 ms budget);
  the write-to-paint budget as asserted measures requestAnimationFrame
  cadence and cannot pass as defined (p95 19 ms vs 16.7 ms). The 40/100 ms
  profiles did not execute because the workflow aborts on the local failure.
- [ ] Add the remaining Phase 6 Go, TypeScript, renderer, and workflow
  coverage.
- [ ] Run the final live Tailscale validation; report the direct route as the
  acceptance run and the DERP route separately, or record explicitly that a
  relay route could not be captured.

## Decision

Treat the lag as a Setta terminal data-plane problem, not an SSH problem.
Replace the per-input HTTP request path and terminal SSE output path with one
long-lived, authenticated, ordered WebSocket stream over the existing
Tailscale HTTPS connection.

Do not add Mosh or general-purpose local echo in this fix. SSH is install-only
in the remote-runtime plan, while the interactive terminal is a PTY owned by
the remote Setta backend. Mosh would require a different terminal architecture
and would not solve the browser/PWA path.

## Current Architecture

The production terminal path is now:

```text
xterm onData
  -> renderer preload one-way IPC send
  -> Electron main
  -> ordered runtime-scoped WebSocket queue over Tailscale
  -> remote Go terminal manager
  -> remote PTY

remote PTY output
  -> Go terminal event hub
  -> the same runtime-scoped WebSocket over Tailscale
  -> Electron main
  -> Electron event IPC
  -> renderer
  -> xterm.write
```

The web/PWA adapter uses the same ticketed stream directly through the browser
WebSocket API. This is consistent with the BYO plan of record: Tailscale is the
remote transport, the runtime serves HTTP behind it, and SSH is only used to
install a runtime.

## Evidence

The live production recording at `.recordings/20260710T014957Z`, analyzed
through `2026-07-10T14:47:17.827Z`, contains the following terminal behavior:

| Measurement | Result |
| --- | ---: |
| Terminal input HTTP requests | 1,335 |
| One-byte requests | 714 (53.5%) |
| Requests of four bytes or fewer | 767 (57.5%) |
| Input HTTP latency, median | 90 ms |
| Input HTTP latency, p95 | 169 ms |
| Input HTTP latency, p99 | 337 ms |
| Input HTTP latency, maximum | 549 ms |
| Isolated small input to next main-process output event, median | 62 ms |
| Isolated small input to next main-process output event, p95 | 150 ms |

The input-to-output measurement is indicative rather than an acceptance
metric: the current recording does not retain terminal output bytes or a
causal input sequence, so the next output event can only be correlated by
session and time.

A current five-sample `tailscale ping --until-direct=false` check reached the
runtime directly in 35-50 ms. This rejects a current DERP relay as the primary
cause, but the recording did not capture the Tailscale route at the time of
each slow request.

The renderer sends most xterm input events immediately and independently. The
calls are not awaited, and the protocol has no client input sequence. Separate
HTTP requests can therefore be in flight concurrently without an explicit
server-side ordering contract. This is a correctness risk in addition to the
latency cost.

The output handler also calls `xterm.write`, schedules `scrollToBottom`, updates
terminal statistics, and writes multiple host dataset attributes for every
output event. The current recording does not show how much time those renderer
operations add after an event reaches Electron main.

## Hypotheses

### H1: Per-input HTTP requests dominate typing latency

**Status:** Confirmed by the Phase 1 direct-Tailscale reproduction.

Each normal character becomes an authenticated, encoded HTTP POST to the
remote runtime. The recorded latency distribution tracks the reported typing
lag, and more than half of the calls carry only one byte.

**Reject if:** keydown-to-server-write instrumentation shows that the input
reaches the PTY well before the visible echo and the delay is instead on the
output or renderer path.

### H2: Tailscale relay routing is the primary cause

**Status:** Rejected for the controlled Phase 1 reproduction.

All ten route samples captured alongside the successful remote workload were
direct. The run therefore does not characterize DERP behavior.

### H3: SSE delivery or renderer work adds material tail latency

**Status:** Supported by the Phase 1 aggregate workload.

The direct-Tailscale run measured 77 ms p95 from main receipt to xterm write,
and the local sustained-output workload showed still larger tails. Phase 5
will segment and profile renderer cost after the transport work.

### H4: SSH remote echo is the mechanism

**Status:** Rejected for Setta's embedded terminal.

SSH appears in runtime installation. Interactive terminal input goes to the
Setta HTTP API and a backend-owned PTY.

## Reproduction Status

Phase 1 reproduced the issue through the production Electron/main/preload/
renderer/HTTP/PTY paths against both a local runtime and `setta-devbox`. The
direct remote workload missed the transport budgets and failed to preserve the
fast-typing marker, while the local workload preserved it. The complete timing
artifacts are recorded in the Phase 1 performance report.

## Goals and Budgets

For a direct Tailscale route:

- Preserve terminal input bytes exactly and in order across normal typing,
  paste, IME input, control sequences, and multiple terminal sessions.
- Keep transport overhead beyond measured Tailscale RTT at or below 15 ms p50
  and 35 ms p95 in the controlled workload.
- Keep main-process receipt to xterm write below 8 ms p95.
- Keep xterm write to the next paint within one frame at 60 Hz in the typing
  workload.
- Eliminate one HTTP request per character.
- Preserve terminal event replay, attach, close, runtime switching, backend
  restart behavior, and explicit failure reporting.
- Keep terminal content out of performance logs. Record byte counts, sequence
  numbers, timestamps, session IDs, and transport state only.

The main-receipt-to-write and write-to-paint budgets apply to interactive
output only. An output event is interactive when the Phase 5 scheduler writes
it immediately; frame-coalesced bulk output and attach replay are measured
separately and are bounded by the one-frame coalescing guarantee, not by the
interactive budgets. To make that segmentation exact, the renderer must record
the scheduler's actual immediate/coalesced decision with each output timing
event, and the recording analyzer must classify by that recorded decision
rather than reconstructing it heuristically. Budget assertions written against
the aggregate workload without this segmentation are invalid: they would
either fail on intentionally coalesced bulk output or be loosened until they
assert nothing.

Sub-5-ms visible echo is not a goal because it would require local prediction.
On a 35-50 ms path, a correct remote echo cannot beat the network RTT without
prediction.

## Implementation Plan

### Phase 1: Add causal timing and establish the baseline

1. Extend the existing session recorder with terminal latency events rather
   than introducing ad hoc console logging. Use one reproduction `runId` and a
   monotonically increasing input sequence per client and session.
2. Record these points without terminal contents:
   - renderer xterm `onData` receipt;
   - preload/main receipt;
   - current HTTP request dispatch and response receipt;
   - backend HTTP handler receipt and PTY write completion;
   - backend output event emission;
   - Electron main output receipt;
   - renderer event receipt;
   - `xterm.write` callback;
   - the next `requestAnimationFrame`.
3. Add `emittedAt`, byte count, and transport sequence to the existing
   `terminal_event_forwarded` recording. Do not record `dataBase64`.
4. Write an exact reproduction report covering the commit, desktop build,
   runtime version, runtime region, Tailscale direct/DERP route, RTT samples,
   workspace, terminal session, keystroke cadence, and output workload.
5. Run the same scripted workload against a local runtime and the Tailscale
   runtime. Include isolated characters, fast typing, backspace, arrow keys,
   paste, and a sustained-output command.
6. Evaluate H1-H3 explicitly. Continue with the transport change if the
   measurements confirm the existing request path is a material contributor.

### Phase 2: Define the Go-owned duplex protocol

**Phase status:** Complete in protocol 12. Implementation stops at the contract
boundary; the registered routes return `terminal_stream_not_implemented` until
Phase 3.

1. Add the stream endpoint and any ticket endpoint to the
   `internal/httpapi` endpoint registry. Do not maintain a second endpoint
   list in the generator.
2. Define stream message kinds and payloads at the Go terminal/httpapi domain
   boundary. Generate the TypeScript discriminated unions, codecs, endpoint
   paths, and value sets from those owners.
3. Use a short-lived, single-use stream ticket minted by an authenticated HTTP
   request. This gives Electron and the browser/PWA one authentication design
   without placing a long-lived device token in a WebSocket URL.
4. Define client messages for stream start/resume and terminal input. Keep
   resize and terminal lifecycle commands on their existing HTTP control paths
   unless measurements justify moving them.
5. Define server messages for stream readiness, input acknowledgement,
   terminal events, replay truncation, and explicit protocol errors.
6. Give each client stream a stable ID and each session a monotonically
   increasing input sequence. The backend must serialize PTY writes per
   session, acknowledge the highest accepted sequence, and reject gaps or
   malformed frames specifically.
7. Bound queued input by bytes at the owning terminal boundary. Surface
   backpressure or disconnection explicitly; do not silently drop input.
8. Retain unacknowledged input until acknowledgement. On reconnect, resume the
   same client stream and deduplicate already accepted sequences before
   replaying unacknowledged input. Backend restart may invalidate the stream
   because it also invalidates the owned PTY session.
9. Reuse the current terminal event cursor and replay buffer semantics for
   server-to-client resume.

Start with typed JSON stream frames. Base64 is not the measured latency source.
Only introduce a binary frame format if the output-throughput benchmark shows
that JSON/base64 is material; any binary message constants must also be
generated from Go-owned values.

### Phase 3: Implement the backend stream

1. Add the authenticated upgrade handler and ticket lifecycle with short
   expiry, one-time consumption, and device/runtime binding.
2. Add one reader loop and one writer loop per connection with bounded queues
   and cancellation. Keep PTY writes ordered through a per-session input
   serializer.
3. Bridge the existing terminal event hub to the stream writer, including
   replay from the supplied cursor and the current truncation event.
4. Make slow-client behavior explicit. Close the stream with a typed reason
   when its bounded output queue cannot keep up; reconnect and replay should
   restore retained output.
5. Add structured recorder hooks at frame receipt, PTY write, event emission,
   and disconnect. Do not log payload bytes.
6. Once all first-party clients use the stream, remove `/terminals/input` and
   `/terminals/events` in the same protocol-version change. Do not retain
   compatibility aliases, dual delivery, or fallback paths.

### Phase 4: Implement desktop and web clients

1. Replace `startTerminalEventStream` with one runtime-scoped terminal stream
   client. Its lifecycle should follow the existing active-runtime stream
   startup, shutdown, and runtime-switch behavior.
2. Route renderer input through ordered one-way IPC to the main-process stream
   queue. Do not create and ignore one promise per character. Deliver stream
   failures and backpressure as typed terminal status events.
3. Forward server terminal events to renderer windows through the existing
   event IPC boundary.
4. Implement the same stream client behind the web/PWA API using the single-use
   ticket flow and the browser WebSocket API.
5. Keep one stream per active runtime and multiplex terminal sessions by
   session ID. Do not create one connection per pane.
6. Preserve session attach/replay across pane unmount/remount and app reload.

### Phase 5: Remove renderer-side tail latency

Do this after Phase 1 measurements identify material renderer cost.

1. Stop unconditionally calling `scrollToBottom` for every output write.
   Preserve user scrollback and follow output only when the terminal was
   already at the bottom.
2. Coalesce terminal statistics and host dataset writes to at most once per
   animation frame instead of repeating them for each output chunk.
3. Let interactive echo output reach `xterm.write` immediately. Coalesce only
   sustained bulk output, with a bound that keeps interactive output within
   one frame. The implemented bound writes the first four output chunks in an
   animation frame immediately and coalesces the remainder of that frame into
   one write; four covers a keystroke's echo plus its common control-sequence
   companions. Revisit the constant only with measurements showing interactive
   bursts that exceed it.
4. Profile large-output workloads and large workspace DOMs before and after.
   Record the results in an append-only report under
   `docs/reports/performance/`.

### Phase 6: Verification

First, de-risk the remote path before building any test-matrix infrastructure.
Phases 2-5 replaced the entire terminal transport with only local
measurements; the original complaint is remote and input-side. Run the
production workload against the Tailscale runtime on the new stream, record
input-path latency (renderer `onData` to PTY write acknowledgement),
output-path latency, the route, and RTT samples, and compare against the
Phase 1 remote baseline. Any unforeseen remote stream problem — ticket
round-trip cost, long-lived WebSocket behavior over the Tailscale HTTPS path,
relay interaction — must surface in this spot-check, not after the
deterministic matrix is built. Record the result as an interim entry in the
Phase 6 report.

Then add deterministic coverage before final live validation:

- Go tests for ticket authentication/expiry/one-time use, message decoding,
  ordered PTY writes, duplicate suppression, sequence gaps, bounded
  backpressure, reconnect, replay, truncation, and cancellation.
- TypeScript tests for the desktop and web stream clients: ordered sends,
  acknowledgement, reconnect, runtime switching, ticket failure, queue
  overflow, and typed disconnect handling.
- Renderer tests for stream status and output scheduling as supplemental
  coverage.
- A production-path Electron workflow test through renderer, preload, main,
  network, Go HTTP/WebSocket handler, terminal manager, real temporary PTY,
  and back to xterm. It must use temporary app data and a temporary workspace.
- A latency workflow with a deterministic network-delay proxy outside the app
  production path. Measure at local, 40 ms RTT, and 100 ms RTT profiles. Assert
  input ordering and the transport/render budgets rather than merely asserting
  that output eventually appears. Budget assertions must use the recorded
  interactive/coalesced segmentation defined in Goals and Budgets; the
  deterministic profiles are the acceptance basis, and live runs are
  confirmatory.
- Reload/reattach, disconnect/reconnect, backend failure, multiple panes,
  fast typing, paste, backspace, control sequences, resize, cancellation, and
  output-flood scenarios.
- A final live Tailscale run that records the route and RTT alongside the app
  measurements. Direct and DERP runs must be reported separately. The direct
  route is the acceptance run. Attempt a relay-routed run by blocking the
  direct UDP path so Tailscale falls back to DERP; if a relay route cannot be
  captured, record that explicitly and treat the deterministic 100 ms profile
  as the DERP stand-in rather than blocking completion on it.

Regenerate `desktop/src/generated/backend.ts` whenever the Go-owned contracts
or endpoint registry change. Do not edit it manually.

Use the narrowest focused tests during implementation. Before finishing the
broad protocol change:

1. Run `./scripts/format.sh`.
2. Run the focused Go tests through `./scripts/go.sh`.
3. Run the focused desktop unit and Electron workflow tests.
4. Run `./check_quality.sh --all` because this changes generated contracts and
   a cross-boundary runtime protocol. The terminal, terminal-profile, and
   terminal-backend-crash workflows must pass; record any pre-existing
   unrelated failures explicitly (as the Phase 4 report did) rather than
   treating the overall gate color as the verdict.
5. If a WebSocket dependency is added, pin it exactly, update lock/module state
   through `./update_dependencies.sh`, and run
   `./scripts/check_supply_chain.sh`.
6. Append the before/after metrics and artifact paths to a new report under
   `docs/reports/performance/`.

## Rollout

Ship the backend and clients as one backend protocol-version increment. A
desktop connected to an older runtime should receive the existing explicit
protocol mismatch/upgrade requirement; do not add a legacy HTTP/SSE fallback.

Success means the controlled direct-Tailscale workload meets the budgets,
terminal bytes remain ordered and lossless, the local runtime does not regress,
and the live recording no longer shows per-character `/terminals/input`
requests.

## Deferred Work

- Mosh integration.
- General terminal local-echo prediction.
- A command composer for noninteractive workflows.
- Binary stream frames, unless measured output throughput requires them.
