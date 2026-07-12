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

- [Sprites overview](https://docs.sprites.dev/)
- [Working with Sprites](https://docs.sprites.dev/working-with-sprites/)
- [Sprites API](https://docs.sprites.dev/api/dev-latest/)
- [Sprites policy API](https://docs.sprites.dev/api/dev-latest/policy/)
- [Sprites checkpoints API](https://docs.sprites.dev/api/v001-rc30/checkpoints/)
- [Sprites connectors](https://docs.sprites.dev/concepts/connectors/)

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
   terminal contents or repository contents in normal operation.
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
  lifecycle_state
  provider_kind
  provider_resource_id
  endpoint
  runtime_identity
  desired_release
  observed_release
  last_ready_at
  deletion_scheduled_at

Device
  id
  user_id
  runtime_id
  public_identity_or_token_hash
  revoked_at

Usage
  user_id
  runtime_id
  interval
  provider_measurements
  enforced_budget
```

Provider observations and Setta intent must be separate. A provider timeout
does not prove that a Sprite was not created. Reconciliation must list or read
the resource by deterministic identity before attempting another create.

The core lifecycle should be exhaustive and typed. Initial states:

```text
absent
provisioning
bootstrapping
ready
sleeping
waking
degraded
suspended
grace
deleting
deleted
```

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
and Setta must harden rate limits and denial-of-service behavior.

### Candidate B: private Sprite URL through a small Setta gateway

The client authenticates to Setta. The gateway authorizes the user/runtime
mapping and forwards HTTP/WebSocket traffic to the private Sprite while the
provider token remains server-side.

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

Identity and billing choices are not implementation prerequisites for the
provider PoC. The intended initial product split is Clerk for authentication
and Stripe Billing for subscriptions, with Setta's database owning the runtime
entitlement projection. Do not adopt Clerk Billing without a separate decision:
its current documentation says it is separate from Stripe Billing, is not a
merchant of record, lacks tax/VAT support, lacks metered billing, and does not
support 3DS payment flows.

Reference: [Clerk Billing limitations](https://clerk.com/docs/guides/billing/overview)

## Security and Abuse Baseline

The platform may execute arbitrary user and agent code, so the following are
requirements rather than later polish:

- one hardware-isolated Sprite per user;
- deterministic per-user CPU, memory, storage, concurrency, and daily spend
  ceilings;
- deny-by-default outbound network policy with explicit product presets;
- SMTP and common abuse destinations blocked by default;
- no arbitrary public inbound ports;
- previews use authenticated, scoped routing rather than exposing the Sprite;
- provider master credentials never enter the Sprite;
- secrets are scoped to one user/runtime or brokered through restricted
  connectors;
- verified identity or payment before expensive capabilities;
- immediate Setta suspension independent of provider deletion;
- minimal, content-free security audit events for provisioning, policy,
  authentication, suspension, and destructive actions;
- explicit retention and deletion schedules;
- an export path that remains available during a bounded payment grace period.

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

### Phase 1: build a provider-only Sprites proof of concept

- [ ] Record the Sprites API/SDK version used and pin any direct dependency
  exactly through `./update_dependencies.sh`.
- [ ] Define a narrow typed provider interface for create, inspect, exec,
  service, policy, checkpoint, restore, and destroy.
- [ ] Implement the Sprites adapter without leaking Fly response types into
  core lifecycle types.
- [ ] Use deterministic Setta-owned Sprite names and labels.
- [ ] Create one Sprite from an automated Go test/harness.
- [ ] Write a file and repository, allow the Sprite to idle, wake it, and prove
  filesystem persistence.
- [ ] Create a checkpoint, mutate state, restore it, and prove rollback.
- [ ] Install and start a minimal Setta runtime as a Sprite Service.
- [ ] Prove service restart after Sprite sleep/wake.
- [ ] Record real warm/cold wake latency, resource use, and provider cost.
- [ ] Destroy only the disposable test Sprite and verify deletion.

Exit: provider lifecycle and persistence are proved without product UI.

### Phase 2: port the generic runtime foundation

- [ ] Port runtime identity and feature reporting.
- [ ] Port service/install verification without Tailscale assumptions.
- [ ] Port provisioning seed/setup attestation with a provider-neutral name.
- [ ] Port secure desktop runtime credential storage.
- [ ] Make runtime endpoints accept provider-neutral HTTPS origins.
- [ ] Preserve device revocation and constant-time secret validation.
- [ ] Add deterministic tests for bootstrapping, pairing, revocation, restart,
  and mismatched runtime identity.

Exit: a freshly provisioned Sprite proves it is the intended runtime and can
authenticate a Setta device without provider credentials.

### Phase 3: port and validate the terminal data plane

- [ ] Port the Go-owned duplex terminal protocol and regenerate TypeScript.
- [ ] Port backend WebSocket loops, tickets, ordering, replay, and bounded
  backpressure.
- [ ] Port Electron and browser stream clients.
- [ ] Port renderer scheduling and content-free latency instrumentation.
- [ ] Run deterministic local latency profiles.
- [ ] Run the identical workload against the Sprite over both access
  candidates.
- [ ] Verify reload, reconnect, Sprite sleep/wake, multi-pane output, terminal
  close, and backend crash behavior through production paths.

Exit: remote terminal behavior is correct and measured on the selected access
path.

### Phase 4: choose and harden the client access path

- [ ] Implement the minimum Candidate A experiment.
- [ ] Implement the minimum Candidate B experiment without making it a
  production service.
- [ ] Produce a written comparison using the gate criteria above.
- [ ] Select one access path and delete the losing experiment.
- [ ] Add authentication, revocation, rate-limit, suspension, and wake-abuse
  tests for the selected path.
- [ ] Verify desktop and a real phone can reconnect after the laptop closes.

Exit: no Fly signup, Tailscale setup, provider token, or manual endpoint entry
is required by the end user.

### Phase 5: implement the minimal control plane

- [ ] Define Go-owned user, entitlement, runtime, device, operation, and usage
  contracts.
- [ ] Implement idempotent `ensureRuntime` and reconciliation.
- [ ] Handle create timeouts by inspecting deterministic identity before
  retrying.
- [ ] Implement wake, health, release mismatch, suspension, grace, export, and
  deletion scheduling.
- [ ] Store the Fly credential only in the control-plane secret store.
- [ ] Add content-free audit events and per-user budget enforcement.
- [ ] Add production-path E2E coverage with a scripted fake provider.
- [ ] Keep the live Sprites test narrow, disposable, and explicitly gated.

Exit: a duplicate request cannot create a duplicate paid runtime, and a failed
provider operation cannot silently orphan one.

### Phase 6: integrate the automatic product experience

- [ ] Authenticate the user through the selected Setta identity provider.
- [ ] Resolve the user's runtime automatically.
- [ ] Show only high-level states: preparing, waking, ready, needs attention,
  suspended, and exporting.
- [ ] Keep provider names, machine sizes, and runtime selection out of the
  ordinary flow.
- [ ] Preserve an internal diagnostics surface for support and development.
- [ ] Verify the desktop can close while agents continue.
- [ ] Verify the phone can observe, steer, approve, open artifacts, and use a
  terminal as supported by the current product shell.
- [ ] Integrate with Easy Button only after its owners declare a stable
  checkpoint.

Exit: cloud development behaves like a Setta capability, not a cloud setup
wizard.

### Phase 7: add optional Runpod GPU jobs

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

### Phase 8: private beta readiness

- [ ] Obtain written Fly confirmation for customer-per-Sprite commercial use,
  total retained Sprite limits, concurrent warm/active limits, API rate
  limits, support escalation, regional capacity, and abuse handling.
- [ ] Finalize terms, acceptable-use policy, privacy disclosures, retention,
  backup/export, and deletion policy.
- [ ] Implement subscription grace: active -> grace -> export-only -> scheduled
  deletion. Never delete immediately after a failed payment.
- [ ] Add operator tools for suspend, inspect metadata, export, reconcile,
  checkpoint, and delete without opening repository contents.
- [ ] Run a bounded private beta with explicit user and spend caps.
- [ ] Compare actual provider cost, support load, wake reliability, and abuse
  events with the launch assumptions.

Exit: business and operational boundaries are proven, not merely coded.

## Proof-of-Concept Acceptance Scenario

The first end-to-end demonstration is complete only when all of the following
happen in one disposable test account:

1. Setta ensures a Sprite without asking the user for Fly credentials.
2. The Setta runtime installs and becomes healthy.
3. A real repository is opened from desktop.
4. A terminal and agent run inside the Sprite.
5. The laptop application closes.
6. Work continues without the laptop.
7. The phone reconnects and observes the same workspace.
8. The Sprite becomes idle without losing its filesystem.
9. A later request wakes it and reconnects automatically.
10. A checkpoint is created, a deliberate breakage is introduced, and the
    checkpoint restores the workspace.
11. The test records wake latency, terminal latency, active time, storage, and
    actual provider cost.
12. The disposable Sprite is destroyed intentionally and verified absent.

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
- Idle/wake semantics stop background work unexpectedly and cannot be modeled
  honestly to users.
- The filesystem or checkpoint behavior loses real workspace state.
- Provider cost cannot be bounded before work starts.
- Public endpoints can be cheaply forced awake despite rate controls, and the
  gateway alternative is operationally unaffordable.
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
  Phase 4 decision.
