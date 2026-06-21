# Branch 2 Essential Port Plan

- **Date:** June 21, 2026
- **Source branch:** `setta-3-workflow-kernel-conceptual-nodes-2`
- **Source cutoff SHA:** `7a67cf453a006fa4cfd9a9b7e9ef6298984364e4`
- **Target branch:** `setta-3-workflow-kernel-conceptual-nodes-3`
- **Shared base:** `6beddf21a554132c283255e1f1bc6c259213e537`
- **Status:** Active port plan. Phase 0 through Phase 3.5A have been
  implemented on the target branch. The next implementation slice is Phase
  3.5B: chip click-through and shared workflow-node activity details.

## Goal

Bring the essential product and architectural work from
`setta-3-workflow-kernel-conceptual-nodes-2` into this branch without carrying
over the branch's accumulated trial-and-error, mistaken abstractions,
decorative visual dead ends, broad automation churn, or partial phase status
confusion.

The target is not a merge and not a replay of branch 2. The target is a clean
implementation on top of this branch's newer appearance, workspace layout,
pane-resize, frozen-overview, and chat-performance work.

The top-level product success criterion is:

> A workflow graph can show what the agent is doing in real time through typed,
> deterministic activity, while durable semantic nodes remain useful long-term
> memory, and graph interaction remains readable and responsive under normal
> pan/zoom and node movement.

Anything from branch 2 that does not serve that outcome should be deferred,
discarded, or treated as learn-only.

## Current Branch Facts

The branch 2 source is frozen at
`7a67cf453a006fa4cfd9a9b7e9ef6298984364e4`. Any later commits on the branch
name are outside this plan unless the cutoff is deliberately updated in this
document.

The branch 2 delta from the merge base to that cutoff is large enough that
wholesale cherry-picking should be treated as high risk:

- Roughly 443 files changed.
- Roughly 95k inserted lines and 9k deleted lines.
- The largest areas are the workspace graph renderer, Electron workflow tests,
  semantic graph backend, generated contracts, and runtime/event-stream
  plumbing.

This branch is also not a blank target. Since the shared base, it already added
or changed:

- Setta 3 appearance and workspace controls.
- Niri-style workspace navigation geometry.
- High-refresh chat streaming performance work.
- Frozen workspace overview surfaces.
- Desktop chrome, sidebar layout, and pane resize interactions.
- Workspace layout and surface registry changes that overlap with branch 2's
  graph surface runtime work.

Porting therefore started with an ownership audit of the current branch before
applying any branch 2 implementation.

## Current Execution Status

The plan has already taken the World B path from the Phase 0 manifest:
graph-surface/runtime stability had to land before renderer-visible liveness
work.

Completed slices:

- **Phase 0 - Audit and slice manifest.** Completed in
  `docs/plans/branch2_slice_manifest.md`. It established that current edge,
  label, and camera update paths made the graph-surface refactor a prerequisite
  before adding live renderer activity.
- **Phase 1 - Graph surface update stability.** Implemented by
  `2bbc9dd6c Optimize workflow graph surface updates`, with follow-up update
  source instrumentation in `e2a8ac774 Require workflow graph update sources`.
  This moved the original graph-surface/runtime concern ahead of trajectory
  rendering.
- **Phase 2A - Typed workspace activity feed.** Implemented by
  `44431c0cc Implement typed workspace activity feed`.
- **Phase 2B - Typed workspace activity markers.** Implemented by
  `9808e6a7a Add typed workspace activity markers`.
- **Phase 3 - Visual grammar baseline.** Implemented by
  `a1f847878 Implement workflow visual grammar`.
- **Phase 3.5A - Readable activity chips.** Planned in
  `28b1905ce docs: plan readable activity chips phase` and implemented by
  `bb51b8df7 Add workflow activity graph chips`.
- **Workflow run navigation stabilization.** Implemented after Phase 3.5A to
  make draft, active-run, and historical-run views coherent:
  one-active-run enforcement, run history, Stop, non-destructive projection
  loading, stable toolbar slots, scoped activity markers, durable run-scoped
  activity snapshots, and frame-aware visual verification. The completed plan
  doc was removed in `d61852b69`.

The current branch now has the typed-liveness spine needed for the next UX
slice. The remaining immediate gap is not more markers; it is connecting the
readable chips to the canonical workflow node details surface.

## Integration Rules

These rules are intended to prevent the same misunderstandings from returning.

### Architecture Before Porting

Major refactors are allowed, and sometimes required, before bringing over a
branch 2 idea.

Do not force a branch 2 feature onto an unhealthy current-branch boundary just
because the feature worked in the source branch. If the target branch's
renderer, runtime, store, contract, IPC, chat, semantic, or workspace-layout
architecture would make the feature expensive, fragile, hard to verify, or
likely to regress performance, first refactor the target boundary into a sane
owner model.

Branch 2 should be treated as a product/behavior reference and a source of
tests/evidence, not as an implementation authority. The target branch's current
architecture should be improved where needed, then the useful branch 2 behavior
should be rebuilt against that architecture.

The Phase 0 manifest recorded prerequisite refactors explicitly. Keep that
standard for any later branch 2 slice: a recommendation of "refactor first" is
a valid outcome, not a failure to port.

### No Legacy Compatibility

This work does not need backward compatibility with branch 2, older local graph
state, older semantic/runtime state, older generated contract shapes, or
transitional renderer behavior.

Do not add:

- backward-compatibility shims,
- legacy support paths,
- migrations,
- transitional readers or writers,
- dual-read or dual-write paths,
- old-field aliases,
- feature flags whose only purpose is preserving old behavior,
- silent compatibility fallbacks,
- compatibility adapters,
- or temporary bridge layers between old and new graph/runtime models.

If a persistent schema, generated contract, local storage shape, renderer state,
or runtime protocol must change, change it directly. Fail loudly with reset
guidance when stale prerelease state is encountered. Tests should assert the new
contract and rejection/reset behavior, not migration from the old shape.

Only add compatibility, migration, or transitional code if the developer
explicitly requests that exact compatibility work.

### Source Cutoff

Use `7a67cf453a006fa4cfd9a9b7e9ef6298984364e4` as the branch 2 evidence
cutoff. The Phase 0 manifest cites commits relative to that SHA. Do not
silently include newer branch 2 commits.

### Capability Versus Method

The audit manifest separates two decisions, and later slice plans should keep
the same distinction:

- **Disposition:** keep, defer, discard, or learn-only.
- **Method:** reimplement-clean, port-diff, copy-doc-only, or do-not-port.

Default to `reimplement-clean` for anything that touches ownership boundaries,
generated contracts, runtime streams, renderer lifecycle, graph layout,
workspace surfaces, or chat transcript/activity presentation. Use `port-diff`
only for small isolated fixes whose current-branch owners and tests have been
verified.

### Generated Contracts

Go-owned contracts are reconciled against this branch's current generator and
`internal/httpapi` endpoint registry. Branch 2 contracts are reference material,
not merge targets.

Generated TypeScript must be regenerated from Go-owned contracts. Never
hand-merge or manually edit generated outputs.

If generated contracts conflict, branch 3's current generator and owner-defined
contracts win by default unless the manifest explicitly records a reason to
change the owner contract.

### Runtime And Pan/Zoom Invariants

Any future renderer runtime frame must preserve the invariants established by
Phase 1:

- no runtime delta may cause full graph scene replacement during camera
  movement;
- no runtime delta may cause graph-shell React replacement during camera
  movement;
- camera movement may not trigger backend reads, layout persistence, or
  generated-contract refreshes;
- activity, chip, detail, or future trajectory updates must be content-only and
  bounded, or the runtime work must stop until the owning surface is refactored.

Do not defer these invariants to a later pan/zoom phase after adding trajectory
runtime rendering. That ordering recreates the branch 2 jank risk.

Phase 0 answered this concrete investigation question and found the World B
path:

> When a small live data update arrives while the user is interacting with the
> current branch's graph, does the renderer update only the affected content, or
> does the data path replace/reproject/rematerialize larger graph state?

The desired end state remains: small updates should update small retained
objects. Phase 1, Phase 2, Phase 3, Phase 3.5A, and workflow run navigation
stabilization implemented and verified that behavior for the current activity
surface.

Future liveness or graph-surface slices must still distinguish:

- Pixi app, renderer, ticker, viewport, or layer recreation;
- full graph scene replacement or rematerialization;
- React graph-shell state replacement or rerender that rebuilds graph content;
- label, edge, node, or sprite materialization churn;
- backend reads or layout persistence caused by camera movement;
- content-only updates that preserve camera, nodes, edges, labels, layers, and
  the React shell.

If a later slice discovers a non-content-only live update path, stop and fix
that owner boundary before adding more renderer-visible behavior. Do not
proceed by hiding churn behind loading states, compatibility fallbacks, or
visual effects.

### Tests And Evidence

Tests from branch 2 are evidence of intended behavior, not artifacts to copy
wholesale. Rewrite tests against the new boundaries unless a test is small,
isolated, and demonstrably boundary-neutral.

Physical MacBook trackpad sign-off is required before claiming pan/zoom
snappiness complete. If the device-side check is not available, leave an
explicit open risk instead of marking the phase complete.

## Branch 2 Core Features And Visuals

### 1. Workflow Graph Validation And Editing

Early branch 2 work added durable workflow draft validation behavior:

- persisted workflow validation state,
- revised draft validation behavior,
- validation overlays,
- edge deletion fixes,
- layout save outcomes,
- movement ownership,
- view-layout ownership,
- durable drag contract coverage.

This is product-relevant and should be considered for an early narrow port, but
it must be reconciled with this branch's current workspace layout and pane
interaction model.

### 2. Living Workspace Visual Direction

Branch 2 explored a "living workspace" graph style:

- workflow nodes as a neon circuit with active edge flow,
- semantic memory as cell-like objects with kind/status coloring,
- split, merge, promote, and dismiss concepts for semantic nodes,
- mockup-only alternatives: Neon Circuit, Cozy Constellation, Holo Command, and
  Factory Flow.

The useful outcome is the visual grammar, not the literal mockup:

- active workflow state must be visually legible,
- execution should visibly travel through the graph,
- semantic memory should look distinct from workflow execution,
- details on demand should explain nodes and activity,
- color/status mapping should stay consistent.

The mistaken part was letting decorative "life" effects become product
meaning. Orbiting organelles, mystery beads, whole-background changes triggered
by semantic-node presence, and unlabeled ambient particles should not be ported
as default product behavior.

### 3. Semantic Cartographer Audit And Settings

Branch 2 added a large semantic-cartographer settings/audit surface:

- settings persistence,
- cartographer model catalog,
- harness config path,
- run audit schema,
- settings API and UI,
- runtime synchronization fixes,
- final synthesis budgeting,
- audit recording snapshots.

This work is useful only if it supports the durable semantic-memory product
model. It should not be ported as standalone settings complexity before the
runtime and semantic-memory boundaries are clear.

### 4. Semantic Memory Usefulness

Branch 2's later semantic work corrected an earlier product mistake: semantic
nodes should represent durable memory, not every action the agent takes.

Core ideas worth preserving:

- semantic nodes are durable findings, decisions, constraints, open questions,
  risks, domain concepts, and reusable codebase facts;
- every automatic semantic node should have concrete evidence;
- new durable memory should explain why it exists and how it can help future
  work;
- process-only notes such as "read file" or "ran command" should be rejected or
  kept as trajectory activity, not promoted to semantic memory;
- semantic details should show source refs, evidence coverage, relationships,
  and future use.

This is one of the highest-value branch 2 outcomes.

### 5. Workspace Trajectory Runtime

Branch 2 introduced a deterministic activity layer separate from semantic
memory:

- typed run/activity facts for file reads, file writes, diffs, commands, tests,
  tool calls, reasoning summaries, assistant output, approvals, and workflow
  status;
- a Go-owned workspace trajectory runtime snapshot/delta contract;
- HTTP snapshot and event-stream endpoints;
- generated TypeScript contracts;
- renderer store and Pixi sprite layer;
- workflow-node details showing recent trajectory provenance;
- typed file-operation fidelity from provider/tool metadata.

This is the central product lesson from branch 2: fast liveness must be
deterministic and typed. The cartographer should not be on the critical path
for showing that the agent read, edited, tested, or requested approval.

### 6. Graph Runtime, Pan/Zoom, And Layout Ownership

Branch 2 contains multiple graph performance refactors:

- surface-controller ownership for Pixi canvas lifetime,
- typed/diffed workspace presentation writes,
- camera movement isolated from backend reads and React graph replacements,
- scene-store composition,
- local-first layout overlays and revision-checked persistence,
- pan/zoom incident reports and performance gates,
- later retained-scene fast-path work that made labels remain visible during
  camera motion.

The latest plan in branch 2 also documents incomplete work:

- wheel-handler input hot-path cleanup was still outstanding,
- retained/dirty geometry pipeline was not complete,
- animation architecture was not complete,
- cross-owner drag was only partially generalized,
- some earlier verification gates were relaxed too far.

Port the architectural contracts and the verified small fixes. Do not port
"complete" status claims without rechecking the diffs and product behavior.

### 7. Activity Sprite Popovers And Shared Agent Activity UI

Branch 2 added useful workflow details improvements:

- trajectory/activity sprites became clickable,
- sprite clicks opened inline popovers focused on the underlying run item,
- popovers linked to the owning workflow node details,
- workflow details reused shared chat/agent activity leaf components instead
  of maintaining a bespoke lower-quality run-item UI.

This should be preserved, but it depends on the trajectory runtime and shared
activity component boundary.

### 8. Recording, Performance, And Visual Tooling

Branch 2 added a lot of tooling:

- visual mockups and visual parity targets,
- performance reports,
- workflow graph pan/zoom recording parsers,
- graph recording schema changes,
- incident reports for pan/zoom, node drag, sprite click, selection, and graph
  replacement,
- workflow graph phase gates.

The useful part is compact causal evidence. The bloat risk is carrying over
large branch-specific recording workflows, visual targets, and automation loops
before the product slice exists on this branch.

## Lessons To Carry Forward

1. Do not use semantic nodes as the liveness layer. Live activity belongs in a
   deterministic trajectory runtime; semantic nodes are durable memory.
2. Do not add visual motion unless it has a readable product meaning. Active
   workflow, active edge flow, blocking approval/failure state, and recent
   trajectory activity have priority over decorative effects.
3. Do not hide labels, edges, or meaningful activity just because the user is
   panning or zooming. Motion-time degradation is not the product answer.
4. Do not rely on report-only performance findings for user-felt graph quality.
   Hard gates should cover structural invariants; physical trackpad feel still
   needs human/device verification.
5. Do not parse shell commands or arbitrary text to invent file-read or diff
   precision. Use typed provider/tool/runtime metadata, and display unknowns
   honestly.
6. Do not manually edit generated outputs. Contracts are Go-owned; TypeScript is
   regenerated.
7. Do not add compatibility shims, legacy readers, dual paths, migrations, or
   silent fallbacks for this prerelease graph/runtime work unless explicitly
   requested.
8. Do not let automation loops mark architectural phases complete. Verify by
   diff, focused tests, production-path workflows, and product behavior.
9. Do not wholesale cherry-pick branch 2. Rebuild small vertical slices against
   this branch's current ownership boundaries.

## Keep, Defer, Discard

### Keep

- Product layer split: workflow graph, trajectory runtime, semantic memory, and
  cartographer audit.
- Typed workspace trajectory runtime with bounded snapshot/delta contracts.
- Typed file-operation fidelity where provider/tool metadata supports it.
- Semantic memory usefulness fields and validation policy.
- Workflow graph validation, layout ownership, and local-first drag/save
  behavior after reconciliation with current layout code.
- Camera fast-path invariants that keep labels and base edges visible during
  pan/zoom.
- Activity sprite popovers and shared agent activity leaf components.
- Compact recording/incident reports that answer why graph interaction failed.

### Defer

- Full semantic cartographer settings UI until the backend semantics and
  runtime boundaries are stable.
- Large visual parity infrastructure until the selected visual slice exists on
  this branch.
- Heavy pan/zoom benchmark matrix until the graph surface controller and
  trajectory layer are in place.
- Manual pinning or promotion of trajectory sprites into durable semantic
  memory.
- Broad semantic-cell split/merge visuals unless a product interaction needs
  them.

### Discard

- Decorative semantic-cell organelles, mystery particles, unlabeled source
  beads, and whole-canvas background changes keyed only to semantic-node
  presence.
- Report-only "passes" for graph interaction quality.
- Branch-specific codex-loop scripts and automation scaffolding unless a
  separate need is proven.
- Duplicative or bespoke workflow run-item UI once shared leaf components can
  render the same data.
- Any transitional compatibility path whose only purpose is preserving old
  graph/runtime state during this refactor.

## Port Strategy

The original draft listed a linear Phase 0 through Phase 9. That order is no
longer the source of truth. The Phase 0 audit found that live renderer updates
were not safe enough, so the branch deliberately moved graph-surface stability
ahead of renderer-visible liveness. The current port strategy is the executed
sequence below.

### Completed Phase 0 - Audit, Ownership, And Feasibility Manifest

Status: complete.

Output:

```text
docs/plans/branch2_slice_manifest.md
```

Key decisions:

- World B was the correct path: the graph-surface/runtime update path had to be
  fixed before adding more live renderer layers.
- Typed metadata was sufficient for a useful first liveness slice when scoped
  to existing typed command, approval, file-change path/status, workflow-status,
  and run provenance facts.
- File reads and richer diff facts remained out of scope because they lacked
  honest typed metadata on this branch.
- Shell-output parsing, assistant-text parsing, and compatibility shims stayed
  forbidden.

### Completed Phase 1 - Graph Surface Update Stability

Status: complete.

Source plan:

```text
docs/plans/branch2_phase1_graph_surface_update_plan.md
```

Implemented behavior:

- retained and diffed edge labels instead of destroying all labels on every
  graph update;
- kept edge graphics batched while skipping redraws when edge geometry and
  style do not change;
- stopped graph updates from cancelling camera pan/zoom when the interaction
  target is still valid;
- added source-attributed graph update counters and production Electron
  coverage for pan-during-update behavior.

This slice corresponds to the original graph-surface/runtime prerequisite, not
to the original "decision gate" wording.

### Completed Phase 2 - Typed Workspace Activity

Status: complete.

Source plan:

```text
docs/plans/branch2_phase2_typed_liveness_plan.md
```

Phase 2A implemented the Go-owned typed activity feed:

- workspace activity records mapped from existing typed workflow, chat run
  item, approval, command, file-change, and workflow-status data;
- HTTP snapshot and event-stream paths through production main, preload,
  renderer, and store boundaries;
- debug counters proving no marker materialization in the backend/feed slice.

Phase 2B implemented renderer-visible activity markers:

- bounded Pixi marker materialization;
- workflow-node anchoring;
- marker debug counters;
- production Electron assertions for marker creation, typed kinds, run
  completion, pan continuity, no scene replacement, and no backend reads during
  camera movement.

This intentionally used `internal/workspaceactivity`, not a separate
`internal/workspacetrajectory` package. Do not add a new trajectory package
unless a later slice proves the activity model is the wrong boundary for a
specific typed fact.

### Completed Phase 3 - Visual Grammar Baseline

Status: complete.

Source plan:

```text
docs/plans/branch2_phase3_visual_grammar_plan.md
```

Implemented behavior:

- single visual-state resolver for workflow nodes, edges, and activity markers;
- debug-visible resolved visual state from the same resolver path that drives
  Pixi styling;
- clear running, waiting, completed, failed, and cancelled states;
- deterministic Electron coverage for success, failure, cancellation, and
  approval states.

This phase deliberately avoided branch 2's neon/glow, organelle, trail,
animation, and visual-parity harness churn.

### Completed Phase 3.5A - Readable Activity Chips

Status: complete.

Defined inside:

```text
docs/plans/branch2_phase3_visual_grammar_plan.md
```

Implemented behavior:

- readable text-bearing activity chips at readable zoom;
- compact glyph/count representation at low zoom and over cap;
- per-node cap with `+N` overflow;
- typed labels from existing workspace activity marker records;
- suppression/fixing of unanchored activity instead of a far-left recent lane;
- chip placement evidence proving readable chips stay inside the canvas;
- production Electron visual evidence for command, approval, workflow-status,
  failure, cancellation, low-zoom compact mode, and pan continuity.

### Completed Workflow Run Navigation Stabilization

Status: complete.

This was not in the original branch 2 phase list, but it became necessary after
the first real manual review of readable chips and run navigation.

Implemented behavior:

- one active run per workflow definition;
- run history and historical run selection;
- Stop/cancel flow;
- durable run-scoped activity snapshots;
- draft, active-run, and historical-run marker scoping;
- non-destructive projection loading;
- stable toolbar slots;
- validation overlay scoped to draft view;
- frame-aware Electron assertions and screenshot evidence for the toolbar,
  draft view, active run, and historical run.

The completed stabilization plan was removed after implementation so the active
plan set stays current.

### Next Phase - Phase 3.5B: Chip Details And Shared Activity Rows

Status: next implementable slice.

Use the Phase 3.5B section and handoff prompt in
`docs/plans/branch2_phase3_visual_grammar_plan.md`.

Goal:

- click or focus a readable activity chip and open or focus the existing
  workflow node details Niri pane for the owning node;
- deep-link or highlight the clicked run item, approval, or workflow event when
  the typed detail ref supports it;
- reuse the existing chat run-activity row rendering path for node-scoped
  agent/tool activity, or extract only the smallest shared component needed.

Do not:

- create a separate chip-only details surface;
- embed the whole chat transcript in workflow node details;
- fabricate chat turns from flat workflow activity records;
- add backend contracts or inferred activity kinds;
- port the full branch 2 trajectory runtime details stack.

Verification:

- focused component/helper tests for shared row reuse and activity highlighting;
- focused Pixi/debug tests for chip hit targets and typed detail refs;
- deterministic Electron `workflow-activity-feed` coverage proving chip
  click-through through production graph and Niri details paths;
- `./scripts/format.sh` and `./check_quality.sh --all` before executable-code
  commits.

### Later Candidate - Semantic Memory Usefulness

Status: not next.

Port the durable semantic-memory policy only after the typed-liveness UX is
coherent:

- evidence candidates from typed activity facts;
- `whyItExists` and `futureUse` for durable semantic nodes;
- validation that rejects weak or process-only automatic nodes;
- source refs and source coverage in details;
- minimal cartographer settings until the behavior is proven.

Verification remains semanticgraph tests plus production semantic-cartographer
Electron coverage.

### Later Candidate - Recording And Evidence Tooling

Status: defer until a product slice needs it.

Port only compact evidence tooling that explains real issues:

- pan/zoom delay or flashing;
- unintended graph replacement;
- label or edge visibility drops;
- chip/detail click routing failures;
- sprite or activity hit-target failures if a later phase adds them.

Do not port broad visual parity targets or phase-loop automation as product
work.

### Reframed Or Deferred Original Phases

- The original **Phase 4 / Phase 5 trajectory runtime** has been reframed as
  typed workspace activity. Do not create a parallel `workspacetrajectory`
  runtime unless a concrete missing typed fact proves the current activity
  boundary is insufficient.
- The original **Phase 7 graph-surface runtime** moved first and is complete
  for the invariants needed by activity markers and chips. Larger pan/zoom
  feel work should be scoped as its own performance slice, with fresh evidence.
- The original **Phase 8 popovers/shared activity UI** is now split. Phase 3.5B
  owns chip-to-details and shared activity rows. Inline popovers remain a later
  optional affordance, not the next slice.
- The original **Phase 9 recording/evidence tooling** remains defer-by-need.

## Verification Policy

Use the narrowest check first for each slice, then broaden only after the slice
is stable.

Required before implementation commits that touch executable code:

- `./scripts/format.sh`
- `./check_quality.sh --all`

Additional requirements by touched area:

- Go commands through `./scripts/go.sh`.
- Generated TypeScript regenerated from Go-owned contracts.
- Production Electron workflows for chat, workflow graph, semantic graph,
  trajectory runtime, or renderer interaction changes.
- Live Codex E2E only when Codex harness/provider behavior is touched and local
  ChatGPT auth is available. Do not use `OPENAI_API_KEY` for live-provider
  checks.
- Performance-relevant graph work gets append-only reports under
  `docs/reports/performance/`.

For documentation-only changes to this plan, inspect the diff. Full format and
quality gates are not required unless executable code, generated artifacts,
scripts, manifests, or tests changed.

## Immediate Next Step

Implement Phase 3.5B from
`docs/plans/branch2_phase3_visual_grammar_plan.md`.

Agent brief:

- use branch 2 files only as design evidence, not as port targets;
- keep Phase 3.5A chip LOD, placement, caps, and compact-mode behavior intact
  unless a hit target or typed detail ref is required;
- route chip click/focus into the existing workflow node details Niri pane for
  the owning node;
- deep-link or highlight the clicked run item, approval, or workflow event when
  the typed activity record supports that reference;
- reuse the existing chat run-activity row rendering path for agent/tool
  activity, or extract only the smallest shared row component needed;
- do not create a separate chip-only details UI, embed full chat transcripts,
  fabricate chat turns, add inferred activity kinds, add backend contracts,
  add compatibility paths, or port the branch 2 trajectory details stack;
- prove the behavior with focused component/helper tests, Pixi/debug tests for
  chip hit targets and refs, deterministic Electron `workflow-activity-feed`
  coverage, screenshots, and the normal format/quality gates.

After Phase 3.5B is green, reassess whether the next product slice should be
semantic-memory usefulness or another workflow details/editor refinement based
on real use of the chip-to-details path.
