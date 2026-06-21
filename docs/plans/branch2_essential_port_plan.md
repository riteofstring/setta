# Branch 2 Essential Port Plan

- **Date:** June 21, 2026
- **Source branch:** `setta-3-workflow-kernel-conceptual-nodes-2`
- **Source cutoff SHA:** `7a67cf453a006fa4cfd9a9b7e9ef6298984364e4`
- **Target branch:** `setta-3-workflow-kernel-conceptual-nodes-3`
- **Shared base:** `6beddf21a554132c283255e1f1bc6c259213e537`
- **Status:** Planning; revised after external review and an initial renderer
  update-path probe. Phase 0 is a combined source-branch and target-branch
  audit, not an implementation phase.

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

Porting must therefore start with an ownership audit of the current branch
before applying any branch 2 implementation.

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

The Phase 0 manifest must therefore record prerequisite refactors explicitly.
A recommendation of "refactor first" is a valid outcome, not a failure to port.

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
cutoff. The Phase 0 manifest must cite commits relative to that SHA. Do not
silently include newer branch 2 commits.

### Capability Versus Method

The audit manifest must separate two decisions:

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

Any renderer runtime frame introduced before the full graph-surface refactor
must already obey these invariants:

- no runtime delta may cause full graph scene replacement during camera
  movement;
- no runtime delta may cause graph-shell React replacement during camera
  movement;
- camera movement may not trigger backend reads, layout persistence, or
  generated-contract refreshes;
- trajectory sprite updates must be content-only and bounded, or the runtime
  sprite work must stop and move behind the graph-surface refactor.

Do not defer these invariants to a later pan/zoom phase after adding trajectory
runtime rendering. That ordering recreates the branch 2 jank risk.

Before any trajectory renderer work starts, Phase 0 must answer this concrete
investigation question:

> When a small live data update arrives while the user is interacting with the
> current branch's graph, does the renderer update only the affected content, or
> does the data path replace/reproject/rematerialize larger graph state?

The desired end state is obvious: small updates should update small retained
objects. The investigation exists to determine whether this branch already has
that behavior or whether graph surface/runtime ownership must be refactored
before adding live trajectory rendering.

The audit must distinguish:

- Pixi app, renderer, ticker, viewport, or layer recreation;
- full graph scene replacement or rematerialization;
- React graph-shell state replacement or rerender that rebuilds graph content;
- label, edge, node, or sprite materialization churn;
- backend reads or layout persistence caused by camera movement;
- content-only updates that preserve camera, nodes, edges, labels, layers, and
  the React shell.

If small live updates are not content-only, the graph surface/runtime refactor
becomes the first implementation slice. Do not proceed to trajectory sprite
rendering until the renderer can accept bounded runtime updates without
disturbing pan/zoom.

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

### Phase 0 - Combined Audit, Ownership, And Feasibility Manifest

Produce a companion manifest before implementation:

```text
docs/plans/branch2_slice_manifest.md
```

This phase combines branch archaeology and current-branch ownership review. It
must not choose an implementation slice until both sides have been inspected.

Execution order within Phase 0 is not flat. Do the two gating investigations
first and to conclusion, because they decide the first slice and the phase
order:

1. the renderer update-path investigation,
2. the typed-metadata feasibility spike.

Only after those are answered, fill the cluster manifest. The manifest is
shallow by default: one section per required cluster, but deep only for the
cluster(s) feeding the first slice the gating investigations point to. Clusters
the first slice does not touch are recorded as `defer` or `learn-only` with the
open question, not reconstructed line by line. Do not let the nine-cluster
archaeology consume the timebox before the gating investigations are done.

For each branch 2 feature cluster, record:

- product intent,
- source commits, relative to cutoff
  `7a67cf453a006fa4cfd9a9b7e9ef6298984364e4`,
- main files touched,
- owner modules and current-branch owner files,
- contracts changed,
- generated outputs affected,
- event streams or IPC/preload surfaces involved,
- production-path tests or reports added,
- known mistakes, false-complete claims, or incomplete follow-ups,
- disposition: keep, defer, discard, or learn-only,
- method: reimplement-clean, port-diff, copy-doc-only, or do-not-port,
- prerequisite target-branch refactors, if needed,
- risk if ported before the owning boundary is settled.

Required clusters:

- workflow validation and layout ownership,
- visual language and mockups,
- semantic cartographer audit/settings,
- semantic memory usefulness,
- workspace trajectory runtime backend,
- renderer trajectory sprites/details,
- graph surface runtime and pan/zoom,
- shared agent activity UI,
- recording/performance tooling.

Current-branch ownership areas to map:

- workspace layout and surface registry,
- graph renderer lifecycle,
- pane presentation and resize handling,
- chat transcript and run activity components,
- chat streaming performance paths,
- semantic graph HTTP/event-stream paths,
- generated backend contract generator,
- Electron workflow harnesses.

Renderer update-path investigation:

- trace every current graph data ingress path that could receive live updates,
  including workflow projection, semantic graph updates, semantic/runtime event
  updates, layout updates, and any existing graph debug/runtime feeds;
- for each path, record whether a small update is content-only, full-scene
  replacement, React graph-shell replacement, Pixi app/layer recreation, label
  or edge rematerialization, or unknown;
- check what happens if the update arrives during camera movement;
- cite the files/functions and existing per-update counters or tests used for
  the answer;
- decide whether the first implementation slice may safely add trajectory
  rendering, or whether graph surface/runtime ownership must be refactored
  first.

Allowed evidence in this docs-only phase: reading source, reading existing
per-update counters such as the scene-graph updater's `updateCounts()`, and
running the production app to watch those counters during pan/zoom. All three
add no committed code. Do not add committed instrumentation in Phase 0. If an
ingress path has no existing counter or observable signal, record it as "needs
instrumentation - defer to implementation"; that is a valid Phase 0 outcome,
not a gap to fill here.

Starting evidence from an initial probe, preliminary and to be confirmed, not
treated as settled: the node ingress path is already content-only. In
`pixi-renderer-scene-graph.js`, `createWorkflowGraphSceneGraphUpdater` exposes
`replaceGraph` and `updateCounts`; `applySceneGraphNodes` diffs nodes by id,
adds only new ids, removes only absent ids, rebuilds a container only when
`nodeContainerRequiresRebuild` is true, and otherwise patches position, label,
and markers in place; per-update node and edge add/remove/update counts are
already recorded. Still open and required before declaring World A: the edge
graphics path (`replaceGraph` replaces the whole `edges` array, and whether
edge display objects diff or redraw lives in `pixi-renderer-edge-rendering.js`),
what calls `replaceGraph` and on which store/event change, whether pan/zoom
routes through React state back into `replaceGraph`, and whether the
not-yet-existing trajectory sprite path can be content-only by design.

Typed-metadata feasibility spike:

- enumerate the typed provider/tool/runtime metadata currently available on
  this branch for file reads, file writes, diffs, commands, tests, tool calls,
  approvals, reasoning summaries, assistant output, workflow execution status,
  and run item provenance;
- identify where branch 2 added metadata that this branch does not have;
- mark trajectory-runtime fidelity as blocked, partial, or feasible before any
  backend runtime implementation starts;
- explicitly reject shell-command or arbitrary-output parsing as a substitute
  for missing typed metadata.

Timebox:

- aim for enough evidence to choose the first safe slice, not exhaustive
  reconstruction of every branch 2 line;
- if a cluster cannot be resolved within the timebox, mark it `defer` or
  `learn-only` with the remaining question instead of extending Phase 0 into an
  implementation project.

Exit criteria:

- both gating investigations (renderer update-path and typed-metadata
  feasibility) completed to a decision before any deep cluster archaeology,
- one checked-in manifest section per required cluster, deep only for the
  first-slice cluster(s) and `defer`/`learn-only` for the rest,
- no committed source, test, generated-output, script, or contract changes;
  reading existing counters and running the production app to observe them is
  allowed,
- renderer update-path investigation recorded with a decision on whether graph
  surface/runtime refactor is a prerequisite,
- generated-contract conflict rule recorded for each contract-touching cluster,
- typed-metadata feasibility recorded,
- first implementation slice chosen only if the current-branch ownership audit
  supports it; otherwise the manifest must state what ownership question blocks
  slice selection.

### Phase 1 - First Slice Decision Gate

Review the Phase 0 manifest and choose one implementation slice. This is a
decision gate, not a coding phase.

The decision must record:

- product outcome for the slice,
- owning backend, renderer, IPC, and test surfaces,
- branch 2 source commits used as reference,
- method: reimplement-clean or port-diff,
- prerequisite refactors, if any, and whether they must happen before feature
  behavior lands,
- generated contracts affected,
- runtime/pan-zoom invariants affected,
- renderer update-path finding that permits the slice, or the prerequisite
  graph-surface refactor work,
- focused verification,
- production Electron verification,
- explicit sign-off owner.

Do not start feature coding if the chosen slice depends on an unresolved owner
boundary. Refactor the owner boundary first when the Phase 0 manifest shows the
current architecture is the wrong substrate.

### Phase 2 - Minimal Workflow Graph Product Baseline

Port or reimplement the smallest workflow graph behavior that is product-facing
and independent from trajectory/semantic memory:

- validation state and overlay behavior,
- edge deletion correctness,
- only the node movement, layout save, and local-first drag pieces whose
  surface/controller ownership has already been settled by Phase 0.

If graph surface/controller ownership is still unresolved, limit this phase to
validation and edge-deletion correctness. Move drag ownership, local-first
layout overlays, and save outcomes to the graph-surface runtime phase rather
than implementing them twice.

Verification:

- focused renderer/store tests for validation and any movement ownership
  included in the slice,
- production Electron workflow graph smoke path,
- no generated outputs edited by hand.

### Phase 3 - Visual Grammar Baseline

Implement only stable visual styling and product vocabulary:

- active workflow node is obvious,
- active workflow edge communicates direction/progress,
- semantic nodes use explicit status/kind markers rather than ambient biology,
- background/foundation does not change merely because semantic nodes exist.

Do not implement semantic-cell mitosis/fusion or decorative organelle motion as
default behavior.

The source of truth for idle/running/failure/approval status must be selected
by Phase 1. If the trajectory runtime does not exist yet, Phase 3 may use
static or synthetic states only, and the visual evidence must be rechecked after
trajectory runtime data lands.

Pan/zoom label/base-edge visibility is owned by the graph-surface runtime phase,
not this styling phase, unless the chosen Phase 1 slice explicitly includes the
surface controller.

Verification:

- screenshot or recording evidence for idle, running, failure, and approval
  states, using the selected source of truth or clearly marked synthetic data,
- no large visual parity harness until the visual slice is stable.

### Phase 4 - Typed Trajectory Runtime Backend

Rebuild the Go-owned trajectory runtime boundary:

- snapshot and delta contracts,
- bounded payloads,
- revision and gap behavior,
- HTTP endpoints owned by `internal/httpapi`,
- event streaming through production main/preload/renderer paths,
- generated TypeScript from Go-owned contracts.

Use typed data only. File reads, writes, diffs, commands, tests, tools,
reasoning summaries, assistant output, approvals, and workflow status should be
represented honestly from available metadata.

Do not start this phase unless Phase 0 found enough typed metadata for a useful
first trajectory slice. If metadata is partial, scope this phase to the typed
facts that are actually available and display missing precision honestly.

This backend-only phase may proceed before the graph-surface refactor only if
it does not add renderer live-update pressure. If the first demo requires
renderer-visible trajectory updates and Phase 0 found non-content-only graph
updates, move Phase 7 before the renderer portion of trajectory work.

Verification:

- Go tests for mapping typed chat/workflow/provider facts into trajectory
  records,
- HTTP endpoint tests,
- generated TypeScript regeneration,
- focused desktop typecheck.

### Phase 5 - Renderer Trajectory Sprites And Details

Add the trajectory renderer layer after the backend contract is stable:

- local trajectory runtime store,
- snapshot bootstrap and delta application,
- bounded sprite pools,
- workflow-node anchoring,
- recent unanchored fallback lane,
- collapse behavior for crowded sprite groups,
- workflow-node details that show activity provenance.

Before sprite rendering lands, add hard gates for the runtime/pan-zoom
invariants listed above:

- trajectory delta application does not full-replace the graph scene;
- trajectory delta application does not cause graph-shell React replacement
  during camera movement;
- camera movement does not request trajectory, semantic, workflow, or generated
  contract reads;
- sprite materialization and update work is bounded to sprite changes and does
  not rebuild unrelated graph content.

If the current graph ownership cannot satisfy those gates, stop this phase and
move the graph-surface runtime phase earlier.

This phase is not allowed to discover the replacement problem by accident. The
Phase 0 renderer update-path investigation must already say whether trajectory
sprite rendering is safe on the current graph surface, or whether Phase 7 is a
prerequisite.

Verification:

- renderer store tests for buffering, coalescing, gap reloads, and workspace
  filtering,
- Pixi renderer tests for bounded sprite materialization,
- focused pan/zoom invariant tests covering trajectory delta arrival during
  camera movement,
- production Electron workflow showing typed file read/write/diff/command
  activity before semantic nodes exist.

### Phase 6 - Semantic Memory Usefulness

Port the durable semantic-memory policy after trajectory facts exist:

- evidence candidates from typed trajectory facts,
- `whyItExists` and `futureUse` for durable nodes,
- validation that rejects weak/process-only automatic nodes,
- source refs and source coverage in details,
- context-pack delivery tracking if the current branch still needs it.

Keep cartographer settings UI minimal until this behavior is proven.

Verification:

- semanticgraph tests for validation and evidence policy,
- renderer details tests for usefulness/source display,
- production semantic-cartographer workflow through Electron paths.

### Phase 7 - Graph Surface Runtime And Pan/Zoom Fast Path

Integrate branch 2's verified graph interaction lessons with this branch's
current surface registry and pane-resize work:

- one graph controller per surface,
- no duplicate Pixi app/ticker/viewport for a surface,
- camera movement does not trigger backend reads, React graph replacement,
  layout writes, or full label sync,
- labels and base edges remain visible during camera movement,
- wheel/input diagnostics stay off the hot path,
- retained/dirty geometry work is explicit before claiming pan/zoom complete.

This phase should not inherit branch 2's false-complete status. Treat wheel
hot-path cleanup and retained dirty work as open until verified on this branch.

If Phase 0 finds that small live data updates currently cause full scene
replacement, React graph-shell replacement, Pixi layer recreation, or visible
materialization churn during camera movement, this phase moves before renderer
trajectory sprites and becomes the first implementation slice.

Verification:

- focused renderer tests for controller lifecycle and camera invariants,
- deterministic Electron pan/zoom workflow,
- performance report under `docs/reports/performance/`,
- reference MacBook trackpad sign-off for physical feel. If unavailable, the
  phase remains open with an explicit risk note.

### Phase 8 - Activity Sprite Popovers And Shared Agent Activity UI

Once trajectory sprites and workflow-node details exist:

- extract shared run/activity leaf components from chat where still applicable,
- render workflow details through those components,
- make trajectory sprites clickable with retained hit targets,
- open an inline popover focused on the clicked run item,
- link from the popover to the owning workflow node details.

Do not embed the whole chat transcript in workflow details and do not fabricate
conversation turns from flat workflow run-item data.

Verification:

- component tests proving shared component reuse,
- renderer interaction tests for sprite hover/click,
- chat streaming regression coverage so shared activity extraction does not
  undo this branch's high-refresh chat-performance work,
- production Electron workflow for sprite popover, details link, and dismissal.

### Phase 9 - Recording And Evidence Tooling

Port only the evidence tooling needed to debug the implemented slices:

- compact incident reports for pan/zoom,
- node-drag reports with moved ids and owners,
- sprite-click reports with item ids and details targets,
- graph replacement and label/edge visibility-drop summaries.

Do not port broad visual parity targets or phase-loop scripts until there is a
stable product slice that needs them.

Verification:

- parser tests fail when required evidence is missing,
- one production recording can explain pan/zoom delay, flashing, unintended
  movement, or sprite-click behavior without manual JSON inspection.

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

Execute Phase 0 as a documentation-only audit and create:

```text
docs/plans/branch2_slice_manifest.md
```

The Phase 0 agent brief should be:

- use source cutoff `7a67cf453a006fa4cfd9a9b7e9ef6298984364e4`;
- do not port code;
- do not cherry-pick;
- do not edit generated outputs;
- do not change source, tests, contracts, scripts, package manifests, or
  dependency manifests;
- do the two gating investigations first and to conclusion - the renderer
  update-path investigation and the typed-metadata feasibility spike - because
  they decide the first slice;
- get empirical renderer evidence from existing per-update counters and from
  running the production app to observe them; do not add committed
  instrumentation; record "needs instrumentation - defer to implementation"
  when no counter exists;
- inspect branch 2 clusters and this branch's current owner files, going deep
  only for the first-slice cluster(s) and marking the rest `defer`/`learn-only`;
- record both `disposition` and `method` for every cluster;
- include generated-contract conflict notes for every contract-touching cluster;
- record prerequisite target-branch refactors when current architecture is the
  wrong substrate;
- mark unresolved ownership as a blocker instead of choosing a slice on
  assumptions;
- run only docs-only diff/whitespace checks unless executable files were
  accidentally changed.

The first implementation slice should be selected only after the manifest
proves its ownership boundary. The renderer update-path finding collapses the
choice to a binary:

- World A - if small live updates are already content-only on the paths that
  matter (the node path already is), the first slice is the typed trajectory
  runtime spine: the Go-owned trajectory backend plus the smallest renderer
  surface that shows typed file read/write/diff/command activity. This is the
  highest-value slice and the cleanest ownership story, since
  `internal/workspacetrajectory` does not exist on this branch yet and is
  purely additive.
- World B - if any path that matters (edges, the `replaceGraph` trigger, or
  camera movement) causes full-scene replacement, React graph-shell
  replacement, Pixi layer recreation, or materialization churn, the first slice
  is the graph-surface/runtime refactor (Phase 7), done before any trajectory
  rendering.

Workflow validation/edge-deletion correctness and semantic-memory usefulness
are real but are not first-slice candidates: the first is lower-value, the
second is downstream of trajectory evidence. Record them as later slices.
