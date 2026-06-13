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

Both halves glow with the same neon-on-dark palette, so the workspace reads as one living system. This is a presentation-layer change: graph topology, layout, hit-testing, selection, edge drawing, persistence, and the React/store contracts stay as they are. We change how each layer is painted, add a gated per-frame animation pass, and add an event-driven transition coordinator for mitosis/fusion.

## Current state (what we're changing)

The renderer lives in `desktop/src/renderer/src/features/workspace-graph/` — custom Pixi.js v8 (`8.18.1`) + `pixi-viewport`. Confirmed in code:

- **The renderer is shared across layers.** Its contract is `pixi-renderer.d.ts`. `workflow-graph-projection.ts` and `semantic-graph-projection.ts` both produce the same `WorkflowGraphGraph`, and `mergeWorkflowAndSemanticGraphs` (`semantic-graph-projection.ts:96`) places both in one scene. Nodes/edges carry `layer?: "semantic" | "workflow"` (`pixi-renderer.d.ts:12,33`).
- **`status`/`kind` are not in the renderer contract.** `pixi-renderer.d.ts` types nodes with `color`, `layer?`, `activity?`, `diagnostic?`, `ports?`; edges with `color?`, `alpha?`, `width?` (no `status`). Workflow `status`/`kind` and edge `status` live only on the projection's private interface (`workflow-graph-projection.ts:12-25`) and ride along untyped at runtime; the renderer consumes a **pre-resolved `node.color`/`edge.color`** and never re-derives colour.
- **Semantic nodes already carry the data the cell design needs.** `rendererGraphFromSemanticGraph` (`semantic-graph-projection.ts:49`) emits `layer: "semantic"`, `connectable: false`, a pre-resolved `color` per `SemanticNodeKind` (`semanticNodeColors`), a `color` shift for `promoted` (cyan) and `dismissed`/`merged` (grey) via `semanticNodeColor`, and an `activity` summary `{active, count, kind}` (`semanticNodeActivitySummary`) — which is already on the renderer contract and already feeds the latent `drawNodeActivityMarker`. Semantic edges carry per-`SemanticEdgeKind` colours (`semanticEdgeColors`).
- **Node geometry is a cached rounded-rect `GraphicsContext` shared by every layer** (`pixi-renderer-node-geometry.js:49`): body filled with `node.color` + white stroke, plus shadow/outlines/diagnostic/activity marker. Grid, ports, outlines, glow, and edge base stroke are likewise **layer-agnostic** — restyling them naively reskins both layers. **Cells are not rectangles**, so the semantic layer needs a new geometry path.
- **`effectsLayer` is the topmost world layer** (`pixi-renderer.js:137`, order `background → edge → node → interaction → effects`) — anything drawn there paints over bodies/ports/labels.
- **There is no animation loop.** The ticker (`pixi-renderer.js:388`) only measures frame time and diffs camera. `drawWorkspaceGlow` computes a `sin` pulse but is only invoked on graph replace / drag, so steady state is static.
- **Graph updates are a full diff-and-replace.** `replaceSceneGraph` → `sceneGraph.replaceGraph` (`pixi-renderer-scene-graph.js`) diffs node/edge *sets* and adds/removes/updates display objects. It has **no notion of a node splitting into two or two merging into one** — a split today would just pop one cell out and two in, instantly. Mitosis/fusion need an explicit, event-driven transition (see architecture E).
- **Hit-testing is AABB** (`pointInsideNodeBounds`). Cells will set `width`/`height` to their diameter; box-selection of a circular cell is acceptable, but worth noting.

Relevant enums (from `@generated/backend`, import — do not mirror):

- Workflow: `WorkflowGraphNodeStatus`, `WorkflowGraphEdgeStatus (inactive|active|completed|cancelled)`, `WorkflowNodeKind`.
- Semantic: `SemanticNodeKind (concept|question|hypothesis|finding|decision|constraint)`, `SemanticEdgeKind (about|touches|supports|refutes|resolves|constrains|related_to)`.
- Drivers for cell transitions: `SemanticEventType` includes `node.split`, `node.merged`, `node.promoted`, `node.dismissed`, `activity.started`, `activity.ended`; cartographer ops include `split_node`, `merge_nodes`, `mark_resolved`. **These typed events are the trigger for mitosis/fusion — we do not infer them by diffing node sets.**

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
- **Have each projection set `layer` explicitly** (`workflow-graph-projection.ts` currently leaves it undefined; set `layer:"workflow"`). Semantic already sets `layer:"semantic"`.
- **Gate all shared rendering on `node.layer`/`edge.layer`:** node geometry (`createNodeGeometryContextFactory`) branches `"workflow"` → glass rect, `"semantic"` → cell; edge rendering (`drawEdge`) branches wire vs tendril; node/edge motion likewise. Each layer's palette stays in its own projection (already isolated; colour is pre-resolved per layer).
- **Cell sizing:** derive the cell radius from the semantic node's `height` (≈68 → r≈34, matching the mockup); keep `width`/`height` as the AABB for hit-testing.

### B. Centralize palettes + motion constants in a neon theme module

A `workspace-neon-theme.ts` holding the shared foundation (grid/vignette/glow/selection) plus a workflow sub-palette (status/kind) and a semantic sub-palette (kind/edge-kind, promoted/dismissed). Key each off the imported enums with `satisfies Record<…,…>` so a new enum member fails the typecheck (AGENTS: exhaustiveness, no hardcoded mirrors). The projections pull values from here instead of the inline literals (`workflow-graph-projection.ts:84-104`, `semantic-graph-projection.ts:21-38`).

### C. Add the missing gated animation pass (serves both layers)

Add an `animation` step inside the existing `app.ticker.add` (`pixi-renderer.js:388`) that repaints animated graphics **only when there is something to animate**, recomputing the active set on `replaceSceneGraph` (not per frame):

- The pass runs iff some **visible** workflow node is in a pulsing status, some visible edge is `active`, some visible semantic cell is `activity.active`, ambient cell breathing is enabled, or a cell transition (mitosis/fusion) is in flight. A fully idle, all-`completed`, all-settled graph costs ~0.
- **Correct layer order for glow.** Add a dedicated **under-node glow layer between `edgeLayer` and `nodeLayer`** for node/cell auras (so they don't wash over bodies/membranes/labels); reserve `effectsLayer` for on-top halos.
- **No `GraphicsContext` rebuilds per frame.** Animate alpha/scale/tint on pooled overlay graphics. Cell **breathing is a `container.scale` oscillation** (cheap); the membrane shape is cached except during a transition; organelles/nucleus/shimmer are cheap overlay draws gated to **visible + active** cells.
- **Culling.** Nodes/cells cull via the existing node spatial index; edges/tendrils cull by **endpoint visibility** (the spatial index is node-only).
- **`prefers-reduced-motion`:** render the lit-but-static state — neon strokes and full glow, but no travelling pulses, no breathing, and **mitosis/fusion snap to their end state** instead of tweening. Also the over-budget fallback.

Motion uses `performance.now()` in the ticker (push/raf, not polling). Status/activity changes arrive via the existing `updateGraph` → `replaceSceneGraph` path.

### D. Flow & tendrils (layer-gated edge motion)

Add `edgeFlowGraphics` to `edgeLayer` and a `sampleCurvedEdge(start,end,t)` helper mirroring `drawCurvedEdge`'s control points (`pixi-renderer-helpers.js:201`). For `edge.layer==="workflow"` + `status==="active"`: bright additive pulses, stable id-hash phase. For `edge.layer==="semantic"`: a swaying filament with a single slow signal. `completed` workflow edges and resting tendrils are painted once with no per-frame work.

### E. Event-driven transition coordinator for mitosis / fusion (the new hard part)

The renderer's diff-replace can't express "one cell became two." Add a thin **transition coordinator** that the store feeds with **typed semantic events** (`node.split` carrying parent → child ids; `node.merged` carrying the surviving id) alongside the new graph snapshot:

- On `node.split`: hold the parent cell, run the mitosis choreography (duplicate nucleus → elongate → pinch → separate) over ~3–4s, interpolating the two lobes from the parent's position to the **children's final layout positions** (from the backend layout), then hand off to the normal scene graph showing the two daughters + sibling edge.
- On `node.merged`: converge the two cells, fuse, hand off to the single surviving cell.
- **No heuristic inference** — transitions come from protocol fields, never from guessing which node-set diff "looks like" a split (AGENTS: use typed APIs, fail loud).
- **Interruption policy:** if a newer update arrives mid-transition, finish-to-end-state-then-apply (snap), so the renderer never desyncs from authoritative graph state. Define this explicitly and cover it in tests.
- This coordinator is presentation-only: it choreographs how an already-decided graph mutation appears; it does not decide or persist anything.

## Implementation phases

Workflow first establishes the shared foundation (palette, animation driver, layer-gating); semantic builds on it; mitosis/fusion last.

**Phase 0 — Contract, baseline & guardrails.** Section A contract + layer-gating. Performance baseline (idle / pan-zoom / drag / 500–5,000-node synthetic) recorded under `docs/reports/performance/`. **Extend the synthetic generator** with workflow status / edge-status **and** a semantic-cell scene with `activity.active` cells, so perf scenes exercise the animated paths (current synthetics emit none). Plumb `reduceMotion` + an animation on/off switch. Add debug-snapshot counters (`edgeFlowRedrawCount`, `nodePulseRedrawCount`, `cellAnimCount`, `transitionsActive`, `animationActive`).

**Phase 1 — Shared neon foundation + workflow static repaint.** `workspace-neon-theme.ts`; stage-level vignette; neon grid; dark-glass workflow node + neon status/kind stroke + base glow; neon outlines/ports/temp-edge/marquee; neon workflow edge base strokes. Verify a merged scene leaves semantic visuals unchanged for now.

**Phase 2 — Animation driver.** Section C: under-node glow layer, active-set gating, culling, reduced-motion static path. Move glow onto it. Confirm idle/finished graphs add no cost.

**Phase 3 — Workflow edge flow (hero #1).** `sampleCurvedEdge`, `edgeFlowGraphics`, `active`-edge pulses with id-hash phase.

**Phase 4 — Workflow node motion.** Pulse auras by status (running/pending/ready, failed/recovery flicker, succeeded settle, cancelled inert).

**Phase 5 — Semantic cell static look.** Layer-gated cell geometry: membrane outline (cached), cytoplasm fill, nucleus, neon stroke + aura, label-below; tendril base strokes coloured by edge kind. Map `promoted`/`dismissed` to membrane treatment. Verify workflow nodes unchanged.

**Phase 6 — Semantic ambient life.** Breathing (container scale), drifting nucleus, organelles, and the `activity.active` shimmer — all gated to visible + active and capped. Tendril sway + slow signal. Re-measure ambient cost; tune until subtle and cheap.

**Phase 7 — Mitosis & fusion (hero #2).** Section E transition coordinator wired to `node.split` / `node.merged`; choreograph geometry to the children's/survivor's layout positions; interruption policy; sibling-bond creation. This is the payoff that makes the semantic map feel alive.

**Phase 8 — Polish (optional).** Per-kind glyphs (workflow) / subtle internal cell texture; the workflow→semantic "bridge" (run feeding the map) if we want it as a real visual; optional true bloom via core `BlurFilter` (no new dep) within a fixed GPU budget — `@pixi/filter-advanced-bloom` would need `./update_dependencies.sh` + `./scripts/check_supply_chain.sh`.

**Phase 9 — Verify & document.** Re-measure vs Phase 0 on the status/activity-enabled synthetic scenes; append before/after to `docs/reports/performance/`. Visual smoke coverage for: workflow neon states, active-edge flow, completed-static, cell static + ambient, active shimmer, **mitosis**, **fusion**, promoted/dismissed, reduced-motion (incl. transition-snap), and a merged workflow+semantic scene. Confirm React render counts unchanged during animation and transitions.

## Performance budget & gating (first-class, per AGENTS)

- **Idle / finished / settled graphs cost what they cost today.** The pass runs only while something is genuinely animating; `completed` edges and resting tendrils are static.
- **Ambient cell life is deliberately cheap:** breathing via `container.scale`; organelles/nucleus/shimmer only for **visible + active** cells and capped; membrane geometry cached except during a transition. If always-on breathing ever shows cost on large semantic graphs, gate it behind zoom/visibility or make it active-only.
- **Work scales with what's visible and active,** never with total graph size (node-index cull + endpoint edge cull).
- **No per-frame `GraphicsContext` rebuilds.** Bounded pulses/transitions; cap concurrent transitions and `log`/expose the cap (no silent truncation).
- **Reduced motion** = static lit state with mitosis/fusion snapping to end state.
- Validate at 500 / 1,000 / 2,500 / 5,000 nodes **with status/activity variety** before done.

## Non-goals / out of scope

- **No change to graph topology, layout, cartographer logic, or store/React contracts** beyond the additive optional fields (A) and the typed transition events fed to the coordinator (E). We render decisions the backend already made.
- The transition coordinator is presentation-only; it never decides or persists splits/merges.
- No new runtime dependencies unless approved (bloom caveat).
- No in-app theme switcher unless requested; the theme module is the seam.

## Risks & mitigations

- **Retheming the wrong layer.** Mitigated by the section A layer gate, explicit `layer`, and merged-scene checks in Phases 1/5/9.
- **Mitosis/fusion desyncing from authoritative graph state.** Driven by typed events (not diff heuristics) + an explicit finish-then-apply interruption policy + tests in Phase 7/9.
- **Ambient cell life regressing large-graph perf.** Cheap breathing + visible/active gating + caps + Phase 0/9 measurement on cell-heavy synthetic scenes; fallback to active-only breathing.
- **Animation washing over membranes/labels.** Under-node glow layer + dark cytoplasm keeps nuclei/labels legible; verify in deep-zoom smoke.
- **Organic hit-testing.** AABB selection on a circular cell is acceptable; revisit only if mis-selection is noticeable.
- **Accessibility / over-stimulation.** Reduced-motion static path; subtle ambient motion; bright fast motion reserved for `active` workflow edges and in-flight transitions; colour-status backed by kind glyphs and existing diagnostics.

## Open questions for the user

1. **Ambient prominence:** always-on subtle breathing/drift for cells (more alive), or calm-until-something-happens (cheaper, gated to active/transitions)? (Recommended: subtle always-on breathing via cheap scale, expensive motion gated.)
2. **The workflow→semantic bridge:** render the run visibly feeding the semantic map (as in the mockup), or keep the two layers visually separate?
3. **Mitosis trigger data:** confirm the `node.split` / `node.merged` events (and the layout) carry parent↔child ids and final positions to the renderer — or do we need the store to emit an explicit transition hint? (Determines exactly how E is wired.)
4. **Replace vs toggle** for the whole workspace look: ship neon as the only look, or keep the current flat look behind a flag for A/B? (Recommended: replace.)
