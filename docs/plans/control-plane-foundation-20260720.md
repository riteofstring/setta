# Minimal Control-Plane Foundation — 2026-07-20

## Outcome

The selected Candidate B gateway now has a production-shaped Go deployable
boundary instead of only a test-hosted handler. This remains an offline
foundation and has not been deployed.

The boundary owns:

- a SQLite authority for users, entitlement and grace state, authoritative
  runtime assignment, independent runtime lifecycle/access/health/release/wake/
  deletion state, devices, hashed client credentials, runtime-access grants,
  credential epochs, persistent fixed-window rate limits, idempotent assignment
  and wake operations, and durable ensure-runtime and Director-hosted-access
  intents;
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

The `internal/controlplane` package owns schema version 3. SQLite uses foreign
keys, WAL journaling, one process-local connection, a five-second busy timeout,
and a private database file. A deferred composite foreign key makes an active
runtime assignment refer to a runtime owned by the same user. Replacement may
leave the old runtime in `deleting` while the user atomically points at the new
runtime; only the pointed-to runtime can authorize or resolve traffic.

Assignment idempotency binds the complete request fingerprint. Reusing a key
with different lifecycle, access, health, desired or observed release, epoch,
authority, or secret-reference data fails rather than silently changing the
operation.

Ensure-runtime idempotency is global with assignment idempotency and binds the
user, deterministic managed runtime name, desired release, credential epoch,
runtime target, and future credential-secret reference. Concurrent requests
create one intent. Replacement atomically points the user at the new
provisioning runtime and cancels unfinished intent for the old runtime without
deleting its durable record.

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

The 2026-07-24 runtime-policy extension makes readiness fail closed: routing
and new grants require an active or unexpired-grace entitlement, ready
lifecycle, enabled access, healthy observation, and exact desired/observed
release equality. Wake requests are globally idempotent durable desired state;
health observations clear them. Suspension, export-only access, exact grace
expiry, release mismatch, and scheduled deletion invalidate live grants
without overwriting lifecycle. The signed bootstrap supplies its verified
installed release explicitly. Schema version 3 is a deliberate clean break;
older databases fail rather than receiving an implicit migration.

The 2026-07-24 extension persists provider-neutral hosted-access intents,
requested capability rows, and ordered progress events. The private Unix
administration boundary accepts strict intent JSON and exposes cursor-resumable
SSE without polling. The existing verified bootstrap now completes its
ready-state mutation through the serving process rather than opening SQLite in
a second process, so an established progress stream receives an in-process
push after the durable transaction commits. Reconnects replay from SQLite.
Ahead-of-history and malformed cursors fail instead of silently skipping
events.

The 2026-07-24 backup extension adds explicit offline `backup` and `restore`
operator commands. Backup uses SQLite's snapshot operation rather than copying
the database/WAL files, retains only the exact database-referenced runtime
secrets under the same in-process consistency boundary, writes private files
and a versioned checksum manifest, and refuses to overwrite a destination.
Restore validates the complete closed file set, manifest fields, checksums,
permissions, schema version, database schema, secret-reference equality, and
every credential through the production readers before succeeding. The
deterministic restore drill proves client authorization and ordered hosted
access progress survive volume replacement. The artifact remains plaintext
operator recovery material that must live on an encrypted trusted volume; it
is not the Phase 7 user-project export format.

The generated TypeScript surface contains only trusted user, project,
workstream, client-device, and requested-capability references. Provider,
Sprite, runtime, region, machine, endpoint, pairing, and wake fields are absent.
A deterministic production-process fixture builds and starts
`setta-control-plane`, submits the generated TypeScript intent, runs the real
bootstrap command with private credential files, and observes
`preparing_access -> syncing_project -> ready_on_phone` over SSE.

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

This is not yet ready for the time-limited hosted run. The hosted runner now
has strict manifest validation, an atomic state journal with pre-create
intents, fixed-shape provision reconciliation, restart-safe teardown,
independent inventory proof, pinned deployment templates, and a credential-free
dry-run. The following work remains:

1. Complete the hosted deployment coordinator. Exact Machines API CRUD,
   bounded inventory, staged secret import, provider-specific cleanup, and an
   expiry-safe cleanup command are implemented; checked-artifact image push,
   digest resolution, IP allocation, secret activation, and the provision
   command remain. The Fly organization and region remain intentionally
   unselected; read-only discovery exposed only the `personal` Fly
   organization, not a Fly organization named `setta-100`.
2. The live coordinator already orders signed runtime installation,
   attestation, credential issuance, and health before invoking bootstrap.
   Generalize those stages into the durable reconciler before using the
   control plane outside the bounded hosted measurement.
3. Provision an encrypted off-volume backup schedule, retention policy, and
   restore owner, then record a measured recovery-time objective. The local
   backup/restore format and deterministic restore drill are implemented, but
   automatic failover and replication are not.

The deterministic fixture has since been extended through the registered
production Electron hosted-cloud-chat workflow and Candidate B conversation,
queueing, steering, approval, cancellation, artifact, restart, and cursor
replay paths.

Current availability is single instance on one durable volume. There is no
failover, database replication, secret-store replication, or backup yet. A
process restart is supported; volume loss is not. These limits block beta
production but do not require user action while the remaining offline work is
implemented.
