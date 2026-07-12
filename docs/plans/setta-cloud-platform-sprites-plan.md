# Setta Cloud Platform: Sprites-First Runtime Plan

**Date:** 2026-07-13

**Status:** Plan of record; implementation has not started. Phase 0 branch
creation and plan authoring are complete.

**Branch:** `setta-3-cloud-platform`, created from `setta-3` at
`de4bae2e4`.

**Worktree:** `/Users/jeff/Documents/_projects/setta.setta-3-cloud-platform`,
created with the repository's `worktree.sh` script.

**Source branch:** `setta-3-cloud-runs-2` remains a read-only source of proven
remote-runtime and terminal work. Do not merge it wholesale.

## Authority and Superseded Direction

This document is the plan of record for Setta-operated cloud development
runtimes. For this product direction it supersedes:

- `docs/plans/byo-cloud-one-click-runtime-plan.md`
- `docs/plans/remote-runtime-plan.md`
- the Fly Machines and Cloud Box recommendations in
  `docs/plans/setta-v3-architecture-recommendations.md` and part 2

Those documents remain useful historical research. Their Tailscale-only,
user-owned provider, provider wizard, workflow, and PWA assumptions are not
requirements for this plan.

If this plan conflicts with repository-wide engineering rules in `AGENTS.md`,
`AGENTS.md` wins.

## Product Decision

Setta should offer a cloud computer that feels like part of Setta, not like a
cloud-provider setup exercise.

The v1 model is:

```text
one Setta user
  -> one persistent CPU Sprite
  -> multiple repositories, conversations, terminals, agents, and previews
  -> paired desktop and phone clients
  -> optional temporary Runpod GPU workers for GPU-specific jobs
```

The user signs into Setta and asks to work. Setta selects, provisions, wakes,
and connects the appropriate runtime. Ordinary users do not select a cloud
provider, paste a provider API key, install Tailscale, choose a VM, or manage a
runtime picker.

One logical runtime per user does not mean one continuously running VM per
user. A Sprite preserves its filesystem while idle and wakes on demand.

## Why Sprites Is the First CPU Provider

Fly Sprites is the current first provider because its documented product model
closely matches Setta's workload:

- persistent, hardware-isolated Linux environments intended for arbitrary
  code, agents, and development environments;
- a full persistent ext4 filesystem with idle data backed by object storage;
- no compute charges while idle;
- a URL that wakes the environment on request;
- background services that restart when a Sprite wakes;
- a Tasks API that can hold a Sprite active while an agent or worker is still
  running after every client disconnects;
- checkpoints and restore;
- programmatic HTTP/WebSocket APIs and an official Go SDK;
- outbound network, resource, and privilege policies.

This is a provider choice, not a permanent domain-model choice. Core Setta
records and runtime protocols must not use Fly-specific states as their own
source of truth.

Sprites is also a young product. Its current public API documentation labels
the latest surface `0.0.1-dev`, and its lifecycle and limits must be proved
instead of assumed. The first milestone is therefore a measured proof of
concept, not a production launch.

Official references:

- [Sprites product and pricing](https://sprites.dev/)
- [Sprites overview](https://docs.sprites.dev/)
- [Working with Sprites](https://docs.sprites.dev/working-with-sprites/)
- [Keeping a Sprite running](https://docs.sprites.dev/keeping-sprites-running/)
- [Sprites lifecycle and persistence](https://docs.sprites.dev/concepts/lifecycle/)
- [Sprites services](https://docs.sprites.dev/concepts/services/)
- [Sprite maintenance](https://docs.sprites.dev/sprite-maintenance/)
- [Sprites API](https://docs.sprites.dev/api/dev-latest/)
- [Sprites policy API](https://docs.sprites.dev/api/dev-latest/policy/)
- [Sprites checkpoints API](https://docs.sprites.dev/api/dev-latest/checkpoints/)
- [Sprites connectors](https://docs.sprites.dev/concepts/connectors/)

The current public pages are internally inconsistent about checkpoint
creation and restore semantics. The API describes filesystem snapshots without
interrupting running processes, while the working guide describes process and
in-memory capture and processes stopping during creation. Phase 1 must treat
those semantics as unknown and record live, versioned probes.

## GPU Decision

Do not make the user's persistent development computer a GPU machine. Keep the
CPU Sprite as the durable workspace and launch a bounded Runpod Pod only for a
specific GPU job. Transfer the minimum required source, data, or checkpoint;
return outputs to the Sprite; terminate the Pod when the job ends.

Runpod is deferred until the CPU Sprite loop works. Its current API supports
creating, starting, stopping, and terminating Pods, but stopped Pods retain
storage charges, container-disk data is not durable across stop, and GPU
capacity is not guaranteed on restart. These constraints require explicit
lifecycle logic.

Official references:

- [Runpod Pod lifecycle](https://docs.runpod.io/pods/manage-pods)
- [Runpod GPU pricing](https://www.runpod.io/pricing)

## Responsibility Boundary

For the included CPU environment, Setta will hold the provider relationship
and pay Fly. Setta therefore owns:

- deciding who may receive a runtime;
- subscription and refund handling;
- per-user quotas and cost controls;
- suspending abusive accounts;
- responding to Fly abuse reports;
- the Setta runtime, control plane, pairing, and product experience;
- backup/export policy and deletion timing.

Fly owns the underlying hosts, microVM isolation, Sprite filesystem machinery,
provider networking, and provider incidents.

Runpod GPU billing should remain directly user-owned for the first GPU version
unless Runpod gives Setta written commercial/reseller permission. A
Setta-funded GPU product is out of scope until there are hard spend controls
and a written provider agreement.

## Settled Architecture Boundaries

Do not relitigate these while implementing the proof of concept unless new
evidence is recorded in this plan.

1. All Setta backend and control-plane implementation in this repository is
   Go.
2. The durable development workspace is the user's CPU Sprite.
3. One Sprite per user is the v1 default. Multiple projects share it.
4. A Sprite is not the system of record for identity, subscription,
   entitlement, provider mapping, or deletion schedule.
5. The Setta control plane stores only the metadata needed to provision,
   authenticate, route, meter, suspend, and delete runtimes. It does not store
   terminal contents or repository contents in its metadata database. It may
   authorize and track the encrypted off-provider backup/export path in Phase
   7, but backup contents belong in a dedicated data store with explicit
   retention and deletion behavior.
6. The Fly organization token is server-side only. It must never be shipped to
   Electron, a browser, a phone, a Sprite, logs, generated fixtures, or a
   prompt.
7. Setta runtime authentication remains mandatory even if Fly provides a
   network authentication layer.
8. Runtime selection is an internal policy decision. Keep a registry boundary,
   but do not make ordinary users select a runtime or provider.
9. Provisioning is idempotent. Retried sign-in, webhook, wake, or ensure calls
   must converge on the same runtime.
10. Destruction is never an automatic response to a transient provider,
    payment, or application error.
11. Git remotes and an off-provider export or backup are required before the
    product claims durable safety. Sprite checkpoints are rollback tools, not
    the sole backup strategy.
12. The existing Easy Button branch is a moving downstream product branch. Do
    not merge it into this branch during the proof-of-concept phases.
13. The trusted Setta runtime and untrusted user or agent processes require an
    explicit isolation boundary inside the Sprite. Hardware isolation between
    Sprites does not protect the runtime from code executing in the same
    Sprite.
14. A Setta device belongs to a Setta user. Access to a particular runtime is a
    revocable grant, not a permanent property of the device, so replacing a
    Sprite does not strand the user's device identity.
15. The control plane is authoritative for account suspension, runtime access
    grants, credential epochs, desired release, and destructive-operation
    intent. Sprite-local state may cache bounded credentials but must not be
    able to silently override those decisions.
16. A checkpoint restore is a security-sensitive destructive operation. It
    must not restore revoked access, an obsolete credential epoch, or an
    unapproved release as authoritative state.
17. Do not create a paid persistent Sprite merely because an identity-provider
    signup occurred. Provisioning requires an explicit beta allowlist or an
    active runtime entitlement established by the product's eligibility and
    payment policy.

## Branch and Commit Protocol

### Phase 0 branch and worktree creation

New platform branches must use the repository's worktree helper rather than
reusing an existing feature worktree. From a clean worktree checked out at the
intended `setta-3` base, the normal creation command is:

```sh
./worktree.sh --stay setta-3-cloud-platform
```

In this case, the branch and plan commit already existed when the worktree
mistake was identified. The original cloud-runs worktree was first restored to
its own branch, then the existing platform branch was attached through the
supported helper:

```sh
git switch setta-3-cloud-runs-2
./worktree.sh --stay --existing setta-3-cloud-platform
```

All platform implementation must run from
`/Users/jeff/Documents/_projects/setta.setta-3-cloud-platform`. Do not switch
the cloud-runs, Easy Button, or other feature worktrees onto this branch.

The recorded base is `de4bae2e4`. Do not silently recreate the branch from a
newer base. If the base must change, record the old base, new base, reason, and
conflict result in the progress log before doing so.

Before porting source code:

1. Confirm `setta-3-cloud-runs-2` still points at `39bc2e719` or a documented
   descendant.
2. Push or otherwise back up that source branch. At plan creation it contained
   20 commits not present on `origin/setta-3-cloud-runs-2`.
3. Keep `setta-3-cloud-runs-2` intact. Do not reset, rebase, squash, or delete
   it.
4. Confirm this branch has a clean worktree before each porting slice.

At the 2026-07-13 review, `setta-3-cloud-runs-2` was clean and fully committed
at `39bc2e719`. Its local tracking state reported 20 commits ahead of
`origin/setta-3-cloud-runs-2` and zero behind; a fresh remote comparison could
not be authenticated from this worktree, so the user will confirm that state
while pushing or otherwise backing up the branch. Its dedicated worktree
protects it from ordinary working-tree mistakes, but linked worktrees share one
Git object database and are not an independent backup. The remaining Phase 0
item is therefore off-repository recovery, not additional local committing.

### Frequent commits are required

Implementation must proceed as small, reviewable, working commits:

- Commit after each narrow checklist item or coherent vertical slice. Do not
  accumulate an entire phase in the working tree.
- Prefer one behavior and its tests in the same commit.
- Keep provider API types, lifecycle transitions, security policy, and UI
  integration in separate commits when they can be verified separately.
- Use descriptive subjects such as `cloud-platform: create typed Sprite
  client`; avoid generic subjects such as `progress` or `more changes`.
- Do not mix cleanup, generated-contract changes, and unrelated product work
  into a feature commit.
- Do not squash the development history before the platform is integrated.
  The small commits are needed to port or revert work safely.
- Update the checklist or append a progress-log entry whenever a phase gate is
  reached or a settled decision changes.
- Never commit an intentionally failing intermediate state to the shared
  branch. A short local red/green cycle is fine; each shared commit must pass
  its narrow required checks.

Before each source-code commit, follow `AGENTS.md`: regenerate outputs owned by
changed Go contracts, run `./scripts/format.sh`, then run
`./check_quality.sh --git-changes` unless the change requires the broader gate.
Run `./scripts/check_supply_chain.sh` for dependency or broad implementation
commits. Use `./scripts/go.sh` for every Go command.

Documentation-only commits require diff inspection and directly relevant
checks only. Record when the full executable workflow is skipped for that
reason.

### Integration discipline

- Do not merge `setta-3-cloud-runs-2` wholesale.
- Do not cherry-pick generated files without their Go owner changes. Regenerate
  generated contracts on this branch.
- Do not repeatedly merge the active Easy Button branch.
- Resolve platform work against `setta-3`; integrate the Easy Button product
  only after its owners declare a stable checkpoint.
- Avoid changing chats, workflows, conversation UI, or presentation code just
  to demonstrate provisioning.

## Reusable Work Inventory

Port behavior, tests, and narrowly useful implementation from the source
branch. Do not assume the old commits apply cleanly.

### Port and adapt

- Runtime feature identity: `e9bf0e1ac`
- Runtime service bootstrap and verified installer pieces: `3fecc3c6c`
- Secure desktop runtime-token storage: `a7866b1e5`
- Provisioning seed and setup attestation: `12ff0999d`
- Signed bootstrap and installer verification pieces: `34fd96152`
- Production bootstrap-token handling: `81450fad8`
- Duplex terminal protocol and backend: `673401bbd`, `59041d186`
- Desktop/web terminal-stream clients: `b86848a85`
- Renderer terminal scheduling and latency fixes: `a48fd11c6`, `fecb4d696`,
  `b2ec9ab79`, `44e9f2ac1`, `e7baefcfe`, `b0d0641fd`, `593b47365`

### Reuse only as design evidence

- Pairing and device revocation semantics.
- Idempotent provisioning records and duplicate adoption.
- Explicit cleanup and failure diagnosis.
- Runtime diagnostics.
- Provisioning progress reporting.

### Do not port

- Tailscale OAuth, auth-key minting, `ts.net` validation, and tailnet discovery.
- AWS/provider catalogs, live provider resolution, and placement selection.
- OpenTofu/Terraform kits.
- The SSH existing-machine happy path.
- The cloud-provider wizard and provider-facing runtime picker UI.
- User-held cloud credentials and local provider CLI execution.
- Old plan progress commits or generated web assets.

## Target Domain Model

Keep provider identifiers out of user-facing concepts. The minimum control
plane records are:

```text
User
  id
  identity_provider_subject
  status

Subscription
  user_id
  entitlement
  state
  grace_ends_at

Runtime
  id
  user_id
  provisioning_state    absent | provisioning | bootstrapping | ready |
                        deleting | deleted | failed
  desired_access_state  enabled | suspended | export_only | delete_scheduled
  health_state          unknown | healthy | degraded | unreachable
  provider_kind
  provider_resource_id
  provider_observation  typed provider-adapter observation, not a core state
  endpoint
  runtime_identity
  credential_epoch
  desired_release
  observed_release
  last_ready_at
  deletion_scheduled_at

Device
  id
  user_id
  public_identity_or_token_hash
  revoked_at

RuntimeAccessGrant
  device_id
  runtime_id
  credential_epoch
  expires_at
  revoked_at

Operation
  id
  runtime_id
  kind
  idempotency_key
  state
  attempt
  lease_owner
  lease_expires_at
  provider_request_id
  last_error_code
  created_at
  updated_at

UsageInterval
  user_id
  runtime_id
  interval_start
  interval_end
  typed_measurements
  measurement_source
  enforced_budget
```

Subscription state remains on `Subscription`; it is not duplicated into the
runtime provisioning state. Provider power observations such as `running` or
`cold` remain adapter-owned because Sprites does not expose every warm/cold
transition as a stable control-plane state.

Do not add heuristic state inference from error strings. Use provider response
fields, runtime health/identity responses, and explicit operation records.

## Access and Authentication Gate

Fly currently documents two Sprite URL modes:

- `sprite`: requires Fly organization membership or an organization token;
- `public`: no Fly URL authentication.

There is no documented custom Setta identity mode. Giving users the Fly
organization token is prohibited, and requiring a Fly account defeats the
product goal. The proof of concept must therefore evaluate two legitimate
architectures:

### Candidate A: public Sprite URL with Setta authentication

Fly terminates TLS and wakes the Sprite. The only exposed service is the Setta
runtime. Every application request and WebSocket upgrade requires a
short-lived or revocable Setta credential. Provisioning and destructive
provider APIs remain unreachable from the Sprite URL.

Advantages: direct data path, low latency, and no Setta relay bandwidth.

Risks: a public attack surface, unauthenticated traffic still wakes compute,
and code inside a sleeping Sprite cannot rate-limit the request that wakes it.
Candidate A is viable only if Fly or another pre-wake edge can enforce useful
abuse controls without turning that edge into an unbounded Setta relay. An
unguessable URL and an in-runtime rate limiter do not solve wake abuse.

### Candidate B: private Sprite URL through a small Setta gateway

The client authenticates to Setta. The gateway authorizes the user/runtime
mapping and forwards HTTP/WebSocket traffic to the private Sprite while the
provider token remains server-side.

The gateway must terminate the client's Setta credential, use the Fly
credential only on the provider-facing hop, strip spoofable identity headers,
and authenticate the gateway-to-runtime hop separately. The design must prove
how this works when both Fly URL authentication and the current Setta runtime
would otherwise consume an `Authorization: Bearer` header. Provider and gateway
logs must redact credentials and single-use WebSocket tickets.

Advantages: private Sprite URLs, centralized suspension, and no public runtime
surface.

Risks: Setta becomes the data path and inherits bandwidth, latency,
availability, WebSocket, and support responsibility.

### Gate criteria

Do not choose by taste. Measure both with the same terminal workload and
record:

- warm and cold connection latency;
- interactive terminal p50/p95;
- reconnect behavior across sleep/wake;
- unauthenticated wake behavior and rate limiting;
- provider token exposure analysis;
- gateway bandwidth and operating cost;
- mobile network transition behavior;
- suspension and revocation latency.

The selected design must not rely on an unguessable URL as authentication.
Before the final comparison is run, record explicit product budgets for cold
connection time, interactive p95 latency, reconnect time, revocation latency,
and maximum unauthenticated wake cost. Phase 1 measurements may inform the
budgets, but the budgets must be written before comparing the final candidates
so the decision cannot be retrofitted to the preferred result.

### Credential authority gate

Do not port the existing long-lived runtime-local device-token design as the
product authority. Before selecting an access path, define and prove:

- the control-plane issuer, audience, runtime binding, expiry, and credential
  epoch for short-lived runtime access;
- user-owned device identity plus a separately revocable runtime access grant;
- signing-key rotation and runtime behavior while the control plane is
  temporarily unavailable;
- suspension and revocation behavior for existing HTTP, SSE, and WebSocket
  connections;
- reauthorization after runtime replacement or checkpoint restore; and
- a bounded proof-of-concept issuer that exercises the same trust boundaries
  before the production Clerk integration exists.

## Control Plane Shape

The control plane should start small:

```text
Clerk-authenticated client
  -> Setta control plane
       -> user/runtime/device/entitlement records
       -> idempotent runtime reconciler
       -> Fly Sprites API
       -> optional access gateway, only if Candidate B wins

desktop or phone
  -> selected authenticated runtime data path
       -> Setta runtime inside the user's Sprite
       -> repositories, agents, terminals, previews, artifacts
```

The first provisioning entry point should behave like:

```text
ensureRuntime(userID) -> existing or newly provisioned runtime
```

It must be synchronous at the API boundary but may return a typed in-progress
state. Auth webhooks may prewarm a runtime, but correctness must not depend on
a webhook arriving once or in order.

Provisioning and wake progress must be push-based through a typed event stream.
Do not revive the source branch's polling watch as the product architecture.

Before Phase 5 implementation, record the initial control-plane deployment
boundary: database, schema ownership, secret store, migration procedure,
durable worker/reconciler, lease or leader-election mechanism, backup, and
availability expectations. Provider mutations must be represented by durable
operations with unique idempotency keys, leases or fencing, bounded retry
classification, and retained ambiguous outcomes. A database uniqueness
constraint must enforce at most one live default runtime per user; a
deterministic provider name alone is insufficient concurrency control.

Identity and billing choices are not implementation prerequisites for the
provider PoC. The intended initial product split is Clerk for authentication
and Stripe Billing for subscriptions, with Setta's database owning the runtime
entitlement projection. Do not adopt Clerk Billing without a separate decision:
its current documentation says it is separate from Stripe Billing, is not a
merchant of record, lacks tax/VAT support, lacks metered billing, and does not
support 3DS payment flows.

References: [Clerk Billing documentation](https://clerk.com/docs/guides/billing/overview),
[Clerk Billing product FAQ](https://clerk.com/billing)

## Security and Abuse Baseline

The platform may execute arbitrary user and agent code, so the following are
requirements rather than later polish:

- one hardware-isolated Sprite per user;
- a protected Setta runtime identity distinct from the identity used by Codex,
  terminals, previews, and arbitrary workspace processes;
- no untrusted write access to runtime authentication, release, audit, usage,
  or service-control state;
- an explicit capability and permission map for management-socket and other
  provider-control operations reachable from inside the Sprite, including
  Tasks, Services, checkpoint, and restore; prove untrusted workloads cannot
  use them to override the trusted runtime;
- deterministic per-user CPU, memory, storage, concurrency, and daily spend
  ceilings;
- deny-by-default outbound network policy with explicit product presets;
- SMTP and common abuse destinations blocked by default;
- no arbitrary public inbound ports;
- previews use authenticated, scoped routing on an origin isolated from Setta
  runtime credentials and product UI, with CSP, sandbox, port ownership, and
  SSRF protections;
- provider master credentials never enter the Sprite;
- secrets are scoped to one user/runtime or brokered through restricted
  connectors;
- verified identity or payment before expensive capabilities;
- immediate Setta suspension independent of provider deletion;
- minimal, content-free security audit events for provisioning, policy,
  authentication, suspension, and destructive actions;
- explicit retention and deletion schedules;
- an export path that remains available during a bounded payment grace period.

If untrusted code can modify the Setta runtime authority, restore security
state without control-plane reconciliation, or keep compute billing active
outside Setta's hard budget, stop the proof of concept and reassess the
provider/runtime boundary.

Network policy must be tested against real developer operations. A policy that
breaks Git, package managers, model APIs, or normal preview access is not
acceptable, but broad outbound access must be an explicit higher-risk mode.

## Implementation Phases

### Phase 0: establish the branch and plan

- [x] Confirm no Sprites-first plan exists.
- [x] Create `setta-3-cloud-platform` from `setta-3` at `de4bae2e4` and attach
  it to a dedicated worktree through `worktree.sh`.
- [x] Write and commit this plan before implementation.
- [ ] Back up `setta-3-cloud-runs-2` at `39bc2e719` or its documented
  descendant.

Exit: the clean platform branch and source branch are both recoverable.

### Phase 1: build a Sprites provider and runtime-boundary proof of concept

- [ ] Send Fly an early written inquiry covering customer-per-Sprite use,
  expected retained and active counts, placement, API limits, billing data,
  encryption and data handling, support, and abuse escalation. Final
  commercial confirmation remains a beta gate, but do not defer discovery
  until the end of implementation.
- [ ] Record the Sprites API/SDK version used and pin any direct dependency
  exactly through `./update_dependencies.sh`. If the SDK has no release tag,
  pin an exact commit-derived Go pseudo-version.
- [ ] Record live capability probes for name and label support, URL auth,
  Services, Tasks, network/resource/privilege policies, checkpoints, usage or
  billing measurements, placement, and deletion. Do not treat `dev-latest`
  documentation or connector label examples as a stable contract.
- [ ] Define a narrow typed provider interface for create, inspect, exec,
  URL settings, service, policy, checkpoint, restore, and destroy. Keep the
  in-Sprite Tasks integration behind a separate Setta workload-lease boundary.
- [ ] Implement the Sprites adapter without leaking Fly response types into
  core lifecycle types.
- [ ] Use deterministic Setta-owned Sprite names. Use provider labels only if
  the pinned create/inspect API proves them.
- [ ] Create one Sprite from an automated Go test/harness.
- [ ] Write a file and repository, allow the Sprite to idle, wake it, and prove
  filesystem persistence.
- [ ] Install and start a minimal Setta runtime as a Sprite Service.
- [ ] Prove service restart after Sprite sleep/wake.
- [ ] Start a bounded background agent-like job, disconnect every client, hold
  the Sprite active through a renewable Task, prove the job continues, then
  release the Task and prove the Sprite can idle. Prove stale Tasks expire
  after a simulated runtime crash.
- [ ] Prove an OS/process isolation design in which arbitrary workspace code
  cannot write runtime auth/release/audit state, signal the trusted runtime,
  invoke forbidden management-socket operations, or maintain billing outside
  Setta's enforced workload lease and budget.
- [ ] Create a checkpoint while representative SQLite and repository writes
  are active, verify consistency, mutate state, restore it, and prove rollback.
  Determine and record exactly what happens to running processes, open
  connections, and memory; do not infer those semantics from the phrase
  "complete filesystem state."
- [ ] Prove the post-restore runtime can be forced to re-attest and accept the
  control plane's newer credential epoch and desired release rather than
  treating restored security state as authoritative.
- [ ] Determine whether authoritative per-Sprite usage and cost measurements
  exist. If they do not, design and validate the conservative Setta-side
  measurement and hard-cutoff mechanism before claiming budget enforcement.
- [ ] Measure warm/cold wake latency, regional placement behavior, resource
  use, active Task time, hot/cold storage, checkpoint growth, and provider
  cost from at least the intended beta geographies.
- [ ] Write a first unit-economics envelope with explicit assumptions for
  active CPU/memory, retained storage, checkpoint retention, egress or gateway
  bandwidth, support margin, and maximum allowed per-user cost.
- [ ] Destroy only the disposable test Sprite and verify deletion.

Exit: provider lifecycle, background-work semantics, isolation, restore,
placement, metering, and an initial cost envelope are proved without product
UI. Any failed isolation or hard-budget proof triggers a stop condition.

### Phase 2: port the generic runtime foundation

- [ ] Port runtime identity and feature reporting.
- [ ] Port service/install verification without Tailscale assumptions and
  preserve the trusted-runtime/untrusted-workload identity separation proved
  in Phase 1.
- [ ] Port provisioning seed/setup attestation with a provider-neutral name.
- [ ] Port secure desktop credential storage for the selected user/device
  identity, but do not make a long-lived Sprite-local device token the product
  authority.
- [ ] Make runtime endpoints accept provider-neutral HTTPS origins.
- [ ] Implement the bounded credential issuer and runtime access-grant model
  from the credential authority gate, including epoch rotation and
  control-plane suspension semantics.
- [ ] Preserve constant-time secret validation where opaque bootstrap or
  pairing secrets remain.
- [ ] Add structured capability diagnostics for the Setta release, Codex
  binary and authentication, workload-lease integration, policy, disk space,
  and protected runtime state.
- [ ] Add deterministic tests for bootstrapping, pairing, revocation, restart,
  mismatched runtime identity, credential epochs, and post-restore
  re-attestation.

Exit: a freshly provisioned Sprite proves it is the intended runtime and can
authenticate a Setta device without provider credentials.

### Phase 3: choose and harden the client access path

- [ ] Implement the minimum Candidate A experiment, including measurement of
  wakes caused before in-runtime authentication can run.
- [ ] Implement the minimum Candidate B experiment without making it a
  production service, including separate Fly-edge and gateway-to-runtime
  authentication.
- [ ] Evaluate a provider-native pre-wake Setta authentication mechanism if
  Fly offers one. Do not call a Setta forwarding proxy a separate direct-path
  candidate merely because it is small.
- [ ] Record the comparison budgets before the final experiment and run both
  candidates with identical workloads and regions.
- [ ] Produce a written comparison using the gate criteria above.
- [ ] Select one access path and delete the losing experiment.
- [ ] Add authentication, credential-epoch, revocation, rate-limit,
  suspension, log-redaction, and wake-abuse tests for the selected path.
- [ ] Verify desktop and a representative real mobile device, using a minimal
  test client, can reconnect after the laptop closes and across a mobile
  network transition. This does not select the product phone architecture.

Exit: the selected path has pre-declared latency, revocation, security, wake,
and cost behavior, and no Fly signup, provider token, or manual endpoint entry
is required by the end user.

### Phase 4: port and validate the terminal data plane

- [ ] Port the Go-owned duplex terminal protocol and regenerate TypeScript.
- [ ] Port backend WebSocket loops, tickets, ordering, replay, and bounded
  backpressure.
- [ ] Port Electron and browser stream clients.
- [ ] Port renderer scheduling and content-free latency instrumentation.
- [ ] Run deterministic local latency profiles.
- [ ] Run the identical workload against the Sprite over the access path
  selected in Phase 3 and compare it with the recorded budgets.
- [ ] Verify reload, reconnect, Sprite sleep/wake, multi-pane output, terminal
  close, and backend crash behavior through production paths.
- [ ] Choose and test the multi-device terminal resize policy so desktop and
  phone attachments cannot continuously resize one shared PTY.

Exit: remote terminal behavior is correct and measured on the selected access
path.

### Phase 5: implement the minimal control plane

- [ ] Record and provision the database, schema ownership, secret store,
  deployment boundary, durable reconciler, lease/fencing mechanism, backup,
  and availability expectations.
- [ ] Define Go-owned user, entitlement, runtime, device, runtime-access-grant,
  operation, provider-observation, usage, and progress-event contracts.
- [ ] Enforce one live default runtime per user with a database uniqueness
  constraint and durable idempotency keys.
- [ ] Implement idempotent `ensureRuntime` and reconciliation.
- [ ] Handle create timeouts by inspecting deterministic identity before
  retrying.
- [ ] Implement wake, health, release mismatch, suspension, credential epochs,
  grace, and deletion scheduling without collapsing them into one lifecycle
  field.
- [ ] Store the Fly credential only in the control-plane secret store.
- [ ] Publish push-based provisioning, wake, reconciliation, and deletion
  progress. Do not add a polling watch.
- [ ] Add content-free audit events, typed measurement intervals, workload
  lease enforcement, and per-user hard budget enforcement.
- [ ] Add production-path E2E coverage with a scripted fake provider for
  concurrent ensure calls, ambiguous create success, timeout, throttling,
  malformed responses, capacity failure, control-plane restart, lease expiry,
  suspension, and orphan adoption.
- [ ] Keep the live Sprites test narrow, disposable, and explicitly gated.
- [ ] Obtain a preliminary written Fly response before Phase 6. A response may
  bound the beta rather than promise unlimited scale, but silence or a rejected
  customer-per-Sprite model is a stop condition.

Exit: a duplicate request cannot create a duplicate paid runtime, and a failed
provider operation cannot silently orphan one. Control-plane restart does not
lose mutation intent, suspension, or budget enforcement.

### Phase 6: integrate the automatic product experience

- [ ] Integrate Clerk authentication and map immutable external subjects to
  Setta users without provisioning on signup alone.
- [ ] Integrate Stripe Billing checkout, subscription webhooks, entitlement
  projection, failed-payment grace, cancellation, and refund/operator flows.
- [ ] Define the beta eligibility rule that permits Sprite creation and the
  capability thresholds that require verified payment or stronger identity.
- [ ] Resolve the user's runtime automatically.
- [ ] Show only high-level states: preparing, waking, ready, needs attention,
  suspended, and exporting.
- [ ] Keep provider names, machine sizes, and runtime selection out of the
  ordinary flow.
- [ ] Preserve an internal diagnostics surface for support and development.
- [ ] Define who pays for model usage; implement the Codex installation,
  version, ChatGPT login/logout or alternative model credential flow, and
  checkpoint/export treatment of those credentials.
- [ ] Implement a user secrets flow with scoped connectors or brokered secrets;
  do not require users to paste long-lived secrets into an agent prompt or
  unprotected Sprite environment.
- [ ] Record the selected phone architecture and secure credential storage.
  Add push notifications for approval-needed, run-finished, and failure events
  without including repository or terminal content in the payload.
- [ ] Verify the desktop can close while agents continue under renewable,
  budget-bound workload leases.
- [ ] Verify the phone can observe, steer, approve, open artifacts, and use a
  terminal through the recorded phone architecture.
- [ ] Add the required deterministic cloud-chat Electron workflow through
  main, preload, renderer, HTTP/event streams, runtime stores, and a scripted
  provider/Codex harness. Cover workspace open, chat creation, streamed output,
  queueing, steering, approvals, completion, cancellation, failure, queued
  promotion or preservation, reload, runtime restart, and persistence.
- [ ] Run the live Electron and backend Codex E2E gates with ChatGPT auth when
  available, without `OPENAI_API_KEY`; record a narrow skip when unavailable.
- [ ] Integrate with Easy Button only after its owners declare a stable
  checkpoint.

Exit: cloud development behaves like a Setta capability, not a cloud setup
wizard.

### Phase 7: implement durability and fleet operations

- [ ] Define the off-provider export and backup format for repositories,
  uncommitted work, non-repository files, Setta runtime state, and explicitly
  excluded credentials.
- [ ] Implement encrypted, user-scoped off-provider backup/export with key
  management, retention, incremental transfer, progress, cancellation, and a
  bounded payment-grace download path.
- [ ] Run a destructive restore drill and record recovery-point and
  recovery-time results. A successful export without a restore is not proof of
  recoverability.
- [ ] Implement signed, staged Setta fleet upgrades using desired/observed
  releases, compatibility gates, rollout caps, failure diagnosis, and rollback
  that does not restore obsolete auth state.
- [ ] Define and exercise the persistent Sprite OS, Codex, and toolchain
  security-update process.
- [ ] Implement disk-pressure, 100 GB ceiling, checkpoint-retention, cache
  cleanup, full-disk recovery, and user-facing quota behavior.
- [ ] Implement preview routing on origins isolated from Setta credentials and
  test CSP, sandboxing, port ownership, SSRF, WebSocket, suspension, and
  teardown behavior.
- [ ] Add operator tools for suspend, inspect metadata, rotate credential
  epochs, export, reconcile, checkpoint, restore, upgrade, and delete without
  opening repository contents.
- [ ] Verify provider encryption in transit and at rest, deletion semantics,
  data-removal timing, backup deletion, data residency, and any legal-hold
  exception with written provider evidence.

Exit: source and product state can be recovered off-provider, the fleet can be
upgraded safely, storage exhaustion is survivable, and untrusted previews do
not share a credential origin with Setta.

### Phase 8: private beta readiness

- [ ] Obtain final written Fly confirmation for the bounded
  customer-per-Sprite beta, total retained Sprite limits, concurrent
  warm/active limits, API rate limits, placement and regional capacity,
  support escalation, billing/usage data, deletion semantics, and abuse
  handling.
- [ ] Finalize terms, acceptable-use policy, privacy disclosures, retention,
  backup/export, data residency, and deletion policy.
- [ ] Verify subscription grace end to end: active -> grace -> export-only ->
  scheduled deletion. Never delete immediately after a failed payment.
- [ ] Run a bounded private beta with explicit user, active-workload, storage,
  checkpoint, and spend caps.
- [ ] Compare actual provider cost, gateway cost, support load, wake
  reliability, placement, and abuse events with the Phase 1 unit-economics
  envelope and recorded launch assumptions.

Exit: business and operational boundaries are proven, not merely coded.

### Phase 9: add optional Runpod GPU jobs after the CPU beta gate

- [ ] Obtain written confirmation of the intended commercial/API arrangement.
- [ ] Define a typed GPU job request with hard GPU, duration, storage, and
  spend limits.
- [ ] Keep Runpod credentials user-owned in the first version unless a written
  agreement allows Setta billing/resale.
- [ ] Launch a disposable Pod from an approved template.
- [ ] Transfer only the required repository/data/checkpoint from the Sprite.
- [ ] Run a real inference or training workload.
- [ ] Return artifacts and checkpoints to the Sprite or durable export store.
- [ ] Terminate the Pod and verify billing/lifecycle state.
- [ ] Prove timeout, cancellation, provider-capacity failure, and orphan
  cleanup.

Exit: GPU work is optional, bounded, observable, and cannot leave an
uncontrolled paid Pod running.

## Proof-of-Concept Acceptance Scenario

The first end-to-end demonstration is complete only when all of the following
happen in one disposable test account:

1. Setta ensures a Sprite without asking the user for Fly credentials.
2. The Setta runtime installs and becomes healthy.
3. A real repository is opened from desktop.
4. A terminal and agent run inside the Sprite.
5. The active agent acquires and renews a budget-bound Sprite workload lease.
6. The laptop application closes and every client disconnects.
7. Work continues without a client, completes, and releases the workload
   lease; a simulated runtime crash proves a stale lease expires.
8. The phone reconnects through the recorded phone architecture and observes
   the same workspace.
9. The Sprite becomes idle without losing its filesystem.
10. A later request wakes it and reconnects automatically.
11. A device or credential epoch is revoked in the control plane.
12. A checkpoint is created, a deliberate breakage is introduced, and the
    checkpoint restores the workspace.
13. Post-restore attestation applies the current desired release and credential
    epoch; the revoked access is not resurrected.
14. The selected access path proves suspension, WebSocket reconnection, and
    credential redaction through its production path.
15. The test records placement, wake and terminal latency, active Task time,
    CPU/memory measurements, storage/checkpoint growth, gateway bandwidth when
    applicable, and actual provider cost.
16. The disposable Sprite is destroyed intentionally and verified absent.

This demonstrates technical viability. It does not by itself prove provider
permission, public scale, billing correctness, abuse operations, or durable
backup safety.

## Explicit Non-Goals

- Supporting multiple CPU providers before Sprites is proved insufficient.
- A user-facing provider or model selector.
- A cloud setup wizard.
- Tailscale, Headscale, or SSH as the ordinary product transport.
- One Sprite per project.
- Shared multi-user Linux accounts inside one Sprite.
- A Setta-funded GPU subscription before provider permission and cost controls.
- Production deployment hosting for applications created in Setta.
- Treating a PWA as the predetermined mobile application architecture.
- Rebuilding the active Easy Button conversation experience on this branch.
- Backward compatibility with the abandoned BYO-cloud setup flow.

## Stop Conditions

Stop and reassess rather than hiding the problem if any of these occur:

- Fly will not confirm the customer-per-Sprite commercial model or workable
  scale limits.
- A secure no-Fly-signup client path requires exposing an organization token.
- The trusted Setta runtime cannot be isolated from arbitrary workspace and
  agent code sufficiently to protect auth, release, usage, audit, and service
  control state.
- Untrusted Sprite code can invoke management or activity mechanisms that
  bypass Setta suspension, restore authority, or hard spend limits and those
  mechanisms cannot be restricted or reconciled safely.
- Idle/wake semantics stop background work unexpectedly and cannot be modeled
  honestly to users, or renewable Tasks cannot keep legitimate work alive and
  expire safely after failures.
- The filesystem or checkpoint behavior loses real workspace state.
- Checkpoint restore can resurrect revoked credentials or an obsolete release
  without mandatory control-plane re-attestation.
- Provider cost cannot be bounded before work starts.
- Authoritative or conservative usage measurements arrive too late to enforce
  the promised per-user hard budget.
- Public endpoints can be cheaply forced awake despite rate controls, and the
  gateway alternative is operationally unaffordable.
- Neither provider-native placement nor a workable regional strategy can meet
  the recorded interactive latency budgets for intended beta users.
- The provider API changes too quickly to support a small stable adapter.
- Support or abuse obligations exceed what two founders can operate during a
  capped private beta.

## Progress Log

- 2026-07-13: Created `setta-3-cloud-platform` from `setta-3` at
  `de4bae2e4`. Chose this stable common base instead of the actively developed
  Easy Button branch. Recorded `setta-3-cloud-runs-2` as a selective source,
  not a merge target.
- 2026-07-13: Corrected the initial worktree setup before implementation. The
  original `setta-3-cloud-runs-2` directory was restored to its own branch,
  and `setta-3-cloud-platform` was attached to the dedicated
  `/Users/jeff/Documents/_projects/setta.setta-3-cloud-platform` worktree with
  `./worktree.sh --stay --existing setta-3-cloud-platform`.
- 2026-07-13: Revalidated current Sprites documentation. Sprites provides
  persistent environments, idle wake, private/public URLs, services,
  checkpoints, policies, and programmatic APIs. The documented URL auth modes
  do not accept Setta identity directly, so client access remains an explicit
  Phase 3 decision.
- 2026-07-13: Reviewed the plan against the current repository and Sprites
  lifecycle documentation. Added early gates for workload leases, trusted
  runtime isolation, credential authority, checkpoint security, metering,
  placement, unit economics, and commercial discovery; moved access-path
  selection before terminal validation; and scheduled control-plane
  infrastructure, billing, Codex auth, mobile/push, backup, fleet upgrades,
  preview isolation, and full cloud-chat E2E coverage explicitly.
- 2026-07-13: Confirmed `setta-3-cloud-runs-2` is clean and fully committed at
  `39bc2e719`. Local tracking state reports 20 commits ahead of and zero behind
  its origin branch, but a fresh comparison could not be authenticated from
  this worktree. The user will handle the independent push or backup and
  confirm the remote state.
