# Living Workspace Visual Redesign Plan — Neon Circuit + Neon Cells

- **Date:** June 13, 2026
- **Status:** Proposed; not started (supersedes the workflow-only "Neon Circuit" draft)
- **Scope:** Give the whole workspace graph a single neon aesthetic with two forms of life: the **workflow** runs like a *machine/circuit*; the **semantic** map grows like an *organism/cells*. Both share the dark-void + neon-glow language. The cartographer's real `split_node` / `merge_nodes` operations become **cell mitosis / fusion**. Extend the existing shared Pixi renderer; do not fork it or move graph state into React.
- **Mockups:**
  - `docs/mockups/workflow-graph-aesthetics.html#neon` — the chosen "Neon Circuit" direction.
  - `docs/mockups/living-workspace.html` — workflow + semantic together: cells breathing, organic tendrils, and the mitosis/fusion hero animations. (QA hook: `#divide=0.55` freezes a cell mid-mitosis.)

## Goal & guiding concept

**One aesthetic, two forms of life.** A dark void with a faint circuit grid and a soft vignette. On it:

- **Workflow = the machine.** Rigid dark-glass nodes edged in a neon stroke whose colour encodes status; edges are glowing wires carrying sharp **energy pulses along the active path** so you watch a run travel the graph.
- **Semantic = the organism.** Each node is a **living cell** — a kind-coloured neon membrane around a dark cytoplasm, a drifting nucleus, a few organelles, gentle breathing; joined by **tendrils** (semantic edges) that sway and carry slow nutrient-like signals. When the cartographer **splits** a node the cell undergoes **mitosis**; **merge** fuses two cells back into one.

Both halves glow with the same neon-on-dark palette, so the workspace reads as one living system. This is a presentation-layer change: graph topology, layout, hit-testing, selection, edge drawing, persistence, and the React/store contracts stay as they are. We change how each layer is painted, add a gated per-frame animation pass, and add a **snapshot-driven** transition coordinator for mitosis/fusion — driven by typed node-lineage fields the backend already provides (see E). The only contract change is additive optional renderer fields; no graph state moves into React and no new store/IPC event feed is introduced.

## Current state (what we're changing)

The renderer lives in `desktop/src/renderer/src/features/workspace-graph/` — custom Pixi.js v8 (`8.18.1`) + `pixi-viewport`. Confirmed in code:

- **The renderer is shared across layers.** Its contract is `pixi-renderer.d.ts`. `workflow-graph-projection.ts` and `semantic-graph-projection.ts` both produce the same `WorkflowGraphGraph`, and `mergeWorkflowAndSemanticGraphs` (`semantic-graph-projection.ts:96`) places both in one scene. Nodes/edges carry `layer?: "semantic" | "workflow"` (`pixi-renderer.d.ts:12,33`).
- **`status`/`kind` are not in the renderer contract.** `pixi-renderer.d.ts` types nodes with `color`, `layer?`, `activity?`, `diagnostic?`, `ports?`; edges with `color?`, `alpha?`, `width?` (no `status`). Workflow `status`/`kind` and edge `status` live only on the projection's private interface (`workflow-graph-projection.ts:12-25`) and ride along untyped at runtime; the renderer consumes a **pre-resolved `node.color`/`edge.color`** and never re-derives colour.
- **Semantic nodes already carry the data the cell design needs.** `rendererGraphFromSemanticGraph` (`semantic-graph-projection.ts:49`) emits `layer: "semantic"`, `connectable: false`, a pre-resolved `color` per `SemanticNodeKind` (`semanticNodeColors`), a `color` shift for `promoted` (cyan) and `dismissed`/`merged` (grey) via `semanticNodeColor`, and an `activity` summary `{active, count, kind}` (`semanticNodeActivitySummary`) — which is already on the renderer contract and already feeds the latent `drawNodeActivityMarker`. Semantic edges carry per-`SemanticEdgeKind` colours (`semanticEdgeColors`).
- **Node geometry is a cached rounded-rect `GraphicsContext` shared by every layer** (`pixi-renderer-node-geometry.js:49`): body filled with `node.color` + white stroke, plus shadow/outlines/diagnostic/activity marker. Grid, ports, outlines, glow, and edge base stroke are likewise **layer-agnostic** — restyling them naively reskins both layers. **Cells are not rectangles**, so the semantic layer needs a new geometry path.
- **`effectsLayer` is the topmost world layer** (`pixi-renderer.js:137`, order `background → edge → node → interaction → effects`) — anything drawn there paints over bodies/ports/labels.
- **There is no animation loop.** The ticker (`pixi-renderer.js:388`) only measures frame time and diffs camera. `drawWorkspaceGlow` computes a `sin` pulse but is only invoked on graph replace / drag, so steady state is static.
- **Graph updates are a full diff-and-replace.** `replaceSceneGraph` → `sceneGraph.replaceGraph` (`pixi-renderer-scene-graph.js`) diffs node/edge *sets* and adds/removes/updates display objects. It has **no notion of a node splitting into two or two merging into one** — a split today would just pop one cell out and two in, instantly. Mitosis/fusion need an explicit transition layer over this path (see architecture E).
- **Split/merge lineage is already a typed contract — the event payload is not.** `SemanticEvent.payload` is `unknown` in generated `backend.ts` (line ~3958), so it cannot be read type-safely. But `SemanticNode` carries typed `splitFromNodeId: string`, `splitIntoNodeIds: string[]`, and `mergedIntoNodeId: string` (lines ~3341-3343). After a split each daughter's `splitFromNodeId` points at the parent and the parent's `splitIntoNodeIds` lists the children; after a merge the absorbed node's `mergedIntoNodeId` names the survivor. The coordinator (E) reads these typed fields by diffing successive authoritative snapshots — it never parses the `unknown` payload.
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
- **Mitosis (hero — `split_node` / `node.split`).** Nucleus duplicates → cell elongates → membrane pinches at a glowing cleavage furrow into a peanut → separates into two daughter cells that settle into their layout positions, bonded by a new sibling tendril. Labels inherit from the parent.
- **Fusion (`merge_nodes` / `node.merged`).** Two cells converge, overlap, neck forms, and fuse into one; nuclei merge to centre; the redundant tendril dissolves.

Two motion vocabularies (sharp/rigid vs slow/organic) share one palette — which reinforces the layer-gating below.

## Architecture

Five changes, each isolated. The first three are shared foundation; the last two are the semantic-specific additions.

### A. Sharpen the shared renderer contract and gate by layer (prerequisite)

Because the renderer is shared, "neon per layer" must be enforced, not assumed.

- **Extend `pixi-renderer.d.ts` with optional, layer-specific visual metadata:** workflow `status?`/`kind?` (node) and `status?` (edge); for semantic, prefer existing fields (`activity`, the pre-resolved `color`) and add explicit optional `promoted?`/`dismissed?` booleans rather than reverse-engineering them from colour. Import the generated enums. Document which layer populates what.
- **Thread the typed lineage through.** Add optional, semantic-only `splitFromNodeId?` / `splitIntoNodeIds?` / `mergedIntoNodeId?` to the renderer node contract and populate them in `rendererGraphFromSemanticGraph` from the already-typed `SemanticNode`. This is what lets the coordinator (E) detect transitions without the `unknown` event payload or any new store API.
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

- **Detect a split** when the next snapshot introduces ≥2 nodes whose `splitFromNodeId` equals a node present in the previous snapshot (now carrying `splitIntoNodeIds`). Hold the parent cell, run the mitosis choreography (duplicate nucleus → elongate → pinch → separate) over ~3–4 s, interpolating the lobes from the parent's position to the **children's final layout positions** (already in the semantic layout), then hand off to the normal scene graph (daughters + sibling edge).
- **Detect a merge** when a previously-present node disappears with `mergedIntoNodeId` naming a surviving node. Converge, fuse, hand off to the survivor.
- **Distinguish new from historical lineage.** Lineage fields are permanent provenance, so a daughter loaded fresh on first paint also has `splitFromNodeId` set. Only animate when the lineage relationship is *newly present relative to the previous rendered snapshot* — never on initial load or reconnect. This is a deterministic diff, not a heuristic.
- **No untyped inference** — detection uses typed lineage fields and node presence, never a guess that a node-set diff "looks like" a split (AGENTS: typed APIs, fail loud).
- **Interruption policy:** if a newer snapshot arrives mid-transition, finish-to-end-state-then-apply (snap), so the renderer never desyncs from authoritative state. Specify and test this.
- **Genuinely presentation-only.** Because it runs off snapshots the renderer already receives, it adds no store/IPC contract and decides/persists nothing. (An *event*-driven alternative — generated typed `node.split`/`node.merged` payloads, or an explicit store→renderer transition hint — is only needed if we want timing independent of snapshot cadence; it would be a real contract change to specify. The lineage-diff approach avoids it.)

## Implementation phases

Workflow first establishes the shared foundation (palette, animation driver, layer-gating); semantic builds on it; mitosis/fusion last.

**Milestones (independently shippable):** **M1 — Workflow neon foundation** (Phases 0–4). **M2 — Semantic cells** (Phases 5–6). **M3 — Mitosis & fusion** (Phase 7), whose only cross-milestone dependency is the lineage-field threading done in M1's Phase 0/A. Polish (8) and verification (9) close out. M3 is the riskiest slice and can be planned/scheduled on its own without blocking M1–M2 shipping.

**Phase 0 — Contract, baseline & guardrails.** Section A contract + layer-gating. Performance baseline (idle / pan-zoom / drag / 500–5,000-node synthetic) recorded under `docs/reports/performance/`. **Extend the synthetic generator** with workflow status / edge-status **and** a semantic-cell scene with `activity.active` cells, so perf scenes exercise the animated paths (current synthetics emit none). Plumb `reduceMotion` + an animation on/off switch. Add debug-snapshot counters (`edgeFlowRedrawCount`, `nodePulseRedrawCount`, `cellAnimCount`, `transitionsActive`, `animationActive`).

**Phase 1 — Shared neon foundation + workflow static repaint.** `workspace-neon-theme.ts`; stage-level vignette; neon grid; dark-glass workflow node + neon status/kind stroke + base glow; neon outlines/ports/temp-edge/marquee; neon workflow edge base strokes. Verify a merged scene leaves semantic visuals unchanged for now.

**Phase 2 — Animation driver.** Section C: under-node glow layer, active-set gating, culling, reduced-motion static path. Move glow onto it. Confirm idle/finished graphs add no cost.

**Phase 3 — Workflow edge flow (hero #1).** `sampleCurvedEdge`, `edgeFlowGraphics`, `active`-edge pulses with id-hash phase.

**Phase 4 — Workflow node motion.** Pulse auras by status (running/pending/ready, failed/recovery flicker, succeeded settle, cancelled inert).

**Phase 5 — Semantic cell static look.** Layer-gated cell geometry: membrane outline (cached), cytoplasm fill, nucleus, neon stroke + aura; tendril base strokes coloured by edge kind. Map `promoted`/`dismissed` to membrane treatment. **Label-below is a label-manager change, not just geometry:** the screen-space bitmap labels (`createWorkflowGraphLabelManager`, `syncLabelPosition`) anchor to the node box today; cells need a below-the-membrane anchor and their own visibility/LOD rule. Verify workflow nodes unchanged.

**Phase 6 — Semantic ambient life.** Breathing (container scale), drifting nucleus, organelles, and the `activity.active` shimmer — all gated to visible + active and capped. Tendril sway + slow signal. Re-measure ambient cost; tune until subtle and cheap.

**Phase 7 — Mitosis & fusion (hero #2).** Section E snapshot-driven coordinator keyed off the typed `SemanticNode` lineage; choreograph geometry to the children's/survivor's layout positions; new-vs-historical-lineage detection; interruption policy; sibling-bond creation. Depends on the lineage threading from Phase 0/A. This is the payoff that makes the semantic map feel alive.

**Phase 8 — Polish (optional).** Per-kind glyphs (workflow) / subtle internal cell texture; the workflow→semantic "bridge" (run feeding the map) if we want it as a real visual; optional true bloom via core `BlurFilter` (no new dep) within a fixed GPU budget — `@pixi/filter-advanced-bloom` would need `./update_dependencies.sh` + `./scripts/check_supply_chain.sh`.

**Phase 9 — Verify & document.** Re-measure vs Phase 0 on the status/activity-enabled synthetic scenes; append before/after to `docs/reports/performance/`. Visual smoke coverage for: workflow neon states, active-edge flow, completed-static, cell static + ambient, active shimmer, **mitosis**, **fusion**, promoted/dismissed, reduced-motion (incl. transition-snap), and a merged workflow+semantic scene. Confirm React render counts unchanged during animation and transitions. **Scope note:** the snapshot-diff approach is intended to stay renderer-only. If any step ends up touching generated backend contracts, IPC/preload, or renderer↔store wiring, the AGENTS-required production-path E2E workflow coverage applies, not just visual smoke.

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
- No new runtime dependencies unless approved (bloom caveat).
- No in-app theme switcher unless requested; the theme module is the seam.

## Risks & mitigations

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
4. **Replace vs toggle** for the whole workspace look: ship neon as the only look, or keep the current flat look behind a flag for A/B? (Recommended: replace.)
