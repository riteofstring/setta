# Minimal Control-Plane Foundation — 2026-07-20

## Outcome

The selected Candidate B gateway now has a production-shaped Go deployable
boundary instead of only a test-hosted handler. This remains an offline
foundation and has not been deployed.

The boundary owns:

- a SQLite authority for users, authoritative runtime assignment, devices,
  hashed client credentials, runtime-access grants, credential epochs,
  persistent fixed-window rate limits, idempotent assignment operations, and
  durable ensure-runtime intents;
- a separate private filesystem secret store for inner runtime credentials;
- provider-confined private transports resolved from durable route metadata;
- bounded request bodies, declared content-length enforcement, concurrent
  request/SSE ceilings, HTTP timeouts, health checks, and graceful shutdown;
- push cancellation for device revocation, user/runtime suspension,
  authoritative runtime replacement, credential-epoch rotation, and grant
  expiry;
- an event/timer-driven runtime reconciler with expiring leases and monotonic
  fencing tokens; and
- content-free JSON-lines gateway measurements.

No Sprite, Fly app, volume, provider request, or billing resource was created.

## Deployment boundary

`cmd/setta-control-plane` is the single intended Go deployable. Its `serve`
command requires all of the following:

- an absolute durable database directory;
- an absolute durable runtime-secret directory;
- a hosting-secret-injected `SPRITE_TOKEN`;
- an explicit numeric listen address and port;
- a loopback runtime target reached only through the Sprites private-access
  dialer; and
- positive concurrent-request, request-body, and shutdown ceilings.

The command removes `SPRITE_TOKEN` from its process environment before opening
the server. The Sprites adapter retains it only in process memory. Runtime
credentials are never stored in SQLite and are re-read from the secret store
for every route resolution, so an atomic secret-file replacement rotates new
requests without restarting the gateway.

TLS termination and normalized edge requests remain hosting-edge
responsibilities. `/healthz` is content-free and does not contact the provider.
All other paths enter the authenticated gateway.

The `ensure-runtime` operator command writes a provisioning intent but never
calls the provider itself. The `serve` process claims durable intents and
performs provider reconciliation. This keeps mutation intent restart-safe and
ensures provider work is attached to the same long-running fenced worker as the
gateway.

## Persistence and schema ownership

The `internal/controlplane` package owns schema version 1. SQLite uses foreign
keys, WAL journaling, one process-local connection, a five-second busy timeout,
and a private database file. A deferred composite foreign key makes an active
runtime assignment refer to a runtime owned by the same user. Replacement may
leave the old runtime in `deleting` while the user atomically points at the new
runtime; only the pointed-to runtime can authorize or resolve traffic.

Assignment idempotency binds the complete request fingerprint. Reusing a key
with different lifecycle, access, epoch, authority, or secret-reference data
fails rather than silently changing the operation.

Ensure-runtime idempotency is global with assignment idempotency and binds the
user, deterministic managed runtime name, credential epoch, runtime target,
and future credential-secret reference. Concurrent requests create one intent.
Replacement atomically points the user at the new provisioning runtime and
cancels unfinished intent for the old runtime without deleting its durable
record.

The reconciler inspects the deterministic managed identity before create. If a
create response is ambiguous, the durable operation enters retry wait; a new
worker inspects and adopts the owned provider resource before considering
another create. Claims have an expiry and monotonically increasing fencing
token. Completion requires the exact worker, token, unexpired lease, active
user, authoritative assignment, and provisioning lifecycle. A suspended user,
replacement, expired lease, or newer claim therefore prevents a stale worker
from committing. Retry state stores a typed content-free stage code rather
than provider response text.

Provider existence and authenticated URL access complete `ensure-runtime` but
do not mark the runtime ready. Signed release installation, attestation, the
inner runtime credential, and health must still complete before a separate
lifecycle transition can enable routing.

Client credentials contain 256 bits of randomness. Only SHA-256 token digests
enter SQLite. The restart-safe `bootstrap` operator command writes the raw
client credential to a mode-0600 file before durable provisioning, then safely
reuses that file after interruption. It has no HTTP administration endpoint.

## Resource ceilings

The deployable defaults are deliberately small and explicit:

| Control | Default |
| --- | ---: |
| Concurrent HTTP/SSE requests | 64 |
| Relayed request body | 1 MiB |
| Graceful shutdown | 10 seconds |
| Per-device authorization rate | 120 requests/minute |
| Gateway HTTP read-header timeout | 5 seconds |
| Gateway HTTP read timeout | 30 seconds |
| Gateway HTTP idle timeout | 60 seconds |
| Reconciler operation timeout | 90 seconds |
| Reconciler lease | 2 minutes |
| Reconciler retry delay | 30 seconds |
| Reconciler attempt ceiling | 10 |

Requests with chunked/unknown request-body length receive 411 and declared
oversized bodies receive 413 before authorization, route resolution, or a
provider connection. Whole-response write timeout remains disabled for healthy
long-lived SSE.

## Release artifact

`./scripts/release/build-control-plane.sh <absolute-output-directory>` builds a
static Linux amd64 executable with the repository-pinned Go toolchain and emits
`SHA256SUMS`. It refuses to overwrite an existing artifact.

The release contains no credentials, database, bootstrap file, region, Fly app
name, or provider endpoint configuration.

## Verification

Deterministic tests cover:

- database restart and authoritative runtime replacement;
- complete-request idempotency and cross-user ownership rejection;
- raw-token exclusion from every SQLite/WAL file;
- durable rate limiting;
- push invalidation for suspension, revocation, reassignment, and epoch
  rotation;
- private-file secret creation, rotation, permission/symlink rejection, and
  deletion;
- restart-safe operator bootstrap;
- real HTTP forwarding through the private-access dialer with inner credential
  replacement and outer credential stripping;
- denial before provider dial;
- established SSE cancellation;
- request concurrency and body ceilings;
- content-free measurement output;
- concurrent ensure-runtime collapse and cross-operation idempotency;
- ambiguous-create adoption across a database restart;
- lease expiry, fencing, replacement, and suspension; and
- permanent rejection of malformed provider identity.

## Deliberate limits before live authorization

This is not yet ready for the time-limited hosted run. The following offline
work remains:

1. Implement the selected one-App/one-Machine/one-volume Fly adapter from
   `hosted-control-plane-measurement-runbook-20260720.md`; the Fly organization
   and region remain intentionally unselected pending new authorization.
2. Implement the recorded authorization-manifest gate, hard cleanup deadline,
   independent inventory proof, and deployment teardown path.
3. Add signed runtime installation, attestation, credential issuance, and
   health stages to the provisioning state machine before it may mark a runtime
   ready.
4. Add backup/restore and record the single-instance failure expectations, or
   explicitly constrain the hosted run to disposable measurement state.
5. Exercise the web client through this control-plane server in a deterministic
   production Electron workflow.

Current availability is single instance on one durable volume. There is no
failover, database replication, secret-store replication, or backup yet. A
process restart is supported; volume loss is not. These limits block beta
production but do not require user action while the remaining offline work is
implemented.
