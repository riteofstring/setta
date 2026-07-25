# Setta Cloud Platform: Sprites-First Runtime Plan

**Date:** 2026-07-13 (re-based 2026-07-17)

**Status:** Plan of record. Phases 0–1b are complete; the confirmed-cold gate
was closed as unobservable and the owner signed Option A on 2026-07-17. The
Phase 2 offline build-out, live install loop, and provider conformance
validation completed on the old base. Their provider-neutral implementation,
the Phase 1c measurement driver, and the viability harnesses are now ported to
the rebased `setta-3-sprites` branch. The new-base Phase 2 implementation and
live exit proof are complete at protocol version 64: signed runtime
credentials, setup attestation, capability diagnostics, HTTPS origin/host
policy, encrypted desktop identities, restart/revocation behavior, production
conversation workflows, a signed live install, and the six-case provider
conformance suite are verified. Both live validation Sprites were destroyed
and `setta-100` was independently confirmed empty afterward. Live Phase 1c
measurements and Phase 3 comparison budgets remain deferred per
`docs/plans/morning-decisions-20260717.md` while the end-to-end cloud UX
viability path is proved.

**Branch:** `setta-3-sprites-development`, created from the pushed
`setta-3-sprites` preserved baseline at `c8254b1f2`. The baseline branch was
created from `setta-3` at `92702eb7c` (the new Setta). Previous home:
`setta-3-cloud-platform`, created from the old `setta-3` at `de4bae2e4`.

**Worktree:** `/Users/jeff/Documents/_projects/setta.setta-3-sprites`,
created with the repository's `worktree.sh` script.

**Source branches:**

- `setta-3-cloud-platform` (head `98ef2df6d`) is the primary read-only source
  of all implemented platform work: the Phase 1a–2 code, live harnesses, and
  evidence reports. Do not merge it wholesale; port by slice per the
  re-baseline section.
- `setta-3-cloud-runs-2` remains historical design evidence only. Its
  reusable commits were already absorbed into `setta-3-cloud-platform`.

## 2026-07-24 Development-First Continuation

Owner direction: finish Sprites as a working standalone reference before any
attempt to merge current `setta-3` into it.

`setta-3-sprites` at `c8254b1f2` is the preserved and pushed baseline.
`setta-3-sprites-development` is the active continuation branch. Do not merge
`setta-3`, create a `setta-3-sprites-integration` branch, or begin Setta 4
ports until the working-state gate below is complete or the owner explicitly
changes the sequence.

### Current objective

Complete and prove the existing Sprites-first hosted runtime path:

1. preserve the provider-neutral runtime, credential, install, backup,
   accounting, lease, capability, setup, and conformance packages
2. complete the bounded Candidate B hosted control-plane lifecycle
3. prove runtime bootstrap and authenticated HTTP/SSE conversation behavior
4. prove steering, cancellation, restart/replay, revocation, failure, and
   cleanup behavior through production paths
5. record content-free performance, reliability, placement, and cost evidence
6. freeze and push one reproducible working reference

Frontend redesign, Niri removal, Director UI work, and `setta-3` reconciliation
remain outside this branch.

### Director-managed product model

The user does not create, select, pair, wake, or manage a Sprite. The user asks
the Director for an outcome. For example:

> "I want to access this project from my phone."

The Director resolves the referenced project or workstream, determines whether
hosted execution and remote access are required, checks trusted entitlement and
capability state, and submits a typed ensure-hosted-access intent. The control
plane then provisions or wakes the user's Sprite, installs or updates the Setta
runtime, binds the project, issues the minimum revocable client access, and
reports typed progress. When ready, the Director tells the user that the
project is available on the phone.

Infrastructure choices remain internal:

- no provider or runtime picker
- no cloud setup wizard
- no Fly credentials or organization concepts shown to the user
- no manual endpoint entry, pairing code, region, machine-size, or wake control
- no requirement that the user understand whether work is local or hosted

The user may ask what Setta is doing or why hosted access is needed. The
Director should answer in product terms such as availability, security, cost,
and expected readiness, not expose provider plumbing.

The future phone client uses the same Director/workstream model as desktop at a
phone-appropriate presentation density. This plan does not select native,
cross-platform, or other phone UI technology. It owns the backend capability
that makes an authenticated workstream available from another device.

This branch implements and proves the provider, control-plane, credential,
execution, and event boundaries behind that experience. It does not implement
the Setta 4 Director frontend.

### Working-state gate

Sprites is in a working state when:

- the deterministic offline provider and hosted lifecycle suites pass
- a deterministic typed-client fixture proves that an ensure-hosted-access
  intent reaches ready-on-phone state without provider-facing client fields
- one explicitly authorized disposable live run provisions the exact bounded
  resources, installs and pairs the signed runtime, serves the Candidate B
  gateway, completes the fixed HTTP/SSE lifecycle workload, and tears down
- independent final inventories prove that every run-owned Sprite, Fly
  Machine, volume, App, grant, and local credential copy is absent
- live evidence contains no credential values or user conversation content
- local and hosted runtime behavior passes the relevant shared conformance
  contracts
- production Electron conversation workflows remain green for every touched
  lifecycle seam
- actual resource placement, timing, relayed bytes, failure observations, and
  cost inputs are recorded in append-only reports
- the branch has a clean, pushed checkpoint suitable for later reference or
  selective ports

### Immediate boundary

The offline implementation is already complete through the full hosted
coordinator and Candidate B workload. The previous authorized live attempt
stopped during Fly registry publication before it created a Machine, volume,
Sprite, secret, or workload.

The next live boundary begins with a fresh, time-bounded owner authorization
and exact Fly organization/region selection. It then creates the one allowed
volume, Machine, and private Sprite; bootstraps the paired runtime; executes the
fixed lifecycle workload; and enters cleanup before the reserved teardown
window.

Do not begin that mutation from standing credentials or infer a Fly
organization. A live continuation requires:

- a newly valid authorization manifest
- explicit Fly organization slug and region
- separate short-lived Fly mutation and read-only inventory credentials
- a short-lived Sprites organization credential
- the existing spend cap, mutation limit, teardown reserve, and cleanup
  deadline

No OpenAI API key is required. Live Codex verification uses the existing
ChatGPT-authenticated Codex CLI and must not use `OPENAI_API_KEY`.

## Authority and Superseded Direction

This document is the plan of record for Setta-operated cloud development
runtimes. Superseded BYO-cloud research has been removed from the working tree
and remains available in Git history.

### Deferred BYO-cloud plugin

Keep the former BYO-cloud/Tailscale direction available as a possible hidden,
AI-installable plugin rather than core product behavior. When a user explicitly
asks Setta to help create or connect a user-owned cloud runtime, the AI could
offer to install this plugin and guide provider setup, Tailscale networking,
bootstrap, pairing, and teardown. It must remain absent from the default product
and must not introduce provider catalogs, credentials, transport branches, or
compatibility paths into core Setta. If revived, recover the removed
`byo-cloud-one-click-runtime-plan.md`, `byo-setta-runtime-architecture-report.md`,
and `remote-runtime-plan.md` from Git history and redesign them against the
then-current plugin contract and runtime credential model rather than restoring
their old implementation unchanged.

If this plan conflicts with repository-wide engineering rules in `AGENTS.md`,
`AGENTS.md` wins.

## 2026-07-17 Re-Baseline onto the New setta-3

Owner direction (recorded 2026-07-17 in the previous worktree): the new Setta
landed on `setta-3`; cut a fresh branch from it, port the provider-neutral
packages first, reconcile the desktop credential slice, then continue Phase 3
there. `setta-3-sprites` (this branch) is that fresh branch. This document
remains the plan of record with the amendments below.

### What changed under the plan

The new base (`92702eb7c`, the `setta-3-easy-button` merge into `setta-3`) is
a product rewrite, not an incremental move:

- `internal/chat`, `internal/terminal`, and `internal/orchestrator` were
  deleted. The product is now a topic-conversation architecture:
  `internal/conversation` (turns, artifacts, navigator, its own SQLite
  store), `internal/agent` (turn engine), `internal/codexapp` (Codex
  app-server JSON-RPC child), `internal/master`, `internal/narration`,
  `internal/speech`, and `internal/webapp` (an embedded PWA served from the
  same Go HTTP server).
- Terminals are entirely absent: no PTY, WebSocket, or xterm code exists in
  Go or the desktop app. There is no terminal data plane to port onto.
- The contract protocol snapshot began at version 62 on the new base and is
  now version 65 after the credential-authority and runtime-foundation ports
  (the old base was 7; the previous branch's foundation slice set 11).
  "Protocol v11" references elsewhere in this document are old-base history.
- The new base already ships remote-runtime plumbing this plan previously
  scheduled as ports: `setta pair` with single-use pairing tokens and
  `/pairing/complete`, SQLite device sessions with revocation and streaming
  revocation sweeps (`internal/runtimeauth`), persistent runtime identity
  (`internal/runtime/identity.go`), a desktop runtime registry and picker
  with protocol-version negotiation and explicit external-URL backends,
  desktop device-token storage (`known-runtimes.json`, mode 0600), and a
  browser/PWA pairing path (token in `localStorage`).
- The original new-base remote transport used plain HTTP origins with
  long-lived bearer device tokens. The desktop now stores only an encrypted
  device identity and resolves signed, expiring runtime credentials with
  credential epochs and separately revocable grants. The web client's
  `localStorage` token remains a recorded gap for the future browser/control-
  plane credential authority.

### Port classification

From a full `git merge-tree` simulation of `setta-3-cloud-platform` into the
new base (2026-07-17): 99 conflicts — 76 modify/delete against the deleted
chat/terminal/orchestrator packages and old chat UI/e2e files, 23 content
conflicts concentrated in `internal/httpapi/*`, `internal/runtime/server.go`,
`cmd/setta{,-backend}`, `cmd/generate-contracts/contract_registry.go`, and
desktop `main/index.ts` plus `shared/{ipc,types}.ts`. Wholesale merge is
therefore prohibited; port by slice:

1. **Port as-is** (verified: zero imports of the deleted packages or desktop
   code): `internal/runtimeprovider` (with `conformance` and `runtimetest`),
   `internal/sprites`, `internal/credissuer`, `internal/localcredissuer`,
   `internal/runtimeinstall`, `internal/runtimebackup`,
   `internal/runtimeaccounting`, `internal/runtimecost`,
   `internal/runtimecapability`, `internal/runtimesetup`, the
   `internal/runtimeauth` extensions, `cmd/setta-release-verify`,
   `cmd/setta-runtime-accounting`, `cmd/setta-sprite-lease-probe`,
   `scripts/sprites/*`, `scripts/test_sprites_*.sh`, and the minisign signing
   in `scripts/release/build-release.sh`. Carry the module additions (pinned
   `sprites-go` pseudo-version `v0.0.0-20260706200727-0d0f37d154bd`) through
   `./update_dependencies.sh`. `internal/runtimeinstall` depends on
   `httpapi.BackendHealth`, `httpapi.RuntimeInfoResponse`, and
   `httpapi.BackendName`; all three exist in the new base with compatible
   shapes.
2. **Re-wire** (re-implement the integration on the new base rather than
   resolving textual conflicts): the runtime-foundation wiring from
   `e1fa627a6` — the httpapi services/auth/endpoints/contracts additions
   (local-credential enroll/refresh, setup attestation, runtime-info
   feature/diagnostics fields, the endpoint access policy in `access.go`),
   the `internal/runtime` config/diagnostics assembly, and the
   `-local-credential-issuer` flags in `cmd/setta{,-backend}`. Reconcile
   with the new base's existing runtime identity and `RuntimeInfoResponse`
   instead of duplicating identity concepts.
3. **Reconcile** (both sides evolved the same seams): the desktop credential
   slice `9b7f731bb`. Its main-process design (runtime credential manager,
   encrypted safeStorage secret stores, the token-provider seam in
   `backend-auth-fetch.ts`) upgrades the new base's plaintext
   `known-runtimes.json` device tokens, but the new base's
   registry/picker/pairing files evolved independently. Land it as a
   redesign of the new files, not a file copy.
4. **Shelved**: terminal replay persistence (`71725cfa6`) — bound to the
   deleted `internal/terminal` session model. It stays in the source branch
   until the product reintroduces terminals; see the Phase 4 re-scope note.
5. **Do not port**: `db806e584` (chat permission escalation / codex sandbox
   policy) — incidental to the platform, and its files were deleted in the
   new base; everything in the old "Do not port" list; the old-base chat e2e
   harness churn (the new base's e2e uses `fake-topic-codex-app-server` and
   the `run-workflows` manifest).

### Pre-port protocol (blocking)

- `setta-3-cloud-platform` has 16 unpushed commits at re-baseline
  (`66294e49b` through `98ef2df6d`, including every source landing). Per the
  branch protocol, push or otherwise back it up and verify the remote ref
  before the first porting slice. Keep it intact and read-only afterward.
- Confirm this worktree is clean before each porting slice, as before.

## Product Decision

Sprites is an internal Setta capability, not a product the user operates.

The v1 model is:

```text
user intent
  -> Director resolves project/workstream and required capabilities
  -> Setta control plane ensures hosted access when needed
  -> one persistent CPU Sprite per entitled user
  -> authenticated desktop or phone workstream access
  -> optional bounded GPU worker for a Director-approved GPU job
```

The user signs into Setta and asks the Director for an outcome. A request to
make a project available on the phone may cause Setta to provision a Sprite,
install the runtime, bind the project, and grant the phone access. The same
infrastructure may also support work that should continue after the desktop
closes. These are consequences of user intent, not infrastructure tasks the
user performs.

One logical runtime per user does not mean one continuously running VM per
user. A Sprite preserves its filesystem while idle and wakes on demand.
Provisioning must be entitlement- and intent-driven; signing up alone does not
create a paid runtime.

## Simplicity Rule

The user should not have to think about where work runs. The ordinary flow is:
ask the Director, receive useful progress, respond only to meaningful approval
or resource questions, and use the resulting workstream from desktop or phone.
There is no provider setup, runtime management, or manual device-to-runtime
pairing flow.

The private-beta implementation starts with one CPU provider, one Sprite per
user, one Go control-plane deployable plus its database and secret store, one
runtime release line, one beta package, and one active agent workload per user.
If Candidate B wins, keep its thin gateway in that deployable until measured
scale or isolation requires a split. Desktop and phone use the same typed
control, workstream, and runtime protocols even when their presentations
differ. Each new service or abstraction must remove more complexity than it
adds or satisfy a recorded security, durability, or cost gate.

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
- [Sprites networking](https://docs.sprites.dev/concepts/networking/)
- [Sprites services](https://docs.sprites.dev/concepts/services/)
- [Sprites checkpoints](https://docs.sprites.dev/concepts/checkpoints/)
- [Sprite maintenance](https://docs.sprites.dev/sprite-maintenance/)
- [Sprites API](https://docs.sprites.dev/api/dev-latest/)
- [Sprites policy API](https://docs.sprites.dev/api/dev-latest/policy/)
- [Sprites checkpoints API](https://docs.sprites.dev/api/dev-latest/checkpoints/)
- [Sprites Proxy API](https://docs.sprites.dev/api/dev-latest/proxy/)
- [Sprites connectors](https://docs.sprites.dev/concepts/connectors/)

The current public pages are internally inconsistent about checkpoint
creation and restore semantics. The API describes filesystem snapshots without
interrupting running processes, while the working guide describes process and
in-memory capture and processes stopping during creation. Phase 1 must treat
those semantics as unknown and record live, versioned probes.

## Pre-Code Cost Baseline

At the 2026-07-13 review, Sprites publishes these usage rates:

| Resource | Published rate | Approximate monthly equivalent |
| --- | ---: | ---: |
| CPU | $0.07 per CPU-hour | workload-dependent |
| Memory | $0.04375 per GB-hour | workload-dependent |
| Hot storage | $0.000683 per GB-hour | $0.50 per GB-month |
| Cold storage | $0.000027 per GB-hour | $0.02 per GB-month |

The documented metering minima are 6.25% CPU and 0.25 GB of memory for each
second that a Sprite is active. At both minima, continuously active compute has
an approximate floor of $0.0153 per hour, or $11.18 over 730 active hours,
before hot storage, actual workload use, gateway bandwidth, support, or margin.
This is not a cost forecast. It is an early warning that an idle-looking
client, forgotten workstream subscription, or stale workload lease can still
create material cost.

Before provider adapter work begins, Phase 1a must turn these public rates into
a small assumptions table for three cases: retained but cold, attached but not
doing useful work, and an active agent. Record a maximum acceptable monthly
provider cost per beta user and the maximum cutoff-enforcement lag. Phase 1c
replaces assumptions with measurements; Phase 6 turns the measured envelope
into one simple beta package. Revalidate all rates before relying on them.

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
   conversation content, artifact contents, or repository contents in its
   metadata database. It may
   authorize and track the encrypted off-provider backup/export path in Phase
   7, but backup contents belong in a dedicated data store with explicit
   retention and deletion behavior.
6. The Fly organization token is server-side only. It must never be shipped to
   any desktop or phone client, a Sprite, logs, generated fixtures, or a prompt.
7. Setta runtime authentication remains mandatory even if Fly provides a
   network authentication layer.
8. Execution placement is a Director/control-plane policy decision based on
   trusted capability, entitlement, availability, security, and cost state.
   Keep a registry boundary, but do not make ordinary users select a runtime or
   provider.
9. Provisioning is idempotent. Retried sign-in, webhook, wake, or ensure calls
   must converge on the same runtime.
10. Destruction is never an automatic response to a transient provider,
    payment, or application error.
11. Git remotes and an off-provider export or backup are required before the
    product claims durable safety. Sprite checkpoints are rollback tools, not
    the sole backup strategy.
12. The existing Easy Button branch is a moving downstream product branch. Do
    not merge it into this branch during the proof-of-concept phases.
    (2026-07-17 amendment: the Easy Button product was merged into `setta-3`
    and is now this branch's base, so the original instruction is satisfied
    by history. The standing rule becomes: do not merge
    `setta-3-cloud-platform` or any old feature branch wholesale; integrate
    by slice per the re-baseline section, and do not chase the still-moving
    `setta-3` head — the recorded base changes only with a progress-log
    entry.)
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
18. Sprite checkpoints are whole-runtime rollback tools. They are not a
    per-project undo feature: restoring project A can also roll back project B,
    databases, runtime state, and every other file in the Sprite. V1 exposes
    restore only as an explicit whole-Sprite recovery or maintenance action,
    with a fresh safety checkpoint or export and a clear impact warning.
19. Anything expected to survive a cold wake must be on the persistent
    filesystem or reconstructible from an authoritative source. Process memory
    and `/tmp` are caches, not durable session, transcript, queue, or replay
    state.
20. Keep private-beta scheduling deliberately small: one active agent workload
    per user by default, using durable queue semantics for additional work and
    bounded leases for background continuation. Do not build or expose a
    general resource scheduler for v1.
21. Start with one private-beta package, one included usage allowance, and one
    hard cost cap. Do not add tiers, metered overages, or machine-size choices
    until measured demand justifies them.
22. Ordinary users interact with the Director and their workstreams from
    desktop or phone. Provider, region, machine size, runtime, Task,
    checkpoint, gateway, pairing, and wake controls remain internal or
    operator-only.
23. Provider portability is a standing constraint, not a migration project.
    No provider SDK type, endpoint, status label, or counter crosses
    `internal/runtimeprovider`; provider-specific concepts stay
    adapter-private. A candidate replacement provider must be evaluable by
    writing one adapter and passing the conformance suite in rule 27.
24. Provider lifecycle labels and counters are non-authoritative hints
    everywhere in the product. Correctness, recovery, and cost enforcement
    derive from Setta-owned behavioral evidence (persistent sentinels, boot
    identity, start histories, heartbeats) and Setta metering. This
    generalizes the Phase 1b finding that Sprites reported `cold` while
    memory was retained for at least 28 hours.
25. Do not encode Sprites-specific behaviors — wake-on-request latency,
    checkpoint UX, per-second billing economics, provider-managed memory
    autoscaling — into user-facing promises or beta economics before the beta
    commitment gate. Until then they are internal capabilities.
26. The provider-exit path is a v1 deliverable, not a Phase 7 aspiration.
    The encrypted off-provider export and inactive-restore path from the
    resilience side plan must keep working against every provider adapter so
    migration stays a drain-and-restore operation Setta controls.
27. Maintain the live lifecycle harness as a provider conformance suite. A
    new provider adapter is complete only when it passes
    the same create/persist/Service/lease/restore/destroy assertions, with
    any provider-specific semantic gaps recorded in this plan rather than
    papered over.

## Branch and Commit Protocol

### Phase 0 branch and worktree creation

2026-07-24 amendment: the commands and branch names in the historical account
below explain how the original platform work was created. They are not the
current execution instruction. Active work now runs on
`setta-3-sprites-development` in
`/Users/jeff/Documents/_projects/setta.setta-3-sprites`, from the preserved
`c8254b1f2` baseline. Do not merge current `setta-3` during the development
completion track.

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

The recorded base is `92702eb7c` (re-based 2026-07-17 from `de4bae2e4`; the
old base, new base, reason, and conflict result are recorded in the progress
log). Do not silently recreate the branch from a newer base. If the base must
change again, record the old base, new base, reason, and conflict result in
the progress log before doing so.

Before porting source code:

1. Confirm `setta-3-cloud-runs-2` still points at `39bc2e719` or a documented
   descendant.
2. Push or otherwise back up that source branch. At plan creation it contained
   20 commits not present on `origin/setta-3-cloud-runs-2`.
3. Keep `setta-3-cloud-runs-2` intact. Do not reset, rebase, squash, or delete
   it.
4. Confirm this branch has a clean worktree before each porting slice.

2026-07-17: the `setta-3-cloud-runs-2` obligations above are complete (pushed
and API-verified 2026-07-13) and now apply unchanged to
`setta-3-cloud-platform` at `98ef2df6d` as the primary source branch. Its 16
unpushed commits must be pushed or backed up before the first porting slice
(see the re-baseline section).

At the 2026-07-13 review, `setta-3-cloud-runs-2` was clean and fully committed
at `39bc2e719`. Its dedicated worktree protects it from ordinary working-tree
mistakes, but linked worktrees share one Git object database and are not an
independent backup. The branch was subsequently pushed to GitHub and verified
through the GitHub API at the full SHA
`39bc2e719ed898ef2c66ce75c40ffb2891056fd2`, with local and origin tracking
state at zero ahead and zero behind.

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

### Agent execution policy

Use GPT-5.6 Sol at high reasoning effort for every agent — lead and subagents
alike (owner decision updated 2026-07-18). The temporary GPT-5.5/xhigh Codex
delegation rule is superseded. The lead owns task decomposition, synthesis,
scope control, review, and every phase-exit or stop/go decision.

Use subagents sparingly and only for concrete, bounded work that can proceed
independently:

- Invoke Codex with `--model gpt-5.6-sol --effort high` for every delegated
  coding task unless the owner explicitly changes the policy again.
- Run no more than two subagents concurrently and keep delegation depth at one.
  Do not create recursive agent trees.
- Give each subagent one non-overlapping question, experiment, or code area.
  Assign one writer per file or experiment; research and review agents are
  read-only unless the lead explicitly assigns an isolated edit.
- Require each subagent to return evidence, commands or sources used,
  uncertainties, and a bounded recommendation. The lead must inspect and
  synthesize the result rather than treating a subagent conclusion as a gate
  decision.

This section is an execution policy, not proof of the active Codex
configuration. Before relying on a delegated result, retain the companion job
metadata showing the requested GPT-5.6 Sol model and high effort. Do not add
custom-agent configuration until repeated execution shows that the checked-in
policy is insufficient or a persistent repository surface is otherwise
justified.

After an implementation phase satisfies its gates, use Claude Code as a
read-only independent second opinion before the final broad quality checks.
Invoke it with `claude -p --model claude-fable-5 --effort high
--permission-mode plan`; give it the phase requirements, diff, test evidence,
and unresolved risks. Before relying on the review, verify that the installed
CLI accepts both flags and retain structured output that identifies
`claude-fable-5` as the model. Do not silently substitute a different model or
effort level; if this configuration is unavailable, record the review as
skipped with the exact failure. Claude's result is advisory: the lead must
inspect every finding, own any fixes, and make the gate decision. Run the final
format, quality, and supply-chain checks only after that review and any
resulting edits are complete.

### Integration discipline

- Do not merge `setta-3-cloud-runs-2` wholesale.
- Do not cherry-pick generated files without their Go owner changes. Regenerate
  generated contracts on this branch.
- Do not merge current `setta-3` during the working-state completion track.
- Treat the Setta 4 Director and phone clients as future consumers of typed
  backend capabilities, not implementation targets on this branch.
- Avoid changing conversation UI, presentation code, or provider-facing UI
  merely to demonstrate provisioning.

## Reusable Work Inventory

2026-07-17: superseded for execution by the port classification in the
re-baseline section. The commit list below is old-base history — those
`setta-3-cloud-runs-2` commits were already absorbed into
`setta-3-cloud-platform`, which is now the sole porting source.

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
  active_runtime_id
  runtime_generation

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
  provider_placement    typed adapter-owned placement observation
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

`User.active_runtime_id` is the single authoritative default assignment.
Replacement may create a new provisioning Runtime while the old Runtime is
still ready or deleting, then atomically advance `active_runtime_id` and
`runtime_generation`. Do not encode replacement as a constraint that forbids
the old and new provider resources from coexisting briefly.

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
Candidate A also fails if developer-level guest access can modify or replace
the in-Sprite authentication authority.

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

Test the provider's authenticated Proxy API as the first Candidate B transport
variant. It may avoid the header collision while keeping the organization token
only at the gateway. It is an implementation choice inside Candidate B, not a
third product architecture.

Advantages: private Sprite URLs, centralized suspension, and no public runtime
surface.

Risks: Setta becomes the data path and inherits bandwidth, latency,
availability, WebSocket, and support responsibility.

### Gate criteria

Do not choose by taste. Measure both with the same fixed authenticated
workstream HTTP/SSE workload and record:

- warm and cold connection latency;
- interactive request p50/p95 and first-event p50/p95;
- stream reconnect and durable-cursor replay across sleep/wake;
- whether unauthenticated requests to private and public Sprite URLs wake
  compute, plus rate limiting;
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

### Connection and idle policy

Current Sprites documentation counts open TCP connections and running TTY
sessions as activity. An attached client therefore does not need a Task merely
to stay connected, but it may keep compute billable. Tasks are reserved for
bounded background work that must continue after every client disconnects.

Recurring disconnect and reconnect is normal operation, not merely failure
recovery. Before choosing the access path, define one simple policy for idle UI
event streams, artifact transfers, and Director/workstream subscriptions: when
each disconnects or closes, what state persists, what the user sees, and how
quickly the next interaction reconnects. Measure attached-idle cost separately
from active agent cost. Do not keep a Sprite awake solely to make the UI appear
continuously connected.

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
Director-authorized ensure-hosted-access intent
  -> Setta control plane
       -> user/runtime/device/entitlement records
       -> idempotent runtime reconciler
       -> Fly Sprites API
       -> optional access gateway, only if Candidate B wins

authenticated desktop or phone client
  -> Director/workstream data path selected by Setta
       -> Setta runtime inside the user's Sprite
       -> projects, conversations, agents, approvals, artifacts
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
constraint or locked assignment update must enforce one authoritative
`active_runtime_id` per user; a deterministic provider name alone is
insufficient concurrency control. A replacement candidate may coexist with the
old runtime until an atomic assignment cutover succeeds.

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
  agents, project processes, artifact tools, and other untrusted workloads;
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

The root boundary is a product decision, not merely a Unix-permissions detail.
Current Sprites guides use `sudo`, while the Setta product should support normal
package and container workflows. Phase 1a must compare only two deliberately
simple models: a constrained host account that still passes representative
developer workflows, or a root-capable workload container or namespace that
cannot reach the management socket or protected Setta state. Probe Docker,
Podman or a simpler rootless container path rather than assuming nested
containers work. Do not build a custom sandbox framework. If neither model
provides useful developer ergonomics and a trustworthy boundary, stop.

Current provider documentation says an enforced network policy blocks raw-IP
and private-IP connections and is read-only inside the Sprite. Verify those
claims live with IP literals, alternate resolvers, DNS-over-HTTPS, SMTP by IP,
pre-existing connections, and privilege/capability changes. Also test real Git,
package-manager, container-registry, model-API, and preview workflows. A policy
that fails either abuse containment or ordinary development is not a proven
boundary; broad outbound access must remain an explicit higher-risk mode.

## Implementation Phases

### Phase 0: establish the branch and plan

- [x] Confirm no Sprites-first plan exists.
- [x] Create `setta-3-cloud-platform` from `setta-3` at `de4bae2e4` and attach
  it to a dedicated worktree through `worktree.sh`.
- [x] Write and commit this plan before implementation.
- [x] Back up `setta-3-cloud-runs-2` at `39bc2e719` or its documented
  descendant.

Exit: the clean platform branch and source branch are both recoverable.

### Phase 1: settle Sprites viability before provider engineering

Phase 1 is ordered by kill probability. Do not start the adapter before Phase
1a exits cleanly.

#### Phase 1a: run cheap stop-condition probes

- [ ] Send Fly an early written inquiry covering customer-per-Sprite use,
  expected retained and active counts, placement, API limits, billing data,
  encryption and data handling, support, and abuse escalation. Final
  commercial confirmation remains a beta gate, but do not defer discovery.
- [ ] Turn the pre-code cost baseline into retained-cold, attached-idle, and
  active-agent assumptions. Record the maximum acceptable provider cost per
  beta user and cutoff-enforcement lag before writing provider code.
- [ ] Create one disposable Sprite through the documented CLI or raw API and
  record the exact CLI, API, base-image, and environment versions used.
- [ ] Build a capability and permission matrix from an ordinary process,
  `sudo` or root, and any proposed workload boundary. Probe Tasks, Services,
  checkpoint create/list/restore, signals, protected files, and every other
  management-socket endpoint actually present. Separately prove whether URL
  authentication, Ports, Proxy, exec, policy, and deletion are guest-reachable;
  do not infer management-socket scope from the external API index.
- [ ] Probe the two simple root models from the security baseline. Exercise
  `sudo apt`, Docker or Podman, rootless containers, cgroups, mount namespaces,
  bind mounts, and cold wake. Prove a root-capable workload cannot reach the
  management socket, protected Setta state, or the trusted supervisor.
- [ ] Prove a control-plane action can stop further billable compute within a
  hard deadline even when hostile code maintains a Task, TTY, open connection,
  or busy process. If the only cutoff is destructive Sprite deletion, record
  that as a failed hard-budget proof rather than hiding it behind estimates.
- [ ] Apply the proposed network and privilege policies from outside the
  Sprite. Test raw IP, private IP, alternate DNS, DNS-over-HTTPS, SMTP by IP,
  pre-existing connections, raw sockets, and ordinary developer operations.
- [ ] Measure whether unauthenticated requests to private and public Sprite
  URLs wake compute. Record whether the authenticated Proxy API is a viable
  gateway transport without exposing the organization token.
- [ ] Probe attached-idle behavior for an application event stream, an idle
  TTY, and a preview. Record which mechanisms keep compute active without a
  Task and how quickly deliberate disconnect/reconnect works.
- [ ] Create a checkpoint during representative SQLite and repository writes,
  inspect it without restoring, then restore it. Record filesystem consistency,
  process/memory/connection behavior, whole-Sprite impact, and whether restored
  code can override a newer credential epoch or desired release.
- [ ] Destroy the disposable Sprite and verify deletion.

Exit: choose and record one useful root/workload boundary, prove a
non-destructive hard-cost cutoff, validate the network boundary, and confirm
that checkpoint restore cannot silently become authoritative. Failure of any
one is a stop condition; no adapter code is written.

#### Phase 1b: build the minimum lifecycle adapter

- [x] Record the Sprites API/SDK version and pin the Go SDK exactly through
  `./update_dependencies.sh`. If it has no release tag, pin an exact
  commit-derived pseudo-version.
- [x] Probe name and label support, URL settings, Services, policies,
  checkpoints, usage observations, placement, and deletion against the pinned
  version. Do not treat `dev-latest` or connector examples as a contract.
- [x] Define the smallest typed provider interface for create, inspect, exec,
  URL settings, service, policy, checkpoint, restore, and destroy. Keep the
  in-Sprite Tasks integration behind a separate Setta workload-lease boundary.
- [x] Implement the adapter without leaking Fly response types into core state.
  Use deterministic Setta-owned names and labels only if the pinned API proves
  them.
- [ ] Through one automated Go harness, create a Sprite, prove filesystem
  persistence across warm and confirmed-cold wake, install a minimal Setta
  Service, prove Service restart, checkpoint and restore, then destroy and
  verify absent.
- [x] Run a bounded agent-like job, disconnect every client, hold the Sprite
  through a short renewable Task, finish, release it, and prove a simulated
  supervisor crash lets the stale Task expire.

Cold-gate unblock protocol: do not infer a cold wake from the provider's
`status` or organization counters. Pass the cold portion only when the same
Sprite preserves an on-disk sentinel while behavioral evidence proves that its
old process state died and its Service started in a new boot. Obtain either a
documented provider operation/test control that forces memory-dropping cold, or
a Fly-provisioned disposable test organization/configuration with a bounded
cold transition. Ask Fly to reconcile any reported `cold` state that resumes
the original process and to identify a supported machine-readable cold or boot
epoch signal. Checkpoint restore and destroy/recreate may exercise recovery,
but are not cold-wake evidence. Do not probe undocumented lifecycle endpoints.
If Fly confirms that deterministic cold cannot be induced or observed, keep
Phase 1b blocked until the owner explicitly chooses between accepting the
provider contract without live proof or changing the architecture and this
gate to a different, provider-supported memory-loss boundary.

2026-07-15 amendment (owner decision) — narrows the blocking scope of the
protocol above. The cold gate now blocks only (a) any claim that a reported
`cold` implies memory discard and (b) the beta commitment gate. It no longer
blocks Phase 2+ engineering on Sprites. Live soak evidence: Sprites
individually reporting `status: "cold"` for 13.2 and 28.6 hours resumed their
original processes with unchanged boot IDs (48-hour cohort pending).
Escalation is running via community thread 28288, the billing@fly.io workload
inquiry, and the paid support plan once purchased. Until Fly answers, exercise
every recovery path with documented deterministic process-loss events —
checkpoint restore and Service kills — under rule 19, and treat real cold as
an unscheduled event of the same class. After the 48-hour wake, write the
owner decision memo choosing between accepting the provider contract without
live cold proof and re-architecting the memory-loss boundary, and record the
choice in this plan.

2026-07-17: the owner chose Option A of the cold-gate decision memo
(`docs/plans/sprites-cold-gate-decision-memo.md`, now on this branch), which
resolves the choice this protocol left open. Phase 1b is complete; see the
progress log.

The restart-safe 12/24/48-hour reported-cold latency experiment is specified in
`docs/plans/sprites-confirmed-cold-soak-test-plan.md` for independent
implementation and execution.

Exit: the minimal provider lifecycle, persistence, Service, Task, restore, and
cleanup behavior work through typed Go code without product UI.

#### Phase 1c: measure capacity and unit economics

Owner-authorized sequencing exception (2026-07-14): Phase 1c work that does
not depend on confirmed-cold behavior may proceed while the Phase 1b cold soak
is active. This is a schedule exception, not a passed Phase 1b exit or a waiver
of its remaining gate. Do not issue live workload, URL, exec, Service, pressure,
or capacity-test calls against the soak-test organization while that experiment
is active; use offline analysis or a separately authorized disposable
organization. The soak experiment owns the confirmed-cold measurement. Phase 2
does not inherit a claim that Phase 1b passed until the blocked item is resolved
or the owner explicitly changes the provider decision and gate.

The provider contingency and future-test matrix is recorded in
`docs/reports/2026-07-14-cloud-runtime-provider-options.md`.

- [ ] Determine whether authoritative per-Sprite usage and cost observations
  exist and how quickly they arrive. Validate the conservative Setta-side
  measurement and hard-cutoff path chosen in Phase 1a.
  - [x] Audit the public API and pinned SDK: neither currently exposes a
    documented machine-readable per-Sprite billing/usage surface.
  - [x] Add provider-neutral usage evidence and exact, versioned rate-card
    accounting that distinguishes authoritative, conservative, zero, and
    unavailable values.
  - [ ] Obtain an authoritative provider source, measure reporting/settlement
    lag, and reconcile it with trusted Setta counters under enforced resource
    ceilings. Active time at provider minima is only a lower bound.
    (2026-07-17: Fly confirmed on thread 28288 that usage exists only
    org-wide, in the dashboard at Billing > Invoices > Cost Explorer; no
    per-Sprite machine-readable source. The authoritative reconciliation
    source is therefore the org-level invoice/Cost Explorer; per-user hard
    budgets remain enforced from conservative Setta-side metering.)
- [ ] Measure warm and confirmed-cold wake, attached-idle time, active Task time,
  CPU, memory-policy behavior, hot/cold storage, checkpoint growth, Proxy or
  gateway bandwidth, and actual provider cost.
- [ ] Measure the fixed Sprite shape with one agent, the maximum proposed beta
  concurrency, terminals, builds, and previews. Record contention and disk
  pressure; do not build an automatic scheduler.
- [ ] Measure placement and interactive latency from the intended beta
  geographies without adding a user-facing region picker.
- [ ] Replace the pre-code assumptions with a measured unit-economics envelope
  covering retained storage, attached idle, active work, checkpoint retention,
  bandwidth, support margin, and the maximum per-user cost.

Offline evidence and the remaining live matrix are recorded in
`docs/reports/2026-07-14-sprites-phase1c-offline-baseline.md`.
The independently completable accounting, provider-exit backup, measurement
preparation, support inquiry, and contingency-probe work is tracked in
`docs/plans/cloud-runtime-resilience-side-plan.md`.

Exit: the measured capacity and cost envelope supports one bounded beta package
and the latency budgets needed for the access-path decision.

### Phase 2: port the generic runtime foundation

- [x] Build the smallest repeatable developer loop that installs one signed
  local runtime build on a disposable test Sprite, verifies health, and rolls
  back by reinstalling the prior build. Do not wait for fleet orchestration.
- [x] Port runtime identity and feature reporting.
- [x] Port service/install verification without Tailscale assumptions and
  preserve the trusted-runtime/untrusted-workload identity separation proved
  in Phase 1.
- [x] Port provisioning seed/setup attestation with a provider-neutral name.
- [x] Port secure desktop credential storage for the selected user/device
  identity, but do not make a long-lived Sprite-local device token the product
  authority.
- [x] Make runtime endpoints accept provider-neutral HTTPS origins.
- [x] Implement the bounded credential issuer and runtime access-grant model
  from the credential authority gate, including epoch rotation and
  control-plane suspension semantics.
- [x] Preserve constant-time secret validation where opaque bootstrap or
  pairing secrets remain.
- [x] Add structured capability diagnostics for the Setta release, Codex
  binary and authentication, workload-lease integration, policy, disk space,
  and protected runtime state.
- [x] Persist any session, run, queue, transcript, terminal replay, and
  reconnect state that must survive a cold wake under the protected persistent
  runtime path. Keep `/tmp` and process memory non-authoritative.
- [x] Add deterministic tests for bootstrapping, pairing, revocation, restart,
  mismatched runtime identity, credential epochs, warm wake, confirmed-cold wake,
  and post-restore re-attestation.

Exit: a freshly provisioned Sprite proves it is the intended runtime and can
authenticate a Setta device without provider credentials. Complete on the new
base on 2026-07-19: the signed install loop and all six live conformance cases
passed, teardown was verified, and the organization returned to empty.

### Phase 3: choose and harden the client access path

- [x] Implement the minimum Candidate A experiment, including measurement of
  wakes caused before in-runtime authentication can run.
- [x] Implement the minimum Candidate B experiment without making it a
  production service, including the Proxy API transport first and separate
  Fly-edge and gateway-to-runtime authentication.
- [x] Evaluate a provider-native pre-wake Setta authentication mechanism if
  Fly offers one. Do not call a Setta forwarding proxy a separate direct-path
  candidate merely because it is small. Rechecked the current official CLI,
  API, Proxy, lifecycle, connector documentation, and pinned SDK on 2026-07-19;
  no inbound Setta identity mode or scoped end-user Proxy credential exists.
  The offline Candidate B HTTP/SSE core and threat-path evidence are recorded
  in `phase3-access-path-soft-check-20260719.md`; the subsequent live comparison
  is recorded in `phase3-access-path-live-comparison-20260719.md`.
- [ ] Record the comparison budgets before the final experiment and run both
  candidates with identical workloads and regions. Budgets and identical
  workloads are complete; the provider returned no placement for either
  Sprite, so physical-region equality remains unverifiable and must be closed
  with the hosted-gateway measurement.
- [x] Produce a written comparison using the gate criteria above.
- [x] Select one access path and delete the losing experiment. Candidate B won
  on 2026-07-19; no Candidate A production path was added, and its live harness
  remains only as regression evidence.
- [x] Add authentication, credential-epoch, revocation, rate-limit,
  suspension, log-redaction, and wake-abuse tests for the selected path.
- [ ] Apply the connection and idle policy to Director/workstream event
  streams and artifact transfers. Measure recurring reconnect behavior and
  attached-idle cost; do not create Tasks merely to preserve idle client
  attachments. Resume once from the last accepted durable cursor without
  polling. Attached-idle cost still requires a hosted measurement.
- [ ] Verify desktop and a representative real phone, using a minimal typed
  test client, can receive access after an ensure-hosted-access intent,
  reconnect after the desktop closes, and recover across a mobile network
  transition. This proves the backend capability without selecting the product
  phone UI technology.

The remaining hosted-gateway measurement now has a fail-closed deployment,
authorization, teardown, and inventory design in
`hosted-control-plane-measurement-runbook-20260720.md`. It deliberately leaves
the Fly organization and region blank until newly authorized.

The 2026-07-20 offline implementation added the strict authorization loader,
durable pre-create intents and atomic state, fixed-shape reconciliation,
restart-safe ordered cleanup, independent inventory proof, pinned deployment
templates, and a provider/credential-free dry-run. The live provider binding,
runtime install/workload stages, and an explicit Fly organization/region remain
open. A read-only local Fly check exposed only organization `personal`, so the
Sprites organization `setta-100` was not assumed to be the Fly billing target;
no resource was created.

Exit: the selected path has pre-declared latency, revocation, security, wake,
and cost behavior, and no Fly signup, provider token, or manual endpoint entry
is required by the end user.

### Phase 4: validate the Director/workstream execution data plane

The Sprites branch does not implement the Setta 4 Director frontend. It proves
the typed hosted capability the Director will consume: ensure access, submit
work, receive ordered public events, steer or cancel, resolve approvals, obtain
artifacts, disconnect, and resume from a durable cursor.

- [x] Define Go-owned ensure-hosted-access, capability/progress, and
  workstream-execution boundaries; generate any TypeScript consumers from
  those owners.
- [x] Preserve ordered HTTP/SSE events, bounded backpressure, durable cursors,
  and push-based invalidation across the Candidate B gateway.
- [ ] Add content-free latency instrumentation around ensure, wake, first
  event, reconnect, replay, steering, cancellation, approval, and artifact
  availability.
- [ ] Run deterministic local profiles and the identical fixed workload
  against the Sprite over the selected access path.
- [ ] Verify desktop disconnect, phone attach, recurring idle reconnect, warm
  wake, simulated process loss, backend crash, and control-plane restart
  through production boundaries.
- [x] Prove conversation, queue, approval, artifact, and replay state survives
  without process memory or `/tmp`.
- [x] Prove a phone access request does not expose provider identity,
  endpoint, pairing, or wake controls to the client contract.

Exit: the hosted Director/workstream capability is correct, resumable,
measured, and independent of provider UI.

### Phase 5: implement the minimal control plane

- [ ] Record and provision the database, schema ownership, secret store,
  deployment boundary, durable reconciler, lease/fencing mechanism, backup,
  and availability expectations. The 2026-07-20 foundation records and
  implements SQLite schema ownership, a separate filesystem secret store, the
  single Go deployment boundary, durable reconciler, expiring operation leases,
  monotonic fencing, explicit single-instance expectations, a strict offline
  backup/restore format, and a deterministic volume-loss restore drill.
  Provisioned encrypted off-volume retention, measured recovery time, and
  failover remain open.
- [x] Define Go-owned user, entitlement, runtime, device, runtime-access-grant,
  operation, provider-observation, usage, and progress-event contracts.
- [x] Enforce one authoritative active runtime assignment per user with locked
  or atomic updates and durable idempotency keys. Test replacement with the old
  deleting Runtime and new provisioning Runtime present together. Implemented
  with complete-request fingerprints, a deferred same-owner foreign key, and
  restart/replacement tests in `internal/controlplane`.
- [x] Implement idempotent `ensureRuntime` and reconciliation. Concurrent
  requests collapse to one durable intent; restart recovery uses an
  event/timer-driven worker with bounded attempts, expiring leases, and
  monotonic fencing tokens.
- [x] Handle create timeouts by inspecting deterministic identity before
  retrying. Ambiguous-create tests prove a restarted worker adopts the owned
  provider resource without issuing another create.
- [x] Implement wake, health, release mismatch, suspension, credential epochs,
  grace, and deletion scheduling without collapsing them into one lifecycle
  field.
- [x] Store the Fly credential only in the control-plane secret store. The
  deployable accepts `SPRITE_TOKEN` only from the hosting secret environment,
  removes the environment entry before serving, and retains the credential
  only inside the provider adapter process. Runtime credentials live in the
  separate private file secret store, never SQLite.
- [x] Publish push-based provisioning, wake, reconciliation, and deletion
  progress. Do not add a polling watch.
- [x] Add content-free audit events, typed measurement intervals, workload
  lease enforcement, and per-user hard budget enforcement.
- [x] Add a minimal alert path for provisioning and wake failure spikes,
  reconciliation backlog, provider errors, unexpectedly old Tasks or active
  sessions, approaching hard budgets, and failed cutoff actions. Reuse the
  existing operational stack if one exists; do not introduce a second platform
  solely for this beta.
- [x] Add production-path E2E coverage with a scripted fake provider for
  concurrent ensure calls, ambiguous create success, timeout, throttling,
  malformed responses, capacity failure, control-plane restart, lease expiry,
  suspension, and orphan adoption. The deterministic provider-protocol suite
  uses the production Sprites SDK adapter, HTTP protocol, durable SQLite store,
  and reconciler rather than an injected provider mock.
- [x] Keep the live Sprites test narrow, disposable, and explicitly gated.
  The provider-conformance harness creates one deterministic run-scoped
  runtime, is bounded to 20 minutes, requires both the broad live-provider
  authorization and a lifecycle-specific opt-in, registers cleanup before any
  provider mutation, and verifies the runtime is absent after destroy.
- [ ] Obtain a preliminary written Fly response before Phase 6. A response may
  bound the beta rather than promise unlimited scale, but silence or a rejected
  customer-per-Sprite model is a stop condition.

Exit: a duplicate request cannot create a duplicate paid runtime, and a failed
provider operation cannot silently orphan one. Control-plane restart does not
lose mutation intent, suspension, or budget enforcement.

### Phase 6: integrate the automatic product experience

- [ ] Choose one private-beta price, included usage allowance, and hard cost
  cap from the Phase 1c envelope. Do not launch tiers, metered overages, or
  machine-size choices.
- [ ] Integrate Clerk authentication and map immutable external subjects to
  Setta users without provisioning on signup alone.
- [ ] Integrate Stripe Billing checkout, subscription webhooks, entitlement
  projection, failed-payment grace, cancellation, and refund/operator flows.
- [ ] Define the beta eligibility rule that permits Sprite creation and the
  capability thresholds that require verified payment or stronger identity.
- [ ] Accept a typed Director ensure-hosted-access intent containing only
  trusted user, project/workstream, client, and requested-capability
  references. Resolve, provision, wake, bind, and grant access idempotently.
- [ ] Resolve execution placement automatically from trusted entitlement,
  capability, availability, security, and cost state.
- [ ] Enforce the initial one-active-agent limit through existing queue
  semantics and bounded background-work leases. Keep those limits automatic;
  do not expose a scheduler or runtime-sizing UI.
- [x] Publish typed Director progress such as preparing access, syncing the
  project, ready on phone, needs attention, suspended, and exporting.
- [x] Keep provider names, machine sizes, endpoints, pairing, wake controls,
  and runtime selection out of the ordinary client contract.
- [x] Preserve an internal diagnostics surface for support and development.
- [ ] Define who pays for model usage; implement the Codex installation,
  version, ChatGPT login/logout or alternative model credential flow, and
  checkpoint/export treatment of those credentials.
- [ ] Implement a user secrets flow with scoped connectors or brokered secrets;
  do not require users to paste long-lived secrets into an agent prompt or
  unprotected Sprite environment.
- [ ] Define a phone client credential contract using platform-secure storage,
  revocable device identity, bounded runtime grants, and automatic rotation.
  Do not select phone UI technology in this backend plan.
- [ ] Add push notifications for approval-needed, access-ready, run-finished,
  and failure events without including conversation, artifact, or repository
  content in the payload.
- [ ] Verify the desktop can close while agents continue under renewable,
  budget-bound workload leases.
- [ ] Verify an idle desktop or phone disconnects according to policy, the
  Sprite becomes eligible to pause when no useful work remains, and the next
  interaction reconnects without asking the user to manage the runtime.
- [ ] Verify a Director request to make a project available on the phone
  provisions or wakes the required Sprite, grants the authenticated phone
  access, and reports readiness without exposing infrastructure choices.
- [ ] Verify the phone can observe, steer, approve, and open artifacts through
  the shared typed workstream contract.
- [ ] Add the required deterministic cloud-chat Electron workflow through
  main, preload, renderer, HTTP/event streams, runtime stores, and a scripted
  provider/Codex harness. Cover the ensure-hosted-access intent, folderless or
  project-bound workstream creation, streamed output, queueing, steering,
  approvals, completion, cancellation, failure, queued promotion or
  preservation, desktop disconnect, phone attach, reload, runtime restart, and
  persistence.
- [x] Run the live Electron and backend Codex E2E gates with ChatGPT auth when
  available, without `OPENAI_API_KEY`; record a narrow skip when unavailable.

Exit: hosted access behaves like a Director capability invoked by user intent,
not a cloud setup wizard or runtime-management flow.

### Phase 7: implement durability and small-fleet operations

- [ ] Define the off-provider export and backup format for repositories,
  uncommitted work, non-repository files, Setta runtime state, and explicitly
  excluded credentials.
  The encrypted inactive-restore foundation and its remaining activation limits
  are implemented by the resilience side plan; store-owned consistent snapshot
  production, retention, incremental transfer, key management, and live restore
  drills remain Phase 7 work.
- [ ] Implement encrypted, user-scoped off-provider backup/export with key
  management, retention, incremental transfer, progress, cancellation, and a
  bounded payment-grace download path.
- [ ] Run a destructive restore drill and record recovery-point and
  recovery-time results. A successful export without a restore is not proof of
  recoverability.
- [ ] Implement one signed runtime release artifact and two rollout rings: an
  internal test Sprite, then the capped beta fleet. Use desired/observed release,
  a concurrency cap, health verification, failure diagnosis, and rollback that
  does not restore obsolete auth state. Do not build a general fleet platform.
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
- [ ] Have the founders use the production path as their daily cloud
  development environment for a recorded interval. Resolve every data-loss,
  security, runaway-cost, wake/reconnect, and operator-critical issue before
  inviting external beta users.

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

1. A user-level intent asks the Director capability to make an identified
   project or workstream available on the user's phone.
2. Setta validates trusted identity, entitlement, project/workstream
   authority, and requested capability without asking for Fly credentials,
   provider choice, region, endpoint, or runtime selection.
3. The control plane idempotently ensures the user's Sprite, installs the
   signed Setta runtime, proves health and identity, binds the requested
   project/workstream, and issues the minimum revocable phone access.
4. The selected root/workload boundary prevents project and agent code from
   reaching protected Setta state or forbidden management operations while
   representative development work still succeeds.
5. The phone attaches through the typed workstream contract and receives
   ordered public events without learning the provider endpoint or credential.
6. One agent run streams output; additional work queues without exposing
   scheduling or infrastructure controls.
7. The phone steers or cancels work, resolves an approval, and opens an
   artifact through production boundaries.
8. The desktop and phone disconnect. Authorized background work continues
   under a budget-bound lease, completes, and releases the lease; a simulated
   runtime crash proves a stale lease expires.
9. Idle subscriptions disconnect according to policy and the Sprite becomes
   eligible to pause without losing durable workstream or project state.
10. A normal wake and simulated process-loss recovery reconnect from durable
    cursors without relying on process memory or `/tmp`.
11. A device grant and credential epoch are revoked; new requests and existing
    streams lose access within the recorded budgets.
12. A whole-Sprite safety checkpoint and restore applies the current desired
    release and credential epoch without resurrecting revoked access.
13. A hostile or forgotten activity mechanism reaches the hard budget and the
    control plane stops further billable compute without deleting user data.
14. The test records placement, ensure/wake/first-event/reconnect latency,
    attached-idle and active-lease time, CPU/memory measurements,
    storage/checkpoint growth, gateway bandwidth, and actual provider cost.
15. Cleanup revokes run-owned grants and destroys the disposable Sprite,
    gateway Machine, volume, and App.
16. Independent inventories verify all run-owned provider resources and local
    credential copies are absent.

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
- Per-project undo through whole-Sprite checkpoint restore.
- Scheduled or cron-like agent runs initiated while every client is offline;
  the control plane may add an alarm-clock capability only after v1.
- Multiple private-beta price tiers, metered overages, user-selected machine
  sizes, or a general workload scheduler.
- A general fleet-orchestration platform beyond one internal ring and one
  capped beta ring.
- A Setta-funded GPU subscription before provider permission and cost controls.
- Production deployment hosting for applications created in Setta.
- Treating a PWA as the predetermined mobile application architecture.
- Implementing the Setta 4 Director or phone frontend on this branch.
- Exposing provider, runtime, endpoint, pairing, wake, or machine controls to
  ordinary desktop or phone users.
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
- Neither a constrained host account nor a root-capable workload boundary can
  preserve representative package/container workflows while excluding the
  management socket and protected Setta state.
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
- Further billable compute cannot be stopped within the hard-budget deadline
  without permanently deleting the user's Sprite.
- Attached-idle workstream subscriptions, artifact transfers, or clients make
  the one-package beta economics unworkable even with deliberate
  disconnect/reconnect.
- The documented network policy can be bypassed through raw IP, alternate
  resolution, privilege changes, or another tested path and Setta cannot close
  the gap without a new operationally affordable enforcement layer.
- Public endpoints can be cheaply forced awake despite rate controls, and the
  gateway alternative is operationally unaffordable.
- Neither provider-native placement nor a workable regional strategy can meet
  the recorded interactive latency budgets for intended beta users.
- The fixed Sprite shape cannot support the initial one-agent workload,
  Director/workstream services, and bounded artifact transfer without
  unacceptable contention.
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
- 2026-07-13: Reconciled a second plan review and rechecked all 16 source
  inventory commits. Reordered Phase 1 into cheap stop-condition probes,
  minimal lifecycle engineering, and measurement; added the root/container,
  management-socket, non-destructive cost-cutoff, network-policy, attached-idle,
  whole-Sprite restore, confirmed-cold durability, fixed-capacity, replacement,
  monitoring, dogfooding, and pricing gates. Kept the user experience to one
  automatic Cloud Dev path and reduced the beta to one active agent, one
  package, and two release rings.
- 2026-07-13: Completed Phase 0 by pushing `setta-3-cloud-runs-2` to GitHub at
  `39bc2e719ed898ef2c66ce75c40ffb2891056fd2` and independently verifying the
  remote ref through the GitHub API. Corrected the branch-specific upstream
  from a raw HTTPS URL to `origin/setta-3-cloud-runs-2`; local and origin state
  then reported zero ahead and zero behind. Phase 1a is the next execution
  gate.
- 2026-07-13: Added the agent execution policy for the plan: GPT-5.6 Sol at
  high effort for lead synthesis and gates; medium-effort subagents for bounded
  routine work; high-effort subagents only for security, architecture,
  ambiguity, or independent gate review; at most two concurrent subagents,
  depth one, with non-overlapping ownership. Recorded that prose guides agent
  behavior but per-agent effort requires supported Codex custom-agent
  configuration and otherwise inherits from the parent session.
- 2026-07-13: Began Phase 1a. Reinstalled the `sprite` CLI (`v0.0.1-rc45`) and
  re-authenticated to org `setta-100`. Characterized and destroyed a leftover
  probe Sprite (`setta-phase1a-20260713-a1`), recording base image (Ubuntu
  26.04, kernel `6.12.91-fly`), tooling (node 22.20, python 3.13.7, podman 5.7,
  docker absent), and the management surface. Early observations: a
  `tail -f /dev/null` keepalive kept the Sprite billing ~7h despite zero load
  (idle-to-zero defeated); the default `sprite` account has passwordless sudo
  and `/.sprite/api.sock` is world-writable (isolation stop-condition needs the
  adversarial socket-authorization probe); raw-IP egress to `1.1.1.1:443` was
  blocked. Found public evidence that Fly supports the customer-per-Sprite
  model (community threads; $20–$2000 plan ladder gating concurrent-active/warm
  Sprites; no-plan cap of 10), so the formal Fly inquiry is deferred to a
  pre-beta gate. Recorded that the Pre-Code Cost Baseline omits the subscription
  plan layer, which changes per-user economics. Full evidence in
  `docs/reports/2026-07-13-sprites-phase1a-probes.md`. Adversarial probes
  (socket authorization, network bypass, hostile-load cost cutoff) held for
  explicit go-ahead.
- 2026-07-13: Ran the Phase 1a characterization battery on a clean disposable
  Sprite (`setta-phase1a-20260713-char`) via a committed, delegated Codex
  harness (`scripts/sprites/phase1a_characterize.sh`, medium effort). Headline
  isolation result: the default `sprite` workload account is capability-root by
  default — a broad ambient capability set including `cap_dac_override` and
  `cap_sys_admin` (verified by writing `/root` directly), plus passwordless sudo
  and a world-writable `/.sprite/api.sock`. Unix user separation is therefore no
  boundary; a real internal boundary must be constructed. Corrected the earlier
  entry: podman is NOT in the base image (the 5.7.0 seen on the leftover Sprite
  was prior-session install); namespace primitives (`unshare -Ur`, cgroup v2)
  do work. Checkpoint restore rolls back the overlay filesystem and kills
  running processes (whole-Sprite reset). Adversarial probes (management-socket
  authorization from the guest, network-policy bypass, hard-cost cutoff under
  hostile load) remain held for explicit go-ahead. Evidence and harness in
  `docs/reports/2026-07-13-sprites-phase1a-probes.md`.
- 2026-07-13: Ran the authorized adversarial + constructive-boundary battery
  (`scripts/sprites/phase1a_adversarial.sh`, delegated Codex, high effort) and
  then destroyed the disposable Sprite (org now empty, verified). No Phase 1a
  stop-condition fired. Results: (1) `/.sprite/api.sock` is unauthenticated and
  actionable from the guest — a local process created a checkpoint with no
  credential — but exposes only services/checkpoints, not `/v1/sprites` or
  `/v1/policy`, and does not leak the org token; (2) a composed inner boundary
  (unprivileged uid + `no_new_privs` + empty caps + mount-namespace masking of
  `/.sprite`) removes capability-root, sudo escalation, DAC override, and socket
  reachability while preserving dev ergonomics, so the isolation gap is a
  boundary-design task rather than a stop-condition (podman rootless is broken on
  this image); (3) `POST /v1/sprites/<name>/suspend` is a non-destructive cutoff
  that moved `running`→`warm` in ~1s, defusing the "cannot stop compute without
  deleting data" stop-condition (confirm `warm` cost in Phase 1c); (4) default
  egress is wide open (raw IP, DoH, SMTP:25, ICMP all succeeded; only RFC1918
  blocked), correcting the earlier raw-IP-blocked note — Setta must apply an
  egress policy and re-test for bypass. Remaining Phase 1a work: cost-assumptions
  table, idle-pause/attached-idle timing, applied-policy bypass, unauthenticated
  URL wake, and `warm` cost.
- 2026-07-13: Validated the composed launcher boundary
  (`scripts/sprites/phase1a_launcher_boundary.sh`, delegated Codex high effort,
  then re-run independently by the reviewer). Trusted code uses `sudo` only to
  create a mount/PID namespace and mask `/.sprite` (incl. the management socket)
  with tmpfs, then `setpriv` drops to uid 65534 with `no_new_privs` and empty
  capability sets before `exec`. Verified: full containment (socket absent,
  `CapEff=0`, `no_new_privs=1`, sudo and setuid escalation blocked, `/root` and
  trusted state unreadable) with full dev ergonomics (git/pip/cc/python/HTTPS),
  and it works as a `sprite-env` Service entrypoint. The isolation gap is now a
  build task with a proven design; remaining hardening (seccomp, cgroup limits,
  network namespace) is Phase 1b/2. Also built the Phase 1a cost-assumptions
  table (retained-cold, attached-idle, active-agent) with proposed thresholds
  (max ~$25/user/mo, cutoff lag <=60s) pending confirmation. Disposable Sprite
  destroyed; org empty. Evidence in
  `docs/reports/2026-07-13-sprites-phase1a-probes.md`.
- 2026-07-13: Completed the remaining Phase 1a gates on a fresh disposable Sprite
  (`setta-phase1a-20260713-net`, delegated Codex high effort, then destroyed;
  org empty). (1) NETWORK BOUNDARY VALIDATED: Sprites enforces a DNS-domain
  egress policy via `POST /v1/sprites/{name}/policy/network`; an allowlist +
  `deny *` blocks raw IP, RFC1918, DoH-by-IP, SMTP:25, and ICMP while preserving
  git/pip/HTTPS, and is unbypassable by capability-root guest code
  (`/.sprite/policy` read-only, socket routes 404, sudo+`cap_net_raw` cannot
  reach denied IPs) — host-side enforcement; the only caveat is that pre-existing
  connections survive a later tightening, so policy is applied at provisioning.
  Independently re-verified. (2) URL WAKE: `auth: sprite` blocks unauthenticated
  wake (302, stays warm; reviewer-verified); `auth: public` + a live service
  wakes on unauth request. (3) PROXY: `WSS /v1/sprites/{name}/proxy` needs a
  Sprites org Bearer token with no scoped client credential, so client access
  requires a backend gateway holding the org token (Phase 3 Candidate B). (4)
  ATTACHED-IDLE: idle TTY/SSE/preview keep compute `running`; deliberate
  disconnect drops to `warm` in ~6s. Phase 1a technical exit criteria are all
  met and no stop-condition fired; the only open item is confirming the two cost
  thresholds and whether `warm` bills memory. Next is Phase 1b (typed lifecycle
  adapter). Evidence and harnesses in
  `docs/reports/2026-07-13-sprites-phase1a-probes.md` and `scripts/sprites/`.
- 2026-07-13: Owner deferred the cost business decision and adopted the proposed
  thresholds provisionally (~$25/user/mo, <=60s cutoff lag), to be revisited with
  Phase 1c measurements. Phase 1a is closed; Phase 1b is next.
- 2026-07-13: Implemented the Phase 1b typed provider and separate in-Sprite
  Tasks lease boundary against pinned `sprites-go`
  `v0.0.0-20260706200727-0d0f37d154bd`; live server reported `0.0.1-rc45`.
  Identity/labels, URL, network policy, Service, filesystem persistence,
  checkpoint/restore, renewable Task-held detached work, stale-Task expiry,
  destroy, and empty-org cleanup passed. Phase 1b is BLOCKED on its only
  remaining gate: after behaviorally proving warm suspension, filling the
  10-Sprite warm capacity produced provider counters `running=0, warm=0,
  cold=11`, but a 60-second post-wake poll showed the original Service process
  resumed (`starts=1`, heartbeat `598`→`1207`) instead of restarting. Thus rc45
  reports `cold` without documented memory loss, and no bounded or deterministic
  confirmed-cold operation is available. Claude Code Fable 5/high independently
  reviewed the implementation and agreed the discrepancy is upstream after the
  restart race was closed. No commit or final broad quality gate was made while
  the phase exit remains red. Evidence:
  `docs/reports/2026-07-13-sprites-phase1b-lifecycle.md`.
- 2026-07-14: Owner authorized starting independent Phase 1c work in parallel
  with the 12/24/48-hour reported-cold soak. Phase 1b remains blocked and the
  soak organization is reserved exclusively for that experiment. Added a
  provider-options reference for future fallback testing; this does not change
  the current provider or waive any Sprites gate.
- 2026-07-14: Added the offline Phase 1c accounting foundation: explicit
  provider-authoritative versus Setta-conservative usage evidence, coverage
  that distinguishes unavailable metrics from zero, and exact versioned
  published-rate arithmetic. The API/SDK audit found no documented
  machine-readable per-Sprite billing surface. Live capacity, provider-bill
  reconciliation, reporting lag, and trusted resource-ceiling validation remain
  open; no request was made against the soak organization. Evidence:
  `docs/reports/2026-07-14-sprites-phase1c-offline-baseline.md`.
- 2026-07-14: Started and implemented the offline cloud-runtime resilience side
  plan: restart-safe event accounting with expiring workload leases, enforced-
  ceiling cutoff exposure, deterministic local evidence generation, encrypted
  provider-exit export and inactive restore, a send-ready Fly inquiry, and
  provider contingency probe specifications. No live provider call or external
  message was made. Durable provider fencing, credential rotation,
  active-generation CAS, provider-bill reconciliation, and live probes remain
  separately gated. Plan: `docs/plans/cloud-runtime-resilience-side-plan.md`.
- 2026-07-15: Ran the soak verify-due wakes. The 12-hour cohort (woken at
  13.2h) and 24-hour cohort (woken at 28.6h) both classified behaviorally
  warm: unchanged boot IDs, Service start counts of one, and heartbeats
  continuing from pre-idle values, with per-Sprite `cold` status confirmed
  seconds before each wake. The 48-hour cohort remains idle, due
  2026-07-16T17:37:49Z. Updated community thread 28288 (corrected evidence in
  the post plus a per-Sprite results reply). Owner adopted the
  build-while-blocked methodology: added settled boundaries 23–27
  (adapter-only provider types, non-authoritative provider labels, no
  Sprites-specific product promises before beta commitment, provider-exit
  export as a v1 deliverable, provider conformance suite) and narrowed the
  cold gate to durable-cold claims and the beta commitment so Phase 2+
  engineering proceeds on Sprites while Fly escalation continues. The
  accept-versus-rearchitect owner decision memo is due after the 48-hour
  wake.
- 2026-07-16: Overnight offline Phase 2 build-out under the build-while-blocked
  amendment, all delegated to Codex and lead-reviewed with independent test
  and formatter runs: runtime release install loop with signed-artifact
  verification and rollback (`internal/runtimeinstall`); runtime identity and
  setup attestation (`internal/runtimecapability`, `internal/runtimesetup`,
  `/runtime/info`, `/setup/attestation`); provider-neutral HTTPS origin/host
  allowlists and typed capability diagnostics; provider-neutral
  `ServiceSpec.RunAs` with a documented setpriv mapping in the Sprites
  adapter; the deterministic lifecycle test battery (credential-epoch cases
  deferred until the credential issuer exists); and the rule-27 provider
  conformance suite with a shared fake provider. Soak 48h cohort remained
  individually `cold` through 06:08Z without waking. Drafted the cold-gate
  decision memo (`docs/plans/sprites-cold-gate-decision-memo.md`, Option A
  recommended, pending 48h result and owner sign-off). All source remains
  uncommitted pending the 48h wake and scoped quality gates. Evidence:
  `docs/reports/2026-07-16-sprites-phase2-overnight.md`.
- 2026-07-16 (day): Completed the remaining offline Phase 2 items. Bounded PoC
  credential issuer (`internal/credissuer`: ed25519, epochs, device identity
  vs revocable grants, key-rotation overlap, offline cached-key verification,
  5s-bounded live-connection cutoff, single-use setup seeds), desktop secure
  credential storage with a hosted local issuer for dev/e2e pairing
  (`internal/localcredissuer`, protocol snapshot v11), and protected-path
  terminal replay persistence with crash-restart recovery split from
  restore-as-historical semantics. The lead independently verified each slice
  (format, Go tests incl. race, desktop typecheck/unit, and Electron e2e:
  chat, chat-last-selected, prod-record-chat, terminal-profile,
  terminal-backend-crash all passing). Two regressions were caught by e2e and
  fixed in-thread (fail-closed pairing; crash recovery). Committed the
  unrelated chat permission workstream separately (`db806e584`) after
  verification to unblock desktop work. Known pre-existing failure:
  `pane-drag-drop` frame metrics (UI workstream, unrelated). Adopted the
  Sol-only agent policy (this section). Phase 2 exit's live proof and the
  coherent source commit remain gated on the 48h wake, org cleanup, and the
  scoped quality gates.
- 2026-07-16 (evening): Owner authorized the 48h wake. Result: behaviorally
  warm at 53.5h of continuously reported per-Sprite `cold` (unchanged boot
  ID, start count 1, heartbeat continued, sentinel intact). All three soak
  cohorts were memory-preserving resumes; reported `cold` never matched the
  documented memory-discard semantics within the observation window. Cleanup
  verified the organization empty. The confirmed-cold gate is closed as
  UNOBSERVABLE per the final report
  (`docs/reports/2026-07-16-sprites-confirmed-cold-soak-final.md`); the
  decision memo is ready for owner sign-off (Option A recommended). Owner
  authorized continuing to the next phase: scoped quality gates and the
  incremental source commits, then live Phase 2 validation and Phase 1c
  measurements against the now-free organization.
- 2026-07-17: Landed the full Phase 1b + Phase 2 source in four
  dependency-ordered commits after `./check_quality.sh --git-changes` passed
  (complexity decomposition, orphaned-helper removal, and file splits were
  required first): `c9af618b5` provider layer (adapter, harnesses,
  conformance suite), `e1fa627a6` runtime foundation (install loop,
  identity/attestation, credential authority, local issuer, origins,
  protocol v11), `9b7f731bb` desktop credential storage with regenerated
  bindings, `71725cfa6` terminal replay persistence. Supply chain: Go code
  affected by zero vulnerabilities; two pre-existing low pnpm advisories
  recorded. Deviation from the review protocol: no separate `claude -p`
  second-opinion invocation was run — this session's division of labor was
  already inverted (Codex GPT-5.6 Sol wrote every change; Claude Fable 5 at
  high effort reviewed each slice independently with its own test, gate, and
  Electron e2e runs). Owner may request a standalone review pass. Known
  follow-ups: pre-existing `pane-drag-drop` e2e failure (UI workstream) and
  a pre-existing `internal/chat` transcript-block data race visible only
  under `-race`.
- 2026-07-17 (early): Completed the live validation tier against the freed
  organization. The runtime install loop passed live on a disposable Sprite
  (uploaded digest-verified Go release verifier replacing the apt bootstrap,
  which failed on the live image; remote signature verification, install,
  health check, verified teardown; `4d99694e5`). The rule-27 conformance
  suite passed 6/6 live (`2a01a24c6`) after three live-run-driven fixes:
  nil-vs-empty ServiceSpec slice comparison, service_restart_detection
  redesigned around deterministic kill-and-restart (a provider-cold
  expectation cannot pass — reconfirmed live), and checkpoint restore made
  churn-tolerant with provider error detail now preserved in adapter errors.
  Every live run tore down cleanly; the organization is empty. Phase 2's
  live install/identity proof is complete. Next: Phase 1c live measurements
  and the Phase 3 access-path budgets (owner input) before candidate
  experiments. Local dev note: `minisign` is now required on the host for
  live install-signing (installed via Homebrew).
- 2026-07-17 (morning): Landed the Phase 1c live measurement driver
  (`573241e66`): manifest-gated (refuses to run without recorded owner
  authorization per the runbook), restart-safe phases, append-only evidence
  for exposure intervals, resource deltas, latencies, and billing snapshots.
  Work is PAUSED by owner instruction pending: the five decisions in
  `docs/plans/morning-decisions-20260717.md`, and the owner's direction on
  porting this branch's slices onto the newly landed `setta-3` version
  (plan: cut a fresh branch from new `setta-3`, port the provider-neutral
  packages first, reconcile the desktop credential slice, then continue
  Phase 3 there). No live Phase 1c run has been made; the organization is
  empty.

- 2026-07-16: Completed cold-soak run `20260714T173244Z-97151` (12h=behaviorally_warm, 24h=behaviorally_warm, 48h=behaviorally_warm); the dedicated organization was confirmed empty after cleanup. See `docs/reports/2026-07-14-sprites-confirmed-cold-soak-20260714T173244Z-97151.md`.
- 2026-07-17 (re-baseline): Cut `setta-3-sprites` from `setta-3` at
  `92702eb7c` (old base `de4bae2e4`; reason: owner direction to continue the
  platform on the newly landed Setta rewrite) and attached it to
  `/Users/jeff/Documents/_projects/setta.setta-3-sprites` with
  `./worktree.sh --stay --existing setta-3-sprites`. Imported this plan and
  `morning-decisions-20260717.md` verbatim from `setta-3-cloud-platform`
  (`98ef2df6d`, commit `4e5c4a325`), then recorded the re-baseline
  amendments. Conflict result of a full `git merge-tree` simulation: 99
  conflicts — 76 modify/delete against subsystems the new base deleted
  (`internal/chat`, `internal/terminal`, `internal/orchestrator`, the chat
  UI and its e2e suite), 23 content conflicts in `internal/httpapi/*`,
  `internal/runtime/server*.go`, `cmd/*`, and desktop `main/index.ts` plus
  `shared/{ipc,types}.ts` — so the port proceeds by slice, never by merge.
  Verified the eleven provider-neutral packages and three `cmd/setta-*`
  tools import nothing from the deleted subsystems, and that
  `runtimeinstall`'s `httpapi` dependencies (`BackendHealth`,
  `RuntimeInfoResponse`, `BackendName`) exist in the new base with
  compatible shapes. New-base facts recorded: protocol snapshot 62;
  pairing/device-session/runtime-registry/PWA plumbing already present;
  terminals absent (Phase 4 re-scoped); `db806e584` excluded from the port.
  Blocking pre-port item: `setta-3-cloud-platform` has 16 unpushed commits
  needing an owner-keyed push. No source code has been ported yet.
- 2026-07-17 (owner decisions and backup): Pushed `setta-3-cloud-platform`
  to origin at `98ef2df6d` and `setta-3-sprites` as a new remote branch
  (owner-keyed). The blocking pre-port item is cleared. Owner deferred
  recording the Phase 3 access-path budgets: the immediate goal is proving
  the end-to-end cloud UX is workable at all, not the formal candidate
  comparison. The budgets-before-comparison requirement stands unchanged
  whenever the formal Candidate A/B comparison runs; it does not gate the
  UX viability work. Owner reaffirmed provider portability as a standing
  priority — build so providers are replaceable where possible, per settled
  boundaries 23–27 (adapter-only provider types, non-authoritative provider
  labels, provider-exit export as a v1 deliverable, and the conformance
  suite as the provider contract).
- 2026-07-17 (cold-gate sign-off): Owner signed the cold-gate decision memo
  as Option A — accept the provider contract without live cold proof — with
  the memo's three conditions: the soak experiment stays closed with the
  organization empty, the confirmed-cold soak harness is maintained as an
  on-demand regression probe rather than a gate, and future Fly statements
  on cold semantics are recorded in this plan rather than triggering a
  rebuild. The signed memo was copied to
  `docs/plans/sprites-cold-gate-decision-memo.md` on this branch. Phase 1b
  is now fully complete. The Fly escalation remains open (forum thread
  28288 final reply still to be posted by the owner; billing inquiry
  unsent); the beta commitment gate still requires Fly's written answers.
- 2026-07-17 (Fly response recorded): Fly answered community thread 28288.
  Substance: "cold" is broad — in most cases cold Sprites are suspended
  (memory kept, processes alive) to optimize start-up; cold Sprites are
  eligible to move between hosts for load-balancing, and a move discards
  memory with no notice, so processes must be assumed lost unless an
  ongoing Task holds the Sprite active; only registered Services are
  promised to keep running (restarted); there is no official
  machine-readable cold/boot-epoch signal (Fly suggests `/proc/stat` btime,
  which updates on resume, and `/proc/sys/kernel/random/boot_id`);
  deterministic cold cannot be induced — Fly recommends simulating a cold
  start by restarting registered Services; usage data exists only for the
  whole organization (dashboard Billing > Invoices > Cost Explorer).
  Consequences, recorded per memo condition 3 (documentation, not a
  rebuild trigger): the soak result is fully explained — all three cohorts
  were suspended and never moved hosts; Option A stands confirmed, since
  Fly itself instructs against relying on warm/cold; the behavioral
  evidence design (boot IDs, sentinels, heartbeats — rule 24) matches
  Fly's own suggested mechanisms; the conformance suite's
  kill-and-restart cold simulation is exactly Fly's recommended
  simulation; rule 19's assume-memory-loss-any-time posture is now
  provider-stated behavior (unannounced host moves), not conservatism;
  and the Phase 1c authoritative-usage question is resolved as
  org-level-only. The beta commitment gate still requires written
  commercial confirmation (billing inquiry / support plan); a forum
  answer does not provide it.
- 2026-07-18 (agent policy update): Owner replaced the temporary Codex
  GPT-5.5/xhigh delegation rule with GPT-5.6 Sol at high reasoning effort for
  all subagents. Updated the checked-in execution policy and `CLAUDE.md`; all
  subsequent delegations use `--model gpt-5.6-sol --effort high` unless the
  owner changes the policy again.
- 2026-07-19 (new-base port continuation): Completed the provider-neutral port
  through the Phase 1c driver and restored all five Phase 1a viability
  harnesses (`198c6ae5c`, `1af7e58ef`). Re-wired the explicitly enabled local
  credential issuer into the rewritten runtime and HTTP registry
  (`e480a8395`): one-time local enrollment, signed/expiring runtime-access
  credentials, refresh, live stream revalidation, device list/revocation,
  startup configuration, and regenerated Go-owned desktop contracts at
  protocol version 63. A real runtime test proved startup -> enrollment ->
  signed authenticated request -> refresh. The full `./check_quality.sh --all`
  gate passed, including all 19 required Electron workflows; the separate live
  Codex topic-conversation gate also passed agent protocol, side isolation, and
  the production topic workflow with ChatGPT auth. Supply-chain checks found no
  Go vulnerabilities and the two pre-existing low-severity pnpm advisories.
  Next new-base slices: finish setup attestation, capability diagnostics, and
  HTTPS origin/host access-policy wiring; then reconcile desktop safeStorage
  credentials with the new runtime registry before Phase 3 UX viability work.
- 2026-07-19 (new-base Phase 2 offline completion): Finished the runtime
  foundation re-wire at protocol version 64. Runtime info now reports the
  Go-owned feature set and structured diagnostics; setup attestation verifies
  and consumes one-time seeds across restart; endpoint access enforces
  configured HTTPS origins and Host values; and runtime configuration wires
  Codex, release, disk, workload-lease, policy, and protected-state checks.
  Reconciled the desktop credential slice with the rewritten registry:
  `known-runtimes.json` contains only device-identity references, durable
  identities and cached access credentials use Electron `safeStorage`, local
  enrollment yields signed short-lived credentials, credentials refresh per
  request, and revocation/restart recovery remain production-path behavior.
  Protocol contracts were regenerated from the Go endpoint registry. The
  runtime-picker workflow passed encrypted-storage, full Electron restart,
  remote recovery, revocation, local fallback, and unreachable-runtime cases;
  the global speech two-launch workflow and all seven deterministic topic-
  conversation workflows passed; and the live ChatGPT-authenticated Codex
  agent protocol, side isolation, and topic-conversation suites passed without
  `OPENAI_API_KEY`. No live Sprite operation was run. The remaining Phase 2
  gate is the explicitly authorized new-base live install/conformance proof;
  Phase 3's Candidate A/B experiments and final access-path selection require
  the deferred comparison budgets and live provider operations.
- 2026-07-19 (new-base Phase 2 live exit): Owner authorized only the signed
  runtime install loop and provider lifecycle conformance in `setta-100`, with
  a $5 maximum spend and immediate cleanup. Preflight confirmed commit
  `b5bb0fc4d`, Sprites CLI `v0.0.1-rc45`, `minisign`, the selected
  `https://api.sprites.dev` endpoint, and an empty organization. The signed
  install loop passed in 86.16 seconds on disposable Sprite
  `setta-u-d8ed9ace4b8b61822c358e48cc995837`: the uploaded release verifier
  reproduced SHA-256
  `ffeda0423218bc07ebb1433c4b81e0be49268e40f100aad86483f57d55c9cdf3`
  before becoming executable, the throwaway `phase2-test` release installed,
  and runtime health passed. Cleanup destroyed the Sprite and a separate API
  inventory query confirmed zero Sprites. The lifecycle harness then passed
  all six conformance cases in 183.14 seconds on disposable Sprite
  `setta-u-ff457a6b725dc4c1bfce7872bedc42c1` against provider server
  `0.0.1-rc46`: identity/label round-trip, filesystem/service warm
  preservation, service restart detection, checkpoint rollback, workload
  lease lifecycle, and destroy-verified absence. A final independent API
  query at 2026-07-19 13:55:36 EDT reported `running=0`, `warm=0`, `cold=0`,
  and an empty Sprite list. Phase 2 is complete on the new base. Per the
  authorization boundary, no Phase 1c measurement or Phase 3 Candidate A/B
  experiment was run.
- 2026-07-19 (Phase 3 offline soft check): Revalidated the current official
  Sprites CLI, API, Proxy, lifecycle, connector documentation, pinned SDK, and
  local CLI without live provider mutation. No provider-native pre-wake Setta
  authentication or scoped end-user Proxy credential was found, so Candidate
  A's unauthenticated wake risk remains and Candidate B still requires a
  server-side provider credential. Added a provider-neutral private dialer and
  Sprites ProxySocket mapping (`248208ffd`) plus a deliberately non-production
  HTTP/SSE gateway core (`972bff7aa`). The core separates client, provider, and
  runtime credentials; authorizes before provider transport; binds one managed
  runtime; strips spoofable headers; refreshes the inner credential per
  request; flushes SSE; rejects unsupported protocol upgrades; and fails
  closed. Deterministic tests prove unauthorized, revoked, suspended, and
  rate-limited requests cannot resolve or dial a runtime. Recorded a threat
  matrix, identical live workload, stop conditions, and suggested but
  explicitly unadopted comparison budgets in
  `phase3-access-path-soft-check-20260719.md`. No Sprite was created or woken,
  no spend occurred, Phase 1c was not run, and no access path was selected.
- 2026-07-19 (Phase 3 live access selection): Owner adopted 2,500 ms cold,
  250 ms interactive, 100 ms Candidate B overhead, 3,000 ms reconnect,
  5 s/10 s new-request/stream revocation, and $0/day unauthenticated-wake
  budgets, then authorized an immediate Candidate A/B HTTP/SSE comparison in
  `setta-100` under a $5 cap and two-hour cleanup deadline. Both candidates
  used the same locally built and minisign-verified runtime release on provider
  server `0.0.1-rc46`. Candidate A woke on a missing-credential 401 and did not
  close an established revoked SSE stream within 12 seconds. Candidate B
  rejected missing, revoked, suspended, and rate-limited credentials before
  route or Proxy dial; did not wake on denial; rotated both client and runtime
  credentials; and push-cancelled established SSE in 0.437 ms. Candidate B
  measured 150.977 ms protected-HTTP p95, 23.875 ms added interactive overhead,
  512.208 ms fresh-SSE reconnect p95, and 1,487.738 ms observed-cold wake p95,
  all inside the adopted applicable budgets. Selected Candidate B. The provider
  exposed no placement value, and hosted-gateway region/cost/bandwidth, exact
  conversation replay, idle policy, and real mobile transition remain open.
  Two discarded precondition attempts and the final candidate Sprites were all
  destroyed; an independent 19:09:59 EDT inventory reported an empty org more
  than 91 minutes before deadline. Full evidence is in
  `phase3-access-path-live-comparison-20260719.md`; Phase 1c and WebSockets were
  not run.
- 2026-07-19 (Phase 3 selected-path offline hardening): Made the Candidate B
  gateway require explicit authorization, routing, and content-free observation
  dependencies; added streaming-safe bounded HTTP server defaults and exact
  relayed-byte/transport-state observations without URLs, runtime identifiers,
  client addresses, queries, headers, credentials, or bodies. Applied the
  push-based web connection policy: hidden, page-cached, and offline pages close
  SSE immediately; visible/online recovery opens each registration once from
  its last accepted cursor. A deterministic 550 ms inactive interval produced
  zero reconnect attempts, followed by one cursor-3 resume instead of the
  original cursor 0. No Sprite or external infrastructure was touched. Hosted
  region/cost/availability/attached-idle measurement and a real-device network
  transition remain. Evidence is in `phase3-offline-hardening-20260719.md` and
  `../reports/performance/cloud-event-stream-idle-policy-20260719.md`.
- 2026-07-24 (Director-managed product reconciliation): Replaced active
  runtime-picker, provider-wizard, PWA, terminal, and pane assumptions with an
  intent-driven hosted capability. The user asks the Director for an outcome,
  such as making a project available on the phone; Setta resolves placement,
  ensures the Sprite and project binding, grants revocable phone access, and
  reports typed readiness without exposing infrastructure. Reframed the
  interactive data plane and acceptance scenario around authenticated
  workstream HTTP/SSE, durable cursors, steering, cancellation, approvals,
  artifacts, background leases, phone attach, revocation, budgets, and
  independently proven cleanup. Historical evidence remains unchanged. The
  branch still does not implement the Setta 4 Director or phone frontend.
- 2026-07-24 (typed hosted-access foundation): Added Go-owned
  ensure-hosted-access, client, capability, grant, and progress contracts and
  generated their TypeScript surfaces. Schema version 2 durably records
  provider-neutral intents, requested capabilities, and ordered progress.
  The private Unix control boundary accepts strict intents and publishes
  cursor-resumable SSE using in-process push plus SQLite replay, with malformed
  and ahead-of-history cursors rejected. The verified bootstrap now commits
  readiness through the serving process, closing a cross-process missed-wakeup
  race found by the production fixture. That fixture builds and starts the
  real control-plane deployable, submits the generated TypeScript request,
  runs the real bootstrap command with private credential files, and observes
  `preparing_access -> syncing_project -> ready_on_phone` with the bounded
  phone grant. Its client request and progress contain no provider, Sprite,
  runtime, region, machine, endpoint, pairing, or wake fields. No provider or
  cloud operation ran. Workstream execution, steering, cancellation,
  approvals, artifacts, failure progress, Electron conversation E2E, and the
  explicitly authorized live hosted run remain open.
- 2026-07-24 (hosted workstream and desktop proof): Added production-path
  Candidate B conversation tests through the authenticated gateway, real
  runtime, durable stores, and scripted Codex protocol. They prove HTTP/SSE
  replay after control-plane and runtime restart plus queueing, steering,
  queued promotion, artifacts, approval denial, cancellation, and failure.
  Added the desktop hosted-access main/preload/renderer IPC boundary with
  generated progress decoding, push streams, replay cursors, and cancellation
  on release or renderer destruction. The registered `hosted-cloud-chat`
  Electron workflow starts the real control-plane deployable, reaches
  `preparing_access -> syncing_project -> ready_on_phone`, then exercises the
  production renderer/store/HTTP/event path for streamed conversation work,
  queue promotion, steering, artifact projection, approval denial,
  cancellation, failure, reload persistence, and hosted-progress replay. Its
  client surface was checked for provider-facing fields and its temporary
  state was sent to macOS Trash. Focused Candidate B tests, all 107 desktop
  unit files (831 tests), typecheck, build, dead-code checks, and the dedicated
  Electron workflow passed. ChatGPT-authenticated live Codex gates ran with
  `OPENAI_API_KEY` removed: side isolation passed in 39.7 seconds and the
  three-case backend conversation/control/restart/artifact matrix passed in
  101.4 seconds. The agent active-fork case first hit its 240-second provider
  deadline, then passed on the required narrow rerun in 59.1 seconds; the
  initial timeout remains recorded as a transient live-provider failure. A
  dedicated production Electron gate then completed a ChatGPT-authenticated
  Codex turn with `OPENAI_API_KEY` removed, projected the exact completion
  marker through the renderer, and verified the durable agent message and
  narrator catch-up boundary. Its first assertion attempts found two test
  expectation errors after the live turn had completed (terminal output lives
  in `summaryText`, and narrator catch-up must be awaited); the corrected
  narrow rerun passed.
  Commits `2fad2326b`, `2178de216`, and `fc302ab02` contain the replay,
  lifecycle-control, and Electron slices. No Fly, Sprite, or other cloud
  resource mutation ran. The explicitly authorized disposable hosted run,
  content-free hosted measurement, independent cloud cleanup inventories, and
  full phone-attach credential exercise remain open.
- 2026-07-24 (hosted readiness timing foundation): Split
  `syncing_project` from completion so the private hosted-access boundary now
  durably records the actual ensure-to-sync, sync-to-ready, and
  ensure-to-ready intervals instead of assigning simultaneous synthetic
  timestamps. Successful completion emits one content-free JSONL measurement
  containing only the completion timestamp, interval durations, and typed
  event discriminator. Deterministic clock tests prove the interval arithmetic,
  ordered durable cursors, and idempotent sync replay; the production private
  HTTP fixture proves the measurement excludes user, project, workstream,
  device, runtime, token, and path fields. The real generated TypeScript client
  fixture and registered hosted Electron workflow both passed after the
  change. The broader Phase 4 latency checkbox remains open for wake, first
  event, reconnect/replay, steering, cancellation, approval, artifact
  availability, and an explicitly authorized identical live Sprite workload.
- 2026-07-24 (typed hosted-access failure progress): Added Go-owned
  `runtime_assignment_rejected` and `device_grant_rejected` reason codes and
  regenerated the TypeScript contract so successful progress carries `null`
  while `needs_attention` carries one exhaustively decoded reason. The private
  completion boundary now records a stage-specific, conservative
  non-retryable failure instead of leaving the client stalled at
  `syncing_project`; its SSE stream delivers the durable failure and then
  closes. Production-boundary tests force an assignment idempotency conflict
  and verify the ordered preparing, syncing, needs-attention sequence plus the
  persisted reason. Store restart coverage proves the reason and terminal
  state survive process loss, and TypeScript client tests prove strict failure
  decoding. The larger typed-progress checkbox remains open for suspension,
  export, and the Director/frontend projection.
- 2026-07-24 (content-free hosted failure audit): Extended the shared JSONL
  observer with a `hosted_access_failed` record emitted only after the durable
  needs-attention write succeeds. The record contains the completion
  timestamp, Go-owned reason code, retryability, and event discriminator only.
  The forced production-boundary assignment rejection test verifies the exact
  field allowlist and rejects any accidental identifier or request-content
  field. Broader audit coverage for provisioning, wake, suspension, export,
  deletion, and budget cutoff remains open.
- 2026-07-24 (durable hosted suspension progress): Integrated the existing
  user-status policy boundary with hosted access. Suspending a user now
  atomically updates the user and appends `suspended` to every latest hosted
  intent before revoking live authorization, then pushes each waiting stream.
  Repeated suspension is idempotent, suspension survives store restart, and
  the private SSE boundary treats it as terminal. Replay after a ready event
  now retains the bounded access grant on that historical ready event before
  delivering suspension. Focused store and private HTTP tests cover
  preparation-time suspension, ready-time suspension, notification, replay,
  terminal EOF, idempotency, and restart. Reactivation deliberately requires a
  fresh hosted-access intent; export progress and frontend projection remain
  open.
- 2026-07-24 (hosted lifecycle restart proof): Strengthened the production
  Candidate B control-path workflow to restart both the private gateway and the
  serving runtime after completing queue promotion, steering, artifact
  publication, approval denial, cancellation, and provider failure. The
  restarted authenticated gateway reopens the same file-backed application and
  control-plane directories and verifies all five durable turn outcomes, an
  empty queue, the artifact, and the approval-resolution trajectory without
  retaining either process. Together with the existing cursor replay restart
  workflow, this directly closes the Phase 4 durable conversation/queue/
  approval/artifact/replay checkbox. The focused production-path test passed.
- 2026-07-24 (content-free workstream access timing): Extended the production
  Candidate B gateway observer with endpoint-registry-owned operation names,
  first-response and total request durations, and a replay-requested boolean.
  It does not retain paths, query strings, cursor values, headers, request or
  response bodies, client identifiers, workspace or conversation identifiers,
  runtime names, or credentials. The deterministic production-path workflows
  now measure initial and cursor-resumed event streams, input submission,
  steering submission, cancellation, approval resolution, and artifact reads;
  they verify a first body byte is observed and explicitly reject fixture
  identifiers, cursor values, and message text in the JSONL output. This closes
  the gateway-side first-response/reconnect/replay and command-request portions
  of the Phase 4 instrumentation work. The broader checkbox remains open for
  provider ensure/wake attribution, outcome-level steering/cancellation/
  approval/artifact availability timing, and the identical authorized live
  Sprite workload. Focused Go and hosted Electron workflows passed; the full
  quality gate passed every code-level layer and all twenty registered Electron
  workflows except for one unrelated pane-close fixture deadline, whose exact
  registered workflow passed immediately on the required narrow rerun. With
  `OPENAI_API_KEY` removed, all four ChatGPT-authenticated live Codex gates
  passed: Electron, agent protocol, side isolation, and topic conversation.
- 2026-07-24 (control-plane volume-loss recovery): Added explicit offline
  `setta-control-plane backup` and `restore` commands. Backup refuses a reachable
  serving process and missing source state, snapshots SQLite through its
  WAL-aware snapshot operation, copies only the exact sorted set of
  database-referenced runtime secrets, writes `0700`/`0600` artifacts and a
  versioned SHA-256 manifest, and never overwrites a destination. Restore
  accepts only the closed manifest file set, rejects duplicate or unknown
  fields, unsupported schemas, permission violations, extra/missing files,
  invalid credentials, and checksum mismatches, then validates the restored
  database and secret-reference equality through production readers. The
  deterministic volume-loss drill proves the original client authorization,
  runtime route credential, and ordered ready hosted-access progress survive.
  Unreferenced secrets are deliberately excluded. The operator guide records
  that this plaintext recovery artifact requires an encrypted trusted volume
  and is neither authenticated untrusted input nor the Phase 7 user-data
  export. Automated off-volume retention, recovery-time measurement,
  replication, and failover remain open.
- 2026-07-24 (independent runtime policy and deletion execution): Advanced the
  clean-break control-plane schema to version 4 with separate entitlement,
  lifecycle,
  access, health, desired/observed release, wake-request, last-ready, grace,
  and deletion-schedule fields. Ready assignment and route resolution now fail
  closed unless health is healthy and the observed signed release exactly
  matches the desired release. The verified bootstrap and `ensure-runtime`
  command carry that release explicitly. Durable globally idempotent wake
  requests, exact entitlement-grace enforcement, export/ended denial, health
  observations, release mismatch, and future deletion scheduling invalidate
  live grants without rewriting lifecycle. Focused tests cover invalid
  transitions, cross-operation idempotency, restart persistence, strict
  rejection of the prior schema, and backup/restore of entitlement and runtime
  policy state. Candidate B wake execution remains the authenticated private
  dial rather than a fictitious provider management operation; wake intent no
  longer marks a healthy sleeping runtime unhealthy. Scheduled deletion now
  has its own due-time durable queue, explicit pre-claim cancellation,
  bounded retry, lease expiry, monotonic fencing, provider-identity validation,
  post-destroy absence verification, and ambiguous-success adoption without a
  repeated destroy. Restart, stale-fence, cancellation, foreign-identity, and
  ambiguous-destroy tests close the independent-state Phase 5 checkbox. Push
  progress and deletion audit events remain under their separate open
  checkboxes. No provider or cloud mutation ran.
- 2026-07-24 (durable push-based runtime progress): Advanced the deliberate
  clean-break control-plane schema to version 5 with ordered, provider-neutral
  progress for ensure-runtime, wake, and deletion operations. Durable cursors
  now record queued or scheduled work, every reconciliation claim, bounded
  retries with stable error codes, provisioned, healthy, deleted, failed, and
  canceled terminal outcomes. The private Unix administration boundary exposes
  cursor-resumable SSE and pushes only after the durable transaction commits;
  reconnects replay from SQLite, malformed or ahead-of-history cursors fail
  explicitly, and no polling watch was added. Focused tests prove retry and
  completion pushes, wake completion only after healthy desired-release
  observation, ambiguous deletion retry and restart replay, strict cursor
  handling, content-free SSE payloads, and backup/restore persistence. No
  provider or cloud mutation ran.
- 2026-07-24 (content-free reconciliation audit): Extended the shared JSONL
  observer with post-commit provisioning and deletion reconciliation outcomes.
  Retry, provisioned, deleted, and terminal-failure records contain only the
  typed operation kind and state, stable error classification, retryability,
  attempt count, and attempt start time. Deterministic tests exercise an
  ambiguous create retry followed by adoption and deletion, verify the exact
  outcome sequence, and reject operation, user, runtime, route, and secret
  identifiers in output. Wake, suspension, budget-cutoff audit, typed
  intervals, workload leases, and hard budget enforcement remain open under
  the combined Phase 5 checklist item. No provider or cloud mutation ran.
- 2026-07-24 (content-free administration audit): Added post-commit audit
  records to the private administration boundary for device creation, device
  revocation, user suspension, and user reactivation. The shared JSONL output
  contains only the typed action, resulting state, timestamp, and audit event
  discriminator; deterministic production-boundary tests reject user, runtime,
  device, token, display-name, and route identifiers. Wake audit remains
  deferred because no product mutation boundary invokes the durable wake
  method yet; inventing a test-only or hidden production path would not prove
  the requirement. Budget-cutoff audit and the rest of the combined Phase 5
  checklist item remain open. No provider or cloud mutation ran.
- 2026-07-24 (typed reconciliation intervals): Extended each content-free
  reconciliation outcome with deterministic attempt start/completion times,
  measured attempt duration, and measured total duration from durable queue
  creation to outcome. Measurements use the control-plane store clock that
  owns the operation timestamps; negative intervals fail the observer rather
  than being clamped or replaced with an estimate. Tests prove exact zero- and
  one-minute retry/adoption/deletion intervals, exact output fields, rejection
  of negative measurements, and continued exclusion of identifiers. Broader
  provider ensure-to-ready/wake attribution and the live identical-workload
  latency matrix remain open. No provider or cloud mutation ran.
- 2026-07-24 (agent workload-lease enforcement): Wired the existing trusted
  Sprites Tasks lease client into the shared agent runtime used by topic,
  side-agent, narrator, and master turns. The installed Sprite Service enables
  it explicitly; local runtimes do not guess from ambient files. A single
  runtime-wide slot enforces one active provider turn, acquisition precedes
  provider-session creation, renewal occurs at half the bounded TTL, renewal
  failure cancels the turn, and every exit attempts release through a separate
  bounded cleanup context. Focused tests cover acquire failure, renewal,
  renewal-failure cancellation, and release. The registered production
  Electron hosted workflow uses the real Sprites Tasks HTTP client against a
  deterministic Unix-socket server and proves balanced leases while retaining
  queueing, steering, approvals, cancellation, failure, artifacts, and reload.
  Per-user hard budget enforcement remains open, so the combined Phase 5
  checklist item stays unchecked. No provider or cloud mutation ran.
- 2026-07-24 (durable budget-access cutoff): Advanced the Go-owned usage and
  budget boundary to control-plane schema version 6. A user policy now records
  a fixed period, covered micro-USD limit, safety reserve, and separately
  computed worst-case cutoff-lag exposure. The private administration boundary
  accepts only contiguous, idempotent Setta-conservative usage intervals,
  rejects conflicting replay, gaps, foreign runtimes, non-conservative sources,
  active-period resets, and integer overflow, and persists cumulative cost and
  the effective enforced budget. Reaching that threshold atomically suspends
  the user and runtime access, invalidates live credentials, and pushes hosted
  access suspension; restart tests preserve the policy and accounting state.
  Content-free audits record only policy enforcement and continue/cutoff
  outcomes. Provider-side suspend with durable retry/fencing and the trusted
  reporter that derives each interval from the existing accounting ledger
  remain open, so this does not yet close per-user hard budget enforcement or
  the combined Phase 5 checklist item. No provider or cloud mutation ran.
- 2026-07-24 (fenced provider budget cutoff): Advanced the clean-break
  control-plane schema to version 7 and made every threshold crossing create a
  durable provider-suspend operation in the same transaction as access
  suspension. The reconciler prioritizes cutoff work, claims it with an
  expiring lease and monotonic fence, validates exact managed identity before
  mutation, treats an absent or already warm/cold runtime as satisfied, calls
  provider suspend only when still active, and verifies the postcondition.
  Ambiguous suspend enters bounded retry; a restarted worker adopts the
  observed success without issuing a duplicate suspend. Tests cover direct
  success, ambiguous-success restart, permanent foreign-identity rejection,
  expired-lease fencing, due-time scheduling, and content-free retry and
  success audits. The automatic trusted reporter that converts runtime ledger
  events and enforced ceilings into these intervals remains open, so the
  combined Phase 5 item stays unchecked. No provider or cloud mutation ran.
- 2026-07-24 (enforced cutoff deadline): Advanced the clean-break schema to
  version 8 so the policy persists the maximum provider cutoff lag beside the
  separately reserved micro-USD exposure. A claimed cutoff derives its exact
  deadline from the durable threshold timestamp, bounds inspect/suspend/verify
  work by the remaining interval, and terminally records
  `cutoff_deadline_exceeded` if work starts or completes too late. Deterministic
  tests cover retry inside the window and loud failure at the boundary. This
  prevents a hung provider request from silently invalidating the conservative
  cost reserve; automatic trusted usage reporting and the failed-cutoff alert
  path remain open. No provider or cloud mutation ran.
- 2026-07-24 (verified accounting evidence ingestion): Replaced the private
  administration boundary's caller-supplied covered-cost fields with the exact
  versioned artifact emitted by `setta-runtime-accounting`. The control plane
  now owns the pinned Sprites rate card, validates the artifact version,
  lowercase configuration/event hashes, rate-card identity, and conservative
  measurement basis, then recomputes every covered micro-USD component from
  the typed usage observation before writing an interval. The raw interval
  writer is package-private. Durable idempotency binds the complete finalized
  artifact, so exact replay is harmless while any mutation conflicts; altered
  costs and invalid identities cannot accrue budget. The administration CLI
  accepts one strict evidence document on stdin and rejects unknown fields or
  trailing documents, providing a direct offline-ledger-to-control-plane
  contract without a second cost representation. Focused tests cover valid
  threshold enforcement, cost tampering, invalid version/rate/hash/basis,
  exact replay, conflicting artifact replay, and strict CLI decoding. Automatic
  event capture and scheduled submission remain open, so the combined Phase 5
  checklist item stays unchecked. No provider or cloud mutation ran.
- 2026-07-24 (shared accounting finalization contract): Moved the versioned
  accounting configuration, canonical configuration hash, budget-policy
  conversion, evidence identity validation, and complete usage/cost/cutoff
  finalization into the Go-owned `runtimeaccounting` package. The offline
  `setta-runtime-accounting` tool now delegates to that shared path and still
  verifies its persisted configuration hash and policy before accepting a
  finalized restart state. Finalization rejects a foreign window, invalid
  event digest, or provider/rate-card mismatch; the control plane consumes the
  same evidence-version and SHA-256 identity rules. This removes a second
  calculation path before adding online event ingestion. Durable push
  ingestion and automatic producer instrumentation remain open. No provider or
  cloud mutation ran.
- 2026-07-24 (durable runtime accounting stream): Advanced the clean-break
  control-plane schema to version 9 with one ordered event stream and
  restart-safe ledger snapshot per managed runtime. The store accepts only the
  next valid provider, attachment, or workload-lease transition and assigns
  sequence atomically across all producers; exact replay is a no-op, while a
  reused event identity with different canonical content, an impossible
  transition, or a foreign runtime fails without changing the ledger. Offline
  and online streams now hash the same canonical JSONL event representation.
  Deterministic tests prove ordered append, exact replay, conflicting replay,
  invalid-transition and foreign-runtime rejection, canonical digest
  stability, and continuation after a complete store restart. The private
  producer transport, source instrumentation, window closure, and automatic
  evidence submission remain open. No provider or cloud mutation ran.
- 2026-07-24 (provider lifecycle accounting producer): Connected fenced
  provider reconciliation to the durable accounting stream. Successful
  provisioning records provider activity from the durable intent creation
  time, conservatively covering create ambiguity and retries; an immediately
  observed warm/cold runtime closes that interval. Verified budget suspension
  and deletion close any active provider interval in the same transaction as
  their fenced operation completion. A transition failure rolls back the
  operation result so restart/adoption can retry without losing accounting.
  Deterministic tests cover active provisioning, provider cutoff, deletion,
  and store restart, while existing ambiguous-provider tests retain their
  single-mutation guarantees. Normal warm/wake observations, gateway
  attachments, workload-lease production, window closure, and automatic
  evidence submission remain open. No provider or cloud mutation ran.
- 2026-07-24 (typed accounting transition submission): Added a strict
  `setta-control-plane admin record-accounting-event` command over the private
  Unix administration socket. Producers submit one Go-owned transition
  document on stdin plus the managed runtime name; unknown fields, trailing
  documents, positional arguments, invalid runtimes, conflicting transition
  IDs, and impossible state changes fail. The caller never supplies sequence:
  the control plane assigns it transactionally and exact command replay is
  harmless. A production-boundary test exercises the actual CLI, Unix HTTP
  server, strict decoder, durable store, and snapshot reader. Runtime service
  and gateway producer wiring remain open. No provider or cloud mutation ran.
- 2026-07-24 (gateway attachment and warm-wake accounting): Made the
  production gateway require a durable attachment recorder. After an
  authenticated upstream response proves the private runtime is reachable, the
  control plane atomically records a provider begin when needed and a unique
  attachment begin; response streaming completion records attachment end.
  Concurrent callers do not supply timestamps or sequence, so the store clock
  serializes both without ordering races. Cutoff or deletion may clear open
  attachments first, in which case the eventual stream cleanup safely adopts
  the durable end state. Accounting failure before forwarding fails the
  request; cleanup failure marks the content-free gateway outcome as a stream
  failure. Production-path tests prove two authenticated requests create one
  provider interval and balanced attachment intervals while denial still opens
  neither provider transport nor accounting activity. In-runtime workload
  lease production, fixed-window closure, and automatic evidence submission
  remain open. No provider or cloud mutation ran.
- 2026-07-24 (remaining automatic-accounting trust boundaries): The next
  automatic steps are deliberately not papered over. The in-Sprite runtime
  currently has no scoped cross-machine credential or authenticated callback
  channel for reporting workload-lease transitions; the new administration
  socket is correctly local to the control-plane volume and must not be
  exposed. Separately, the pinned Sprites SDK can send CPU, RAM, and storage
  configuration at creation, but Setta's provider-neutral `CreateRequest`,
  persisted provisioning intent, and provider observation do not yet carry or
  verify those limits. Therefore the control plane cannot truthfully construct
  enforced CPU/memory/storage ceilings for automatic evidence, and using SDK
  defaults or billing minima would be a forbidden heuristic. Required follow-up
  is an explicit fixed resource contract persisted with the intent and verified
  on adoption, plus a separately scoped runtime-reporting credential and
  authenticated endpoint. Until both land, fixed-window closure, in-runtime
  workload-lease reporting, and fully automatic budget intervals stay open.
- 2026-07-25 (explicit runtime resource contract): Closed the resource-shape
  half of that prerequisite without selecting a product default. The
  provider-neutral create contract now requires exact CPU core-millionths,
  memory bytes, and persistent-storage bytes; the Sprites adapter sends only
  shapes exactly representable as whole CPUs, decimal megabytes, and decimal
  gigabytes, observes the provider-returned configuration, and refuses
  mismatched adoption. Control-plane schema version 10 persists the shape with
  the assignment and provisioning intent, binds it into idempotency, carries it
  through fenced claims and restart, records the observed shape, and fails
  permanently on mismatch. The hosted live authorization manifest is version 2
  and must explicitly authorize the same shape. These durable verified values
  can now own conservative CPU, memory, and storage ceilings; the scoped
  cross-machine runtime-reporting credential, authenticated workload-lease
  transition endpoint, fixed-window closure, and automatic evidence submission
  remain open. No provider or cloud mutation ran.
- 2026-07-25 (authoritative evidence resource validation): Tightened the
  private evidence ingestion boundary around the newly persisted shape. Before
  an interval can accrue budget, the control plane now reconstructs enforced
  CPU, memory, and conservative hot-storage ceilings from the managed runtime,
  rejects usage quantities above those bounds, recomputes the complete cutoff
  decision from its own price schedule and durable user policy, and requires
  the reserved cutoff exposure to equal that recomputation. Exact finalized
  artifact replay remains harmless and a mutated replay still conflicts before
  authority validation. Tests cover forged cutoff output, internally
  self-consistent evidence built for a larger runtime, and a mismatched durable
  exposure reserve. Event-stream/window authenticity and automatic submission
  remain the next boundary; no provider or cloud mutation ran.
- 2026-07-25 (atomic accounting-window finalization): Advanced the clean-break
  control-plane schema to version 11 and made stored events the evidence source.
  For each runtime, the control plane now closes the next contiguous ledger
  window, verifies and hashes the complete newly assigned canonical event
  sequence, derives conservative usage from the persisted resource shape,
  finalizes cost and cutoff against its durable policy and server-owned price
  schedule, records the budget interval, advances the ledger, and persists the
  evidence in one transaction. Failure rolls back every artifact; exact replay
  is harmless, changed replay conflicts, and restart preserves the next event
  and window positions. Committed windows compact the bounded ledger replay
  index without discarding the durable event registry. A strict
  `setta-control-plane admin finalize-accounting-window` command exposes only
  the window identity and end time over the private Unix socket; a
  production-boundary test exercises CLI, HTTP, store, finalization, and
  snapshot paths. Scheduled closure and authenticated in-runtime
  workload-lease production remain open, so the combined Phase 5 accounting
  item stays unchecked. No provider or cloud mutation ran.
- 2026-07-25 (production provider-protocol E2E): Added a validated production
  Sprites API-origin boundary: the official HTTPS origin remains the default,
  arbitrary HTTP is rejected, and plaintext is accepted only for loopback.
  This lets deterministic tests exercise the pinned SDK adapter, real HTTP
  request and response contracts, durable SQLite operations, and reconciler
  together instead of stopping at an injected provider interface. The suite
  proves concurrent identical ensure calls issue one create, an ambiguous
  create is adopted after restart without a second mutation, an existing
  owned orphan is adopted, throttling and malformed JSON fail loudly, capacity
  rejection is terminal at the configured attempt bound, a timed-out claim is
  recovered only after lease expiry and restart, and suspension prevents any
  provider request. This closes the Phase 5 scripted-provider E2E checklist
  item. No provider or cloud mutation ran.
- 2026-07-25 (control-plane contract ownership audit): Closed the Phase 5
  Go-owned contract checklist after tracing every named record to its owning
  production type and durable reader/writer. `internal/controlplane` owns
  users, entitlements, runtimes, devices, runtime-access grants, fenced
  operations, provider observations, conservative usage intervals, and ordered
  progress events; `internal/runtimeprovider` and `internal/runtimeaccounting`
  own the provider-neutral resource, usage, and evidence values embedded by
  those records. The client-visible hosted-access intent and progress subset
  is registered with `cmd/generate-contracts` and emitted from those Go types,
  while administrative and provider-facing records remain internal rather
  than acquiring a second TypeScript mirror. Existing restart, ownership,
  idempotency, generated-contract, and cursor-replay tests are the
  authoritative evidence. No executable files changed for this audit.
- 2026-07-25 (narrow disposable live-provider gate): Closed the Phase 5 live
  Sprites harness checklist without issuing a provider request. The
  provider-conformance test remains limited to one deterministic run-scoped
  runtime and a 20-minute context, but now requires the dedicated
  `SETTA_LIVE_SPRITES_LIFECYCLE=1` opt-in in addition to the broad
  `SETTA_LIVE_SPRITES=1` authorization. Cleanup is registered before the first
  possible provider mutation, uses an independent bounded context, and now
  inspects the deterministic identity after destroy to fail if the runtime is
  still present.
- 2026-07-25 (immediate operational alert path): Extended the existing
  content-free production JSONL operations stream with typed
  `operational_alert` records. Provider protocol errors emit warning or
  critical alerts according to retryability, while terminal provisioning,
  wake, and budget-cutoff failures emit critical alerts without user,
  runtime, operation, route, or credential identifiers. The deployable wires
  the alerting observer across the production reconciler, administration, and
  gateway observer boundary. Failure-spike aggregation, reconciliation
  backlog, unexpectedly old Task/session, and approaching-budget thresholds
  remain open, so the combined Phase 5 alert checkbox stays unchecked. No
  provider or cloud mutation ran.
- 2026-07-25 (production wake and health administration): Added strict private
  Unix-socket commands for idempotent runtime wake requests and trusted health
  observations. The store now returns, from the same locked health
  transaction, whether a wake was pending and whether the observation
  completed it; degraded health preserves the wake, while healthy
  desired-release evidence appends and pushes its durable terminal progress.
  Content-free audits record only wake-requested, typed health-state, and
  wake-observed outcomes, excluding user, runtime, operation, release, route,
  and credential identifiers. A production-boundary test exercises CLI,
  Unix-socket HTTP, store mutation, degraded preservation, healthy completion,
  and push notification. Suspension/export audits, scheduled accounting, and
  authenticated workload-lease reporting remain open, so the combined Phase
  5 item stays unchecked. No provider or cloud mutation ran.
- 2026-07-25 (durable wake interval attribution): Extended the trusted health
  boundary to carry the original durable wake-request timestamp out of the
  same locked transaction that appends healthy progress. A completed wake now
  emits one content-free `runtime_wake_ready` interval containing only start,
  completion, and measured duration; degraded health preserves the pending
  wake and emits no completed interval, while negative durations fail the
  observer rather than being clamped. The private HTTP production-boundary test
  verifies the exact field allowlist and rejects user, runtime, operation,
  release, and credential identifiers. This closes local deterministic wake
  attribution, while the broader Phase 4 latency checkbox remains open for the
  authorized live workload comparison and remaining end-to-end outcome
  intervals. No provider or cloud mutation ran.
- 2026-07-25 (authenticated workload-lease accounting): Advanced the
  clean-break control-plane schema to version 12 with one separately scoped
  runtime-reporting credential per managed runtime. Only the token hash and
  rotation epoch enter SQLite; create-once credential generation writes a
  private file, private-socket rotation invalidates the prior token, and
  responses and content-free audits exclude both token and runtime identity.
  The Go HTTP registry owns a runtime-only reporting contract outside the
  generated desktop client. Its production endpoint accepts only the scoped
  Bearer credential, derives runtime identity from that credential, rejects
  non-workload transitions and mutated deterministic identities, and records
  exact replay once. Central ingestion assigns ordered event time from the
  store clock while carrying forward the producer-relative remaining lease
  TTL, avoiding cross-machine and concurrent-gateway clock races without
  clamping or keyword heuristics. The runtime reporter permits HTTPS and
  numeric loopback HTTP only; the installer provisions the raw credential as a
  protected runtime-owned file and passes its path, never its value, to the
  service. Agent turns now fail closed unless acquire and renewal transitions
  are accepted, cancel on reporting failure, and report end only after provider
  release succeeds. The hosted cloud-chat Electron workflow exercises the real
  control-plane deployable, credential generation and rotation, backend,
  Electron main/preload/renderer paths, Sprites Tasks socket fixture,
  queued/steered conversation lifecycle, reload, and balanced authenticated
  lease reporting. Scheduled accounting-window closure, automatic finalized
  evidence submission, remaining aggregate alerts, and authorized live-provider
  validation stay open, so the combined Phase 5 accounting checkbox remains
  unchecked. No provider or cloud mutation ran.
- 2026-07-25 (automatic fixed-window accounting): Advanced the clean-break
  control-plane schema to version 13 and closed the remaining Phase 5
  accounting automation gap. The production reconciler now owns one-minute
  fixed-window scheduling through its existing event/timer loop, gives an
  already-due hard-budget cutoff priority, closes the earliest due ledger
  before other provider work, submits the finalized server-derived evidence,
  and emits only the existing content-free usage outcome. Accounting producers
  and policy changes push the worker; no polling loop or competing consumer was
  added. Each ledger now retains an exact durable start-of-window boundary.
  Closure replays and verifies canonical events from that boundary, splits at
  the half-open window end, and preserves later events in the next ledger, so a
  delayed event or process restart cannot stretch an earlier interval or lose
  usage. The scheduler catches up contiguous empty or active windows, caps the
  final partial window at the policy end, derives deterministic idempotency
  keys, rejects discontinuous period rollover, and resumes from the same next
  boundary after restart. Repeated focused tests cover delayed events,
  timer/wakeup execution, restart continuation, deterministic replay, and
  policy-end capping. The final broad gate passed all Go packages, 832 desktop
  tests, build/dead-code checks, and all 20 required Electron workflows. Two
  earlier broad attempts encountered unrelated Electron harness flakes in the
  runtime-picker and pane-projection workflows; each passed its immediate
  isolated rerun before the clean final gate. Supply-chain checks passed Go
  vulnerability, exact-version, lockfile, and release-age policies but still
  report the pre-existing transitive ESLint `brace-expansion <=5.0.7`
  advisory; this slice changed no dependency file. Remaining aggregate alerts
  and explicitly authorized live-provider validation stay open. No provider or
  cloud mutation ran.
- 2026-07-25 (authoritative approaching-budget warning): Added the remaining
  non-heuristic budget warning to the existing content-free operational stream.
  A newly committed usage interval emits `budget_approaching` exactly when
  cumulative spend first enters the policy's server-derived maximum
  cutoff-exposure range. The threshold reuses the durable enforced budget and
  authoritative worst-case cutoff reserve instead of inventing a percentage;
  a hard-cutoff interval emits only its stronger cutoff outcome, subsequent
  intervals do not repeat the warning, and exact request replay remains
  alert-free. Both automatic scheduled finalization and the private Unix-socket
  usage/finalization paths emit only the signal, severity, stable reason code,
  and timestamp. Focused tests repeatedly exercised the threshold, exposure
  larger than the spendable budget, exact replay, and the production
  administration boundary; `./check_quality.sh --git-changes` passed. Failure
  spike and backlog aggregation remain open. No arbitrary maximum Task or
  attachment-session age was added because the current product contracts do
  not own one; adding such a threshold would be the forbidden heuristic the
  implementation rules reject. No provider or cloud mutation ran.
- 2026-07-25 (durable reconciliation-backlog warning): Advanced the clean-break
  control-plane schema to version 14 with private operational-alert
  deduplication and added a content-free `reconciliation_backlog` warning. The
  threshold is the existing reconciler lease: an actionable provisioning,
  deletion, or budget-cutoff operation must remain due and unserved for one
  complete lease before it qualifies. Backlog evaluation and worker wake
  timing now share one SQL-owned actionable-operation query, preventing
  eligibility drift. After downtime, the reconciler records and emits the
  warning before continuing in the same pass to the established highest-
  priority work, so alerting never consumes an operation slot or delays cutoff,
  accounting, deletion, or provisioning recovery. SQLite retains the private
  operation kind and identity only for deduplication; output contains just the
  warning signal, stable reason, severity, and timestamp. Repeated tests cover
  the exact threshold, same-process replay, restart replay, recovery ordering,
  and deletion-over-provisioning priority. The final broad gate passed all Go
  packages, 832 desktop tests, builds/dead-code checks, and all 20 required
  Electron workflows. Supply-chain results remain unchanged: Go, exact
  versions, lockfile sync, and release-age checks pass, while the pre-existing
  transitive ESLint `brace-expansion <=5.0.7` advisory keeps the audit nonzero.
  Failure-spike aggregation and unexpectedly old Task/session detection remain
  open. No provider or cloud mutation ran.
- 2026-07-25 (Phase 6 progress and diagnostics audit): Closed two stale
  product-integration checklist items without changing executable code. The
  Go-owned hosted-access state machine durably publishes `preparing_access`,
  `syncing_project`, `ready_on_phone`, `needs_attention`, and `suspended`
  events with ordered cursors and push notification; the generated desktop
  contract carries those states through the production main, preload, and
  renderer boundary, and the required hosted-cloud Electron workflow proves
  initial delivery and cursor replay. Exporting remains a future entitlement
  lifecycle state rather than a prerequisite for the checklist's illustrative
  progress examples. The existing runtime-info diagnostics surface reports
  typed Setta release, Codex binary/authentication, workload lease, policy,
  disk-space, and protected-state status with stable reason codes. Focused
  tests prove healthy, unavailable, unknown, and failing projections and reject
  sensitive account material. The ensure-hosted-access automation and broader
  cloud-chat workflow items remain open because their existing deterministic
  workflow still invokes the trusted bootstrap completion explicitly. No
  executable files changed and no provider or cloud mutation ran.
- 2026-07-25 (authoritative stale-activity warnings): Advanced the clean-break
  control-plane schema to version 15 and closed the Task/session portion of the
  Phase 5 alert item without inventing maximum ages. A workload Task now emits
  one content-free `stale_workload_task` warning exactly when its centrally
  observed renewable lease expires without an accepted end transition. Durable
  deduplication includes the private runtime, Task name, and authoritative
  expiry, so replay and restart are silent while a later occurrence of the
  same fixed Task name can alert independently. The serving Store separately
  tracks gateway attachments created by its own process. Any attachment
  restored from SQLite but absent from that set is provably orphaned because
  its HTTP/SSE connection could not survive the process; reconciliation emits
  `stale_active_session` and atomically records the canonical attachment end,
  repairing accounting rather than only reporting the symptom. Current
  attachments and unexpired Tasks remain alert-free. Focused tests cover the
  exact expiry boundary, current-process suppression, both alerts, accounting
  repair, same-process deduplication, restart replay, and a second expiration
  of the same Task name. `./check_quality.sh --git-changes` passed. The first
  full gate passed all code-level layers and fourteen Electron workflows before
  the known runtime-picker fixture race; that exact workflow passed immediately
  in isolation. The repeated full gate then passed all 48 Go packages, 832
  desktop tests, builds/dead-code checks, and all 20 required Electron
  workflows. Supply-chain checks passed Go vulnerability, exact-version,
  lockfile, and release-age policies; the pre-existing transitive ESLint
  `brace-expansion <=5.0.7` advisory remains. Failure-spike aggregation is the
  only local alert category still open. No provider or cloud mutation ran.
- 2026-07-25 (operational-alert boundary audit): Closed the combined Phase 5
  alert-path item after verifying every listed source reaches the existing
  content-free `operational_alert` JSONL stream. Each retryable or permanent
  provider protocol error is emitted; terminal provisioning, wake, and cutoff
  failures add their stronger typed critical signal; durable backlog,
  approaching-budget, expired-Task, and restart-orphaned-session warnings cover
  the remaining categories. A failure spike therefore remains visible as the
  underlying sequence of typed alerts for the deployment's operational stack
  to group, page, or rate-limit. The control plane does not add a second
  count/window aggregator: the plan explicitly says to reuse the operational
  stack, no owner-defined aggregation policy exists, and choosing a count or
  window here would be the prohibited heuristic fallback. The stable signal,
  reason, severity, and timestamp are sufficient downstream inputs without
  user, runtime, operation, route, provider-resource, Task, session, or
  credential identifiers. This was a documentation-only boundary audit after
  the clean schema-v15 full gate; no automated check was repeated and no
  provider or cloud mutation ran.
