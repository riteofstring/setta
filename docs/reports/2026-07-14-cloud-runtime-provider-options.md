# Cloud Runtime Provider Options

Date: 2026-07-14
Status: Reference for future viability testing; no provider decision changed

## Purpose

Preserve the provider comparison made after the Sprites Phase 1b cold-status
discrepancy. This is a testing shortlist, not a procurement decision or a claim
that marketing documentation proves production reliability.

Setta needs more than remote command execution. The target is one durable Linux
development environment per user with strong workload isolation, persistent
files, bounded background-agent execution, authenticated previews, controllable
sleep/wake behavior, checkpoints or recoverable storage, enforceable egress,
and costs that can fit a provisional provider budget of about $25 per beta user
per month.

Prices and product surfaces change quickly. Revalidate every value immediately
before a live probe or provider decision.

## Shortlist

| Provider | Match to Setta | Idle/persistence model | Reliability and maturity signal | Cost position | Future-test priority |
| --- | --- | --- | --- | --- | --- |
| AWS EC2 + EBS | A full persistent Linux VM, but Setta must build the sandbox control plane, wake routing, previews, supervision, and policy layer | Explicit stop/start; EBS root and data volumes persist; stopped compute is not billed | Strongest infrastructure reputation in this set; mature APIs, SOC reports, and published EC2 SLA. A single instance still needs replacement and backup design | Shape, region, EBS, IP, network, and support dependent; plausibly within the beta cap when stopped while idle, but must be calculated | **P0 reliability baseline** |
| E2B | Closest turnkey agent-sandbox alternative; VM, command/filesystem APIs, secure access, network policy, URLs, and explicit pause/resume | Pause preserves filesystem and memory indefinitely; paused compute billing stops | Established specialist with real production users, but its official status history shows several recent create/resume, volume, API, and regional incidents | About $0.0666 per active hour for normalized 1 vCPU + 1 GiB; Hobby $0 base, Pro $150/month plus usage | **P0 turnkey candidate** |
| Fly Machines + Volume | Mature lower-level VM primitive with explicit start, stop, suspend, forced cold boot, API lifecycle, routing, and persistent attached volume | Stop discards memory; suspend attempts to preserve it; attached volumes persist; stopped CPU/RAM billing stops | More mature than Sprites and powers Fly applications, but it retains correlated Fly vendor/control-plane risk | Generally low scale-to-zero compute; stopped rootfs and volumes remain billable. Reprice exact VM and volume shape | **P1 same-vendor contingency** |
| Modal Sandboxes + Volume | Strong arbitrary-code compute, Go support, authenticated endpoints, volumes, and filesystem/directory snapshots; not naturally one indefinitely retained computer | Durable state lives in Volume or snapshots; Sandbox snapshots terminate the source today; processes are expected to restart | Established compute platform, SOC 2 Type II, public status history, and documented feature-maturity levels; recent platform incidents still exist | Roughly $0.095 per active hour for normalized 1 vCPU + 1 GiB before storage and other services | **P1 architectural alternative** |
| Daytona VM Sandboxes | Very close feature match: microVM isolation, Go SDK, explicit pause/resume, stop/start, snapshots, previews, firewall, and secret gateway | VM pause preserves memory; VM stop clears memory and preserves/offloads filesystem; stopped CPU/RAM is released | Platform status advertises high recent uptime, but the relevant microVM pause/fork product was announced on 2026-07-10 and lacks a long operating record | About $0.0666 per active hour for 1 vCPU + 1 GiB, plus storage after allowances | **Watch; probe after maturity evidence** |
| Runloop Devboxes | Purpose-built for long-running coding agents, persistent devboxes, snapshots, suspend/resume, egress policy, credential gateway, and microVM isolation | Suspended devboxes stop CPU/RAM billing; persistent storage remains billed | SOC 2 Type II, 24/7 managed-platform positioning, and enterprise support options; public operating history is less extensive than AWS | About $0.1332 per active hour for 1 CPU + 1 GB, plus storage; suspend/resume requires the $250/month Pro plan | **Revisit if budget supports it** |
| Cloudflare Sandbox SDK / Containers | Attractive routing and scale-to-zero economics, but does not currently supply the durable per-user computer Setta needs | Container disk is erased on sleep; persistent snapshots are described as forthcoming; external object storage changes filesystem semantics | Cloudflare has a strong infrastructure reputation, but Containers/Sandbox SDK are young and their feature surface has changed recently | Low usage pricing with a $5 Workers Paid base, but persistence must be built separately | **Exclude until durable disk is GA** |

## Normalized public pricing snapshot

These figures normalize public usage rates for comparison. They are not quotes
and are not fully apples-to-apples: Sprites meters observed usage with minima,
some competitors bill provisioned resources, Modal prices physical cores, and
AWS/Fly sell named shapes plus separate networking and storage.

| Provider | Public active compute used for comparison | Approximate normalized active rate | Idle retained cost notes |
| --- | --- | ---: | --- |
| Fly Sprites | $0.07/CPU-hour + $0.04375/GB-hour | $0.11375/hour at a fully used 1 CPU + 1 GB; documented minimum-use floor was about $0.0153/hour | No compute while idle; storage rates differ by hot/cold tier |
| E2B | $0.000014/vCPU-second + $0.0000045/GiB-second | $0.0666/hour for 1 vCPU + 1 GiB | Paused compute is free; 10 GB Hobby or 20 GB Pro disk included |
| Daytona | $0.000014/vCPU-second + $0.0000045/GiB-second | $0.0666/hour for 1 vCPU + 1 GiB | Stopped/paused CPU and memory released; storage is separately metered after allowances |
| Modal | $0.00003942/physical-core-second + $0.00000667/GiB-second | About $0.095/hour for 0.5 physical core (roughly 1 vCPU) + 1 GiB | Durable Volume and snapshot charges are separate; no equivalent indefinite paused Sandbox |
| Runloop | $0.108/CPU-hour + $0.0252/GB-hour | $0.1332/hour for 1 CPU + 1 GB | Devbox storage about $0.25/GB-month; suspend/resume on Pro |
| AWS EC2 + EBS | Named instance and regional pricing | Use the AWS calculator for the selected x86/ARM shape and region | Stopped instance compute is free; EBS, snapshots, public IP, network, and support can continue billing |
| Fly Machines | Named VM, regional, rootfs, and volume pricing | Reprice the selected shared/dedicated shape | Stopped/suspended CPU and RAM are free; rootfs and volumes remain billed |

## Current recommendation

If Sprites fails viability, test two different risk profiles rather than moving
directly to another young sandbox product:

1. **AWS EC2 + EBS** is the reliability-first control. It proves what Setta
   costs and looks like on mature, deterministic infrastructure. It requires
   more Setta-owned orchestration, but lifecycle semantics are explicit and
   recovery patterns are well understood.
2. **E2B** is the turnkey comparison. Its API and pricing are close to the
   desired product, and explicit pause/resume removes the exact ambiguity found
   in Sprites. Its recent incident history means the live reliability gates
   remain mandatory.

Fly Machines is the fastest same-vendor fallback and should remain a P1 probe,
especially because `stop -> start` provides a documented forced cold boot. It
does not diversify provider risk. Modal is credible if Setta accepts a more
stateless runner plus durable-volume architecture. Daytona should not be chosen
for a reliability-led beta until its new VM lifecycle has accumulated operating
history. Runloop is a feature match but currently misses the similar-price
constraint at small beta scale.

## Provider replacement and outage policy

Setta should preserve provider choice without pretending that a stateful
computer can fail over like a stateless HTTP request.

- Keep lifecycle and accounting contracts provider-neutral. Provider SDK
  types, rate cards, credentials, status strings, and error details stay inside
  their adapter boundary. Usage observation is optional because lifecycle
  support does not imply a billing API.
- Bind each runtime to exactly one provider, provider resource, and generation
  at a time. Retrying create/restore must be idempotent within that binding.
- A provider health circuit may stop new placements and select a previously
  qualified backup for **new** runtimes. Do not retry one create across two
  providers concurrently; that risks duplicate computers and charges.
- Do not automatically move an existing runtime during a transient outage.
  Its freshest filesystem may exist only at the unavailable provider, and an
  automatic restore of an older copy can silently fork or lose work.
- Existing-runtime recovery requires a verified off-provider export or backup,
  an explicit new generation, restore attestation, credential-epoch rotation,
  and one atomic control-plane binding switch. The old generation remains
  fenced if it later returns. No dual-read, dual-write, or compatibility shim.
- User data and product authority must not depend solely on provider-local
  memory, tokens, status, or checkpoint metadata. The backup format and restore
  test are provider-exit gates, not optional disaster-recovery polish.
- Automatic fallback is enabled only after the backup candidate independently
  passes the common lifecycle, isolation, cutoff, durability, cost, and
  reliability matrix below. Price similarity alone is insufficient.

This supports removing Sprites later or routing new users around an outage
without leaking Fly-specific assumptions into core logic. Seamless recovery of
an already-running stateful workspace remains impossible until Setta has a
tested off-provider backup and fencing protocol.

The offline implementation and follow-on execution packages are tracked in:

- `docs/plans/cloud-runtime-resilience-side-plan.md`
- `docs/plans/phase1c-live-measurement-runbook.md`
- `docs/plans/fly-sprites-support-inquiry.md`
- `docs/plans/cloud-runtime-contingency-probes.md`

## Required test matrix for every candidate

No provider advances because of this table alone. Run the following gates
through its real production API and data path:

| Gate | Required evidence |
| --- | --- |
| Lifecycle determinism | Explicit start, stop, suspend/pause if offered, forced memory-loss restart, stable state/epoch signals, bounded transition times, and idempotent cleanup |
| Filesystem durability | Same-instance persistence, stopped/cold persistence, crash recovery, snapshot/restore consistency, storage exhaustion behavior, and off-provider export |
| Service recovery | Supervisor starts on boot, survives or restarts as documented, reports health, and recovers after host replacement and forced cold boot |
| Disconnected agent work | Work continues only under an explicit renewable lease/hold and expires safely after supervisor loss |
| Hard cost cutoff | Setta can stop further compute within the recorded deadline despite hostile processes, open terminals, connections, services, or output loops |
| Isolation | Ordinary and root-capable workloads cannot reach provider credentials, control sockets, trusted supervisor state, neighboring tenants, or host resources |
| Network policy | Enforced external egress policy blocks raw IP, alternate DNS, DNS-over-HTTPS, SMTP, private networks, pre-existing connections, and raw sockets while allowing required development traffic |
| Secret handling | Provider credentials never enter the workload; model and Git credentials use scoped, revocable injection or a trusted proxy |
| Preview and gateway | Authenticated, origin-isolated preview routing; known wake behavior; no provider token reaches clients; reconnect behavior is measured |
| Capacity and placement | Creation limits, concurrency, rate limits, region placement, wake latency, noisy-neighbor behavior, disk pressure, and quota escalation path |
| Usage and billing | Authoritative per-resource observations, reporting lag, retained-idle cost, attached-idle cost, active-agent cost, bandwidth, support, and enforceable budgets |
| Reliability history | Public incident history, status component coverage, SLA scope, support response path, data-loss terms, backup obligations, and at least a multi-day Setta soak |
| Contract/API maturity | Pinned SDK or schema, stable lifecycle fields, pagination, typed errors, retry metadata, webhook/event support, and no dependence on undocumented endpoints |
| Cleanup and recovery | Orphan reconciliation, token loss, control-plane restart, provider outage, stuck transition, deletion verification, and empty-account proof |

## Source references

### Fly Sprites

- [Sprites product and pricing](https://sprites.dev/)
- [Lifecycle and persistence](https://docs.sprites.dev/concepts/lifecycle/)
- [Keeping a Sprite running](https://docs.sprites.dev/keeping-sprites-running/)
- [Sprites API](https://docs.sprites.dev/api/dev-latest/)

### AWS

- [EC2 instance lifecycle and stopped-instance billing](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html)
- [EC2 stop/start and EBS persistence](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/Stop_Start.html)
- [EC2 On-Demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- [EBS pricing](https://aws.amazon.com/ebs/pricing/)
- [Amazon Compute SLA](https://aws.amazon.com/compute/sla/)
- [AWS SOC reports](https://aws.amazon.com/compliance/soc-faqs/)

### E2B

- [Sandbox persistence and explicit pause/resume](https://e2b.dev/docs/sandbox/persistence)
- [Pricing](https://e2b.dev/pricing)
- [Billing and limits](https://e2b.dev/docs/billing)
- [Secure sandbox access](https://e2b.dev/docs/sandbox/secured-access)
- [Official incident history](https://status.e2b.dev/history)

### Fly Machines

- [Fly Machines overview](https://fly.io/docs/machines/)
- [Machine stop, suspend, and start API](https://fly.io/docs/machines/api/machines-resource/)
- [Suspend/resume and forced cold start](https://fly.io/docs/reference/suspend-resume/)
- [Machine and volume billing](https://fly.io/docs/about/billing/)
- [Fly Enterprise SLA](https://fly.io/legal/sla-uptime/)

### Modal

- [Modal Sandboxes and public pricing](https://modal.com/products/sandboxes)
- [Sandbox resources and billing](https://modal.com/docs/guide/sandbox-resources)
- [Sandbox snapshots and limitations](https://modal.com/docs/guide/sandbox-snapshots)
- [Security, isolation, and SOC 2](https://modal.com/docs/guide/security)
- [Feature maturity](https://modal.com/docs/guide/feature-maturity)
- [Official incident history](https://status.modal.com/incidents)

### Daytona

- [Pricing](https://www.daytona.io/pricing)
- [Sandbox lifecycle, stop, pause, and archive](https://www.daytona.io/docs/en/sandboxes/)
- [VM pause/fork announcement](https://www.daytona.io/dotfiles/vms-pause-and-fork)
- [Network policy](https://www.daytona.io/docs/en/network-limits/)
- [Go SDK](https://www.daytona.io/docs/en/go-sdk/)
- [Official status](https://status.app.daytona.io/)

### Runloop

- [Pricing](https://runloop.ai/pricing)
- [Security and compliance](https://runloop.ai/security-compliance)
- [Official status](https://status.runloop.ai/)

### Cloudflare

- [Containers pricing](https://developers.cloudflare.com/containers/pricing/)
- [Containers disk persistence limitation](https://developers.cloudflare.com/containers/faq/)
- [Sandbox lifecycle](https://developers.cloudflare.com/sandbox/concepts/sandboxes/)
- [Sandbox SDK platform](https://developers.cloudflare.com/sandbox/platform/)
