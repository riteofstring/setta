# Living Workspace Visual Redesign Plan — Neon Circuit + Neon Cells

- **Date:** June 13, 2026
- **Status:** Phases 0–6 implemented (committed through `1992781fb`), but **visual parity with the mockup is NOT met** — the running app reads as a *darker version of the pre-redesign graph*, not the neon mockup. Phases 0–6 are a sound structural skeleton; the gap is **visual calibration, not architecture** (see "Visual parity & gating" and "Known calibration gaps"). A calibration pass under the new visual-parity gate is required before continuing to Phase 7.
- **Scope:** Give the whole workspace graph a single neon aesthetic with two forms of life: the **workflow** runs like a *machine/circuit*; the **semantic** map grows like an *organism/cells*. Both share the dark-void + neon-glow language. The cartographer's real `split_node` / `merge_nodes` operations become **cell mitosis / fusion**. Extend the existing shared Pixi renderer; do not fork it or move graph state into React.
- **Mockups:**
  - `docs/mockups/workflow-graph-aesthetics.html#neon` — the chosen "Neon Circuit" direction.
  - `docs/mockups/living-workspace.html` — workflow + semantic together: cells breathing, organic tendrils, and the mitosis/fusion hero animations. (QA hook: `#divide=0.55` freezes a cell mid-mitosis.)

## Goal & guiding concept

**One aesthetic, two forms of life.** A dark void with a faint circuit grid and a soft vignette. On it:

- **Workflow = the machine.** Rigid dark-glass nodes edged in a neon stroke whose colour encodes status; edges are glowing wires carrying sharp **energy pulses along the active path** so you watch a run travel the graph.
- **Semantic = the organism.** Each node is a **living cell** — a kind-coloured neon membrane around a dark cytoplasm, a drifting nucleus, a few organelles, gentle breathing; joined by **tendrils** (semantic edges) that sway and carry slow nutrient-like signals. When the cartographer **splits** a node the cell undergoes **mitosis**; **merge** fuses two cells back into one.

Both halves glow with the same neon-on-dark palette, so the workspace reads as one living system. This is a presentation-layer change: graph topology, layout, hit-testing, selection, edge drawing, persistence, and the React/store contracts stay as they are. We change how each layer is painted, add a gated per-frame animation pass, and add a **snapshot-driven** transition coordinator for mitosis/fusion — driven by typed node-lineage fields the backend already provides (see E). The only contract change is additive optional renderer fields; no graph state moves into React and no new store/IPC event feed is introduced. This redesign **replaces** the old flat look; do not add backward-compatibility shims, legacy rendering paths, migrations, transitional adapters, dual renderers, dual-read/write paths, or A/B theme toggles.

## Pre-redesign baseline & still-current facts

> **Note (post-Phase-6):** this section documents the *starting point* and the rationale, not the current code. Several "gaps" below have since been implemented by phases 0–6 — the renderer contract now carries `status`/`kind`/lineage (Phase 0/A), there is a gated animation loop (Phase 2), and semantic nodes render as cells rather than rounded rects (Phase 5). Read items framed as gaps as **historical motivation**, not remaining work. The facts that are still the live spec for the not-yet-built Phase 7 — the typed `SemanticNode` lineage fields and the `semantic:<id>` ID-namespace caveat — remain accurate.

The renderer lives in `desktop/src/renderer/src/features/workspace-graph/` — custom Pixi.js v8 (`8.18.1`) + `pixi-viewport`. Confirmed in code at the pre-redesign baseline:

- **The renderer is shared across layers.** Its contract is `pixi-renderer.d.ts`. `workflow-graph-projection.ts` and `semantic-graph-projection.ts` both produce the same `WorkflowGraphGraph`, and `mergeWorkflowAndSemanticGraphs` (`semantic-graph-projection.ts:96`) places both in one scene. Nodes/edges carry `layer?: "semantic" | "workflow"` (`pixi-renderer.d.ts:12,33`).
- **`status`/`kind` are not in the renderer contract.** `pixi-renderer.d.ts` types nodes with `color`, `layer?`, `activity?`, `diagnostic?`, `ports?`; edges with `color?`, `alpha?`, `width?` (no `status`). Workflow `status`/`kind` and edge `status` live only on the projection's private interface (`workflow-graph-projection.ts:12-25`) and ride along untyped at runtime; the renderer consumes a **pre-resolved `node.color`/`edge.color`** and never re-derives colour.
- **Semantic nodes already carry the data the cell design needs.** `rendererGraphFromSemanticGraph` (`semantic-graph-projection.ts:49`) emits `layer: "semantic"`, `connectable: false`, a pre-resolved `color` per `SemanticNodeKind` (`semanticNodeColors`), a `color` shift for `promoted` (cyan) and `dismissed`/`merged` (grey) via `semanticNodeColor`, and an `activity` summary `{active, count, kind}` (`semanticNodeActivitySummary`) — which is already on the renderer contract and already feeds the latent `drawNodeActivityMarker`. Semantic edges carry per-`SemanticEdgeKind` colours (`semanticEdgeColors`).
- **Node geometry is a cached rounded-rect `GraphicsContext` shared by every layer** (`pixi-renderer-node-geometry.js:49`): body filled with `node.color` + white stroke, plus shadow/outlines/diagnostic/activity marker. Grid, ports, outlines, glow, and edge base stroke are likewise **layer-agnostic** — restyling them naively reskins both layers. **Cells are not rectangles**, so the semantic layer needs a new geometry path.
- **`effectsLayer` is the topmost world layer** (`pixi-renderer.js:137`, order `background → edge → node → interaction → effects`) — anything drawn there paints over bodies/ports/labels.
- **There is no animation loop.** The ticker (`pixi-renderer.js:388`) only measures frame time and diffs camera. `drawWorkspaceGlow` computes a `sin` pulse but is only invoked on graph replace / drag, so steady state is static.
- **Graph updates are a full diff-and-replace.** `replaceSceneGraph` → `sceneGraph.replaceGraph` (`pixi-renderer-scene-graph.js`) diffs node/edge *sets* and adds/removes/updates display objects. It has **no notion of a node splitting into two or two merging into one** — a split today would just pop one cell out and two in, instantly. Mitosis/fusion need an explicit transition layer over this path (see architecture E).
- **Split/merge lineage is already a typed contract — the event payload is not.** `SemanticEvent.payload` is `unknown` in generated `backend.ts` (~line 3958), so it cannot be read type-safely. But `SemanticNode` carries typed `splitFromNodeId: string`, `splitIntoNodeIds: string[]`, and `mergedIntoNodeId: string` (~lines 3341-3343). After a split, each daughter's `splitFromNodeId` points at the parent, the parent's `splitIntoNodeIds` lists the children, and **the parent is marked `dismissed` and kept** (not removed — `projection.go:315`). After a merge, likewise **the source node does not disappear** — the projection maps every `semanticGraph.nodes` entry with no dismissed/merged filter (`semantic-graph-projection.ts:76`), and `semanticNodeColor` greys any node with `dismissed` or `mergedIntoNodeId !== ""` — so the absorbed source stays in the set, now carrying `mergedIntoNodeId = survivor` and `dismissed = true`. **ID namespace caveat:** renderer node ids are prefixed `semantic:<id>` (`semanticRendererNodeId`), while these lineage fields are *raw* semantic ids — they must be reconciled (see A) or comparisons silently never match. The coordinator (E) reads these typed fields by diffing successive authoritative snapshots; it never parses the `unknown` payload.
- **Hit-testing is AABB** (`pointInsideNodeBounds`). Cells will set `width`/`height` to their diameter; box-selection of a circular cell is acceptable, but worth noting.

Relevant enums (from `@generated/backend`, import — do not mirror):

- Workflow: `WorkflowGraphNodeStatus`, `WorkflowGraphEdgeStatus (inactive|active|completed|cancelled)`, `WorkflowNodeKind`.
- Semantic: `SemanticNodeKind (concept|question|hypothesis|finding|decision|constraint)`, `SemanticEdgeKind (about|touches|supports|refutes|resolves|constrains|related_to)`.
- Drivers for cell transitions: the typed `SemanticNode` lineage fields above (`splitFromNodeId` / `splitIntoNodeIds` / `mergedIntoNodeId`). `SemanticEventType` (`node.split`/`node.merged`/…) and cartographer ops (`split_node`/`merge_nodes`) name the operations, but the renderer keys off the typed node lineage, **not** the `unknown` event payload. We never guess a split/merge from an untyped diff.

## Design language

### Shared neon foundation (both layers)

Near-black clear (`0x07080d`), a faint cyan fine grid + brighter coarse grid, and a **stage-level** radial vignette (sibling of the viewport like `labelLayer`, so it doesn't pan/zoom; redrawn on resize). One palette module owns the neon colours and motion constants for both layers. Glow is the cheap layered-stroke style (no GPU filter) by default.

### Workflow — "the machine" (Neon Circuit)

- **Glass nodes, neon edge.** Dark vertical-gradient body (≈ `0x0d1220`→`0x080b14`) with the status/kind colour as the **stroke** (not fill) plus a soft outer glow. Idle = dim stroke; live = bright neon.
- **Running = alive.** `running` (and subtly `pending`/`ready`) get a breathing pulse aura; `failed`/`recovery_required` a hotter, faster flicker; `succeeded` a steady green; `cancelled` inert grey.
- **Edges are wires; execution is light.** `active` edges carry bright additive pulses source→target; `completed` edges are a steady lit wire with **no motion**; `inactive`/`cancelled` are dim. Pulse phase from a stable hash of `edge.id` (not index).

### Semantic — "the organism" (Neon Cells)

- **Cell anatomy.** A kind-coloured neon **membrane** (a subtly organic, slightly wobbling closed outline) around a dark cytoplasm radial fill, a slowly drifting **nucleus** (ring + bright core), and a few **organelles** (small dots with Brownian jitter). A soft outer aura in the kind colour. Label sits **below** the cell.
- **Breathing & life.** Cells gently breathe (small scale oscillation) and drift around their layout home, so the map feels alive at rest. Kept deliberately cheap (see Performance).
- **Active cells.** When `node.activity.active` is true (the cartographer is exploring/editing it), the membrane gains an orbiting shimmer bead and the organelles jitter faster. This is driven by existing contract data.
- **Promoted / dismissed.** `promoted` → brighter cyan, thicker membrane, a confirm pulse. `dismissed`/`merged` → desaturated grey, organelles still, dimmed.
- **Tendrils (semantic edges).** Organic swaying filaments coloured by `SemanticEdgeKind`, carrying a **slow** nutrient-like signal — deliberately the opposite of the workflow's sharp circuit pulses. Gated on `edge.layer === "semantic"`.
- **Mitosis (hero — `split_node` / `node.split`).** Nucleus duplicates → cell elongates → membrane pinches at a glowing cleavage furrow into a peanut → separates into two daughter cells at their layout positions. The original cell is **kept as a dimmed provenance cell** (the backend marks it `dismissed`; it is not deleted, and no sibling edge is created). Labels inherit from the parent.
- **Fusion (`merge_nodes` / `node.merged`).** Two cells converge, overlap, neck forms, and fuse into one; nuclei merge to centre; the redundant tendril dissolves.

Two motion vocabularies (sharp/rigid vs slow/organic) share one palette — which reinforces the layer-gating below.

## Architecture

Five changes, each isolated. The first three are shared foundation; the last two are the semantic-specific additions.

### A. Sharpen the shared renderer contract and gate by layer (prerequisite)

Because the renderer is shared, "neon per layer" must be enforced, not assumed.

- **Extend `pixi-renderer.d.ts` with optional, layer-specific visual metadata:** workflow `status?`/`kind?` (node) and `status?` (edge); for semantic, prefer existing fields (`activity`, the pre-resolved `color`) and add explicit optional `promoted?`/`dismissed?` booleans rather than reverse-engineering them from colour. Import the generated enums. Document which layer populates what.
- **Thread the typed lineage through, in the renderer id namespace.** Add optional, semantic-only `splitFromNodeId?` / `splitIntoNodeIds?` / `mergedIntoNodeId?` to the renderer node contract and populate them in `rendererGraphFromSemanticGraph` from the already-typed `SemanticNode` — **converting each non-empty raw id with `semanticRendererNodeId`** so they match the prefixed (`semantic:<id>`) renderer node ids (empty string means "unset"; leave it empty, don't prefix it). This is what lets the coordinator (E) compare lineage against renderer node ids without the `unknown` event payload or any new store API.
- **Have each projection set `layer` explicitly** (`workflow-graph-projection.ts` currently leaves it undefined; set `layer:"workflow"`). Semantic already sets `layer:"semantic"`.
- **Gate all shared rendering on `node.layer`/`edge.layer`:** node geometry (`createNodeGeometryContextFactory`) branches `"workflow"` → glass rect, `"semantic"` → cell; edge rendering (`drawEdge`) branches wire vs tendril; node/edge motion likewise. Each layer's palette stays in its own projection (already isolated; colour is pre-resolved per layer).
- **Update the cached-geometry rebuild predicate.** `nodeContainerRequiresRebuild` (`pixi-renderer-scene-graph.js:172`) currently rebuilds only on `color`/`connectable`/`height`/`width`/`ports` change. Any new field *baked into* the cached `GraphicsContext` (e.g. `promoted`/`dismissed`/`kind` affecting the static membrane, or `status` affecting a baked stroke) must be added there — or, preferably, kept **out** of the cached context and animated via overlays so no rebuild is triggered.
- **Cell sizing:** derive the cell radius from the semantic node's `height` (≈68 → r≈34, matching the mockup); keep `width`/`height` as the AABB for hit-testing.

### B. Centralize palettes + motion constants in a neon theme module

A `workspace-neon-theme.ts` holding the shared foundation (grid/vignette/glow/selection) plus a workflow sub-palette (status/kind) and a semantic sub-palette (kind/edge-kind, promoted/dismissed). Key each off the imported enums with `satisfies Record<…,…>` so a new enum member fails the typecheck (AGENTS: exhaustiveness, no hardcoded mirrors). The projections pull values from here instead of the inline literals (`workflow-graph-projection.ts:84-104`, `semantic-graph-projection.ts:21-38`).

### C. Add the missing gated animation pass (serves both layers)

Add an `animation` step inside the existing `app.ticker.add` (`pixi-renderer.js:388`) that repaints animated graphics **only when there is something to animate**, recomputing the active set on `replaceSceneGraph` (not per frame):

- The pass runs iff some **visible** workflow node is in a pulsing status, some visible edge is `active`, some visible semantic cell is `activity.active`, or a cell transition (mitosis/fusion) is in flight. Ambient cell breathing is **off by default** (so a settled graph stays at ~0 cost) and, if enabled, is a measured, visible/zoom-gated extra (see Performance). A fully idle, all-`completed`, all-settled graph costs ~0.
- **Correct layer order for glow.** Add a dedicated **under-node glow layer between `edgeLayer` and `nodeLayer`** for node/cell auras (so they don't wash over bodies/membranes/labels); reserve `effectsLayer` for on-top halos.
- **No `GraphicsContext` rebuilds per frame.** Animate alpha/scale/tint on pooled overlay graphics. Cell **breathing is a `container.scale` oscillation** (cheap); the membrane shape is cached except during a transition; organelles/nucleus/shimmer are cheap overlay draws gated to **visible + active** cells.
- **Culling.** Nodes/cells cull via the existing node spatial index; edges/tendrils cull by **endpoint visibility** (the spatial index is node-only).
- **`prefers-reduced-motion`:** render the lit-but-static state — neon strokes and full glow, but no travelling pulses, no breathing, and **mitosis/fusion snap to their end state** instead of tweening. Also the over-budget fallback.

Motion uses `performance.now()` in the ticker (push/raf, not polling). Status/activity changes arrive via the existing `updateGraph` → `replaceSceneGraph` path.

### D. Flow & tendrils (layer-gated edge motion)

Add `edgeFlowGraphics` to `edgeLayer` and a `sampleCurvedEdge(start,end,t)` helper mirroring `drawCurvedEdge`'s control points (`pixi-renderer-helpers.js:201`). For `edge.layer==="workflow"` + `status==="active"`: bright additive pulses, stable id-hash phase. For `edge.layer==="semantic"`: a swaying filament with a single slow signal. `completed` workflow edges and resting tendrils are painted once with no per-frame work.

### E. Snapshot-driven transition coordinator for mitosis / fusion (the new hard part)

The renderer's diff-replace can't express "one cell became two." Add a thin **transition coordinator** *inside the existing* `updateGraph` → `replaceSceneGraph` path. It compares the previous rendered snapshot with the next one and reads the typed `SemanticNode` lineage fields threaded in via A — no new store→renderer API, and never the `unknown` `SemanticEvent.payload`:

- **Detect a split** when a node present in the previous snapshot *newly gains* `splitIntoNodeIds` (and becomes `dismissed`) and its listed children appear as new nodes. Per backend `projectNodeSplit` (`internal/semanticgraph/projection.go:293`) the **source is marked `dismissed` and kept** (not removed), ≥1 child is required, and **no sibling edge is created** — so the end state is *source (dismissed/grey) + children*, not "daughters replacing the parent." Run the peanut mitosis (duplicate nucleus → elongate → pinch → separate) over ~3–4 s, interpolating from the source's position to the **children's final layout positions** (already in the semantic layout), then hand off to that end state. **The peanut → two choreography only fits a 2-child split** (the canonical case); 1-child or 3+-child splits snap or use a generic transition — a product decision to confirm (see open questions).
- **Detect a merge** when a previously-present source node *newly gains* `mergedIntoNodeId` naming a present/new survivor (the source **stays** in the set, now `dismissed`/grey — it does not disappear). Converge the source into the survivor, fuse, then hand off to the snapshot's end state (survivor present; source dismissed/absorbed).
- **Distinguish new from historical lineage.** Lineage fields are permanent provenance, so a daughter loaded fresh on first paint also has `splitFromNodeId` set, and an already-merged source stays dismissed across snapshots. Only animate when the lineage relationship *first becomes present relative to the previous rendered snapshot* — never on initial load or reconnect.
- **Deterministic lineage-diff detection** — splits/merges are detected by comparing typed lineage fields across snapshots, never guessed from node-set shape/count alone (AGENTS: typed APIs, fail loud). It is still a diff; it is just not a shape heuristic.
- **Interruption policy:** if a newer snapshot arrives mid-transition, finish-to-end-state-then-apply (snap), so the renderer never desyncs from authoritative state. Specify and test this.
- **Genuinely presentation-only.** Because it runs off snapshots the renderer already receives, it adds no store/IPC contract and decides/persists nothing. (An *event*-driven alternative — generated typed `node.split`/`node.merged` payloads, or an explicit store→renderer transition hint — is only needed if we want timing independent of snapshot cadence; it would be a real contract change to specify. The lineage-diff approach avoids it.)

## Implementation phases

Workflow first establishes the shared foundation (palette, animation driver, layer-gating); semantic builds on it; mitosis/fusion last.

**Every phase below that changes pixels is gated by the automated "Visual parity gate" (next section): it is not done until its canonical scene is rendered at fit-to-view zoom and passes the gate (metric floor within tolerance of the mockup + agent-judge majority). No human review — the implementing agent runs the gate and only ships gate-passing work.** Phases 1–6 were marked done without this gate and that is exactly why the result missed the mockup — re-running them through the gate is the calibration pass.

**Milestones (independently shippable):** **M1 — Workflow neon foundation** (Phases 0–4). **M2 — Semantic cells** (Phases 5–6). **Visual calibration (Phase 6.5) gates M3** — M1+M2 must reach mockup parity at fit zoom before mitosis work begins. **M3 — Mitosis & fusion** (Phase 7), whose only cross-milestone dependency is the lineage-field threading done in M1's Phase 0/A. Polish (8) and verification (9) close out. M3 is the riskiest slice and can be planned/scheduled on its own without blocking M1–M2 shipping.

**Phase 0 — Contract, baseline & guardrails.** Section A contract + layer-gating. Performance baseline (idle / pan-zoom / drag / 500–5,000-node synthetic) recorded under `docs/reports/performance/`. **Extend the synthetic generator** with workflow status / edge-status **and** a semantic-cell scene with `activity.active` cells, so perf scenes exercise the animated paths (current synthetics emit none). Plumb `reduceMotion` + an animation on/off switch. Add debug-snapshot counters (`edgeFlowRedrawCount`, `nodePulseRedrawCount`, `cellAnimCount`, `transitionsActive`, `animationActive`).

**Phase 1 — Shared neon foundation + workflow static repaint.** `workspace-neon-theme.ts`; stage-level vignette; neon grid; dark-glass workflow node + neon status/kind stroke + base glow; neon outlines/ports/temp-edge/marquee; neon workflow edge base strokes. Replace the old workflow visuals in place; do not keep a flat-look fallback or theme flag. Verify a merged scene leaves semantic visuals unchanged for now.

**Phase 2 — Animation driver.** Section C: under-node glow layer, active-set gating, culling, reduced-motion static path. Move glow onto it. Confirm idle/finished graphs add no cost.

**Phase 3 — Workflow edge flow (hero #1).** `sampleCurvedEdge`, `edgeFlowGraphics`, `active`-edge pulses with id-hash phase.

**Phase 4 — Workflow node motion.** Pulse auras by status (running/pending/ready, failed/recovery flicker, succeeded settle, cancelled inert).

**Phase 5 — Semantic cell static look.** Layer-gated cell geometry: membrane outline (cached), cytoplasm fill, nucleus, neon stroke + aura; tendril base strokes coloured by edge kind. Map `promoted`/`dismissed` to membrane treatment. **Label-below is a label-manager change, not just geometry:** the screen-space bitmap labels (`createWorkflowGraphLabelManager`, `syncLabelPosition`) anchor to the node box today; cells need a below-the-membrane anchor and their own visibility/LOD rule. Verify workflow nodes unchanged.

**Phase 6 — Semantic ambient life.** Breathing (container scale), drifting nucleus, organelles, and the `activity.active` shimmer — all gated to visible + active and capped. Tendril sway + slow signal. Re-measure ambient cost; tune until subtle and cheap.

**Phase 6.5 — Visual calibration (BLOCKS Phase 7).** Bring the ordinary fit-to-view graph up to mockup parity — this is the salvage pass over phases 1–6, not new structure. **First deliverable, before tuning any value: the harness itself** — a deterministic, temporary-app-data, production-path render of the canonical tiny all-`not_started` draft workflow at fit zoom (`workflow-idle-fit.png`). Only with that reproducible baseline in hand (next to the mockup) does calibration begin. **First target = that exact failed case**; it must read like the mockup before anything else proceeds. Build the automated parity gate first (the dual-render metric + agent-judge pipeline above). **Freeze the negative-control fixture** (`docs/reports/visual/controls/workflow-idle-known-bad-phase6.png`) by rendering the **last pre-calibration state — the committed Phase 6 baseline (`1992781fb`)** — since the worktree already holds calibration changes (an existing dark recording also works); preserve it forever as the negative control. Then **prove the gate works via its controls** — mockup-vs-mockup passes, the frozen known-bad fixture fails, darkened/blurred variants fail — with scene-equivalent renders (same graph/crop/size/framing) and a per-scene evidence bundle. Only a gate that passes its own controls is trustworthy. Then work the "Known calibration gaps" **one change at a time, re-running the gate each time and reading the scorecard deltas**: zoom-stable glow first (the biggest lever, since world-space glow vanishes at fit zoom), then node contrast, then palette, then additive bloom (composited on the glow *layer*, not just child graphics). **Keep the performance gate attached** — additive bloom / screen-space glow via Pixi filters can be GPU-expensive; measure on the 500–5,000-node scenes and stay within the perf budget. Output: gate-**passing** scorecards + fit-zoom renders for `workflow-idle`, `workflow-running`, `semantic-cells`, and `merged` under `docs/reports/visual/`. Phase 7 does not start until every canonical scene passes the automated parity gate. No human sign-off — the gate is the verdict.

**Phase 7 — Mitosis & fusion (hero #2).** Section E snapshot-driven coordinator keyed off the typed `SemanticNode` lineage; choreograph geometry to the children's/survivor's layout positions; new-vs-historical-lineage detection; dismissed-source provenance treatment (split *and* merge keep the source); daughter-count fallback (peanut only for 2-child splits); interruption policy. Depends on the lineage threading from Phase 0/A. This is the payoff that makes the semantic map feel alive.

**Phase 8 — Polish (optional).** Per-kind glyphs (workflow) / subtle internal cell texture; the workflow→semantic "bridge" (run feeding the map) if we want it as a real visual; optional true bloom via core `BlurFilter` (no new dep) within a fixed GPU budget — `@pixi/filter-advanced-bloom` would need `./update_dependencies.sh` + `./scripts/check_supply_chain.sh`.

**Phase 9 — Verify & document.** Re-measure vs Phase 0 on the status/activity-enabled synthetic scenes; append before/after to `docs/reports/performance/`. Visual smoke coverage for: workflow neon states, active-edge flow, completed-static, cell static + ambient, active shimmer, **mitosis**, **fusion**, promoted/dismissed, reduced-motion (incl. transition-snap), and a merged workflow+semantic scene. Confirm React render counts unchanged during animation and transitions. **Visual parity:** all canonical scenes (`workflow-idle`, `workflow-running`, `semantic-cells`, `merged`, `mitosis`) **pass the automated parity gate** (metric floor + agent-judge majority), with passing scorecards + renders saved under `docs/reports/visual/`. No human review. **Scope note:** the snapshot-diff approach is intended to stay renderer-only. If any step ends up touching generated backend contracts, IPC/preload, or renderer↔store wiring, the AGENTS-required production-path E2E workflow coverage applies, not just visual smoke.

## Visual parity gate (first-class, fully automated — the user is never asked to review)

This gate was added after phases 0–6 shipped structurally correct yet looked nothing like the mockup. The hard lesson: **code review and unit tests verify structure and counts, but cannot verify "does it look like the mockup."** Every visual phase passed review and tests, yet the running app looked like a *darker* pre-redesign graph — because the render was never compared to the mockup at the real (fit-to-view) zoom. Visual parity is now a required gate, and it is **fully automated**: the user is never asked to review, compare, or sign off. Verification is the implementing agent's job, performed by the gate defined below. Work is not "done" until the gate passes; by the time the user looks, it is already gate-passing.

**Root-cause failures this gate exists to prevent (all happened):**
- **No render-vs-mockup comparison was ever in the loop.** The mockup was the spec but never diffed against output.
- **Self-certification on cherry-picked zoomed-in renders**, which flatter faint glow. The user sees the **whole-graph (fit-to-view)** zoom — where world-space glow shrinks to nothing and dark-glass nodes just read as dark.
- **Tuning/judging a stale build** (`out/` not rebuilt), so the changes weren't even in the render being looked at.

**Canonical reference scenes — always rendered at fit-to-view (whole-graph) zoom, never zoomed in:**
- `workflow-idle` — a draft workflow, all `not_started` (the dimmest and most common state; the one the user kept seeing).
- `workflow-running` — a mid-run with `running`/`succeeded`/`failed` nodes and `active` edges (where the energy lives).
- `semantic-cells` — a cell cluster with tendrils and at least one `activity.active` cell.
- `merged` — workflow + semantic in one scene.
- `mitosis` — a mid-division frame (Phase 7).

**How to render (concrete — don't leave this ambiguous):**
- Commands: `node desktop/tests/electron/run-workflows.mjs --workflow workflow-graph-smoke` and `… --workflow semantic-graph`; PNGs land under `.recordings/workflow-graph/<ts>/` and `.recordings/semantic-graph/<ts>/`. Always render against a **fresh build** (`pnpm -C desktop build`) — confirm the renderer bundle is newer than your edits, or render in dev. (A stale `out/` silently renders old code — that already wasted a session.)
- **Fit-to-view is mandatory, not automatic, and must be a named artifact.** The smoke harness's `initial.png` is zoomed *in*; capture a deliberate fit-to-view frame (whole graph in the viewport) saved as `<scene>-fit.png` (e.g., `workflow-idle-fit.png`). That is the only view that counts — zoomed-in frames are what hid the problem. If the harness can't yet emit a fit-to-view capture, **adding that capture is part of Phase 6.5, not something to hand-wave** — do not substitute whatever zoom the smoke happens to use.
- **The `workflow-idle` golden must exercise the real app/backend/renderer path — deterministically, not from personal data.** A fixture render is insufficient (the failure was on the normal app surface). But "real path" must **not** mean the developer's `~/.setta` data — that isn't reproducible. Per AGENTS (temporary dirs, production paths): add a deterministic harness that seeds **temporary app data** with the canonical tiny all-`not_started` draft workflow programmatically, then renders it through the production main/preload/renderer path at fit zoom. (`scripts/record_desktop_session.sh` against personal data is fine for a quick manual gut-check, but the *golden* must be the deterministic temp-data render.) Synthetic env-flag scenes route through the real surface (`workflow-graph-surface-helpers.ts`) and are acceptable for the other canonical scenes.
- **A render-only check ("it didn't crash / canvas isn't blank") must never be reported as parity.** That false-green produced this whole episode. Parity is decided by the automated gate below — measurement plus an agent judge — not by a liveness check and not by a human.

**The automated parity gate (no human in the loop — this is the core Phase 6.5 deliverable):**

Both sides become images and parity is decided by measurement + an agent judge; the build fails until the app matches the mockup. Three layers:

1. **Dual render.** Render the mockup (headless Chrome) and the app (electron harness) for the same canonical scene at fit zoom, each **cropped to the graph canvas** (no toolbar/legend/sidebar) at identical pixel dimensions.
2. **Deterministic metric floor (no model, fully reproducible).** Compute a visual fingerprint on both PNGs and require the app's to fall within tolerance of the **mockup's own values** — targets auto-derived from the mockup render and stored at `docs/reports/visual/<scene>.target.json`, no hand-picked numbers: background colour (median of node-free regions), mean/p95 luminance, colourfulness (Hasler–Süsstrunk), neon-hue presence (% pixels in cyan/teal/blue bands above sat+value thresholds), lit-pixel ratio (glow), and glow softness (soft halo vs hard edge). Any metric out of tolerance ⇒ non-zero exit. **The gate must demonstrably fail on the frozen known-bad fixture** (see Controls) — if it greens that, the gate itself is broken and is the first bug to fix.
3. **Agent vision verdict (the Claude/Codex-verifiable layer).** A sub-agent with image input receives both cropped PNGs + the metric scorecard + a fixed rubric and returns structured JSON — per-criterion score (background, node borders, edge glow, overall neon character), concrete deltas, pass/fail. Run it 3× and take majority. **The deterministic metrics are the hard floor that stops the agent from doing exactly what we did — confidently claiming parity when the numbers say otherwise.** The agent adds nuance and actionable deltas; it cannot override the math.

One command (e.g. `node desktop/tests/electron/run-workflows.mjs --workflow visual-parity`) renders, crops, fingerprints, runs the agent judge, and **exits non-zero on any out-of-tolerance scene**. An agent or CI runs it; it never asks the user.

**Three requirements that make the gate trustworthy (not merely present):**
- **Controls — the gate must validate itself.** Ship it with control cases in its own test: **mockup-vs-mockup must pass** (a render compared against itself); a **saved known-bad fixture must fail forever**; and **intentionally darkened / blurred copies of a passing render must fail**. The known-bad case must be a *frozen artifact*, not "whatever the branch happens to render" — that disappears the moment calibration changes the code (and the worktree already has calibration changes). Capture it from the **last pre-calibration state — the committed Phase 6 baseline (`1992781fb`)**, or an existing dark recording, save it as `docs/reports/visual/controls/workflow-idle-known-bad-phase6.png`, and require it to fail permanently. If any control is wrong (the known-bad fixture greens, or mockup-vs-mockup reds), the gate is miscalibrated and that is the first bug to fix — an uncalibrated gate is *worse* than none, because it re-creates the false-green that caused this episode.
- **Scene equivalence (required).** The mockup and the app must render the **same canonical graph shape, same canvas crop, same viewport pixel size, and same fit-to-view framing** — otherwise the metric comparison is apples-to-oranges. This needs a mockup hook (`?scene=<name>`) so the mockup draws each canonical graph (the tiny `start→work→end`, the cell cluster, etc.) at the app's framing, not its own demo graph.
- **Evidence bundle (every run, every scene).** Emit `mockup.png`, `app.png`, `side-by-side.png`, `metrics.json`, `agent-judge.json`, and the exact command that produced them, under `docs/reports/visual/<scene>/`. Every parity claim is then fully auditable and reproducible by another agent — no "trust me, it looks right."
- **Artifact-tracking policy.** `docs/reports/visual/` mixes durable gate *inputs* with transient *output*; commit the inputs, ignore the output. **Tracked (committed):** `controls/` (the frozen known-bad fixture the gate cannot run without) and the derived `*.target.json` files. **Ignored (per-run, regenerated every run):** the `<scene>/` evidence bundles. The `.gitignore` rule is `/docs/reports/visual/*/` with `!/docs/reports/visual/controls/` (and `/**`). Ignoring the whole directory, or "just the PNGs," is wrong both ways — the known-bad control *is* a PNG that must be tracked, and per-run `metrics.json`/`agent-judge.json` must *not* be.

**Tolerance derivation (deterministic — no invented thresholds).** "No hand-picked numbers" needs a procedure, or the agent just guesses thresholds. Derive each metric's tolerance band: (1) render the **mockup N≈5×** and measure each metric's spread across rerenders — that intrinsic noise (antialiasing, animation-frame timing) is the floor of "indistinguishable from the mockup"; (2) the band must be **wide enough to absorb that noise yet tight enough that every negative control fails** (the known-bad fixture and the darkened/blurred variants). The band is the largest interval that passes the mockup's own rerenders and excludes all negative controls. **If no such band exists for a metric** (mockup noise overlaps a bad control), that metric is too weak — drop or replace it. Tolerances are thus a computed, testable output of the control set, not a number anyone picked.

**Definition of done for any pixel-changing phase (in addition to typecheck / lint / unit):**
1. **Fresh build** — verify the renderer bundle is newer than the edits (or render in dev). Never trust a stale `out/`.
2. **Run the automated parity gate** for the affected canonical scene(s).
3. **The gate passes** — every metric within tolerance of the mockup target **and** agent-judge majority pass. The implementing agent owns this; the user is never asked to look.
4. Commit the **passing scorecard + render** under `docs/reports/visual/<scene>/` as the record. Regressions are caught by the gate re-running, not by anyone eyeballing.

**Render discipline (on the implementing agent):** fresh build every time; fit-to-view zoom every time; **the automated gate is the only judge of parity — never the user, never the agent's own eyeballing** (eyeballing is exactly what failed). When calibrating, change one thing at a time, re-run the gate, and read the scorecard deltas. Never report parity from anything but a passing gate; never say "it looks like neon."

**Known calibration gaps (phase-6 render vs. mockup — the visual to-do list):**
- **Glow is world-space, so it vanishes at fit zoom** — the single biggest reason the graph looks dead. Make glow zoom-stable (e.g., screen-space or scale-compensated).
- **Dark-glass nodes are too dark / low-contrast** vs. the mockup; Phase 1 removed the old colored fills and gave too little back.
- **Palette is the muted original Setta colors**, not the mockup's brighter neon variants.
- **No additive bloom that reads at realistic zoom** (the layered-stroke glow is too subtle; additive compositing must land on the glow *layer*, not just child graphics).

These are calibration against `workspace-neon-theme.ts` plus a couple of rendering decisions (chiefly zoom-stable glow). **They do not require redoing phases 0–6** — the structure is the asset; the look is the work.

## Performance budget & gating (first-class, per AGENTS)

- **Idle / finished / settled graphs cost what they cost today.** The pass runs only while something is genuinely animating; `completed` edges and resting tendrils are static.
- **Ambient cell life is gated by default:** organelles/nucleus/shimmer only for **visible + active** cells, capped; membrane geometry cached except during a transition. Cell **breathing defaults off** (settled graphs stay at ~0 cost) and is enabled only as a measured, visible/zoom-gated extra via `container.scale` — never an always-on per-cell per-frame cost on large graphs until proven negligible.
- **Work scales with what's visible and active,** never with total graph size (node-index cull + endpoint edge cull).
- **No per-frame `GraphicsContext` rebuilds.** Bounded pulses/transitions; cap concurrent transitions and `log`/expose the cap (no silent truncation).
- **Reduced motion** = static lit state with mitosis/fusion snapping to end state.
- Validate at 500 / 1,000 / 2,500 / 5,000 nodes **with status/activity variety** before done.

## Non-goals / out of scope

- **No change to graph topology, layout, cartographer logic, or store/React contracts** beyond the additive optional renderer fields in A (including the threaded `SemanticNode` lineage). The coordinator (E) runs off snapshots the renderer already receives — no new store/IPC event feed. We render decisions the backend already made.
- The transition coordinator is presentation-only; it never decides or persists splits/merges.
- **No backward compatibility, legacy support, migrations, transitional code, or old-look fallback.** Do not add compatibility shims, dual rendering paths, old-field aliases, dual-read/write behavior, feature flags for the previous visual style, or A/B toggles. If a renderer contract or visual path changes for this redesign, update the direct owner and its tests in place.
- No new runtime dependencies unless approved (bloom caveat).
- No in-app theme switcher. The theme module is an implementation boundary for the new look, not a compatibility layer.

## Risks & mitigations

- **Shipping a phase that passes tests but misses the mockup — REALIZED in phases 1–6.** This is the most expensive risk and it already happened: structure was correct, tests green, but the look was wrong and nobody compared render-to-mockup at the real zoom. Mitigated going forward by the first-class **automated Visual parity gate**: the dual-render metric floor (app fingerprint within tolerance of the mockup's) plus a majority agent-vision verdict must pass before any pixel-changing phase is "done." The implementing agent never self-certifies the look, and the user is never asked to review — the gate is the verdict, and it must fail on the frozen known-bad fixture or it is broken.
- **Retheming the wrong layer.** Mitigated by the section A layer gate, explicit `layer`, and merged-scene checks in Phases 1/5/9.
- **Mitosis/fusion desyncing from authoritative graph state.** Driven by typed `SemanticNode` lineage compared across authoritative snapshots (not untyped payloads or diff heuristics) + an explicit finish-then-apply interruption policy + tests in Phase 7/9.
- **Ambient cell life regressing large-graph perf.** Cheap breathing + visible/active gating + caps + Phase 0/9 measurement on cell-heavy synthetic scenes; fallback to active-only breathing.
- **Animation washing over membranes/labels.** Under-node glow layer + dark cytoplasm keeps nuclei/labels legible; verify in deep-zoom smoke.
- **Organic hit-testing.** AABB selection on a circular cell is acceptable; revisit only if mis-selection is noticeable.
- **Accessibility / over-stimulation.** Reduced-motion static path; subtle ambient motion; bright fast motion reserved for `active` workflow edges and in-flight transitions; colour-status backed by kind glyphs and existing diagnostics.

## Open questions for the user

1. **Ambient prominence:** calm-until-something-happens (breathing **off** by default, motion gated to active/transitions — the cheaper default that keeps settled graphs at ~0 cost), or opt-in subtle always-on breathing once measured? (Recommended: gated default; enable always-on only if measurement shows it's negligible.)
2. **The workflow→semantic bridge:** render the run visibly feeding the semantic map (as in the mockup), or keep the two layers visually separate?
3. **Mitosis trigger source (largely resolved — confirm preference):** the typed `SemanticNode` lineage fields (`splitFromNodeId`/`splitIntoNodeIds`/`mergedIntoNodeId`) already let the coordinator detect splits/merges by snapshot diff with **no new contract** — the recommended wiring. The event-driven alternative (generated typed `node.split` payloads or an explicit store→renderer transition hint) is only needed if you want timing independent of snapshot cadence. OK to go snapshot-diff?
4. **Replacement policy:** resolved — ship neon as the only workspace graph look. Do not keep the current flat look behind a flag or A/B toggle.
5. **Dismissed-source treatment:** both split and merge **keep** the source node as a `dismissed` (grey) provenance cell. Show it as a dimmed provenance cell, hide it via presentation policy, or keep it fully visible? (Decides whether mitosis/fusion ends on "parent fades to dim" vs "parent vanishes.")
6. **Non-2 splits:** the peanut mitosis only fits a 2-child split (the canonical case, and what the backend test exercises), but `projectNodeSplit` allows ≥1 child. Snap / use a generic "bud-off" transition for 1- or 3+-child splits, or constrain the product to 2-child splits?
