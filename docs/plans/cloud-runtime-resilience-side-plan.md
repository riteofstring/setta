# Cloud Runtime Resilience Side Plan

Date: 2026-07-14
Status: Complete locally; live-provider executions remain separately gated
Owner: Setta cloud-platform workstream

## Purpose

Build the provider-neutral foundations that reduce cost and provider-outage
risk while the Sprites confirmed-cold soak owns the live organization. This is
an offline, independently completable side plan. It does not declare Phase 1b
or Phase 1c complete and does not authorize calls against the soak
organization.

The work must remain useful if Sprites is removed. Sprites rate cards and API
details stay behind provider-specific boundaries; usage evidence, cutoff
decisions, export contents, encryption, restore validation, and fencing remain
Setta-owned.

## Safety and sequencing rules

1. Do not issue live workload, URL, exec, Service, pressure, capacity, billing,
   or cleanup calls against the soak organization.
2. Do not send external support messages or create AWS/E2B resources. Produce
   reviewed drafts and executable probe specifications for later authorization.
3. Use push/event-derived accounting. Do not add a polling loop.
4. A Setta cost estimate must distinguish authoritative provider data,
   conservative bounded data, zero, and unavailable dimensions.
5. Keep provider billing floors separate from enforced resource ceilings. A
   conservative bill uses the greater billed quantity while upper-bound cost
   decisions still require an enforced whole-runtime ceiling.
6. Never place plaintext credentials, provider tokens, runtime access grants,
   or encryption keys in an export, manifest, log, fixture, or report.
7. Restore only into a new, inactive runtime generation. The backup package
   must return a staged receipt, not accept a caller-supplied `fenced=true`.
   Actual provider fencing, credential-epoch rotation, and the atomic binding
   switch remain a durable Phase 5 control-plane gate; never add dual-read/write
   or transparent stateful failover.
8. Archive restore must reject traversal, absolute paths, unsafe link targets,
   special files, corruption, truncation, and manifest/content mismatch.
9. Export only a trusted, quiesced prepared snapshot with no
   workload-controlled bind mounts or filesystem mounts. Export and staging
   parents must be private directories that the untrusted workload cannot
   write. The archive package enforces private modes and stable file identity;
   the future Phase 7 snapshot builder owns content selection and mount
   quiescence.
10. Use medium-effort subagents for bounded reconnaissance or mechanical review.
   Use high effort for security-sensitive export/encryption judgment. Subagents
   must not edit overlapping shared files.
11. Run focused tests during implementation. After every side-plan gate passes,
    request an independent read-only review with
    `claude -p --model claude-fable-5 --effort high --permission-mode plan`,
    address valid findings, then run the final repository checks required by
    `AGENTS.md`.

## Deliverable A: trusted accounting and cutoff primitives

- [x] Implement a provider-neutral append-only activity ledger for provider
  active time, attached-idle time, and bounded workload-lease time.
- [x] Make ledger snapshots restart-safe without closing active intervals or
  double-counting time.
- [x] Convert a closed ledger window plus enforced CPU/memory/storage ceilings
  into explicit Setta-conservative usage evidence using integer arithmetic.
- [x] Evaluate a covered micro-USD budget with a safety reserve and a maximum
  cutoff-enforcement lag. Return typed continue/cutoff decisions and fail when
  required prices or enforced bounds are unavailable.
- [x] Test overlapping attachments/workload leases, invalid event order, restart, window
  rollover, rounding, overflow, missing rates, and the cutoff boundary.

Gate A: deterministic tests prove a restart cannot erase or duplicate accounted
time and an unenforced/unpriced resource cannot silently produce a safe budget
decision.

## Deliverable B: provider-exit export, restore, and fencing foundation

- [x] Define a versioned Go-owned export manifest containing runtime generation,
  content metadata, hashes, and an explicit inventory of authority that must be
  provisioned afresh before activation. The archive layer must not falsely
  claim that it inspected arbitrary workspace content for secrets.
- [x] Implement authenticated streaming encryption with a caller-supplied
  user-scoped key. Generate a unique per-export subkey; authenticate framing and
  a final record so corruption and truncation fail.
- [x] Export regular files, directories, and safe relative symlinks from a
  trusted, quiesced prepared root. Reject special files and unsafe paths.
  Report progress and honor cancellation. Do not walk a live hostile workspace
  or a root containing workload-controlled mounts.
- [x] Restore into a package-named inactive staging directory, validate every
  manifest entry and digest, and remove partial output after failure. Do not
  accept a caller-selected publication destination.
- [x] Require a strictly newer runtime generation and return an explicitly
  inactive receipt that names fencing and credential rotation as activation
  prerequisites. Do not pretend local archive code can prove provider fencing.
- [x] Test round trips, empty and multi-chunk files, cancellation, wrong keys,
  bit flips, truncation, traversal, unsafe symlinks, special files, unexpected
  files, digest mismatch, exclusive export publication, invalid generations,
  authenticated plaintext after the tar footer, and source-path races.

Gate B: an adversarial local suite proves only authenticated, internally
consistent exports can become an inactive staged generation. It cannot become
the active assignment through this package.

## Deliverable C: restart-safe Phase 1c measurement preparation

- [x] Add a local command that consumes timestamped accounting events and an
  enforced-ceiling/rate-card configuration, persists ledger state atomically,
  and emits structured usage/cost/cutoff evidence.
- [x] Make input and output provider-neutral; select the Sprites rate card only
  at the command boundary.
- [x] Add fixtures and a restart test that processes the same event stream in
  two invocations without drift.
- [x] Document the separately authorized live collection steps for CPU cgroup
  counters, memory, storage, checkpoints, gateway bytes, provider bill
  snapshots, latency, capacity, and cleanup.

Gate C: the local harness is deterministic and restart-safe; no live provider
call is needed to verify it.

## Deliverable D: external-resolution packages

- [x] Write a send-ready Fly inquiry covering cold semantics, a supported boot
  epoch, per-Sprite billing data and lag, plan credits, placement/capacity,
  SLA/support escalation, backup, deletion, and customer-workload terms.
- [x] Write separate AWS EC2+EBS and E2B probe plans using the common provider
  matrix and identical evidence/result formats.
- [x] Define explicit authorization, credentials, spend cap, cleanup, and stop
  conditions for each live probe.

Gate D: another engineer can send the inquiry or execute either probe without
inventing requirements or touching production resources.

## Integration and completion

- [x] Update the main Sprites plan and provider-options report with links and
  only the progress actually proven.
- [x] Inspect the shared worktree and commit only coherent changes whose
  dependencies are included and whose gates pass. Do not absorb unrelated
  concurrent chat/UI or soak-agent edits.
- [x] Complete the Claude Fable 5/high review and final applicable format,
  quality, and supply-chain gates after all preceding items pass.

The independent review ran with `claude-fable-5` at high effort and returned
`pass_with_nonblocking_findings`. Its accounting-coverage, replay-integrity,
stream-finalization, and ledger-bounding findings were addressed before the
final checks.

Side-plan exit: Gates A–D pass locally, the independent review and applicable
repository checks are clean, and the resulting commits contain no unrelated
shared-worktree changes. The Sprites live soak, provider bill reconciliation,
and AWS/E2B live probes remain separately authorized follow-on executions.
