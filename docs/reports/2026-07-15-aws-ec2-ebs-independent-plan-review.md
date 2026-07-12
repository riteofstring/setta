# AWS EC2 + EBS Independent Plan Review

Date: 2026-07-15
Status: Complete; accepted findings integrated into the AWS plan
Baseline plan commit: `742396c9b`
Integrated plan commit: `210ab095b`

## Review method

The Setta lead first analyzed the existing cloud plans, provider-neutral code,
and current AWS documentation, then committed an independent 1,177-line
baseline at `742396c9b`. Only after that fixed reference existed was Claude
asked to perform the same planning task independently.

Claude Code 2.1.208 exposed the required `--model`, `--effort`, and
`--permission-mode` flags. The session was started read-only with:

```sh
claude -p --model claude-fable-5 --effort high --permission-mode plan
```

The prompt named the source plans and explicitly prohibited reading
`docs/plans/setta-cloud-platform-aws-ec2-ebs-plan.md`, editing files, or making
live AWS mutations. It requested a complete UX-first AWS plan, architecture,
phases, gates, tests, logs, collaboration policy, stop conditions, and five
highest-risk assumptions.

The initial structured invocation spent 728 seconds in a tool-use loop and was
boundedly interrupted. It returned no plan, but its metadata identified the
requested `claude-fable-5` session (with internal supporting model usage), 24
turns, no permission denial, and no web requests. A single recovery prompt on
the same session forbade further tools and requested the already-developed
plan. It completed successfully in 181 seconds and stated that it had not read
the Setta baseline. The recovery response's per-request metadata named an
internal supporting model; the original session metadata is the evidence that
the requested Fable 5 orchestration was used. No substitute model was selected
by the lead.

The full structured response remains in the task execution record. This report
preserves the review method, distinct conclusions, and finding disposition
without duplicating a second thousand-line plan in the repository.

## Independent result

Claude independently converged on the principal product and architecture:

- EC2/EBS is entirely hidden; ordinary use is sign in, open, and type.
- Provisioning/wake is automatic and push-driven; no provider, size, Region,
  credential, endpoint, start, or stop UI exists.
- Setta owns the AWS relationship, identity, lifecycle, budget, suspension,
  backups, and deletion.
- Instance memory/processes are disposable; durable user state lives on
  encrypted EBS and an off-provider backup.
- Instances have no IAM role by default; runtime identity is short-lived and
  generation/epoch-bound.
- The trusted agent and hostile workspace need a proven namespace/cgroup/
  network boundary, with IMDS and trusted state inaccessible.
- User access and previews traverse an authenticated gateway; no client holds
  AWS credentials or needs a stable instance address.
- Stop/start, hostile cutoff, snapshot/restore, isolation, egress, billing,
  wake latency, and cleanup must pass live disposable-account gates before
  product adapter work.
- Existing-state provider recovery is explicit restore plus fencing and an
  atomic generation switch, never dual-write or transparent failover.
- Tests must assert durable state and user-visible outcomes through production
  paths, not mock call counts or generator drift.

That convergence materially increases confidence in the baseline direction.

## Comparison and dispositions

| Topic | Stronger plan / disposition | Reason |
| --- | --- | --- |
| User lifecycle vocabulary | Claude; accepted | It adhered exactly to the six high-level managed-cloud states. Background work and deletion remain task/flow states rather than new runtime states. |
| Immediate input while waking | Setta; retained | The baseline explicitly makes the shell/composer usable and durably queues exactly once, which better defines the Apple-like latency mask. |
| Runtime/user authentication layering | Claude; accepted | Per-generation mTLS transport identity separated from inner user/device authorization avoids overloading a bearer/header and makes revocation clearer. |
| Preview wake abuse | Claude; accepted | Rejecting unauthenticated traffic before `ensure` structurally prevents public scans from creating paid compute. |
| Network topology | Combined | Claude made the private-subnet/shared-egress case concrete; Setta retained ephemeral IPv4 and IPv6-first candidates so cost, reliability, compatibility, and custom-proxy burden are measured before selection. |
| Egress threat model | Claude; accepted | SNI payload exfiltration, DNS/IP-set timing, shared CDNs, and a shared proxy's trust/availability burden are real residuals that must be tested and accepted explicitly. |
| Default instance architecture | Setta; retained | A hidden x86 2-vCPU/4-GiB starting policy minimizes repository/toolchain incompatibility and memory pressure. Claude's `t4g.small` ARM/2-GiB proposal was not supported by a compatibility measurement. |
| Storage layout | Setta; retained | Separate disposable system and retained workspace volumes make termination cutoff, image replacement, and recovery safer than a single root volume. |
| Provider contract evolution | Setta; retained | The current interface owns Sprite-shaped exec/service/network/checkpoint assumptions. Capability boundaries are safer than claiming EC2 implements it unchanged. No compatibility shim is authorized. |
| Gateway reachability | Setta; retained | An outbound Box Agent works across all candidate egress topologies and avoids requiring the gateway to address every private instance directly. Claude's mTLS layering is retained on that connection. |
| No-instance-role operations | Combined | Both reject a default role. Claude's explicit consequence—no routine SSM—and console/serial/agent diagnostic alternatives were added. |
| Cost estimates | Setta; retained | Claude supplied precise dollar figures without a current authorized price capture. The plan requires immutable rate inputs and measured settled billing instead. |
| Cutoff escalation | Setta; retained | Revoke/fence, graceful stop, force stop, then terminate disposable compute while retaining workspace data is more complete than treating `StopInstances` alone as guaranteed within 60 seconds. |
| Testing and evidence | Combined | Setta's state-machine, full Electron, live AWS, chaos, restore, and human-journey matrix remains; Claude sharpened topology/egress and preview-abuse cases. |
| Commit/subagent/quality policy | Equivalent; combined | Both require coherent behavior-plus-test commits, medium effort for simple bounded work, high for consequential work, append-only evidence, Claude Fable 5 review, and final broad checks after gates. |

## Five first assumptions after integration

1. EC2 stop/start truly loses memory/processes, retains the workspace, and
   restarts the trusted service within the wake target.
2. The exact trusted/untrusted boundary blocks IMDS, credentials, agent state,
   host control, resource-limit changes, and network bypass while supporting
   representative development.
3. One of the three outbound topologies meets compatibility, reliability,
   enforceable-egress, latency, and full-cost gates without routine manual
   operations.
4. Gateway revocation is within five seconds and the full stop/force/terminate
   escalation removes paid compute within sixty seconds under hostile load
   without silently activating damaged data.
5. First provision, stopped wake, retained storage, snapshots, egress, shared
   platform, support, and billing lag fit the UX and USD $25/user/month envelope
   with a tested off-provider restore.

## Outcome

The integrated Setta plan is stronger than either plan alone. The Setta
baseline was more complete on immediate UX behavior, storage separation,
cutoff escalation, provider-contract design, comprehensive production-path
testing, and evidence gates. Claude improved state-vocabulary discipline,
transport/application identity separation, preview wake-abuse prevention,
network-topology alternatives, egress residuals, and the operational cost of
rejecting instance roles.

No finding makes the written direction unsafe to begin Phase 0. The live AWS
viability phase remains intentionally blocking before adapter/product work.
