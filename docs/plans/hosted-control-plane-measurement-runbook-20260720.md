# Hosted Control-Plane Measurement Runbook — 2026-07-20

## Status and decision

This now has an offline, fail-closed runner foundation plus live provider
bindings for exact cleanup. It does not itself authorize a deployment and has
not created a Fly App, Machine, volume, secret, image, or Sprite.

Use one disposable Fly App containing one Fly Machine and one encrypted 1 GiB
Fly Volume for the first hosted Candidate B measurement. The control plane
remains the `setta-control-plane` Linux amd64 artifact. Fly Proxy terminates
TLS; the Go server binds `0.0.0.0:8080`; the volume mounts at `/data`; and the
runtime remains private behind the Sprites Proxy transport.

This boundary follows Fly's current official surfaces:

- the [Machines API](https://fly.io/docs/machines/api/) owns Apps, Machines,
  and Volumes;
- [Fly App secrets](https://fly.io/docs/apps/secrets/) are injected into a
  Machine at boot and are not readable back through the API;
- [`http_service`](https://fly.io/docs/reference/configuration/#the-http_service-section)
  provides TLS-edge HTTP routing, health checks, request concurrency, and
  automatic stop/start controls; and
- [Fly Volumes](https://fly.io/docs/machines/api/volumes-resource/) expose
  region, encryption, attachment, and deletion state.

The Fly organization and region are deliberately not selected here. Both must
appear in a new owner authorization because the completed Phase 3
authorization covered Sprites Candidate A/B work, not a new paid Fly App.

## Authorization manifest

No mutating command may run from loose environment variables alone. The future
hosted runner must load one mode-0600 JSON manifest from an absolute private
state directory and validate all fields before the first provider call:

```json
{
  "schema_version": 1,
  "run_id": "lowercase-visible-ascii-id",
  "owner_authorized_at": "RFC3339 timestamp",
  "start_deadline": "RFC3339 timestamp",
  "cleanup_deadline": "RFC3339 timestamp",
  "maximum_spend_usd": "decimal string",
  "sprites_organization": "setta-100",
  "fly_organization": "explicit Fly organization slug",
  "fly_region": "explicit Fly region code",
  "fly_app_name": "setta-gateway-<run-id>",
  "resource_prefix": "setta-gateway-<run-id>",
  "authorized_workload": [
    "hosted-candidate-b-http-sse",
    "controlled-unauthenticated-wake",
    "rotation-revocation-suspension-rate-limit-reconnect-redaction"
  ],
  "excluded_workload": ["websocket", "phase1c"],
  "cleanup_authority": "destroy all run-owned resources even after authorization expiry",
  "billing_observer": "owner reviews Sprites and Fly billing after cleanup"
}
```

Fail closed if:

- any field is blank, unknown, duplicated, or outside the fixed allowlist;
- the manifest or state directory is group/other accessible or is a symlink;
- `now` is before authorization, after the start deadline, or too close to the
  cleanup deadline to preserve a 15-minute teardown reserve;
- the cleanup deadline is more than two hours after authorization;
- the spend value exceeds the newly authorized amount;
- either organization or the region differs from the manifest;
- the deterministic app name does not exactly match the run ID; or
- an inventory already contains a resource with the run prefix.

Cleanup is the sole exception to authorization expiry. Once a state manifest
exists, cleanup must remain callable before or after every deadline and must
never require the live-workload enable flag.

## Fixed deployment shape

The checked-in deployment adapter should generate no choices at runtime:

| Setting | Fixed value |
| --- | --- |
| App count | 1 |
| Machine count | 1; disable Fly's default HA spare |
| CPU | 1 shared CPU |
| Memory | 256 MiB initially; record actual configuration |
| Volume | 1 encrypted 1 GiB volume |
| Volume snapshots | disabled for disposable measurement state |
| Internal port | 8080 |
| Edge HTTP | HTTPS forced |
| Edge request hard limit | 64 concurrent requests |
| Auto start/stop | enabled, zero minimum Machines |
| Health check | `GET /healthz`, expect 2xx |
| Data directory | `/data/control-plane` |
| Runtime-secret directory | `/data/runtime-secrets` |
| Inner runtime target | `127.0.0.1:7345` through Sprites Proxy |

Do not put an app name or region in a checked-in `fly.toml`. Render both from
the validated manifest into the private run directory. Build the already
checksummed static control-plane artifact into a pinned minimal image; do not
compile unreviewed repository state on the remote builder.

Import secrets through stdin with `fly secrets import --stage`, never command
arguments or generated config. The app vault holds `SPRITE_TOKEN` and a
temporary inner runtime credential. Map the inner credential to a file for the
operator bootstrap; only `SPRITE_TOKEN` enters the serving process environment,
and `setta-control-plane` removes that entry before serving.

The client credential is generated first in the mode-0700 local run directory,
passed once to `setta-control-plane bootstrap` through bounded Machines API
stdin, and persisted on the private volume. It is removed locally immediately
after the workload. It must never enter the manifest, logs, measurement JSON,
shell history, Fly config, image, or remote command output.

## Ordered run

1. Validate the manifest and two distinct credentials: a short-lived Fly
   mutation token and a read-only organization inventory token. Resolve the
   existing Sprites credential only after validation.
2. Capture independent pre-run Fly organization inventory and Sprites
   organization inventory. Refuse any matching run prefix.
3. Build the static Linux artifact, verify `SHA256SUMS`, build the pinned image,
   and record only image digest, binary digest, and tool versions.
4. Create the exact Fly App, then its one encrypted volume in the authorized
   region. Persist returned app, volume, and later Machine identifiers
   atomically after each successful provider response.
5. Create one already-authorized disposable private Sprite, install the signed
   runtime release, and pair an inner device credential through the
   authenticated private transport.
6. Stage the Sprite provider token and freshly paired inner credential through
   stdin, deploy exactly one Machine with HA disabled, and confirm actual
   Machine region, volume region/attachment, image digest, and `/healthz`.
   Generate the client credential locally, pass it to bootstrap through bounded
   Machines API stdin, and confirm the route remains unusable until the inner
   secret and grant are durable.
7. Run only the manifest workload. Record content-free gateway measurements,
   actual Fly Machine/volume placement, Sprites placement when exposed,
   relayed bytes, process ceilings, wake behavior, and failure observations.
8. Begin teardown immediately after the workload or at the 15-minute reserve,
   whichever comes first.

Every mutation must check the cleanup clock first. A failed or ambiguous
provider response transitions immediately to inventory/reconciliation; it must
not blindly repeat create.

## Teardown and proof

Teardown is idempotent and works from the durable identifiers even if deploy or
measurement stopped midway:

1. Revoke the control-plane grant and delete the local copied client
   credential.
2. Destroy the run-owned Sprite and independently confirm the Sprites
   organization contains no matching identity.
3. List run-owned Fly Machines, force-destroy each exact ID, and confirm the
   Machine list is empty.
4. List run-owned Fly Volumes, destroy each exact ID, and confirm the volume
   list is empty. Machines must be gone first because attached volumes cannot
   be destroyed.
5. Destroy the exact Fly App, then query organization-wide Apps inventory with
   the separate read-only token until the exact name and prefix are absent.
6. Record cleanup attempts, accepted deletion times, final empty inventories,
   and cleanup completion. Retain no credential values.

The bounded inventory recheck is the one justified polling path. Fly App
deletion is asynchronous (`202 Accepted`) and the provider exposes no deletion
completion stream; inventory is therefore the independent completion source.
The interval and maximum attempts must be fixed, terminate before the cleanup
deadline, and switch to a loud emergency-cleanup error rather than waiting
indefinitely.

Deleting a Fly App with the Machines API supports `force=true`, but the normal
path still deletes Machines and Volumes explicitly so residual paid storage is
visible and independently proven absent. Force-delete is the final emergency
fallback, not the first teardown step.

## Evidence and stop conditions

Persist only content-free evidence:

- manifest digest and validated authorization times;
- tool, binary, and image digests;
- opaque provider resource IDs and actual region codes;
- typed operation/result codes and timestamps;
- request counts, durations, relayed bytes, and resource ceilings;
- final empty inventory snapshots; and
- links to the owner's later billing review.

Stop creating or measuring and enter cleanup if any credential is printed,
placement differs, the app shape differs, health or access-path budgets fail,
an unauthenticated request opens a Sprite transport, the state file cannot be
synced, inventory is ambiguous, or the teardown reserve begins.

## Offline implementation status

Implemented on 2026-07-20:

1. `internal/hostedmeasurement` strictly decodes the mode-0600 manifest,
   rejects duplicate/unknown fields and unsafe filesystem boundaries, validates
   the fixed workload and two-hour window, and keeps cleanup callable after
   expiry.
2. The package writes a mode-0600, atomically replaced and directory-synced
   state journal. A durable deterministic-name intent is committed before each
   provider create, so a process interruption between provider success and ID
   persistence can be reconciled without a duplicate create.
3. The fixed one-App/one-volume/one-Machine provisioner and cleanup coordinator
   are provider-interface driven. Cleanup is ordered, idempotent, uses exact
   IDs, and proves absence through bounded independent inventory checks. The
   bounded recheck remains the only polling path.
4. Deterministic race-enabled tests cover strict authorization, expiry,
   teardown reserve, ambiguous create adoption, deploy interruption, journal
   interruption, restart, partial cleanup, idempotent cleanup, and final empty
   inventories.
5. `setta-hosted-measurement dry-run` emits the complete content-free action
   plan without reading provider credentials, contacting a provider, or
   creating `state.json`.
6. `deploy/hosted-control-plane` contains the pinned linux/amd64 distroless
   image and fixed Fly configuration template. The base manifest digest was
   resolved read-only on 2026-07-20.
7. The Fly provider binding uses separate inventory and mutation credentials,
   bounded typed Machines API responses, exact App/volume/Machine identities,
   and the fixed one-CPU/256-MiB/one-volume service shape. It rejects an image
   that is not a registry reference pinned by a complete SHA-256 digest and
   rejects a created or restart-adopted Machine unless current provider
   inventory attests that same digest.
8. Secret staging invokes an absolute resolved `flyctl` binary without a
   shell, imports exactly `SPRITE_TOKEN` and the base64-encoded inner runtime
   credential through stdin, and excludes inherited provider credentials.
   The Machine exposes the inner credential only as a file and allows only the
   Sprite token into the serving process environment.
9. The Sprites cleanup binding lists a bounded number of pages, verifies the
   exact deterministic managed identity, organization, and ownership labels,
   and deletes only that identity. Provider response details are excluded from
   durable and operator errors.
10. `setta-hosted-measurement cleanup` opens an existing journal without ever
    initializing a missing one, remains callable after authorization expiry,
    and resolves credentials only for providers represented by durable intent
    or resource state. It removes and confirms the Sprite before Fly
    reconciliation so a Fly inventory failure cannot strand the Sprite.
11. Shared public IPv4 preparation inventories typed `flyctl --json` output
    with the read-only credential, allocates only the free shared address type
    with the mutation credential when absent, and requires an independent
    post-allocation inventory confirmation. Duplicate or malformed inventory
    fails closed.
12. The provisioner composes restart-safe secret staging and shared-ingress
    preparation before Machine creation, with a fresh cleanup-reserve check
    between every mutation. Crossing the reserve transitions the durable run
    to cleanup before the next provider call.
13. Published-image resolution accepts only private Buildx JSON metadata in
    the run directory, requires the top-level and OCI descriptor manifest
    digests to match, and derives the immutable Fly registry reference without
    parsing human command output.
14. The image publisher authenticates Fly's registry through an isolated
    private Docker configuration, verifies the release binary against the
    exact `SHA256SUMS` input before either command, pushes only linux/amd64 with
    local Buildx, and reuses a prior result only when its private metadata is
    already valid.
15. The top-level run coordinator arms cleanup before the first mutation,
    durably creates the registry-owning App, publishes its image, resumes the
    remaining fixed provisioning, enters measuring state, executes an injected
    workload, and always invokes cleanup with a context independent from a
    canceled workload.
16. Sprite provisioning derives one deterministic run identity, records intent
    before creation, refuses an unjournaled pre-existing runtime, verifies the
    exact provider ID/name/ownership labels on create and restart, persists
    actual placement, and shares the same cleanup-reserve cutoff as Fly.
17. Runtime release inputs come from a strict schema-versioned manifest in the
    private run directory. It permits only private same-directory regular
    files, fixes the target to Linux AMD64, validates the release identity at
    its owning package boundary, pins the custom verifier by SHA-256, and
    derives its protected remote path in code.
18. The provider-neutral verifier installer reads and hashes the exact private
    local bytes before provider calls, rejects remote symlinks and digest drift,
    stages non-executable bytes with argv-only commands, verifies them remotely,
    publishes atomically, and re-verifies the selected path.
19. Hosted Sprite runtime preparation now composes durable provisioning,
    verifier installation, the existing signed release install loop, and its
    identity/version/health proof in one ordered, restart-safe operation.
20. The typed Fly Machines binding includes bounded exact-Machine execution
    with the mutation credential, private stdin, structured output, and
    content-free errors; invalid app, Machine, command, input, or timeout
    boundaries fail before transport.
21. Control-plane bootstrap can accept a locally generated device credential
    through bounded stdin, validate and durably persist it with private
    permissions, and require exact equality on restart. This removes any need
    to print or copy the credential back out of the distroless Machine.
22. The runtime pairing command has an explicit single-event JSON mode so
    automation can mint the temporary inner credential through a typed output
    contract instead of scraping human text or QR output.
23. Provider-neutral runtime pairing now invokes that typed command, completes
    pairing only through the authenticated private dialer, validates the exact
    runtime and protocol response, bounds every payload, and keeps tokens out
    of all errors.
24. The top-level coordinator now prepares and privately pairs the signed
    Sprite runtime before Fly Machine creation, passes the freshly minted inner
    credential only into secret staging, clears it immediately afterward, and
    never exposes it to the measurement workload.
25. Hosted bootstrap creates one private local client credential, journals its
    digest plus the exact Machine/Sprite/device identities before remote exec,
    passes it through bounded stdin, validates the typed ready event, and skips
    only after durable acceptance. Missing or drifted restart credentials fail
    closed instead of minting replacements.
26. The executable coordinator now requires bootstrap as an explicit stage
    after Fly provisioning and before the measuring phase, and passes only the
    private local credential path and non-secret prepared runtime metadata to
    the authorized workload.
27. The hosted Candidate B workload uses the private bootstrap credential for
    fixed HTTP and SSE samples, measures cold connections, interactive HTTP,
    first-event reconnects, and the adopted p95 budgets, and writes only a
    private content-free report. Its controlled unauthenticated probe suspends
    the exact owned Sprite, observes one non-active state before and after the
    denied request, and fails if the request opens the runtime.
28. The serving control plane now owns a mode-0600 Unix administration socket
    inside its private data directory. Typed admin commands can ensure a
    replacement device, revoke an exact device, and suspend or resume the user
    in the live store process, so established-stream invalidation remains
    push-based; no administration route is exposed through Fly HTTP.

Still required before a live create/deployment mutation:

1. Wire the implemented checked-artifact publisher, signed runtime
   preparation, staged-secret activation, bootstrap, and hosted workload into
   the manifest-gated provision command. The operator CLI intentionally
   exposes only `dry-run` and exact cleanup; it cannot create resources.
2. Add access-lifecycle measurement and revoke/remove the bootstrap client
   credential during cleanup before provider resources are reconciled.
3. Supply a newly valid manifest with an explicit Fly organization slug and
   region. A read-only check on 2026-07-20 found the local Fly identity exposes
   only organization `personal`; it does not expose a Fly organization named
   `setta-100`. The same check found no existing `setta-gateway-` Sprite in the
   Sprites `setta-100` organization. No target was inferred and no mutation was
   attempted.
