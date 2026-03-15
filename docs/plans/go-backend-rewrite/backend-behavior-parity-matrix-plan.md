# Backend Behavior Parity Matrix Plan

Last updated: `2026-03-17`

Purpose: build a behavior-level parity matrix between the Python-backed
behavior on `main` and the Go-backed behavior on the rewrite branch, so the
rewrite cannot be declared complete based only on broad subsystem ownership or
current-caller reachability.

This doc is intentionally procedural. A future audit should be able to follow
it and produce a reproducible matrix without relying on memory or prior chat
context.

## Why This Exists

The current rewrite docs answer two different questions:

- `caller-backed-backend-surface-checklist.md`:
  - does the active caller already hit a Go-owned backend surface today?
- `backend-capability-coverage-checklist.md`:
  - where does backend ownership live overall?

Those are necessary, but they are too coarse to prove behavior parity.
Cross-cutting details such as validation rules, normalization, default-name
generation, error contracts, and realtime side effects can still be missing
while a broader capability row is marked complete.

The rewrite also already has an explicit requirement in
`testing-strategy.md`: maintain a living mapping between Python test areas,
corresponding Go test coverage, uncovered gaps, and intentional drops. This
plan is how to materialize that requirement in a repo-visible artifact.

## Primary Output

Build and maintain:

- `docs/plans/go-backend-rewrite/backend-behavior-parity-matrix.md`

This future matrix should become the source of truth for:

- behavior-level parity claims
- proof that small but important backend behaviors were not silently dropped
- the current list of behavior gaps that still block a true "rewrite complete"
  claim

If the matrix becomes large, keep it as one file unless size clearly harms
usability. Prefer a single searchable ledger over many partial shards.

## Document Organization Rules

Default:

- keep one canonical searchable ledger in
  `backend-behavior-parity-matrix.md`

If size or reviewability becomes a real problem:

- keep `backend-behavior-parity-matrix.md` as the canonical index and status
  summary
- move detailed row tables into linked appendices by behavior area or audit
  slice, not by Python package or backend subfolder
- keep the same row schema, status semantics, and stable behavior ids across
  every appendix
- keep cross-cutting families together even when their evidence spans routes,
  types, helper/runtime code, tests, and frontend callers

Do not split primarily by source-tree folder such as `backend/setta/routers`,
`backend/setta/types`, or `backend/setta/project_state`. Those boundaries are
implementation structure, not behavior structure, and they make cross-cutting
omissions easier to hide.

## Non-Goals

- Do not create a file-for-file Python-to-Go port ledger.
- Do not reduce the matrix to only current frontend callers.
- Do not rely on route names alone as proof of behavior parity.
- Do not treat broad ownership docs as sufficient replacement for behavior
  evidence.
- Do not use heuristic "importance" judgments to skip small behaviors.
  If a behavior is in scope, classify it explicitly instead of silently
  omitting it.

## Source-of-Truth Boundary

For each audit run, pin one exact source commit on `main` (or another explicit
baseline branch if the product decision says so). Record that commit at the top
of the matrix.

Rules:

- The pinned `main` commit is the source of truth for pre-rewrite behavior.
- The current rewrite branch is the target implementation being audited.
- Do not let the matrix drift against a moving `main` without recording a new
  audit pass.
- If `main` changed behavior intentionally after the rewrite branch diverged,
  capture that as a separate matrix update rather than smearing multiple source
  baselines together.

## What Counts As A Matrix Row

A row is one behavior or invariant, not one package, route family, or feature
cluster.

Good row examples:

- project names trim whitespace before storage
- project names reject reserved names
- project names reject slug collisions
- create-project generates a valid unique default name
- add-kwarg generates a valid unique param name
- view-mode creation generates a valid unique default name
- rename route returns the expected typed validation failure
- websocket name-validation broadcast includes section errors
- section rename rejects top-level Python-identifier conflicts
- param rename enforces sibling uniqueness only within the relevant hierarchy

Bad row examples:

- project shell
- project state
- naming
- websocket behavior

If a "feature" contains multiple distinct rules, defaults, side effects, or
error contracts, split it into multiple rows.

## Required Matrix Columns

Each matrix row should include at least:

- capability area
- behavior id or short behavior name
- source baseline commit
- Python/main-side evidence
- current-caller or retained-boundary evidence, when relevant
- Go implementation evidence
- Go test evidence
- black-box transport evidence, when relevant
- status
- notes / open gap / follow-up

Recommended status values:

- `Proved`
  - Go implementation exists and cited evidence proves the surviving behavior.
- `Implemented, proof incomplete`
  - Go code appears to cover the behavior, but the proof is incomplete or
    missing.
- `Missing`
  - no acceptable Go equivalent is present for an in-scope behavior.
- `Retained Python boundary`
  - the behavior intentionally remains on a retained Python surface.
- `Intentional divergence`
  - behavior changed on purpose, and the new behavior is explicit in code,
    tests, and docs.
- `Dormant / unproven caller`
  - the behavior exists on the source baseline, but current evidence does not
    yet prove it remains a required active product behavior.

Avoid `Complete` in this matrix. It is too easy to read as "someone feels good
about this area." Use evidence-oriented statuses instead.

## Required Evidence Sources

### Source-baseline behavior inventory

Use the pinned `main` commit for:

- Python tests under `tests/`
- backend docs under `docs/reference/`
- Python transport inventory:
  - `backend/setta/types/routes.py`
  - `backend/setta/routers/*.py`
- Python websocket/message contracts and related backend-sent payload types
- public Python APIs and retained SDK surfaces:
  - `setta.api.SettaListener`
  - `setta.api.chat_toolkit`
  - `setta.api.SettaRunner`
- Python helper code that defines real behavior invariants rather than only
  incidental implementation structure

### Rewrite-branch target evidence

Use the current branch for:

- Go runtime/service code under `internal/*` and `cmd/*`
- Go HTTP/websocket/MCP registration and route wiring
- Go tests
- frontend caller usage where transport or user-visible behavior matters
- rewrite docs that define retained boundaries or intentional scope decisions

### Existing rewrite docs to cross-check

- `docs/plans/go-backend-rewrite/testing-strategy.md`
- `docs/plans/go-backend-rewrite/caller-backed-backend-surface-checklist.md`
- `docs/plans/go-backend-rewrite/backend-capability-coverage-checklist.md`
- `docs/plans/go-backend-rewrite/CURRENT.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`

## Behavior Inventory Rules

Build the source-baseline inventory from deterministic sources, not from vague
repo impressions.

Always enumerate from:

- Python tests first
- reference docs second
- transport/public API surfaces third
- helper/runtime code fourth when it defines actual behavior not already
  captured elsewhere

Use tests as the minimum behavior map, but do not stop at tests alone.
Reference docs and explicit contracts often describe behavior that needs its
own matrix rows even when a Python test does not isolate it cleanly.

## Enumerated Family Coverage Rules

Treat any accepted discriminator family as a first-class audit target.

Examples:

- section impl types
- code-object / param impl types
- route payload `kind` or `type` fields
- view modes and other mode-specific literals
- configuration field families with per-field validation
- policy-flag and environment-mode branches when they change behavior

For each such family, build an explicit family inventory from deterministic
source evidence. Record:

- the authoritative source definition location
- the full accepted value set on the pinned source baseline
- per-value defaults, seeded state, side effects, and singleton rules
- per-value error contracts for unsupported or invalid inputs
- mode or policy gates that change which values are accepted

During the audit, a family is not fully covered by:

- one representative test case
- one broad "create X" row
- one route-level proof that does not enumerate the accepted values

Acceptable coverage patterns are:

- explicit matrix rows for each value-specific behavior or invariant
- a linked family-coverage appendix/table that enumerates every source value
  and points to the exact matrix row(s), Go implementation evidence, and Go
  proof for that value

If the source accepts a value and the Go side does not, or if no proof exists
for that value-specific behavior, the family is not yet fully proved.

## Codex Multi-Pass Workflow

Do not try to produce the final matrix in one giant pass.

### Pass 0: Freeze the audit boundary

- choose and record the exact source commit on `main`
- record the target branch/head being audited
- record any explicit retained Python boundaries or out-of-scope decisions that
  already exist in current rewrite docs

### Pass 1: Build the source-baseline behavior ledger

Goal: inventory source behaviors without making Go-parity claims yet.

Tasks:

- enumerate Python test areas and concrete tested behaviors
- enumerate backend reference-doc behavior contracts
- enumerate public transport and SDK surfaces
- enumerate accepted discriminator families and their full source value sets
- break broad features into row-level behaviors
- mark the source evidence for every row

Output:

- an initial matrix with source-side rows populated
- family inventories for discriminator-driven behavior surfaces
- Go-side columns intentionally left blank or marked `unmapped`

### Pass 2: Map each row to Go implementation and proof

Goal: fill Go-side evidence without changing row granularity.

Tasks:

- map each source behavior to the relevant Go package(s)
- map each behavior to Go tests
- map transport-visible behaviors to HTTP/websocket/MCP proofs where needed
- map caller-visible behaviors to frontend caller evidence where needed
- classify the row status

Rules:

- if Go code exists but no proof exists, use `Implemented, proof incomplete`
- if the behavior intentionally changed, use `Intentional divergence` only with
  explicit evidence
- if the behavior remains on a retained Python boundary, say so explicitly

### Pass 3: Skeptical omission audit

Goal: find what Pass 1 and Pass 2 missed.

This pass should act like a hostile reviewer.

Tasks:

- find Python tests with no matrix row
- find reference-doc sections with no matrix row
- find validation/error/realtime/default-generation behavior hidden inside
  helper code with no matrix row
- compare family inventories against matrix coverage and Go acceptance tables
- find rows marked `Proved` whose cited proof does not actually prove the full
  behavior
- find broad rows that should have been split into smaller behaviors

Rules:

- assume rows are insufficient until proven otherwise
- prefer false negatives over false positives
- do not treat one family member as proof of the whole family
- if a live product check finds a parity miss, reopen the affected family rows
  instead of preserving the prior completeness claim

### Pass 4: Gap triage and rewrite-work creation

Goal: turn the matrix into an execution tool instead of a static report.

Tasks:

- group `Missing` and `Implemented, proof incomplete` rows by subsystem
- identify which gaps require code, which require tests, and which require docs
- decide whether any gap reopens a rewrite slice or only needs a focused fix
- add follow-up doc/task links where appropriate

### Pass 5: Spot re-audit after fixes

After each meaningful batch of fixes:

- re-check the touched matrix rows
- re-run the skeptical pass on the touched subsystem
- update the matrix instead of relying on chat memory

## Suggested Audit Order

Use multiple bounded passes instead of trying to audit the whole backend at
once.

Recommended order:

1. project state, naming, lifecycle, view modes, window spaces, and section /
   param mutation rules
2. websocket/realtime/listener contracts and backend-sent state/error payloads
3. project shell routes, notifications, default-project, and save/load flows
4. terminals, run-code, detached runs, LSP, formatting, and watch-code
5. artifacts, binary payloads, attachments, file browser, and git
6. MCP, app-spec/app-definition, UI settings, and codegen-facing tooling
7. AI, managed chat, tool-preview, agentic flows, and transcription
8. plugins and extension/runtime boundaries
9. launcher, deployments, startup, packaging, and retained Python surfaces

This order is intentional:

- start with stateful behavior where small missing invariants are dangerous
- then move to transport and runtime surfaces
- leave larger packaging/distribution tails after core behavior parity is
  mapped

## Completeness Gates

Do not treat the matrix as ready until all of the following are true:

- every row cites at least one source-baseline evidence item
- every `Proved` row cites concrete Go proof, not only a likely package owner
- every `Intentional divergence` row states what changed and why
- every `Retained Python boundary` row points to the explicit retained surface
- every `Dormant / unproven caller` row explains why the behavior is not yet
  classified as active
- no broad subsystem row hides multiple smaller rules
- every accepted discriminator family is covered either by explicit matrix rows
  or by a linked family-coverage appendix/table with per-value proof
- high-risk behavior classes have explicit rows:
  - validation rules
  - normalization
  - default/generated values
  - error typing and status contracts
  - persistence invariants
  - realtime/websocket side effects
  - mode-specific behavior

Do not call the rewrite behaviorally complete while in-scope rows still sit in:

- `Missing`
- `Implemented, proof incomplete`

unless there is an explicit product decision to accept the gap.

## Common False Positives To Avoid

- "The subsystem is Go-owned, so all the small behaviors are covered."
- "There is a Go route, so the whole behavior is proved."
- "There is a Go unit test somewhere, so the caller-visible contract is safe."
- "The frontend has local validation, so backend validation parity is less
  important."
- "The source behavior is too small to merit its own row."
- "No one mentioned this in a checklist, so it must not matter."
- "The current caller does not obviously use it, so it can be omitted without a
  classification."
- "One enum member or section type worked, so the entire family is proved."
- "A source-tree folder has been reviewed, so every behavior defined across
  that area is covered."

## Maintenance Rule

Once the first matrix lands:

- update the matrix in the same change when a behavior-level parity claim
  changes
- do not mark a rewrite slice done based only on the two broader checklist docs
  if the matrix still shows unresolved in-scope gaps
- if manual product use, backend logs, or a newly added test reveals a parity
  miss inside an audited surface, immediately reopen the affected matrix rows
  and family inventory instead of treating it as an isolated bug outside the
  audit
- if the matrix becomes stable and important enough, add a dedicated
  `backend-behavior-parity-matrix-audit-plan.md` for ongoing maintenance

## First Recommended Slice

Start with:

- project names
- view mode names
- window-space names
- section names
- param names
- generated/default naming on create flows
- related rename/create error contracts
- related websocket name-validation error broadcasts

Reason:

- the behavior cluster is important
- it is small enough to finish cleanly
- it crosses validation, defaults, persistence, routes, and websocket side
  effects
- it is exactly the kind of gap broad subsystem checklists can miss
