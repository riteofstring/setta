# Cloud Runtime Contingency Probe Plans

Date: 2026-07-14
Status: Prepared; AWS and E2B live probes not authorized

## Common contract

AWS EC2+EBS and E2B must be tested with the same repository fixture, workload
sequence, clocks, evidence schema, and failure classifications. Neither
candidate advances on documentation or price alone.

Each run must record:

- authorization, account/project, region, deterministic prefix, API/CLI/SDK and
  image/template versions, start/cleanup deadlines, and a hard spend cap;
- create, inspect, explicit memory-loss stop/start, pause/resume if offered,
  exec, service recovery, snapshot/restore, and idempotent destroy behavior;
- filesystem hashes across lifecycle transitions and an off-provider export;
- whole-runtime CPU, memory, disk, network, and process limits;
- provider credential, metadata, neighboring-tenant, host, and control-socket
  isolation from both ordinary and root-capable workloads;
- egress policy against raw IP, alternate DNS, DNS-over-HTTPS, SMTP, private
  networks, pre-existing connections, and raw sockets;
- authenticated preview/gateway behavior without a provider token in clients;
- attached-idle, bounded disconnected work, cutoff lag, billing visibility,
  settled cost, creation capacity, placement, interactive latency, and public
  incident/SLA/support evidence;
- destructive cleanup, list/absence proof, and final billing observation.

The result directory uses the same names for both providers:

```text
manifest.json
events.jsonl
usage.json
latency.json
security.json
filesystem.json
billing-before.json
billing-first-visible.json
billing-final.json
cleanup.json
report.md
```

Stop immediately on unexpected account resources, missing cleanup authority,
credential exposure, cross-tenant/host access, uncontrolled spend, data loss,
or evidence corruption.

## Probe A: AWS EC2 + EBS reliability control

### Authorization package

- Dedicated disposable AWS account or explicitly isolated sandbox account.
- Region `ca-central-1` for the Toronto control measurement.
- Maximum experiment spend: USD $10; configure an account budget before create.
- One x86 `t3.small` instance, 20 GiB encrypted gp3 root volume, no IAM instance
  role, IMDSv2 required, metadata hop limit one, termination protection off.
- Exact AMI ID and on-demand/EBS/public-address prices recorded immediately
  before execution. Abort if the expected bounded total exceeds $10.
- Deterministic resource tags including owner, experiment ID, expiry, and
  `setta-disposable=true`.

### Execution

1. Create the security group deny-by-default inbound. Permit only the
   authenticated test access path; do not expose SSH broadly.
2. Launch once with an idempotent client token. Reconcile ambiguous create by
   tags/client token before retrying.
3. Install the same signed probe fixture, record boot ID and filesystem hashes,
   and verify no provider credential is present.
4. Stop then start the instance to prove explicit memory loss and EBS
   persistence. Verify the Service restarts in a new boot.
5. Snapshot EBS, mutate the filesystem, restore into a separate inactive
   generation, validate hashes, and keep it inaccessible until verification.
6. Exercise attached idle, workload lease, hostile keepalive, CPU/memory/PID
   cgroups, disk pressure, authenticated preview, reconnect, and cutoff.
7. Repeat the interactive latency workload from the declared beta geographies.
8. Terminate both generations, delete snapshots/volumes/security groups, verify
   tag queries return empty, and retain final billing evidence.

AWS passes only if the explicit stop/start and recovery behavior is
deterministic, the Setta-owned orchestration burden is documented, isolation
holds without instance credentials, and the stopped-retained monthly model can
fit the beta cap including EBS, snapshots, addressing, network, and support.

## Probe B: E2B turnkey comparison

### Authorization package

- Dedicated disposable E2B team/project and scoped test API key.
- Maximum experiment spend: USD $25; configure provider spend limits if
  available and a Setta-side elapsed-time cutoff regardless.
- One pinned custom template with the closest supported x86 1-vCPU/1-GiB shape,
  20 GB or the plan's included disk, and the same signed fixture.
- Exact SDK, template, plan, pause/resume, maximum-duration, disk, network, and
  overage terms recorded immediately before execution.
- Deterministic sandbox metadata including owner, experiment ID, expiry, and
  `setta-disposable=true`.

### Execution

1. Create once with deterministic metadata and reconcile ambiguous outcomes by
   listing exact metadata before retrying.
2. Record sandbox/host epoch evidence, filesystem hashes, resource limits, and
   every provider-visible credential/control surface.
3. Pause and resume to characterize memory preservation and compute billing.
4. Use the documented stop/kill/recreate or equivalent provider-supported path
   to prove memory loss while restoring persistent state; do not relabel pause
   as cold.
5. Snapshot or export, mutate, and restore into a separate inactive generation.
6. Exercise the identical idle, lease, hostile keepalive, cgroup, disk,
   preview, reconnect, cutoff, capacity, and geography workloads used on AWS.
7. Compare Setta counters with per-sandbox usage and billing exports, recording
   first-visible and final-settled lag.
8. Kill every sandbox, delete snapshots/templates created solely for the run,
   revoke the test key, prove list results are empty, and retain final billing.

E2B passes only if pause and forced memory-loss semantics are explicit and
observable, persistent storage survives as documented, network/isolation gates
hold, per-sandbox billing supports the budget, and recent incident risk is
acceptable for the bounded beta support model.

## Decision output

The final comparison must keep three separate conclusions:

1. lifecycle/security viability;
2. measured beta economics and reliability;
3. migration effort from the provider-neutral Setta contracts.

Selecting a provider for new placements does not authorize automatic migration
of an existing stateful runtime. Existing-runtime migration still requires an
authenticated off-provider export, inactive restore, provider fencing,
credential-epoch rotation, attestation, and an atomic active-generation switch.
