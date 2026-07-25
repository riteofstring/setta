# Setta Sprites Integration — Plan of Record

**Date:** 2026-07-24
**Status:** Deferred until the standalone Sprites working-state gate is complete.

## Relationship to Setta 4

This document owns the Sprites preparation and migration strategy. The
[`setta-4-director-command-center-plan.md`](setta-4-director-command-center-plan.md) owns the Setta 4
product, Director, semantic graph, fullscreen UI, Niri removal, and performance work.

Setta 4 and standalone Sprites development may proceed in parallel, but they have different
authority:

- Setta 4 is the product-critical path and owns all new product-facing contracts.
- `setta-3-sprites-development` owns completion of the standalone Sprites reference.
- The integration work in this document must not begin until that reference is green and pushed.
- A green Sprites integration branch is a source of evidence and portable behavior, not a wholesale
  merge source for Setta 4.
- The eventual `setta-4-sprites` branch starts from a green Setta 4 checkpoint, never from a Sprites
  branch.

## Blocking Prerequisite

Finish Sprites on `setta-3-sprites-development` before creating an integration branch or merging
current `setta-3`.

The authoritative development plan is
`docs/plans/setta-cloud-platform-sprites-plan.md` on the `setta-3-sprites-development` branch. Its
2026-07-24 development-first amendment defines the working-state gate, the bounded Candidate B live
continuation, cleanup proof, and the frozen reference checkpoint.

Integration becomes eligible only when:

- the deterministic offline provider and hosted lifecycle suites pass
- an explicitly authorized live Candidate B run completes its fixed lifecycle workload
- independent inventories prove all run-owned provider resources and credentials are absent
- the relevant local and hosted conformance and production conversation paths are green
- content-free performance, reliability, placement, and cost evidence is recorded
- the development branch has a clean, pushed working checkpoint

Completion of this prerequisite does not automatically authorize integration. It only makes the
integration plan actionable.

## Objective

After the blocking prerequisite, reconcile the working Sprites reference with current `setta-3` so
its useful machinery is easy to inspect, test, and selectively port after the Setta 4 Director UI
stabilizes.

The work should leave us with:

- current `setta-3` conversation, speech, Electron, and contract behavior
- reusable hosted-runtime provider and lifecycle machinery
- explicit local and hosted execution boundaries
- secure credential, installation, accounting, lease, and control-plane components
- provider conformance and deterministic lifecycle fixtures
- a migration ledger that identifies exactly what Setta 4 should port

The purpose is not to preserve the Sprites product surface. It is to turn the valuable parts of the
branch into well-bounded implementation references.

## Branch Topology

### Preserved baseline

`setta-3-sprites` remains the pushed, known baseline. Its current preservation point is:

```text
c8254b1f2 runtime: remove legacy BYO cloud compatibility
```

Do not merge `setta-3` directly into that preserved branch.

### Future integration branch

Only after the blocking prerequisite and explicit owner direction, create:

```text
setta-3-sprites-integration
```

from the frozen working checkpoint on `setta-3-sprites-development`, then merge the selected current
`setta-3` tip into it. Record both exact parent commits in the migration ledger before resolving
conflicts.

The integration branch may be reset or replaced before it is shared if the first merge approach
proves structurally wrong. Once published and used by others, preserve its history normally.

### Future product branch

After Setta 4 reaches its green Director checkpoint:

```text
green setta-4 checkpoint
        ↓
setta-4-sprites
        ↓
selective behavior ports from the migration ledger
```

Do not merge `setta-3-sprites`, `setta-3-sprites-integration`, or their aggregate history into
`setta-4-sprites`.

## Current Merge Forecast

The initial read-only merge forecast found:

- merge base: `8d1c4c904`
- 69 Sprites-only commits
- 164 `setta-3`-only commits at the time of analysis
- 23 predicted conflicted paths

The conflicts are concentrated in:

- Go HTTP/runtime contracts and wiring
- generated TypeScript and schema snapshots
- Electron main-process wiring
- speech and conversation E2E fixtures
- web/PWA files removed by `setta-3`
- Niri/pane E2E workflows
- obsolete BYO runtime planning documents
- `CLAUDE.md`

The count is manageable, but the merge is semantic work. A clean textual resolution is not proof
that the combined runtime is correct.

## Hard Lines

- No backward-compatibility shims.
- No dual contract generations.
- No manual edits to generated TypeScript or generated schema snapshots.
- No web/PWA restoration.
- No BYO/Tailscale compatibility restoration.
- No runtime picker or provider wizard as a primary product surface.
- No Sprites integration with Niri panes.
- No Director UI implementation on the integration branch.
- No terminal-centric acceptance criteria for the eventual product.
- No keyword heuristics or silent provider fallbacks.
- No real hosted provisioning without separate authorization, short-lived credentials, a spend cap,
  a cleanup deadline, and an explicit resource inventory.
- No claim that this branch can be merged wholesale into Setta 4.

## Ownership Rules

Resolve every merge conflict according to the domain owner, not according to which side produces
fewer textual changes.

### Current `setta-3` owns

- conversation lifecycle and durable stores
- folderless and app-scoped routing
- speech capture, playback, and safe credential behavior
- current Electron main/preload/renderer transport
- current production E2E harness behavior
- current HTTP endpoint registry conventions
- current product decisions removing web/PWA paths
- current unreleased-product policy

### Sprites owns

Where no newer Setta 4 owner exists:

- provider contracts and provider conformance
- hosted runtime capabilities and setup state
- secure provider credential issuance and enrollment
- signed installation and image publication
- backup, usage accounting, and leases
- private gateway and control-plane behavior
- hosted lifecycle and failure fixtures
- offline hosted-provider testing

### Generated contracts

Reconcile Go owner inputs first:

- endpoint contracts remain owned by the `internal/httpapi` endpoint registry
- shared values remain owned by their Go domain package
- TypeScript is generated from those owners
- schema snapshots are regenerated from the reconciled registry

Never select one side of a generated-file conflict as the final resolution.

### Deleted files

Files removed by a current product decision stay removed unless this plan identifies a current
backend owner and a production consumer for them.

Tests for an obsolete UI are not a reason to restore that UI. Replace them with boundary or
production-workflow coverage for the behavior that still matters.

## Target Execution Boundary

The reusable result should expose a small consumer-owned execution port. It must not import provider
UI, runtime-picker, Niri, or Sprites presentation concepts.

Conceptually, it covers:

```text
resolve trusted execution target
submit turn
steer active turn
cancel run
read durable snapshot
subscribe from durable cursor
```

Local and hosted adapters must pass the same contract suite. Provider selection, credentials,
installation, leases, accounting, and transport remain behind the hosted adapter.

The Setta 4 Director may later consume this boundary, but Setta 4 owns the final interface and may
change it before porting.

## Implementation Sequence

This sequence is deferred until the blocking prerequisite is complete and the owner explicitly
starts integration.

### Phase 0 — Create the preparation branch and ledger

1. Confirm the frozen `setta-3-sprites-development` checkpoint and `setta-3` are pushed and clean.
2. Create `setta-3-sprites-integration` from the frozen working checkpoint.
3. Create a migration ledger recording:
   - source commit
   - behavior or capability
   - current owner
   - intended Setta 4 owner
   - relevant contracts
   - relevant tests
   - disposition: retain, rewrite, port, or delete
4. Record the exact `setta-3` commit selected for the merge.
5. Re-run the merge forecast and attach the conflicted-path inventory.

Exit gate:

- preserved baseline remains unchanged
- integration branch exists locally
- source commits and conflict inventory are recorded
- every major Sprites capability has an initial disposition

### Phase 1 — Merge current Setta 3

1. Merge the recorded `setta-3` commit without committing immediately.
2. Resolve documentation and deletion conflicts according to current product decisions.
3. Reconcile Go contract owners and endpoint registration.
4. Reconcile runtime/server construction and dependency ownership.
5. Reconcile Electron main/preload transport only where backend capabilities require it.
6. Remove obsolete web/PWA files rather than restoring them.
7. Remove obsolete Niri/runtime-picker tests rather than making the old UI authoritative.
8. Regenerate TypeScript and schema outputs from reconciled Go owners.
9. Inspect the complete merge diff before committing.

Exit gate:

- no unmerged paths
- no generated output was manually resolved
- no obsolete frontend path was restored
- current conversation and speech ownership remains recognizable
- Sprites provider/runtime packages remain independently identifiable

### Phase 2 — Establish the execution boundary

1. Define the smallest useful consumer-owned local/hosted execution port.
2. Adapt current local execution without changing product behavior.
3. Adapt hosted Sprites execution behind the same port.
4. Move provider-specific setup, credentials, leases, and accounting behind the hosted adapter.
5. Remove renderer knowledge of provider and runtime plumbing.
6. Add deterministic contract fixtures for both adapters.

Exit gate:

- local and hosted execution share one consumer-owned contract
- provider packages do not depend on Electron or UI packages
- the renderer does not select infrastructure through provider-specific state
- unsupported capability states fail specifically and visibly

### Phase 3 — Harden reusable Sprites capabilities

Process capabilities in bounded slices:

1. provider contracts and conformance
2. runtime capabilities and setup state
3. credentials and authentication
4. signed installation and image publication
5. backup, accounting, and leases
6. private gateway and control plane
7. deterministic hosted lifecycle and failure handling
8. offline hosted-provider harness

For each slice:

- identify the Go owner
- minimize its public interface
- remove UI and compatibility dependencies
- add focused boundary coverage
- update the migration ledger
- commit independently when coherent

Exit gate:

- each retained capability has an explicit owner and bounded interface
- each retained capability has production-relevant deterministic coverage
- deleted behavior has an explicit disposition
- no slice depends on an obsolete product surface

### Phase 4 — Production-path verification

When the integration branch is ready to merge and the user asks verification to begin:

1. Run focused Go tests through `./scripts/go.sh`.
2. Regenerate affected contracts.
3. Run focused desktop unit and type checks.
4. Run deterministic Electron E2E through production main/preload/renderer/HTTP/store paths.
5. Cover local and hosted resolution, submission, streaming, steering, cancellation, failure,
   restart/replay, credentials, and capability/setup failure where touched.
6. Run the offline hosted-provider lifecycle suite.
7. Run live Codex E2E with ChatGPT auth and without `OPENAI_API_KEY` when locally available.
8. Run formatting, the appropriate quality gate, and supply-chain checks required by the repository
   policy.

Real hosted provisioning remains outside this phase unless separately authorized.

Exit gate:

- integration branch is green through production paths
- local and hosted adapters pass the same contract suite
- generated outputs match the reconciled owners
- no test depends on a removed frontend
- migration ledger matches the implemented branch

### Phase 5 — Freeze the reference and prepare Setta 4 ports

1. Push the green integration branch.
2. Record its final commit in the migration ledger.
3. Identify the minimal commit/package sequence for each retained capability.
4. Mark dependencies on contracts that Setta 4 has replaced.
5. Provide port notes that describe behavior and ownership, not cherry-pick instructions alone.
6. Keep later backend experiments separate from the frozen reference checkpoint.

Exit gate:

- GitHub contains a reproducible green reference
- every desired Setta 4 capability has a bounded port recipe
- no port recipe requires merging the integration branch wholesale

## Setta 4 Port Sequence

After the Setta 4 Director checkpoint:

1. Create `setta-4-sprites` from the green Setta 4 commit.
2. Port provider contracts and the conformance harness.
3. Port runtime capabilities and setup state.
4. Port credentials and authentication.
5. Port signed installation.
6. Port backup, accounting, and leases.
7. Port private gateway and control-plane behavior.
8. Implement Setta 4 Go owners and regenerate TypeScript.
9. Add secure automatic desktop runtime binding.
10. Implement local and hosted Director execution adapters.
11. Port deterministic production Electron E2E.
12. Port the offline hosted-provider harness.
13. Reprofile the Director command center under local and hosted event latency.

Do not port:

- runtime picker as the primary UX
- provider wizard as the primary UX
- Niri or pane integration
- web/PWA paths
- terminal-centric acceptance criteria
- BYO/Tailscale compatibility
- older contracts superseded by Setta 4

The Director should choose and explain execution placement from trusted capability state. The user
may inspect or override a meaningful decision, but should not have to operate provider plumbing.

## Completion Definition

The preparation track is complete when:

- `setta-3-sprites` remains an intact pushed baseline
- a green `setta-3-sprites-integration` reference is pushed
- current `setta-3` behavior and Sprites backend capabilities coexist behind clear owners
- local and hosted execution pass one consumer-owned contract suite
- reusable capabilities have bounded interfaces and deterministic coverage
- obsolete UI and compatibility paths are absent
- generated contracts come only from reconciled Go owners
- the migration ledger provides a concrete selective-port path into `setta-4-sprites`
- no Setta 4 work depends on merging the integration branch

## Immediate Next Actions

1. Continue standalone development on `setta-3-sprites-development`.
2. Complete the working-state gate in its Sprites plan of record.
3. Freeze and push the working reference checkpoint.
4. Revisit this merge forecast against that checkpoint and the then-current `setta-3`.
5. Begin Phase 0 only under explicit owner direction.
