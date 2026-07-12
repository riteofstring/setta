# Setta Cloud Platform — AWS EC2 + EBS Plan

Date: 2026-07-15
Status: Plan of record for the AWS pivot; independently reviewed; implementation not started
Owner: Setta cloud-platform workstream

## Purpose and authority

Build Setta-operated cloud development on AWS EC2 and EBS while making remote
compute feel like an ordinary, native part of Setta. A user should not need to
understand AWS, machines, disks, regions, networking, or lifecycle operations.
They should open a workspace and work.

This plan replaces the Sprites-specific provider choice and implementation
sequence in `setta-cloud-platform-sprites-plan.md`. It retains that plan's
provider-neutral product, security, lifecycle, accounting, backup, mobile, and
operational requirements. It also incorporates the completed foundations in
`cloud-runtime-resilience-side-plan.md` and the AWS control experiment in
`cloud-runtime-contingency-probes.md`.

This is an AWS-primary plan, not a promise of transparent multi-cloud failover.
Each runtime has exactly one provider resource and one active generation.
Another qualified provider may receive new placements during an AWS incident,
but moving existing state requires a verified backup, a newer inactive
generation, fencing, credential rotation, and one atomic binding switch.

The order is deliberate:

1. freeze the experience Setta promises;
2. disprove the riskiest AWS assumptions with disposable live probes;
3. implement the smallest provider and runtime foundations;
4. connect them through production Setta paths;
5. prove durability, security, economics, and operability;
6. run a bounded private beta.

No phase advances because its code exists. It advances only when its exit gate
has objective evidence in the append-only logs defined below.

## Source hierarchy and UX analysis

When older plans disagree, use this order:

1. this AWS plan;
2. the provider-neutral requirements in
   `setta-cloud-platform-sprites-plan.md`;
3. the completed resilience plan and contingency probe contract;
4. useful experience findings from `byo-cloud-one-click-runtime-plan.md` and
   `remote-runtime-plan.md`;
5. older architecture recommendations as background only.

The existing plans contain two different product eras. The BYO plans exposed a
runtime picker, provider choices, provider login, machine shapes, Tailscale,
copy/paste, and explicit provisioning approvals. Those were reasonable ways to
reduce infrastructure ownership, but they conflict with the current managed
product. Do not port them.

The durable UX findings are:

- local and cloud workspaces should use the same chat, terminal, files,
  previews, approvals, queueing, steering, transcript, and pane concepts;
- the same cloud workspace and current work should be available from desktop
  and phone;
- feedback must be immediate even when provisioning or waking is not;
- users need honest high-level progress, not provider output or fake
  percentages;
- drafts, queued messages, layout, transcript, and approvals survive reloads
  and network transitions;
- background work may continue after the desktop closes only under an explicit
  bounded workload lease;
- completion and approval notifications are product behavior, not optional
  polish;
- version or capability incompatibility must fail clearly rather than produce
  mysterious partial behavior.

### Experience principle

Cloud compute is a capability of a Setta workspace, not an object the user
manages. AWS is an operator implementation detail.

Ordinary users must never be asked to:

- create or connect an AWS account;
- paste credentials, tokens, IP addresses, hostnames, or pairing codes;
- select AWS, a Region, an Availability Zone, an AMI, an instance type, a
  volume, a VPC, or a provider;
- install or configure SSH, Tailscale, a provider CLI, a tunnel, or a VPN;
- click start, stop, wake, attach, snapshot, or resize;
- diagnose an EC2 state, EBS attachment, capacity error, or AWS billing line.

Setta selects, creates, wakes, connects, meters, suspends, backs up, replaces,
exports, and eventually deletes the runtime. Provider details belong in an
operator-only surface and content-free support evidence.

### Interaction budget

The happy path has no infrastructure flow:

- Sign in once.
- Open or create a cloud-backed workspace in the same place users already
  manage workspaces.
- Type immediately.

The first action that requires cloud compute starts preparation automatically.
The composer remains usable and the message is durably queued. Returning to a
stopped workspace wakes it automatically. There is no second submit, retry,
confirmation, or modal after readiness.

Creating a cloud workspace may require one clear product choice if local and
cloud storage semantics genuinely differ. The wording should describe the
benefit, such as availability across devices, not the machinery. Do not add a
choice merely to expose implementation detail.

### Required user journeys

#### 1. First cloud workspace

1. The user signs in and opens/imports a repository or starts a conversation.
2. Setta immediately renders the workspace shell and accepts input.
3. The UI says `Preparing your cloud workspace…` in context, without blocking
   navigation or typing.
4. Setta durably stores submitted work, provisions in the background, and
   streams typed progress events.
5. Once healthy, queued work starts exactly once and output appears in the
   existing chat/terminal surfaces.

No AWS consent is required because Setta, not the user, owns the provider
relationship. Destructive project deletion remains a separate explicit action.

#### 2. Return to a stopped workspace

1. Cached workspace structure, transcript, layout, and last known status render
   immediately.
2. Setta starts the runtime without a user action.
3. The user can type or navigate while it wakes; input is preserved and queued.
4. The UI moves through only useful states such as `Waking…`, `Ready`, or
   `Needs attention`.
5. The queued action is promoted exactly once when the active generation is
   authenticated and healthy.

#### 3. Continue from a phone

The phone opens the same workspace, transcript, panes, active run, queue, and
approvals. It may use a layout adapted to the screen, but it is not a different
runtime or a manually paired companion. Opening it wakes the runtime when
needed. Network changes, app backgrounding, and token refresh do not duplicate
or lose work.

#### 4. Background agent work

A run with a valid workload lease continues after every client disconnects.
The lease is bounded, renewable by trusted runtime logic, visible as a
high-level active task, and released on completion/cancellation/failure. The
user receives completion or approval-required notification. When no work,
client attachment, or protected activity remains, Setta stops compute
automatically.

#### 5. Suspension, budget, or failure

Setta first revokes access and new-work authority. The message describes the
user consequence and recovery action, for example: `Cloud workspace paused —
your files are safe.` Provider codes and resource names stay in expandable
support details. Drafts and queued work remain durable. Automatic retries are
bounded and state-driven; the UI offers retry only when a user action can
actually help.

#### 6. Export and deletion

Export is understandable and non-destructive. Deletion states what will be
removed, applies the retention/grace policy, requires an intentional
confirmation, fences the runtime immediately, and produces auditable absence
proof. Neither action is mixed into everyday lifecycle controls.

### User-visible state contract

The renderer consumes typed Setta lifecycle events. It must not translate raw
AWS strings or infer state from error text. Keep runtime lifecycle vocabulary
to the same six high-level states frozen by the managed-cloud plan:

| User state | Meaning | Allowed user behavior |
| --- | --- | --- |
| `Preparing` | The first runtime generation is being created and verified | Browse cached state, type, queue, cancel queued work |
| `Waking` | A retained workspace is being attached to healthy compute | Same as preparing; no second submit |
| `Ready` | The authenticated active generation can accept work | Full workspace behavior |
| `Needs attention` | Setta cannot safely proceed automatically | Preserve state; show one useful action plus support ID |
| `Suspended` | Access/new work is administratively or budget blocked | Read allowed cached/control-plane state; resolve entitlement/support |
| `Exporting` | A verified export is being prepared | Existing active behavior follows the declared quiescence policy |

Background work, an idle retained workspace, and deletion still need honest
feedback, but they are task/project/account conditions rather than additional
runtime lifecycle states. Show active background work in the existing run UI;
show deletion inside its explicit destructive flow. A retained idle workspace
needs no persistent `Paused` badge: opening or submitting moves directly to
`Waking`.

`pending`, `running`, `stopping`, `stopped`, `shutting-down`, `terminated`,
volume states, status checks, placement, and capacity failures are adapter or
operator observations, not user states.

### Experience service-level objectives

These are provisional gates to measure before making a public promise. Record
p50, p95, p99, sample size, geography, runtime release, instance type, and
failure rate; never report only a best case.

| Interaction | Private-beta target |
| --- | --- |
| Visible response to click/keystroke | within 100 ms locally |
| Cached workspace/transcript usable | p95 within 500 ms |
| Submitted work durably acknowledged | p95 within 1 second |
| Reconnect to an already-ready runtime | p95 within 2 seconds |
| Stopped runtime to authenticated healthy runtime | p50 at most 35 seconds; p95 at most 60 seconds |
| First-ever runtime to authenticated healthy runtime | p50 at most 90 seconds; p95 at most 180 seconds |
| Interactive terminal added round-trip latency | p95 at most 100 ms from a supported geography |
| Access/lease revocation at Setta gateway | p95 within 5 seconds |
| Compute cutoff after a hard policy decision | no later than 60 seconds |

If EC2 cannot meet the wake target, first improve AMI/bootstrap and mask honest
latency with immediate cached/queued interaction. Do not display false
readiness. If p95 remains over 90 seconds under normal conditions, stop and
revisit always-warm pools, the shape/image, or the provider decision before
beta.

### Operator-only experience

Support and operations need an authenticated, audited view of:

- Setta user/runtime/generation and desired lifecycle state;
- AWS account, Region, Availability Zone, instance, volume, snapshot, AMI,
  launch-template version, and last provider observations;
- operation/idempotency key, lease/fencing token, credential epoch, and runtime
  release;
- last health/boot/attestation evidence, transition duration, and typed failure;
- usage evidence, estimated cost coverage, billing lag, budget state, and
  cleanup deadline;
- safe actions implemented as durable operations, never ad hoc console steps.

Logs must remain content-free by default: identifiers, transitions, sizes,
counts, timings, hashes, and typed reasons, not source code, prompts, terminal
output, secrets, or environment values.

## Product boundaries

### Private-beta shape

- one Setta user maps to one persistent workspace data volume and at most one
  active EC2 instance generation;
- one fixed, hidden x86_64 shape is used initially;
- one active agent workload per user by default; other work uses the existing
  queue semantics;
- one included allowance and one hard cap; no machine tiers, overage, or AWS
  price UI;
- supported Regions are selected by policy from a short operator-owned list;
- on-demand instances only until interruption semantics are explicitly
  designed and proven; no Spot in the private-beta critical path;
- no GPU, Docker socket, public arbitrary ports, SSH-to-user flow, shared
  multi-user runtime, or transparent stateful failover.

The initial x86 shape should be a 2-vCPU/4-GiB burstable instance class, with
the exact current-generation type selected by the live pricing/capacity probe.
This is an operator policy, not a client constant. ARM may become an internal
placement after toolchain and repository compatibility measurements; do not
make early users debug architecture differences.

### Cost envelope

Keep the existing provisional maximum provider cost near USD $25 per beta user
per month and the 60-second cutoff-enforcement maximum until measured evidence
justifies changing them. The AWS model must include, separately:

- on-demand running seconds and one-minute start floors;
- CPU-credit surplus or other burst charges;
- root and workspace gp3 storage while running or stopped;
- incremental snapshot and off-provider backup storage;
- public IPv4 or shared egress infrastructure;
- gateway, control-plane, database, object-storage, logging, KMS, monitoring,
  support, and cross-region/data-transfer costs;
- abandoned/stuck resources and billing-report lag reserve.

Do not use a compute-only hourly rate as the beta cost. Reprice by API or an
immutable reviewed rate-card input immediately before every economics gate.

## Target architecture

```text
desktop / phone
      |
      | Setta auth, typed events, durable commands
      v
Setta control plane ---- Postgres / secret store / object backup
      |       |
      |       +---- authenticated preview + runtime gateway
      |                         ^
      | AWS API                 | outbound TLS session
      v                         |
AWS workload account       trusted Setta Box Agent
  EC2 instance -------------+-----------------------+
  disposable encrypted root | untrusted workspace   |
  retained encrypted EBS ---+ files / repos / state |
```

The control plane owns intent, identity, durable operations, active-generation
binding, releases, credentials, access grants, suspension, deletion, and
accounting. AWS observations never become authority by themselves.

### AWS account and network topology

- Use dedicated workload accounts per environment under AWS Organizations;
  never place beta workloads in a developer's personal or control-plane
  account.
- The control plane assumes a narrowly scoped environment role using workload
  identity; no long-lived AWS access keys in repositories, clients, instances,
  or user data.
- Apply Service Control Policies and IAM conditions for allowed Regions,
  required tags, approved launch templates/AMIs/types, encrypted EBS, IMDSv2,
  and denied privilege-expansion paths.
- Use separate VPCs and subnets per environment. No inbound security-group
  rules exist on user instances. SSH is not a product access path.
- The Box Agent establishes an outbound authenticated TLS connection to the
  Setta gateway. Terminal, events, file operations, agent protocol, and preview
  streams multiplex over authenticated logical channels with backpressure and
  per-channel limits.
- The beta probe should compare: (A) an ephemeral public IPv4 with zero inbound
  rules and direct outbound egress; (B) IPv6-first egress with an explicitly
  costed shared fallback for IPv4-only development dependencies; and (C) a
  private subnet with no public address and a shared, highly available managed
  NAT or Setta-controlled egress-proxy fleet. Do not pay for one Elastic IP,
  NAT gateway, load balancer, or custom proxy per user.
- Egress policy must be enforceable below untrusted user control. Required
  development traffic is allowlisted through the selected boundary; private
  networks, metadata, provider APIs, SMTP, alternate DNS, raw-IP bypasses, and
  pre-existing forbidden connections are tested.

No Setta client or database contract depends on an instance address; the Box
Agent reconnects outbound and authenticates the active generation. If the
public-address option wins, its address may change on stop/start. If the
private-subnet option wins, the primary private address normally remains with
the network interface while stopped, but Setta identity still must not depend
on that behavior.

A shared egress proxy can provide an out-of-instance FQDN/SNI backstop even
after a hypothetical host escape, but it adds a shared trust point, throughput
ceiling, image-patching duty, and availability burden. A managed NAT is more
mature but cannot enforce domains by itself. On-host DNS/IP-set policy has
DNS-to-IP timing and shared-CDN ambiguity; any allowlisted HTTPS destination
can still carry payload exfiltration unless Setta performs compatibility-
breaking TLS interception. Phase 1 must measure and explicitly accept or close
these residuals instead of claiming that a security group is an egress policy.

### Instance, image, and storage layout

Use two encrypted EBS volumes:

1. **Disposable system volume.** A small root disk built from a pinned,
   signed, reproducible Setta AMI. It contains the OS, trusted Box Agent,
   supervisor, policy, and a pinned runtime release. It is replaceable and
   `DeleteOnTermination=true`.
2. **Retained workspace volume.** A gp3 data disk sized by a hidden beta policy,
   identified by UUID, encrypted, mounted only after generation verification,
   and `DeleteOnTermination=false`. It contains user files and the explicitly
   designated persistent runtime state.

Enable EBS encryption by default with an environment-owned key policy. Decide
between the AWS-managed EBS key and a shared environment customer-managed key
only after recovery, access-control, audit, cross-account backup, and cost
tests; never create a billable key per user by default.

An EBS volume attaches only within one Availability Zone. The placement record
therefore binds the active instance and retained volume to the same AZ. A zonal
outage recovery uses a verified snapshot/off-provider backup to create a newer
generation; it is not a blind cross-AZ retry.

### Trusted/untrusted boundary

EC2 tenant isolation does not protect Setta's trusted agent from code running
inside the same VM. Before beta, user code—including package scripts and
root-seeking workloads—must run inside a boundary that proves all of these:

- no access to the host PID, mount, network, device, IPC, cgroup, or systemd
  control planes;
- no access to Box Agent executables, sockets, state, credentials, gateway
  tickets, or bootstrap evidence;
- no access to IMDS, provider APIs, host credentials, or other users;
- enforced CPU, memory, PID, disk, file-descriptor, process-runtime, and
  network ceilings that the user cannot raise;
- useful development package installation without host root or a Docker
  socket;
- restart and cleanup of every workload process when a lease ends or a
  generation is fenced.

Evaluate rootless containers/namespaces with cgroup v2, seccomp, AppArmor, and
a controlled persisted overlay as an implementation candidate. The gate is
adversarial behavior, not the chosen technology name. If root-capable user
workloads can escape or tamper with enforcement, stop; do not compensate with
monitoring or terms of service.

### Bootstrap and runtime identity

Do not place a lasting secret in EC2 user data or an AMI. The preferred
enrollment flow is:

1. the durable create operation writes the expected account, Region, AZ,
   instance identity, generation, launch-template version, runtime release,
   and one-use enrollment nonce to Setta authority;
2. early trusted bootstrap reads the signed EC2 instance identity document via
   IMDSv2;
3. it sends the signed document plus the nonce over TLS;
4. Setta verifies the AWS signature and exact expected instance/account/Region,
   consumes the nonce, and returns a short-lived generation-bound credential;
5. the agent rotates to ordinary short-lived gateway credentials;
6. IMDS is unavailable from the untrusted workload boundary.

No IAM instance profile is attached in the beta unless a written threat model
and adversarial test proves every permission safe to expose to hostile code.
EBS, snapshots, EC2 lifecycle, and monitoring operations are performed by the
control plane. If operational access is required, design a separate narrowly
scoped break-glass path; do not silently add SSH or broad SSM permissions. No
instance role also means ordinary SSM access is unavailable. Treat that as a
deliberate security/operability tradeoff: prove boot-failure diagnosis through
content-safe console output, serial-console break glass where supported, and
the Box Agent diagnostic channel after network initialization.

### Runtime access and previews

- Every client request is authenticated by Setta and authorized against the
  active runtime generation, device, grant, entitlement, and credential epoch.
- Separate transport identity from user authorization: the Box Agent uses
  short-lived per-generation mTLS (or an equivalently strong mutually
  authenticated transport), while the user/device grant remains an inner,
  independently revocable application-layer authorization. Do not overload one
  bearer/header for both trust decisions.
- The gateway never trusts runtime-supplied user identity headers.
- Runtime tickets are short-lived, audience-bound, generation-bound,
  single-purpose, and replay resistant.
- Revocation and suspension take effect at the Setta gateway without waiting
  for EC2 to stop.
- Previews use authenticated per-workspace origins and origin isolation;
  arbitrary ports are never directly exposed from EC2.
- Reject unauthenticated preview traffic before any ensure/wake operation. A
  public scan or expired share must never create paid compute.
- HTTP, HTTPS, WebSocket, SSE, streaming bodies, HMR, large output, slow
  consumers, disconnect/reconnect, and mobile network changes have explicit
  limits and tests.
- A temporary public share feature is out of scope until it has a distinct
  capability, expiry, abuse, rate-limit, and content policy.

### Lifecycle and hard cutoff

Keep core intent separate from AWS observation:

- desired access: enabled, suspended, export-only, delete-scheduled;
- provisioning: absent, creating, bootstrapping, verifying, ready, replacing,
  failed;
- Setta health: unknown, healthy, degraded, unreachable, incompatible;
- AWS adapter observation: pending, running, stopping, stopped,
  shutting-down, terminated, status checks, volume attachment, and typed API
  failure.

`ensureRuntime(userID)` is a durable, idempotent operation. Each mutation uses
an operation ID, AWS client token where supported, explicit desired parameters,
lease/fencing token, deadline, and persisted provider request evidence. On a
timeout or ambiguous response, reconcile by exact resource ID, operation tags,
and generation before retrying. Account for EC2 eventual consistency with
bounded exponential backoff inside the durable operation—not a permanent UI or
fleet polling loop.

Normal idle flow:

1. trusted events close client-attachment and workload-lease intervals;
2. the control plane persists an idle deadline and emits a typed transition;
3. a durable scheduler acts at that deadline;
4. it rechecks authoritative lease, generation, and activity state;
5. it asks the runtime to quiesce, sync, and unmount safely;
6. it stops the EC2 instance and verifies stopped state;
7. opening/submitting later creates one start operation; the agent remounts,
   verifies, authenticates, and drains the queue.

Hard suspension/cost flow:

1. immediately revoke gateway access, new work, and lease renewal;
2. fence the generation in Setta authority;
3. request graceful quiescence and EC2 stop;
4. if the measured cutoff deadline is at risk, use the explicitly tested
   force/skip-OS-shutdown stop path and mark the filesystem for verification;
5. if EC2 still cannot stop within 60 seconds, terminate the disposable
   instance while retaining the workspace volume;
6. inspect/repair or restore the volume into a newer inactive generation before
   it can become active again.

Force stop or termination can corrupt in-flight writes. They are last-resort
budget/security controls, not ordinary idle behavior. The separate retained
volume makes compute disposable, but only live crash-consistency and restore
tests can validate the recovery claim.

### Durability and provider exit

- EBS is the fast primary workspace copy, not the only durable copy.
- Quiesced EBS snapshots provide AWS-local recovery and replacement.
- The existing authenticated `internal/runtimebackup` export is the
  provider-exit format and restores only into a newer inactive generation.
- Define explicit beta RPO/RTO from measurements. Track Setta database state,
  workspace files, and active in-memory work separately; do not imply EC2 stop
  preserves RAM or processes.
- Backup completion requires content hash/inventory, generation, credential
  authority inventory, encryption, retention, restore-test status, and an
  off-provider location.
- Scheduled restore drills create an isolated inactive volume/runtime, validate
  content and safety, then destroy it and prove cleanup.
- Deletion fences immediately, honors the written grace/retention policy,
  destroys instance/root volume/snapshots/workspace volume/backups as required,
  and records provider list/absence evidence.

### Accounting and budgets

Extend, do not replace:

- `internal/runtimeprovider` for provider-neutral lifecycle/usage contracts;
- `internal/runtimeaccounting` for append-only activity evidence;
- `internal/runtimecost` for versioned integer rate cards and bounded cost;
- `internal/runtimebackup` for authenticated provider-exit packages.

AWS usage evidence distinguishes:

- Setta-authoritative runtime/lease/attachment intervals;
- enforced instance, volume, snapshot, and network ceilings;
- EC2/EBS resource observations;
- Cost and Usage Report or billing data, including its reporting and settlement
  lag;
- estimated, authoritative, unavailable, and zero dimensions.

A delayed AWS bill cannot authorize more work. The hard cutoff uses
conservative Setta evidence plus enforced ceilings and a safety reserve. Later
billing reconciles estimates and alerts on drift. CPU credits, volume size,
snapshot growth, public addresses, egress, gateway bytes, and orphan time must
not disappear into an unpriced remainder.

## Domain and contract work

The Go-owned domain should include, at minimum:

- `Runtime`: user, active generation, desired access, provisioning state,
  health, provider kind/resource observation/placement, runtime release,
  credential epoch, backup status, timestamps;
- `RuntimeGeneration`: immutable generation, provider binding, instance/root
  volume/workspace volume, AMI/launch-template release, AZ, attestation,
  activation/fencing state;
- `RuntimeOperation`: kind, idempotency key, request fingerprint, lease/fencing
  token, provider request/resource IDs, attempt/deadline/state/typed error;
- `Device` and `RuntimeAccessGrant`: device/session, scope, audience, generation,
  issued/expiry/revocation;
- `UsageInterval`, `BudgetDecision`, `Backup`, `RestoreReceipt`, and
  `DeletionReceipt` with explicit evidence basis.

HTTP request/response contracts remain owned by the `internal/httpapi` endpoint
registry. Generate TypeScript surfaces from Go-owned contracts and values;
never hand-maintain mirrors or edit generated outputs. Provider SDK types and
AWS strings stop at an AWS adapter package.

The current broad `runtimeprovider.Provider` reflects the Sprites proof. Before
adding AWS, deepen the owning modules instead of forcing EC2 through methods
that do not match it. Separate capabilities such as lifecycle, command/data
path, service supervision, network policy, snapshot, and usage when their
authority or failure modes differ. Do not create a global constants file or a
fake lowest-common-denominator provider.

## Implementation phases and gates

### Phase 0 — Adopt the plan and freeze evidence rules

- [ ] Review and accept this plan as the AWS pivot plan of record.
- [ ] Record the exact branch, base commit, dirty-worktree ownership, AWS probe
  authorization owner, maximum spend, and disposable account.
- [ ] Preserve existing Sprites evidence; do not rewrite it to make AWS look
  selected retroactively.
- [ ] Create the append-only progress, decision, gate, risk, cost, and resource
  ledgers below.
- [ ] Freeze beta UX vocabulary, interaction targets, cost cap, cutoff limit,
  supported geographies, retention intent, and stop conditions.
- [ ] Decide which existing concurrent changes must land or move before AWS
  implementation; never absorb unrelated work into cloud commits.

Gate 0: owner accepts the UX contract, evidence templates, spend authority,
source hierarchy, and initial stop conditions. The plan and no unrelated files
are committed.

### Phase 1 — AWS viability and architecture proof

Use the prepared AWS contingency probe as the minimum contract. All resources
are disposable, tagged, cost-capped, and cleaned up. Documentation does not
pass this phase.

#### Phase 1A — Account, pricing, capacity, and API semantics

- [ ] Create/identify the isolated AWS account and Toronto measurement Region;
  configure an AWS Budget and an independent Setta deadline.
- [ ] Inventory account defaults, quotas, supported AZs/types, AMIs, public
  addressing, EBS encryption, CloudTrail, billing export, and cleanup rights.
- [ ] Record exact current on-demand, EBS, snapshot, IPv4, egress, gateway,
  KMS, logging, and support rates as immutable inputs.
- [ ] Compare at least the candidate x86 2-vCPU/4-GiB shapes for price,
  sustained CPU, credit behavior, availability, and boot latency.
- [ ] Prove create idempotency and ambiguous-result reconciliation using a
  client token plus operation/generation tags.
- [ ] Measure eventual consistency, throttling, typed errors, quota failure,
  start/stop transition distributions, and API reporting lag.
- [ ] Verify every resource can be found by deterministic Setta ownership tags
  and expiry.

Gate 1A: a reviewed report shows bounded cost inputs, available capacity,
reconcilable API behavior, no duplicate resources, and successful absence
proof after cleanup.

#### Phase 1B — Storage, lifecycle, and cutoff proof

- [ ] Launch a disposable system volume plus retained encrypted workspace
  volume with the proposed termination flags.
- [ ] Record boot IDs, service start counts, mount UUIDs, sentinel hashes, and
  process/RAM loss across stop/start.
- [ ] Prove ordinary quiesce/stop/start preserves the workspace and restarts
  the trusted service without manual action.
- [ ] Prove a force-stop and a terminate-retaining-data escalation against a
  hostile workload and a deliberately unresponsive supervisor.
- [ ] Measure cutoff from Setta decision to gateway revoke and to zero EC2
  compute billing state; meet the 5-second/60-second gates.
- [ ] Verify filesystem check/repair behavior after forced interruption and
  never activate a questionable volume silently.
- [ ] Snapshot, mutate, restore to a separate inactive volume/generation,
  validate hashes, and measure lazy initialization/performance.
- [ ] Prove AZ constraints, attachment conflicts, volume-busy behavior, KMS
  denial, snapshot failure, disk full, inode exhaustion, and orphan cleanup.

Gate 1B: ordinary stop/start is deterministic; the worst-case cutoff meets the
deadline without deleting retained workspace data; every forced path detects
and safely handles possible corruption; restore and cleanup pass.

#### Phase 1C — Bootstrap and hostile-workload isolation proof

- [ ] Build the smallest pinned AMI fixture and record its source, packages,
  SBOM, signature/digest, architecture, and release identity.
- [ ] Prove signed instance-identity enrollment, expected-instance matching,
  nonce consumption, replay rejection, and credential rotation.
- [ ] Prove no long-lived secret exists in the AMI, user data, IMDS-visible
  fields, filesystem export, logs, environment, or process list.
- [ ] Run ordinary and root-capable adversarial workloads against host
  namespaces, Box Agent, IMDS, control sockets, credentials, cgroups, devices,
  mounts, and neighboring resources.
- [ ] Exercise fork bombs, memory pressure, CPU loops, disk/inode fill, huge
  output, raw sockets, alternate DNS/DoH, private addresses, SMTP, and existing
  forbidden connections.
- [ ] Prove package/toolchain installation works inside the boundary without
  host root or Docker socket.
- [ ] Verify expiry/fencing kills all workload processes and prevents agent or
  network resurrection.

Gate 1C: the exact proposed trusted/untrusted boundary withstands the
adversarial suite while remaining useful for representative repositories. Any
host-control or credential escape is a stop condition.

#### Phase 1D — Outbound gateway and preview proof

- [ ] Connect the Box Agent outbound with no inbound security-group rules and
  no stable runtime address in Setta contracts.
- [ ] Authenticate active generation, device, grants, audience, and credential
  epoch on every logical channel.
- [ ] Prove terminal, command, file/event, agent, and preview flows with
  independent backpressure and byte/time/concurrency limits.
- [ ] Exercise HTTP/HTTPS/WebSocket/SSE/HMR, large/slow streams, reconnect,
  suspension, ticket replay, header spoofing, origin isolation, and mobile
  network changes.
- [ ] Compare ephemeral IPv4, IPv6-first/shared-IPv4 fallback, and private
  subnet/shared-NAT-or-egress-proxy designs for compatibility, cost, bypass
  resistance, cold start, availability, and operational burden; select one
  explicit beta topology.
- [ ] Test SNI/domain fronting, DNS/IP-set timing, shared-CDN addresses,
  allowlisted-destination exfiltration, and egress-proxy failure/overload;
  document residuals the beta explicitly accepts.
- [ ] Prove unauthenticated or revoked preview traffic cannot invoke ensure,
  start, or any other paid mutation.
- [ ] Confirm gateway loss cannot extend an expired workload lease or prevent
  the control plane from cutting off EC2.

Gate 1D: production-shaped traffic works through the authenticated outbound
path, no provider credential/address reaches a client, revocation passes, and
the selected egress topology has bounded cost and documented limitations.

#### Phase 1E — Economics and soak

- [ ] Run representative interactive, attached-idle, disconnected-agent,
  sustained-build, preview-heavy, stop/start, snapshot, and restore workloads.
- [ ] Reconcile Setta evidence with first-visible and final-settled AWS billing;
  record every uncovered or drifting dimension.
- [ ] Model at least light, median, heavy, abandoned, and hostile monthly users
  with p50/p95 provider and shared-platform cost.
- [ ] Run a multi-day lifecycle soak with restarts, control-plane disconnects,
  capacity probes, fault injection, backup/restore drills, and daily orphan
  absence checks.
- [ ] Evaluate AWS status/SLA/support scope and perform one bounded support-path
  exercise without inventing a production emergency.
- [ ] Compare the final measured AWS result with the same common contract used
  for E2B or another qualified backup candidate; do not compare marketing
  claims.

Gate 1E: measured median/p95 cost fits the approved envelope with reserve,
billing lag cannot defeat cutoff, UX latency meets the provisional gates, the
soak has no unexplained state/data/cost event, and support/incident risk is
accepted in writing.

Phase 1 exit: Gates 1A–1E pass and the owner explicitly authorizes product
engineering. A failed security, data-loss, cleanup, or hard-cutoff gate stops
implementation rather than becoming beta debt.

### Phase 2 — Provider contracts and AWS adapter

- [ ] Refactor the provider-neutral contracts into capability boundaries that
  represent Setta authority without Sprite or EC2 leakage.
- [ ] Add exact, pinned AWS SDK dependencies through `./update_dependencies.sh`
  and run the supply-chain gate.
- [ ] Implement the AWS adapter for create/inspect/start/quiesce/stop/force
  cutoff/terminate, volume attach/detach, snapshot/restore, tag inventory, and
  cleanup.
- [ ] Map AWS observations and typed API errors exhaustively; no error-string
  heuristics or silent fallback.
- [ ] Persist request fingerprints, client tokens, resource IDs, observations,
  and retry metadata around every ambiguous operation.
- [ ] Implement a versioned AWS cost schedule with explicit unavailable
  dimensions and immutable observation time.
- [ ] Add an exact tagged-resource reconciler for orphan detection and desired
  state repair. It may run on events/startup and a documented low-frequency
  safety schedule; it is not user-visible status polling.

Gate 2: deterministic adapter tests cover success, ambiguity, duplicate retry,
eventual-not-found, throttling, quota, partial create, stale observation,
attachment conflict, KMS denial, cutoff escalation, and cleanup, followed by a
small authorized live replay against the disposable account.

### Phase 3 — Runtime image, supervisor, and release pipeline

- [ ] Build the AMI from normal versioned source/templates; do not embed a
  large bootstrap program in a string literal.
- [ ] Pin the OS base, direct dependencies, toolchains, Box Agent, and policy
  release; generate an SBOM and sign/digest the output.
- [ ] Implement signed identity enrollment and short-lived credential rotation.
- [ ] Implement workspace-volume discovery/mount by UUID, generation checks,
  clean/unclean markers, quiesce, sync, unmount, and recovery gating.
- [ ] Implement the proven trusted/untrusted boundary and hard ceilings.
- [ ] Implement runtime health/capability/release reporting and a content-free
  `doctor` artifact.
- [ ] Implement systemd supervision, bounded workload leases, full process-tree
  cleanup, and automatic outbound gateway connection.
- [ ] Define canary, promotion, rollback-by-new-generation, and unsupported
  release behavior. Never mutate every runtime blindly in place.

Gate 3: a newly launched and a stop/started runtime attest the exact release,
mount the correct generation, survive the hostile suite, enforce leases, and
recover services without manual access. A bad release is prevented from wider
promotion.

### Phase 4 — Gateway and runtime data plane

- [ ] Implement the authenticated outbound session and typed multiplexed
  channels in production services.
- [ ] Bind every connection and operation to runtime generation, device/grant,
  credential epoch, and bounded ticket.
- [ ] Connect production terminal, files/events, chat/provider protocol,
  commands, approvals, queueing, steering, and preview flows.
- [ ] Implement backpressure, cancellation, replay/resume boundaries,
  per-channel ceilings, rate limits, idle detection, and content-free metrics.
- [ ] Implement immediate gateway suspension and credential/grant revocation.
- [ ] Prove no direct EC2 port or provider token is necessary for ordinary or
  mobile clients.

Gate 4: deterministic end-to-end tests traverse the production
Electron/main/preload/renderer/HTTP/store/gateway/runtime paths and a live AWS
runtime. They cover streamed output, queueing during a run, steering,
completion/cancellation/failure, queued-work promotion/preservation,
approvals, reload/restart, terminal, preview, and revocation.

### Phase 5 — Durable control plane and authority

- [ ] Add Go-owned database/domain contracts for user, subscription, runtime,
  generation, operation, device, grant, usage, budget, backup, and deletion.
- [ ] Implement `ensureRuntime` as one durable idempotent workflow with leases,
  fencing, atomic active-generation assignment, and ambiguous-result recovery.
- [ ] Implement start/wake, idle stop, suspension, cutoff escalation,
  replacement, export, restore, and deletion workflows.
- [ ] Implement push-based typed progress/event delivery and restart-safe
  resume. Timer deadlines are durable; state is not held only in one process.
- [ ] Integrate Clerk authentication and Setta entitlement without provisioning
  merely on identity-provider webhook receipt.
- [ ] Integrate conservative accounting, budget reserve, usage reconciliation,
  and content-free audit.
- [ ] Generate TypeScript from the HTTP endpoint registry after every owning
  contract change; never edit generated output manually.

Gate 5: concurrent ensures create one binding; process restarts at every
operation boundary converge; stale workers cannot mutate a newer generation;
revocation/cutoff are timely; no provider or identity webhook can create an
unentitled paid runtime.

### Phase 6 — Automatic desktop and phone experience

- [ ] Implement the user-visible state contract and immediate cached workspace
  shell.
- [ ] Automatically prepare/wake on meaningful workspace access or submitted
  work, with durable exactly-once queueing.
- [ ] Keep composer, navigation, cached transcript/layout, cancellation, and
  safe actions usable while preparing/waking.
- [ ] Use one local/cloud interaction vocabulary; no AWS/runtime picker,
  machine controls, or provider settings in ordinary UI.
- [ ] Implement honest high-level progress, actionable `Needs attention`, and
  expandable support ID without fake percentages.
- [ ] Preserve drafts, queues, transcript, layout, and approvals over app
  restart, control-plane restart, runtime restart, offline periods, and mobile
  network changes.
- [ ] Implement notifications for completion, response, and approval required,
  carrying IDs rather than sensitive content.
- [ ] Verify very large transcripts/pane graphs remain responsive and record
  before/after evidence under `docs/reports/performance/` for relevant changes.

Gate 6: the six user journeys pass without infrastructure configuration, first
and returning interactions meet the measured targets, duplicate clicks do not
duplicate work/resources, and accessibility/keyboard/mobile behavior is
reviewed through the real product paths.

### Phase 7 — Durability, recovery, fleet safety, and operations

- [ ] Schedule and verify quiesced snapshots plus encrypted off-provider
  exports with explicit retention and RPO/RTO.
- [ ] Run restore drills into new inactive generations and atomic activation
  drills with fencing/credential rotation.
- [ ] Add fleet inventory, orphan expiry, stuck-operation detection, capacity
  circuit, new-placement circuit, cost anomaly alerts, and content-free SLOs.
- [ ] Add safe rollout/canary/rollback, AMI retirement, version compatibility,
  and forced security-update procedures.
- [ ] Add operator runbooks for AWS outage, AZ capacity, gateway outage,
  control-plane/database restore, compromised runtime, KMS denial, cost spike,
  stuck stop/terminate, orphan cleanup, export, deletion, and provider exit.
- [ ] Qualify at least one backup provider with the common contract before
  claiming placement resilience. Existing-state failover remains explicit.
- [ ] Prove deletion and backup-expiry absence across EC2, EBS, snapshots,
  object storage, database authority, gateway grants, and logs.

Gate 7: scheduled chaos/restore/deletion drills pass, every resource has an
owner/expiry/cost record, stale generations are fenced, a region/provider
placement circuit is safe for new runtimes, and operators can recover without
ad hoc AWS console invention.

### Phase 8 — Bounded private beta

- [ ] Define cohort size, geographies, repository/workload exclusions, support
  hours, incident owner, spend cap, retention, and rollback criteria.
- [ ] Start with internal/dogfood users, then a tiny invited cohort; increase
  only after a written gate review.
- [ ] Monitor UX latency, readiness failure, disconnect/reconnect, run
  completion, approval, data integrity, backup freshness/restore, cutoff lag,
  provider/shared cost, support load, and AWS incidents.
- [ ] Review every `Needs attention`, forced cutoff, restore, orphan, and cost
  anomaly; classify systemic versus user-specific cause.
- [ ] Reconcile settled AWS bills against Setta evidence before each expansion.
- [ ] Decide continue, hold, redesign, or provider switch from measured evidence.

Gate 8: the beta operates within the accepted reliability, latency, security,
durability, support, and cost envelope for the declared observation period.
Expansion is a new decision, not an automatic consequence of time.

## Test strategy: behavior and invariants, not tautologies

Tests should make an independently observable claim about Setta behavior. Do
not add tests that merely restate a constant, make a fake return the value the
assertion expects, rerun a generator and compare its own output, or verify a
mock call without proving the resulting state.

### 1. Pure/state-machine tests

- exhaustive lifecycle transitions reject impossible combinations;
- property/concurrency tests interleave ensure, start, stop, suspend, delete,
  restore, stale lease, worker crash, and duplicate delivery;
- restart tests persist at each operation boundary and prove convergence with
  no duplicate instance/volume or double queue promotion;
- accounting tests cover time-window boundaries, missing rates, CPU credits,
  storage growth, reporting lag, integer rounding/overflow, reserve, and exact
  cutoff boundary;
- generation/fencing tests prove an old runtime cannot publish events, renew a
  lease, accept a ticket, or become active after replacement.

The oracle is the Setta invariant and durable state, not internal call order.

### 2. Production-shaped AWS protocol tests

Run the production AWS adapter against a deterministic local HTTP implementation
of the AWS operations it uses, selected through the SDK's normal endpoint
configuration. Inject signed/typed success and failure responses, network
timeouts after accepted mutations, eventual `NotFound`, throttling/retry hints,
pagination, stale observations, partial resource creation, mismatched client
token parameters, and corrupted/missing fields.

Assertions inspect durable operations, ownership inventory, final provider
resources, active generation, and cleanup. Unit tests that only assert “the SDK
method was called” are insufficient.

### 3. Real disposable AWS tests

The authorized live suite uses the same compiled adapter/runtime/gateway as
production with temporary Setta data. It proves:

- create ambiguity does not duplicate instances or volumes;
- boot identity changes and RAM/processes disappear on stop/start while
  workspace hashes persist;
- trusted services restart exactly as designed;
- no inbound port exists and the outbound gateway survives address changes;
- force stop and terminate-retain-data meet cutoff and trigger safe recovery;
- snapshots restore to a new inactive generation and cleanup reaches empty
  tagged inventory;
- adverse capacity, KMS, volume, disk, network, and billing behaviors are
  recorded, not skipped;
- final billing is reconciled after provider reporting settles.

Every live test has a maximum spend, wall-clock deadline, deterministic prefix,
expiry tags, trap/finalizer cleanup, and a separately runnable cleanup command.
Cleanup failure is a failed test.

### 4. Adversarial runtime/security tests

Treat repository code, package install hooks, build scripts, agent commands,
and user-requested root as hostile. Attempt metadata/credential theft, namespace
escape, agent tampering, cgroup escape, mount/control-socket access, network
bypass, DNS/DoH bypass, private-network access, SMTP, fork/memory/disk bombs,
huge output, stale connection survival, ticket replay, header spoofing, and
cross-generation access.

The test succeeds only when the forbidden action is blocked at the enforcing
boundary and legitimate representative development still works.

### 5. Deterministic application workflow tests

For changes touching chat, provider protocol, run lifecycle, gateway,
streaming, queues, steering, approvals, IPC/preload contracts, generated
contracts, renderer state, or transcripts, run deterministic end-to-end tests
through production Electron/main/preload/renderer/HTTP/store paths with
temporary app data and a scripted provider/runtime harness.

Cover at minimum:

- open workspace, first prepare, immediate submit, one queued promotion;
- ready reconnect and stopped wake;
- streamed response, terminal interaction, and preview;
- queue during active run, steer, approve, cancel, fail, retry, and completion;
- app/control-plane/runtime restart at every meaningful state;
- offline submit/reconnect, phone network transition, credential refresh, and
  revocation;
- duplicate events/clicks, stale generation, suspension, hard cutoff, backup,
  restore, export, and deletion when touched.

HTTP-only, component-only, store-only, service-only, and unit-only coverage does
not satisfy this gate.

### 6. Live Codex and performance tests

When the local Codex CLI is signed in with ChatGPT auth, run the live Codex E2E
suite for affected chat/provider/run/streaming behavior. Do not set or use
`OPENAI_API_KEY`. If ChatGPT auth is unavailable, record the narrow skip and do
not call it provider-integration evidence.

For performance-relevant frontend work, baseline before changing it, measure
the same scenario after, and append results under `docs/reports/performance/`.
Include large transcripts, pane graphs, streamed output, reconnection bursts,
and mobile-sized rendering. Profile deeper when automated thresholds regress.

### 7. Human experience and operational drills

Script the six user journeys with first-time users who receive no AWS
explanation. Count clicks, typing, blocked time, retries, and support questions.
Separately run operator incident drills from the written runbooks. Human review
does not replace deterministic gates; it catches confusing but technically
valid behavior.

## Commit and collaboration protocol

### Frequent coherent commits

- Commit the accepted plan before implementation.
- Commit after each narrow, working behavior and its tests; prefer one owner or
  boundary per commit.
- Keep contract/domain, AWS adapter, AMI/runtime, gateway, control-plane, UI,
  generated outputs, and operational documentation separate when they can be
  verified independently.
- Include generated outputs with their owner change after regeneration; never
  hand-edit them.
- Never commit intentionally failing intermediate work, credentials, live
  evidence containing secrets/content, or unrelated dirty-worktree changes.
- Record the commit hash in the append-only progress/gate entry. Small commits
  must be independently reviewable and safe to revert or port.
- Tests proving a behavior land with that behavior. A follow-up test-only commit
  is acceptable only when it closes a recorded gap and can fail against the
  prior behavior for the stated reason.

Before each source-code commit, obey `AGENTS.md`: regenerate affected outputs,
use `./scripts/go.sh` for Go commands, run `./scripts/format.sh`, then
`./check_quality.sh --git-changes` unless the change requires the broader gate.
Run `./scripts/check_supply_chain.sh` before dependency/toolchain/supply-chain
commits and for broad/release-like commits. Documentation-only commits require
diff inspection and only directly relevant checks.

### Mindful subagent use

Use subagents only for concrete, bounded, non-overlapping work that can proceed
independently.

- Use medium effort for simpler reconnaissance, documentation inventory,
  mechanical test-matrix review, or isolated implementation with a crisp
  contract.
- Use high effort for security boundaries, credentials/attestation, lifecycle
  concurrency/fencing, destructive cleanup, backup integrity, cost cutoff,
  architectural decisions, and ambiguous incident analysis.
- Do not default every task to high. Match effort to consequence and
  uncertainty.
- Run no more than two subagents concurrently and keep delegation depth at one.
- Give each agent one file area or question, explicit non-goals, evidence
  requirements, and a no-overlap rule.
- The lead reviews commands, sources, tests, diffs, and conclusions. A subagent
  opinion is never itself a gate.
- Record model/effort when the harness exposes it; otherwise state that the
  inherited configuration could not be independently verified.

### Claude independent review

After a phase passes its own gates and before final broad checks, request a
read-only second opinion with exactly:

```sh
claude -p --model claude-fable-5 --effort high --permission-mode plan
```

First verify the installed CLI exposes these flags and the result identifies
the requested model. Do not substitute another Claude model silently. Ask
Claude to inspect the plan, evidence, implementation diff, tests, failure
handling, security, operability, and unresolved risks. Retain its structured
output or an append-only review report, classify each finding as accepted,
rejected with evidence, deferred with owner/date, or blocking, and address
valid findings with narrow checks before the final broad gates. Claude is an
advisory second opinion; the Setta lead owns the decision.

For this plan's initial review, Claude must first produce its AWS plan
independently from the source plans without reading this plan. Only then should
the lead compare the two plans, integrate stronger elements, and append the
comparison outcome below.

## Final verification before push

Run narrow tests continuously and phase gates before review. Once the relevant
implementation phase gates pass and Claude findings are resolved:

1. regenerate every affected output from its Go-owned source;
2. run `./scripts/format.sh`;
3. run the required live AWS cleanup/absence check and retain evidence;
4. run affected deterministic production-path Electron E2E tests;
5. run the live Codex E2E suite when ChatGPT CLI auth is available, or record
   the justified narrow skip;
6. run `./scripts/check_supply_chain.sh` for the broad implementation;
7. run `./check_quality.sh --all` for the broad implementation;
8. stage the exact intended commit and run `./check_quality.sh --staged` if the
   staged boundary needs separate proof;
9. inspect `git status`, staged diff, generated ownership, evidence redaction,
   and commit history; verify no disposable AWS resource remains;
10. append the exact commands/results/commit to the final gate log.

If any edit follows a check, rerun the narrow affected check and every final
gate invalidated by that edit. Push only committed, reviewed work after the
final gate is clean. Do not run a broad gate repeatedly while known narrow
failures remain.

## Append-only execution records

Append new entries; never rewrite a prior result to look successful. A
correction is a new dated entry that references the superseded entry. Store
large raw artifacts under a deterministic report directory and link them.
Never commit credentials or user content.

### Progress log

```text
## YYYY-MM-DD HH:MM TZ — Phase / slice

- Owner:
- Branch and starting commit:
- Scope and non-goals:
- Files/components changed:
- Commands/tests and results:
- Evidence/report links:
- Commit(s):
- Remaining risks/blockers:
- Next smallest step:
```

### Decision log

```text
## ADR-AWS-NNN — Title

- Date / owner:
- Status: proposed | accepted | superseded
- Context and evidence:
- Options considered:
- Decision:
- Consequences and cost:
- Reversal trigger:
- Supersedes / superseded by:
```

### Gate log

```text
## YYYY-MM-DD — Gate X result

- Result: pass | fail | blocked
- Acceptance criteria:
- Test/evidence artifact:
- Sample/region/release/shape:
- Failures and disposition:
- AWS resources created:
- Cleanup/absence proof:
- Spend and billing-settlement status:
- Reviewed by:
- Commit:
```

### Risk and incident log

```text
## RISK-AWS-NNN — Title

- First observed / last reviewed:
- Trigger and affected invariant:
- Likelihood / impact:
- Evidence:
- Mitigation and owner/date:
- Stop condition?:
- Status / superseding entry:
```

### Resource and cost ledger

Every live experiment report records authorization, AWS account alias/ID as
allowed by redaction policy, Region/AZ, deterministic experiment ID, resource
IDs/tags/types/sizes, create/expiry/delete time, price-card version, maximum
spend, measured usage, first-visible bill, final-settled bill, cleanup command,
and empty-inventory proof. Use JSON/JSONL artifacts plus a reviewed Markdown
summary; do not rely on a prose estimate alone.

### Plan review comparison

The independent review is preserved in
`docs/reports/2026-07-15-aws-ec2-ebs-independent-plan-review.md`.

- Baseline Setta plan commit: `742396c9b`
- Claude command/model verification: Claude Code 2.1.208 accepted
  `--model claude-fable-5 --effort high --permission-mode plan`; the structured
  session metadata identified `claude-fable-5` and internal supporting models.
- Claude independent output: completed on the same read-only session after one
  bounded recovery request; it stated that it did not read this baseline.
- Stronger Claude elements accepted: exactly six lifecycle states; layered mTLS
  runtime identity and user authorization; unauthenticated preview cannot wake;
  private-subnet/shared-egress candidate; explicit egress residuals; and the
  no-SSM diagnostic tradeoff.
- Setta elements retained over Claude: hidden x86 2-vCPU/4-GiB starting policy
  rather than ARM 2-GiB; measured rather than unverified cost figures; outbound
  agent rather than requiring direct gateway reachability; three topology
  candidates rather than prematurely selecting a custom egress fleet; separate
  system/workspace EBS volumes; and capability-oriented provider refactoring
  rather than forcing EC2 through the Sprite-era interface unchanged.
- Blocking findings: none in the plan itself. Live topology, isolation,
  cutoff, restore, pricing, and wake-latency gates remain intentionally open.
- Integrated plan commit: recorded by the follow-up append-only entry after
  this integration commit exists.

## Stop conditions

Stop the AWS path and return to provider/architecture selection if any remains
true after a bounded remediation attempt:

- untrusted code can reach Setta/AWS credentials, host control, another user,
  or the enforcement plane;
- hard suspension cannot revoke gateway access within 5 seconds or stop paid
  compute within 60 seconds;
- ordinary stop/start or forced-cutoff recovery can silently lose/corrupt
  retained workspace state;
- no tested off-provider backup and inactive restore can meet the accepted
  beta RPO/RTO;
- p95 stopped wake exceeds 90 seconds in normal supported conditions after
  image/bootstrap optimization;
- median/p95 full provider and shared-platform cost cannot fit the approved
  cap with reporting-lag reserve;
- AWS quotas/capacity, API behavior, support, or incident history makes the
  promised cohort unreliable;
- gateway/data-plane latency or cost requires per-user public infrastructure
  that breaks the envelope;
- cleanup cannot prove absence of instances, volumes, snapshots, addresses,
  grants, or backups;
- operating the system safely requires routine manual AWS console work.

## Initial references

Repository evidence:

- `docs/plans/setta-cloud-platform-sprites-plan.md`
- `docs/plans/cloud-runtime-resilience-side-plan.md`
- `docs/plans/cloud-runtime-contingency-probes.md`
- `docs/reports/2026-07-14-cloud-runtime-provider-options.md`
- `docs/reports/2026-07-14-sprites-phase1c-offline-baseline.md`
- `docs/plans/byo-cloud-one-click-runtime-plan.md`
- `docs/plans/remote-runtime-plan.md`
- `docs/plans/setta-v3-architecture-recommendations.md`

AWS behavior to revalidate at each live gate:

- [EC2 instance lifecycle and billing](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html)
- [StopInstances API, force, and skip-OS-shutdown behavior](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_StopInstances.html)
- [Terminate instances and volume deletion behavior](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/terminating-instances.html)
- [EC2 API idempotency](https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-idempotency.html)
- [EC2 API eventual consistency](https://docs.aws.amazon.com/ec2/latest/devguide/eventual-consistency.html)
- [EC2 instance identity document verification](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/verify-iid.html)
- [IMDS configuration and precedence](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-options.html)
- [EC2 public/private address lifecycle](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html)
- [Security-group rule behavior](https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html)
- [EBS volume creation, encryption, and AZ attachment](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-creating-volume.html)
- [Restore an EBS volume from a snapshot](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-restoring-volume.html)
- [EC2 On-Demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- [EBS pricing](https://aws.amazon.com/ebs/pricing/)
- [VPC and public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
