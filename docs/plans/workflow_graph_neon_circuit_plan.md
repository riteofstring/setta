# Workflow Graph "Neon Circuit" Visual Redesign Plan

- **Date:** June 13, 2026
- **Status:** Proposed; not started
- **Scope:** Replace the workflow graph's flat visual language with the "Neon Circuit" aesthetic (Tron / synthwave) selected from the mockups, so the graph reads like a live circuit where execution visibly travels the wires. Extend the existing Pixi renderer; do not fork it or move graph state into React.
- **Mockup reference:** `docs/mockups/workflow-graph-aesthetics.html` (theme 1, "Neon Circuit"). Open with `#neon`.

## Goal

Make the workflow graph fun and legible at a glance: a dark void with a faint circuit grid, dark "glass" node bodies edged in a neon stroke whose colour encodes status, and edges that are glowing wires carrying **energy pulses along the active path** in the direction of execution. Detail stays on demand — clicking a node still opens its panel; the canvas itself communicates *kind*, *status*, and *flow* without text overload.

The redesign is purely a presentation-layer change. Graph topology, layout, hit-testing, selection, edge drawing, persistence, and the React/store contracts stay exactly as they are. We change how nodes/edges/background are painted and add a gated per-frame animation pass.

## Current state (what we're changing)

The renderer lives in `desktop/src/renderer/src/features/workspace-graph/` and is a custom Pixi.js v8 (`8.18.1`) + `pixi-viewport` implementation. Relevant facts confirmed in code:

- **Layered world** under the viewport (`pixi-renderer.js:129`): `backgroundLayer` (grid), `edgeLayer` (`edgeGraphics`, `edgeHighlightGraphics`, `edgeLabelLayer`), `nodeLayer` (per-node `Container`s), `interactionLayer` (marquee, temp edge), `effectsLayer` (`glow`). Labels are screen-space `BitmapText` in a sibling `labelLayer`.
- **Node visuals are baked into cached `GraphicsContext`** (`pixi-renderer-node-geometry.js:49`): body = rounded rect filled with `node.color` at `0.92` alpha + a **white** stroke; plus shadow, hover/selected outlines (white), diagnostic diamond, and a latent activity marker. Rebuilt only when `color`/`size`/`ports` change (`pixi-renderer-scene-graph.js:172`).
- **Colour comes from the projection** (`workflow-graph-projection.ts:84-104`): `nodeStatusColors` keyed by `WorkflowGraphNodeStatus`, `idleKindColors` keyed by `WorkflowNodeKind`. Node objects carry `status`, `kind`, `color`, `width`, `height`, `executionCount`, `diagnostic`, `ports`.
- **Edges** are drawn as cubic beziers into one shared `edgeGraphics`, cleared and fully redrawn per `redrawWorkspaceEdges` call (`pixi-renderer-edge-rendering.js:5`); control offset is `max(80, |dx|*0.35)` (`pixi-renderer-helpers.js:201`). Edge objects carry `status: WorkflowGraphEdgeStatus`.
- **Background** is a solid `0x07080d` clear (`pixi-renderer.js:68`); grid is a two-tier slate line set (`pixi-renderer-node-geometry.js:99`).
- **There is no animation loop.** The ticker (`pixi-renderer.js:388`) only measures frame time and diffs camera state. `drawWorkspaceGlow` (`pixi-renderer-helpers.js:254`) computes a `Math.sin(now/450)` pulse but is **only invoked on graph replace and during node drags** — so in steady state the graph is completely static.

The relevant enums (from `@generated/backend`, do not hardcode-mirror — import them):

- `WorkflowGraphNodeStatus = not_started | pending | ready | running | succeeded | failed | cancelled | waiting_approval | recovery_required`
- `WorkflowGraphEdgeStatus = inactive | active | completed | cancelled`
- `WorkflowNodeKind = start | end | action | gateway.and | gateway.or | gateway.xor | loop.guard`

The `edge.status` enum is the gift that makes the hero effect cheap and correct: **`active` edges get bright fast flow, `completed` edges get a steady dim trickle, `inactive`/`cancelled` get ambient or nothing.** We do not need to infer flow from node states.

## Design language (Neon Circuit)

Translating the chosen mockup into production terms:

1. **Void + circuit grid.** Keep the near-black clear. Recolour the grid to a faint cyan fine grid and a slightly brighter coarse grid. Add a subtle screen-space radial vignette (brighter centre) so the canvas feels lit from within rather than uniformly flat.
2. **Glass nodes, neon edge.** Node body becomes a dark vertical-gradient "glass" fill (≈ `0x0d1220`→`0x080b14`) with the **status/kind colour applied as the stroke** (not the fill) plus a soft outer glow in the same colour. Idle (`not_started`) nodes use a dim stroke; live statuses use a bright neon stroke. This is the single biggest legibility win: status reads as the colour of the glowing border, and the dark fill keeps labels crisp.
3. **Running = alive.** Nodes whose status is `running` (and `pending`/`ready` more subtly) get an animated pulse aura — a colour-matched ring that breathes via `sin(time)`. `failed`/`recovery_required` get a hotter red with a faster, sharper flicker; `succeeded` settles to a steady green glow.
4. **Edges are wires; execution is light.** Base edges are thin tinted strokes with a soft glow. On `active` edges, bright pulses (small additive dots) travel source→target so you literally watch the run move through the graph. `completed` edges keep a slow, dim trickle to show the path already taken.
5. **Neon selection/hover.** Replace the white hover/selected outlines with cyan neon outlines consistent with the rest of the palette.
6. **(Optional) kind glyphs.** Small vector marks per `WorkflowNodeKind` (start ▶, end checkered, action gear, gateway diamond/merge) so kind is readable without relying on the label. Nice-to-have, last phase.

Starting animation constants (from the mockup, tune in-app): node pulse period ≈ 1.0–1.4 s; edge pulse speed ≈ one traversal per 1.6–2.2 s; 3–5 pulses on active edges, 2 dim on completed, 0–1 ambient elsewhere; glow alpha ≈ `0.08 + pulse*0.05`.

## Architectural approach

Three structural additions, each small and isolated:

### A. Centralize the palette in one theme module

Create `workflow-graph-neon-theme.ts` (colocated with the renderer) as the single home for the neon palette and animation constants: node stroke/fill/glow colours per `WorkflowGraphNodeStatus` and `WorkflowNodeKind`, edge colours per `WorkflowGraphEdgeStatus`, grid/vignette/selection colours, and motion timings. Key it off the imported generated enums with `satisfies Record<…, …>` so a new status fails the typecheck (per AGENTS: discriminated-union exhaustiveness, no hardcoded enum mirrors).

`workflow-graph-projection.ts` keeps owning *which* colour a node/edge resolves to, but pulls the values from this module instead of the inline `nodeStatusColors`/`idleKindColors` literals (`workflow-graph-projection.ts:84-104`). This avoids a "constants junk drawer" and keeps the palette at one boundary. The node `GraphicsContext` builders in `pixi-renderer-node-geometry.js` consume the same module for the dark fill + neon stroke.

> Open question for the user (see below): make Neon the **only** look, or gate it behind a flag for A/B + perf comparison. Default recommendation: ship it as the new look, no compatibility shim (per AGENTS), with the theme module making a future toggle trivial if wanted.

### B. Add the missing gated animation pass

The renderer has a ticker but no visual animation. Add an `animation` step inside the existing `app.ticker.add` callback (`pixi-renderer.js:388`) that, **only when there is something to animate**, advances `now` and repaints the animated layers (glow aura, node pulse, edge flow). Gating rules:

- Maintain a small `animatedNodeIds`/`hasActiveEdges` summary recomputed on `replaceSceneGraph`, not per frame. If no node is in a pulsing status and no edge is `active`/`completed`, the animation step early-returns and the graph costs ~0 — identical to today's static cost. This is essential for the large-graph requirement (AGENTS UI rules; see the 500–5,000 node scenarios in `pixi_workspace_crisp_rendering_plan.md`).
- Repaint only the dedicated animation `Graphics` (new `edgeFlowGraphics`, the existing `glow`, and a new per-node pulse layer). **Never rebuild node `GraphicsContext` per frame** — animate cheap alpha/scale/tint on overlay graphics instead.
- Cull by viewport: only animate nodes/edges whose bounds intersect the visible world rect, reusing the existing spatial index (`createWorkflowGraphSpatialQueries`) and `viewport` bounds. Off-screen pulses are invisible; don't pay for them.
- Honour `prefers-reduced-motion`: when set, render the **lit but static** state (full glow, neon strokes, no travelling pulses, no breathing). Plumb a `reduceMotion` flag from the surface/host.

Motion is driven by `performance.now()` in the ticker (push/raf, not polling — compliant). Status changes still arrive via the existing `updateGraph` → `replaceSceneGraph` path from the store; the animation pass just reads the current `nodes`/`edges`.

### C. Edge energy flow (the hero effect)

Add `edgeFlowGraphics` to `edgeLayer` (above `edgeGraphics`, below labels). Add `sampleCurvedEdge(start, end, t)` to `pixi-renderer-helpers.js` that mirrors the exact control points used by `drawCurvedEdge` (`helpers.js:201`) so pulses ride the same curve the wire is drawn on. Each frame, for each visible non-`inactive` edge, draw N additive dots at parametric positions `((now*speed + k/N + edgePhase) mod 1)`, with `N`/brightness/speed chosen by `edge.status`. Deterministic phase from edge index → no per-pulse state to allocate. This reuses the existing per-edge geometry; the base wire still comes from `redrawWorkspaceEdges` (now neon-tuned).

## Implementation phases

Each phase is independently shippable and visually meaningful.

**Phase 0 — Baseline & guardrails.**
Capture a performance baseline (idle, pan/zoom, drag, and the 500/1k/2.5k/5k synthetic scenes already used by the crisp-rendering work) and record it under `docs/reports/performance/` per AGENTS. Plumb a `reduceMotion` flag and an internal animation on/off switch. Add debug-snapshot counters for the new work (`edgeFlowRedrawCount`, `nodePulseRedrawCount`, `animatedNodeCount`, `animationActive`) alongside the existing counters in `createWorkflowGraphDebugSnapshot`.

**Phase 1 — Static neon repaint (no motion).**
Add `workflow-graph-neon-theme.ts`; point `workflow-graph-projection.ts` at it. Repaint: background vignette layer, neon grid (`drawWorkspaceGrid`), dark-glass node body + neon status/kind stroke + base glow (`createNodeGeometryContextFactory`), neon hover/selected outlines, neon-tuned ports (`drawPortVisualState`) and temp-edge/marquee colours, and neon edge base strokes (`drawEdge` in `pixi-renderer-edge-rendering.js`). At the end of this phase the graph already looks like Neon Circuit, just frozen.

**Phase 2 — Animation driver.**
Wire the gated animation pass (section B) into the ticker. Move glow repaint onto it (replacing the update-only `redrawGlow` calls), with the active-set gating and viewport culling. Add the reduced-motion static path. Verify idle large graphs show no added cost via the Phase 0 counters and frame-time samples.

**Phase 3 — Edge energy flow (hero).**
Add `sampleCurvedEdge`, `edgeFlowGraphics`, and the per-status flow renderer (section C). Tune speed/density/brightness per `active` / `completed` / `inactive`. This is the "watch execution travel the graph" payoff.

**Phase 4 — Node status motion.**
Per-node pulse aura for `running`/`pending`/`ready`; hotter flicker for `failed`/`recovery_required`; steady settle for `succeeded`/`cancelled`. Implemented as a single pooled overlay `Graphics` per animated node (or one batched `Graphics` in `effectsLayer`), animating alpha/scale only.

**Phase 5 — Polish (optional).**
Per-kind glyphs; optional true bloom. Pixi v8's core `BlurFilter` (no new dependency) on a duplicated bright edge/glow layer gives real bloom within a fixed GPU budget; `@pixi/filter-advanced-bloom` looks better but is a new dependency and would require `./update_dependencies.sh` + `./scripts/check_supply_chain.sh` (AGENTS). Default: ship the cheap layered-stroke glow; treat filter-based bloom as a gated follow-up.

**Phase 6 — Verify & document.**
Re-measure against the Phase 0 baseline; append before/after to `docs/reports/performance/`. Extend the existing Pixi visual smoke coverage with neon states (idle, running, failed, active-edge flow, reduced-motion static). Confirm React render counts are unchanged during animation (the animation pass must not touch React state).

## Performance budget & gating (first-class, per AGENTS)

- **Idle graphs cost what they cost today.** No active node/edge ⇒ animation step early-returns; no per-frame draws.
- **Work scales with what's *visible and active*,** never with total graph size: viewport-cull via the spatial index, and iterate only the precomputed active set.
- **No `GraphicsContext` rebuilds per frame;** animate alpha/scale/tint on a small number of pooled overlay graphics.
- **Bounded pulses:** fixed small N per edge; cap total animated edges/nodes per frame and `log`/expose the cap in the debug snapshot if hit (no silent truncation).
- **Reduced motion** renders a static lit state; also the safe fallback if a frame budget is exceeded.
- Validate at the existing 500 / 1,000 / 2,500 / 5,000 synthetic-node scenarios before considering it done.

## Non-goals / out of scope

- No change to the **semantic / conceptual** graph theme (`semantic-graph-projection.ts`) in this plan; Neon here is workflow-graph only. (A follow-up could share the theme module.)
- No new runtime dependencies unless explicitly approved (bloom filter caveat above).
- No multi-theme switcher in-app unless requested; the theme module is the seam if we want one later.
- No changes to graph state ownership, layout ranks, hit-testing, or store/React contracts.

## Risks & mitigations

- **Animation regresses large-graph perf.** Mitigated by active-set gating + viewport culling + Phase 0/6 measurement gates.
- **Neon glow hurts label legibility.** Dark glass fill keeps labels crisp (unlike today's status-coloured fill); verify in deep-zoom smoke tests.
- **Over-stimulation / accessibility.** `prefers-reduced-motion` static path; keep ambient motion subtle and reserve bright fast flow strictly for `active` edges.
- **Colour-only status encoding.** Status already maps to colour today; the optional kind glyphs and existing diagnostic markers add non-colour cues for accessibility.

## Open questions for the user

1. **Replace vs toggle:** ship Neon as the only workflow-graph look, or keep the current flat look behind a setting/flag for comparison? (Recommended: replace, with the theme module making a toggle cheap later.)
2. **Motion intensity:** always-on faint ambient flow on every wire (more "alive"), or motion *only* on `active`/`completed` edges (calmer, cheaper)? (Recommended: status-gated only.)
3. **Bloom:** is core `BlurFilter` (no new dep) acceptable for Phase 5, or avoid GPU filters entirely and stick to layered-stroke glow?
```
