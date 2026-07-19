# Phase 3 Access-Path Soft Check — 2026-07-19

## Scope

This is offline preparation, not the formal Candidate A/B experiment or an
access-path decision. It used checked-in evidence, the pinned Sprites SDK and
current official documentation. It did not create, wake, modify, or destroy a
Sprite; spend money; run Phase 1c; choose a candidate; or adopt product budgets.

## Outcome

1. Candidate A's known pre-wake risk is unchanged. The documented Sprite URL
   modes remain provider-authenticated `sprite` and unauthenticated `public`.
   No provider-native inbound mode accepts a Setta client identity before Fly
   wakes the Sprite.
2. Candidate B remains technically credible enough for a controlled live
   comparison. The Proxy API establishes a provider-authenticated WebSocket
   tunnel and then carries raw TCP. The Fly organization token can therefore
   stay in the outer tunnel handshake while a separate signed Setta runtime
   credential is sent in the inner HTTP `Authorization` header.
3. Sprites connectors do not change the inbound result. They provide outbound
   Sprite-to-third-party access and workload identity, not client-to-Sprite
   authentication.
4. No candidate is selected. Candidate B still needs live latency, wake,
   reconnect, revocation, bandwidth, cost, and mobile-network evidence.
   Candidate A still needs an actual pre-wake control to satisfy a zero-wake
   abuse posture.

## Official interface check

Checked on 2026-07-19:

- The [CLI reference](https://docs.sprites.dev/cli/commands/) documents only
  `sprite` and `public` URL authentication modes.
- The [Proxy API](https://docs.sprites.dev/api/dev-latest/proxy/) documents a
  raw TCP tunnel over an authenticated WebSocket request to
  `/v1/sprites/{name}/proxy`.
- The [API reference](https://docs.sprites.dev/api/dev-latest/) requires a
  Bearer token for management API calls; it does not document a scoped
  end-user Proxy credential.
- The [lifecycle reference](https://docs.sprites.dev/concepts/lifecycle/)
  identifies open TCP connections as activity, says they drop on pause, and
  gives approximate 100–500 ms warm and 1–2 s cold wake times.
- [Connectors](https://docs.sprites.dev/concepts/connectors/) are outbound
  integrations and do not provide inbound Setta client authentication.

The pinned `github.com/superfly/sprites-go` version exposes `ProxySocket` for
`tcp` and sends the provider credential in the outer Proxy handshake. No newer
provider-native pre-wake Setta identity mechanism was found in the current CLI,
SDK, or official documentation.

## Offline implementation prepared

Two provider-neutral slices are committed:

- `248208ffd` adds a private-runtime dial contract, maps the Sprites adapter to
  the pinned SDK's Proxy socket, verifies runtime ownership before dialing, and
  limits targets to TCP loopback services inside the runtime.
- `972bff7aa` adds a deliberately non-production HTTP/SSE gateway core. It
  authorizes the client before route resolution or provider transport, binds
  authorization to one managed runtime, removes spoofable identity and
  hop-by-hop headers, replaces the client credential with the independently
  resolved runtime credential, resolves rotated runtime credentials per
  request, streams SSE with flushing, and redacts upstream errors.

Deterministic tests prove that missing, malformed, unauthorized, revoked,
suspended, and rate-limited client credentials cannot resolve a runtime route
or open provider transport. Route mismatch, non-loopback targets, foreign
runtime names, unsupported networks, and invalid provider values fail closed.

The gateway intentionally returns `501 protocol_upgrade_not_implemented` for
WebSocket/CONNECT requests before opening provider transport. Current Setta
conversation/master traffic can be evaluated over production HTTP/SSE paths;
bidirectional upgrade support remains explicit work if the selected product
workload requires it.

## Threat-path comparison

| Threat or failure | Candidate A: public URL | Candidate B: private Proxy path | Live evidence still required |
| --- | --- | --- | --- |
| Missing or invalid Setta credential | Rejected only after the request reaches and may wake the runtime | Rejected at the gateway before provider transport opens | Confirm provider activity and billing observations |
| Credential revocation or suspension | Runtime must receive updated authority; an already sleeping runtime cannot enforce pre-wake policy | Central gateway can reject new requests before dialing; active streams still need push cancellation | Measure new-request and established-stream cutoff |
| Provider-token exposure | Client does not need the token, but the runtime URL is public | Token stays in the gateway's outer Proxy handshake; inner HTTP uses only the runtime credential | Inspect client, gateway, provider, and runtime logs |
| Header spoofing | Runtime must distrust caller identity headers | Gateway core strips forwarding, proxy, and all caller-supplied `X-Setta-*` headers | Exercise production server and edge normalization |
| Wake abuse | Known failure mode: unauthenticated traffic reaches the Fly edge before runtime auth | Gateway denial can stop before Proxy/TCP creation | Verify no hidden provider connection on denials |
| Gateway availability and bandwidth | No Setta relay | Setta owns relay latency, egress, scaling, and support | Measure region-matched load and operating cost |
| Reconnect after pause | Direct URL reconnect | Proxy WebSocket and inner TCP both reconnect; open TCP counts as activity | Test observed sleep/wake and network transitions |
| Bidirectional protocol | Provider edge handles upgrades to the runtime | Not yet implemented in the offline core | Implement only if the selected workload needs it |

## Suggested decision budgets — not adopted

These are reviewable starting points only. The owner must adopt or replace them
before the formal comparison; the deferred budget decision remains deferred.
Phase 1c may change the cost and cold-start values.

| Gate | Suggested budget | Measurement definition |
| --- | --- | --- |
| Cold authenticated connection | p95 at or below 2,500 ms | Client request start to authenticated runtime health response after an observed provider-cold state; preserve provider state and runtime boot evidence |
| Interactive access-path latency | p95 at or below 250 ms; Candidate B adds no more than 100 ms over A | Deterministic request submission to first scripted SSE event, excluding model/provider generation time, in the same region and workload |
| Reconnect | p95 at or below 3,000 ms | Network restoration to first replayed SSE event with no missing or duplicated authoritative event |
| Revocation | New requests denied within 5 s; established SSE cut off within 10 s | Revoke at the authority, then continuously probe a new request and an existing stream |
| Unauthenticated wake cost | $0/day and zero provider connections | Invalid/missing credentials must stop before the operation that can wake or bill compute |

The zero unauthenticated-wake suggestion is intentionally a security and cost
gate, not a forecast. Under current documented behavior it disqualifies a bare
public Sprite URL; Candidate A would need a real pre-wake control to proceed.

## Identical live workload for later authorization

Run both candidates against the same disposable Sprite build, service, region,
client machine, sample order, and scripted provider harness through production
runtime HTTP/store paths:

1. Confirm an empty organization and record CLI, server, SDK, commit, region,
   start deadline, cleanup deadline, and maximum spend.
2. Install the same signed runtime release and configure Candidate A or B
   without changing the runtime workload.
3. Probe missing, malformed, revoked, suspended, and rate-limited credentials;
   record whether any provider connection or runtime wake occurs.
4. Measure warm and observed-cold authenticated health, then run the scripted
   conversation flow: open workspace, create conversation, submit input,
   receive SSE output, queue while active, steer, complete, reconnect, and
   verify replay/persistence.
5. Rotate the runtime credential between requests and prove the old credential
   fails. Revoke the client while one SSE stream is open and measure both the
   existing stream and new requests.
6. Repeat reconnect on a representative mobile network transition. Measure
   gateway bytes, CPU, memory, provider activity, and bill observations.
7. Tear down immediately after each candidate and independently confirm the
   organization is empty.

Do not run this matrix until the owner records budgets, organization, region,
maximum spend, billing observer, and cleanup deadline. Phase 1c remains a
separate authorization.

## Stop conditions for the live comparison

Stop and clean up immediately if any of these occurs:

- a provider credential appears in a client-visible response, inner runtime
  request, application log, or reusable artifact;
- a denied Candidate B request resolves a runtime route or opens Proxy/TCP;
- an unauthenticated Candidate A request wakes compute without an approved
  nonzero wake-abuse budget;
- authorization can be rebound to a different runtime;
- revocation, latency, reconnect, or cleanup exceeds an adopted hard budget;
- a provider response is ambiguous enough that cleanup cannot be proven.

## Remaining owner input

Before live Phase 3 work: adopt or revise the five budgets; authorize maximum
spend, organization, region, billing observer, start time, and cleanup deadline;
and decide whether WebSocket support is part of the comparison workload. None
of those decisions is needed for the completed offline scaffold.
