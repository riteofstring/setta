# Phase 3 Access-Path Live Comparison — 2026-07-19

## Decision

Select **Candidate B: a private Sprite reached through a small Setta gateway**.
Candidate A is rejected because an unauthenticated request woke the public
Sprite before Setta authentication and because established-stream revocation
did not meet the adopted 10-second budget. Candidate B stopped missing,
revoked, suspended, and rate-limited client credentials before route resolution
or Proxy transport, and push-cancelled an established SSE stream in 0.437 ms.

This selects the access architecture, not a production deployment. The hosted
gateway region, bandwidth, operating cost, high availability, and real mobile
transition remain Phase 3 exit work. The provider did not expose placement for
either disposable Sprite, so both used the same `setta-100` default placement
but physical-region equality could not be independently proved.

## Authorization and scope

Owner authorization was recorded on 2026-07-19:

- organization: `setta-100`;
- maximum spend: $5;
- start: immediately at 2026-07-19 18:40:58 EDT;
- cleanup: immediately after each candidate, hard deadline 20:40:58 EDT;
- billing observer: owner review in Cost Explorer afterward;
- authorized: Candidate A/B HTTP/SSE, controlled unauthenticated wake probes,
  credential rotation, revocation, suspension, rate limiting, reconnect, and
  client-visible/log-output redaction checks;
- excluded: WebSocket work and Phase 1c.

Adopted budgets:

| Gate | Budget |
| --- | ---: |
| Observed-cold authenticated connection p95 | 2,500 ms |
| Interactive access-path p95 | 250 ms |
| Candidate B interactive added overhead | 100 ms |
| Reconnect p95 | 3,000 ms |
| Revocation | new requests within 5 s; established SSE within 10 s |
| Unauthenticated production wake | $0/day |

## Preflight and workload

Preflight at commit `2242f47f82daba4581b78fe5a45c32c84e2282d1` proved
a clean worktree and empty organization through an independent API inventory:
`running=0`, `warm=0`, `cold=0`, `sprites=[]`. The selected CLI was
`v0.0.1-rc45`; both disposable Sprites reported provider server `0.0.1-rc46`.

The harness built the same Linux amd64 Setta runtime release once, signed its
checksums with a throwaway minisign key, verified them locally, uploaded the
release verifier over the authenticated management channel, and reproduced
verifier SHA-256
`ffeda0423218bc07ebb1433c4b81e0be49268e40f100aad86483f57d55c9cdf3`
inside each Sprite before execution. Each candidate then installed that same
signed artifact and registered the production Setta runtime Service on port
7345.

The measured workload used production runtime paths:

- legacy one-time pairing only to bootstrap isolated test device credentials;
- authenticated `/workspace-session` HTTP requests;
- authenticated `/codex/account/events` SSE, whose production subscription
  immediately emits a typed `snapshot_required` event;
- five explicit suspend cycles per candidate, each waiting until the provider
  reported `cold` before measuring the authenticated wake;
- rotation to a second runtime device credential and revocation of the first;
- an established SSE stream during revocation;
- missing, revoked, suspended, and rate-limited client requests;
- generic error-body and harness-output checks for credential material.

Candidate A used the public Sprite URL and the runtime device credential
directly. Candidate B kept URL access provider-authenticated, authorized a
separate client credential in a local proof-of-concept gateway, used the
provider token only inside the Proxy WebSocket transport, and replaced the
outer credential with the separately rotated runtime device credential on
inner HTTP.

## Harness corrections

Two bounded attempts were discarded before measurement. Both explicit suspend
calls returned success, but the original harness allowed only 30 seconds for
the provider to leave `running`; both Sprites were destroyed and independent
inventories returned empty. The corrected harness used the already-proven
60-second observation bound and logged transitions. Across the final run, the
provider took approximately 31–37 seconds after each explicit suspend request
to report `cold`. The client-visible cold-wake latency was measured only after
that state transition and did not include this provider idle/suspend delay.

## Results

| Measurement | Candidate A | Candidate B | Budget/result |
| --- | ---: | ---: | --- |
| Protected HTTP p95 | 127.102 ms | 150.977 ms | both pass 250 ms |
| Candidate B protected-HTTP overhead | — | 23.875 ms | pass 100 ms |
| New SSE connection to first typed snapshot p95 | 145.760 ms | 512.208 ms | both pass 3,000 ms reconnect |
| Observed-cold authenticated wake p95 | 1,501.413 ms | 1,487.738 ms | both pass 2,500 ms |
| Missing credential response | 401, runtime woke | 401, no route or Proxy dial, runtime stayed cold | A fails $0 wake; B passes |
| Established-SSE revocation | not observed within 12,000 ms | 0.437 ms | A fails 10 s; B passes |
| Credential rotation | pass | pass | pass |
| Suspension | 401 at the already-reached runtime | 403 before route/Proxy dial | B passes pre-wake control |
| Rate limit | twelve requests remained 401 | 429 before route/Proxy dial | A has no pre-wake limiter; B passes |
| Credential in client-visible bodies/output | none observed | none observed | pass within observable scope |

Candidate B opened 28 Proxy connections across cold wakes, repeated SSE
connections, credential setup, and ordinary traffic. Missing, revoked,
suspended, and rate-limited outer credentials did not increment route or dial
counters.

The 512.208 ms Candidate B SSE number is a fresh Proxy-backed connection and
therefore applies to reconnect, not ordinary request latency on an already-open
event stream. The exact conversation-input-to-event workload remains Phase 4
data-plane validation; the current runtime had no live Codex account and the
authorized run did not add a test-only endpoint or run a model provider.

## Budget determination

Candidate B meets every adopted numeric budget exercised by the authorized
HTTP/SSE comparison:

- cold p95: 1,487.738 ms ≤ 2,500 ms;
- protected interactive HTTP p95: 150.977 ms ≤ 250 ms;
- interactive overhead over A: 23.875 ms ≤ 100 ms;
- fresh SSE reconnect p95: 512.208 ms ≤ 3,000 ms;
- new revoked requests: rejected before routing on the next request;
- established SSE revocation: 0.437 ms ≤ 10 seconds;
- missing credentials: zero Proxy dials and no runtime wake.

Candidate A cannot meet the adopted $0/day unauthenticated wake budget under
the documented public URL behavior. Its existing runtime stream sweep also did
not close the test stream inside 12 seconds, so it cannot meet the 10-second
revocation budget without another pre-runtime control—which would make it
Candidate B in substance.

## Security and evidence limits

- No provider or runtime credential appeared in client-visible error bodies,
  JSON results, or captured harness output. Provider-internal logs are not
  exposed by the API, so their redaction cannot be independently inspected.
- The gateway ran on the test client host. A hosted gateway must repeat latency,
  bandwidth, regional placement, load, and failure measurements before beta.
- The provider returned an empty `primary_region`/placement field for both
  Sprites. Same-org default placement was used, but exact physical colocation
  is unverified.
- The SSE workload proved production streaming, reconnect, and push revocation,
  but not conversation cursor replay after a submitted agent turn.
- Phase 1c, WebSockets, attached-idle cost, and real mobile transitions were not
  run.

## Cleanup proof

Final disposable runtimes:

- Candidate A: `setta-u-fd7c47010c05a4d24966b13966860678`;
- Candidate B: `setta-u-66feee7cea16651c467a27c89f2c7889`.

Each candidate was destroyed and verified absent before its subtest returned.
At 2026-07-19 19:09:59 EDT, a separate CLI API inventory reported
`running=0`, `warm=0`, `cold=0`, and `sprites=[]`, more than 91 minutes before
the hard cleanup deadline.

## Remaining Phase 3 work

1. Deploy the selected thin gateway in its intended region and measure
   bandwidth, operating cost, high availability, and failure behavior.
2. Apply the idle/disconnect policy to real UI event streams and measure
   attached-idle cost. The push-based hidden/offline web policy and cursor-safe
   deterministic coverage were completed offline on 2026-07-19; hosted cost
   measurement remains.
3. Run desktop and representative-device mobile transition checks.
4. Carry the exact production conversation submit → streamed event → cursor
   replay workload into Phase 4 data-plane validation.
5. Have the owner review Cost Explorer against the $5 cap.

Subsequent offline hardening is recorded in
`phase3-offline-hardening-20260719.md` and
`../reports/performance/cloud-event-stream-idle-policy-20260719.md`.
