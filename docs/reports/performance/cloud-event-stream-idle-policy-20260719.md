# Cloud Event-Stream Idle Policy — 2026-07-19

## Scope

This report records the offline browser-client baseline and deterministic result
for the Phase 3 HTTP/SSE connection policy. It does not claim hosted gateway
cost, provider placement, attached-idle billing, or a real mobile transition.

## Policy

- A visible, online web client may hold only event streams with live
  subscriptions.
- A hidden, page-cached, or offline client closes every active event stream
  immediately. It does not poll or repeatedly attempt reconnection.
- Returning online to a visible page starts each registered stream once.
- Each stream resumes from its last accepted authoritative cursor. A
  `conversation.resync_required` event may replace that cursor, including with
  an earlier authoritative sequence.
- Conversation release keeps the existing rule: an inactive pane closes its
  stream unless an active run requested bounded keep-alive, and that keep-alive
  closes when the conversation stops working or waiting for approval.
- Client attachment never creates a provider Task. Durable run and transcript
  state remains owned by the runtime store and workload lease behavior.

## Baseline inspected before implementation

The existing web event-stream loop retried every 500 ms after a connection
ended. It had no page-visibility, page-cache, or browser-network activity input,
so a hidden or offline page could continue the reconnect loop. Its cursor lived
inside one loop invocation; deliberately stopping and starting a registration
would restart from the registration's original cursor.

This was a source-backed behavioral baseline, not a hosted cost measurement.
No Sprite was created or contacted.

## Deterministic result after implementation

Focused tests drive the production web API registration and SSE decoder with a
scripted HTTP stream:

| Check | Baseline | After |
| --- | --- | --- |
| Fetches during a 550 ms inactive interval | reconnect loop had no activity gate | 0 |
| Resume operations on reactivation | no deliberate resume policy | exactly 1 |
| Resume cursor after accepting authoritative sequence 3 | registration's original sequence 0 | sequence 3 |
| Activity propagation | none | push-based visibility, pagehide/pageshow, offline/online |
| Polling added | n/a | none |

The 550 ms inactive interval exceeds one configured 500 ms reconnect delay. The
test therefore proves the inactive state suppresses at least the reconnect that
the old loop would otherwise attempt. Focused Vitest coverage passed 8 tests
across the activity source, stream decoder, and production web API registration.

## Remaining measurement

The hosted gateway run must measure connection duration, relayed bytes,
provider activity, and Cost Explorer observations with the page visible versus
hidden. A representative phone must then repeat visible → offline/network
change → online → cursor replay. Those operations need fresh live-deployment
authority and a physical device; this offline result is not a substitute.
