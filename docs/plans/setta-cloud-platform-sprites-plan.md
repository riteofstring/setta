# Setta Cloud Platform: Sprites-First Runtime Plan

**Date:** 2026-07-13 (re-based 2026-07-17)

**Status:** Plan of record. Phases 0–1b are complete; the confirmed-cold gate
was closed as unobservable and the owner signed Option A on 2026-07-17. The
Phase 2 offline build-out, live install loop, and provider conformance
validation completed on the old base. Their provider-neutral implementation,
the Phase 1c measurement driver, and the viability harnesses are now ported to
the rebased `setta-3-sprites` branch. New-base runtime wiring is in progress:
the local signed-credential authority is integrated at protocol version 63;
desktop secure credential storage, setup/diagnostics/access-policy wiring, and
the live Phase 1c measurements remain. Phase 3 comparison budgets remain
deferred per `docs/plans/morning-decisions-20260717.md` while the end-to-end
cloud UX viability path is proved.

**Branch:** `setta-3-sprites`, created from `setta-3` at `92702eb7c` (the new
Setta). Previous home: `setta-3-cloud-platform`, created from the old
`setta-3` at `de4bae2e4`.

**Worktree:** `/Users/jeff/Documents/_projects/setta.setta-3-sprites`,
created with the repository's `worktree.sh` script.

**Source branches:**

- `setta-3-cloud-platform` (head `98ef2df6d`) is the primary read-only source
  of all implemented platform work: the Phase 1a–2 code, live harnesses, and
  evidence reports. Do not merge it wholesale; port by slice per the
  re-baseline section.
- `setta-3-cloud-runs-2` remains historical design evidence only. Its
  reusable commits were already absorbed into `setta-3-cloud-platform`.

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
- The contract protocol snapshot is now version 62 (the old base was 7; the
  previous branch's foundation slice set 11). Ported contract additions must
  be re-applied on top of the new numbering and regenerated; "protocol v11"
  references elsewhere in this document are old-base history.
- The new base already ships remote-runtime plumbing this plan previously
  scheduled as ports: `setta pair` with single-use pairing tokens and
  `/pairing/complete`, SQLite device sessions with revocation and streaming
  revocation sweeps (`internal/runtimeauth`), persistent runtime identity
  (`internal/runtime/identity.go`), a desktop runtime registry and picker
  with protocol-version negotiation and remote (tailnet or external-URL)
  backends, desktop device-token storage (`known-runtimes.json`, mode 0600),
  a browser/PWA pairing path (token in `localStorage`), and
  infrastructure-provider detection (no Fly/Sprites entry yet).
- The remote transport today is plain HTTP origins with long-lived bearer
  device tokens. The credential authority gate (short-lived credentials,
  epochs, separately revocable grants) still stands; it is now an upgrade of
  the new base's existing seams instead of a parallel build. The web client's
  `localStorage` token is a recorded gap for that gate.

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

## Simplicity Rule

Cloud Dev must be simpler than the infrastructure it hides. The ordinary user
signs in, opens a repository or conversation, and works from desktop or phone.
There is no provider setup or runtime management flow.

The private-beta implementation starts with one CPU provider, one Sprite per
user, one Go control-plane deployable plus its database and secret store, one
runtime release line, one beta package, and one active agent workload per user.
If Candidate B wins, keep its thin gateway in that deployable until measured
scale or isolation requires a split. Desktop and phone use the same control and
runtime protocols. Each new service or abstraction must remove more complexity
than it adds or satisfy a recorded security, durability, or cost gate.

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
This is not a cost forecast. It is an early warning that an idle-looking client,
terminal, preview, or forgotten heartbeat can still create material cost.

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
    per user by default, using the existing queue semantics for additional
    work, plus measured hard caps for terminals and previews. Do not build a
    general resource scheduler for v1.
21. Start with one private-beta package, one included usage allowance, and one
    hard cost cap. Do not add tiers, metered overages, or machine-size choices
    until measured demand justifies them.
22. Ordinary users see one automatic Cloud Dev experience from desktop or
    phone. Provider, region, machine size, runtime, Task, checkpoint, and
    gateway controls remain internal or operator-only.
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
    new provider adapter (E2B, AWS build-out) is complete only when it passes
    the same create/persist/Service/lease/restore/destroy assertions, with
    any provider-specific semantic gaps recorded in this plan rather than
    papered over.

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
- Do not repeatedly merge the active Easy Button branch.
- Resolve platform work against `setta-3`; integrate the Easy Button product
  only after its owners declare a stable checkpoint.
- Avoid changing chats, workflows, conversation UI, or presentation code just
  to demonstrate provisioning.

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

Do not choose by taste. Measure both with the same terminal workload and
record:

- warm and cold connection latency;
- interactive terminal p50/p95;
- reconnect behavior across sleep/wake;
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
event streams, terminals, and previews: when each disconnects or closes, what
state persists, what the user sees, and how quickly the next interaction
reconnects. Measure attached-idle cost separately from active agent cost. Do not
keep a Sprite awake solely to make the UI appear continuously connected.

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

- [ ] Build the smallest repeatable developer loop that installs one signed
  local runtime build on a disposable test Sprite, verifies health, and rolls
  back by reinstalling the prior build. Do not wait for fleet orchestration.
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
- [ ] Persist any session, run, queue, transcript, terminal replay, and
  reconnect state that must survive a cold wake under the protected persistent
  runtime path. Keep `/tmp` and process memory non-authoritative.
- [ ] Add deterministic tests for bootstrapping, pairing, revocation, restart,
  mismatched runtime identity, credential epochs, warm wake, confirmed-cold wake,
  and post-restore re-attestation.

Exit: a freshly provisioned Sprite proves it is the intended runtime and can
authenticate a Setta device without provider credentials.

### Phase 3: choose and harden the client access path

- [ ] Implement the minimum Candidate A experiment, including measurement of
  wakes caused before in-runtime authentication can run.
- [ ] Implement the minimum Candidate B experiment without making it a
  production service, including the Proxy API transport first and separate
  Fly-edge and gateway-to-runtime authentication.
- [ ] Evaluate a provider-native pre-wake Setta authentication mechanism if
  Fly offers one. Do not call a Setta forwarding proxy a separate direct-path
  candidate merely because it is small.
- [ ] Record the comparison budgets before the final experiment and run both
  candidates with identical workloads and regions.
- [ ] Produce a written comparison using the gate criteria above.
- [ ] Select one access path and delete the losing experiment.
- [ ] Add authentication, credential-epoch, revocation, rate-limit,
  suspension, log-redaction, and wake-abuse tests for the selected path.
- [ ] Apply the connection and idle policy to UI event streams, terminals, and
  previews. Measure recurring reconnect behavior and attached-idle cost; do not
  create Tasks merely to preserve idle client attachments.
- [ ] Verify desktop and a representative real mobile device, using a minimal
  test client, can reconnect after the laptop closes and across a mobile
  network transition. This does not select the product phone architecture.

Exit: the selected path has pre-declared latency, revocation, security, wake,
and cost behavior, and no Fly signup, provider token, or manual endpoint entry
is required by the end user.

### Phase 4: port and validate the terminal data plane

2026-07-17 re-scope: the new base has no terminal subsystem, so this phase as
written has no port target. The product's interactive data plane is now the
conversation and master event streams plus the speech realtime path. Phase
4's purpose — validate the interactive data plane over the selected access
path against the recorded budgets — transfers to those surfaces: measure
conversation event-stream latency, reconnect, replay/persistence across warm
and cold wake, and backend-crash recovery through production paths. Whether
terminals return to the product is an owner decision; until then the
terminal-specific checklist below is shelved together with the replay slice
(`71725cfa6`), and the checklist items should be read as applying to the
conversation/master streams where they generalize (reconnect policy,
budgets, crash behavior, multi-device attachment).

- [ ] Port the Go-owned duplex terminal protocol and regenerate TypeScript.
- [ ] Port backend WebSocket loops, tickets, ordering, replay, and bounded
  backpressure.
- [ ] Port Electron and browser stream clients.
- [ ] Port renderer scheduling and content-free latency instrumentation.
- [ ] Run deterministic local latency profiles.
- [ ] Run the identical workload against the Sprite over the access path
  selected in Phase 3 and compare it with the recorded budgets.
- [ ] Verify reload, recurring idle reconnect, warm wake, confirmed-cold wake,
  multi-pane output, terminal close, and backend crash behavior through
  production paths. Prove expected transcript and replay state survives even
  though processes and `/tmp` do not.
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
- [ ] Enforce one authoritative active runtime assignment per user with locked
  or atomic updates and durable idempotency keys. Test replacement with the old
  deleting Runtime and new provisioning Runtime present together.
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
- [ ] Add a minimal alert path for provisioning and wake failure spikes,
  reconciliation backlog, provider errors, unexpectedly old Tasks or active
  sessions, approaching hard budgets, and failed cutoff actions. Reuse the
  existing operational stack if one exists; do not introduce a second platform
  solely for this beta.
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

- [ ] Choose one private-beta price, included usage allowance, and hard cost
  cap from the Phase 1c envelope. Do not launch tiers, metered overages, or
  machine-size choices.
- [ ] Integrate Clerk authentication and map immutable external subjects to
  Setta users without provisioning on signup alone.
- [ ] Integrate Stripe Billing checkout, subscription webhooks, entitlement
  projection, failed-payment grace, cancellation, and refund/operator flows.
- [ ] Define the beta eligibility rule that permits Sprite creation and the
  capability thresholds that require verified payment or stronger identity.
- [ ] Resolve the user's runtime automatically.
- [ ] Enforce the initial one-active-agent limit through existing queue
  semantics and measured terminal/preview caps. Keep those limits automatic;
  do not expose a scheduler or runtime-sizing UI.
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
- [ ] Verify an idle desktop or phone disconnects according to policy, the
  Sprite becomes eligible to pause when no useful work remains, and the next
  interaction reconnects without asking the user to manage the runtime.
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

1. Setta ensures a Sprite without asking the user for Fly credentials.
2. The selected root/workload boundary prevents workspace code from reaching
   protected Setta state or forbidden management operations while normal
   package and container workflows still work.
3. The Setta runtime installs and becomes healthy.
4. A real repository is opened from desktop.
5. A terminal and one active agent run inside the Sprite; additional agent work
   queues without exposing scheduling controls to the user.
6. The active agent acquires and renews a budget-bound Sprite workload lease.
7. The laptop application closes and every client disconnects.
8. Work continues without a client, completes, and releases the workload
   lease; a simulated runtime crash proves a stale lease expires.
9. The phone reconnects through the recorded phone architecture and observes
   the same workspace.
10. Idle UI streams disconnect according to policy and the Sprite becomes
    eligible to pause without losing its filesystem.
11. A normal warm wake reconnects automatically.
12. A confirmed-cold wake restarts Services and restores the expected transcript,
    queue, and replay state without relying on process memory or `/tmp`.
13. A device or credential epoch is revoked in the control plane.
14. A whole-Sprite safety checkpoint is created, a deliberate breakage is
    introduced, the impact warning is shown, and the checkpoint restores the
    workspace.
15. Post-restore attestation applies the current desired release and credential
    epoch; the revoked access is not resurrected.
16. The selected access path proves suspension, WebSocket reconnection, and
    credential redaction through its production path.
17. A hostile or forgotten activity mechanism hits the hard budget and the
    control plane stops further billable compute without deleting user data.
18. The test records placement, warm/cold wake and terminal latency,
    attached-idle and active Task time, CPU/memory measurements,
    storage/checkpoint growth, gateway bandwidth when applicable, and actual
    provider cost.
19. The disposable Sprite is destroyed intentionally and verified absent.

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
- Attached-idle terminals, previews, or clients make the one-package beta
  economics unworkable even with deliberate disconnect/reconnect.
- The documented network policy can be bypassed through raw IP, alternate
  resolution, privilege changes, or another tested path and Setta cannot close
  the gap without a new operationally affordable enforcement layer.
- Public endpoints can be cheaply forced awake despite rate controls, and the
  gateway alternative is operationally unaffordable.
- Neither provider-native placement nor a workable regional strategy can meet
  the recorded interactive latency budgets for intended beta users.
- The fixed Sprite shape cannot support the initial one-agent workload plus
  bounded terminals and previews without unacceptable contention.
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
  identical AWS/E2B contingency probe specifications. No live provider call or
  external message was made. Durable provider fencing, credential rotation,
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
