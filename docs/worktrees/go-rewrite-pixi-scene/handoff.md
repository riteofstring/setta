# Go-Rewrite Pixi Scene Handoff

Last updated: 2026-04-21
Worktree: `go-rewrite-pixi-scene`
Related plan: `docs/worktrees/go-rewrite-pixi-scene/plan.md`
Related history: `docs/worktrees/go-rewrite-pixi-scene/log.md`
Related guardrails and gates: `docs/worktrees/go-rewrite-pixi-scene/checklist.md`

## Branch checkpoint

- This is a fresh restart from `origin/go-rewrite`.
- Branch name: `go-rewrite-pixi-scene`.
- The old `go-rewrite-pixijs` branch is research only. Do not continue its hybrid underlay path by inertia.
- The product direction is now explicit: replace the visible xyflow area with a Pixi-owned scene.
- The active log for this worktree is intentionally clean and short. Keep `log.md` append-only, keep it focused on recent iteration memory, and rotate older material into `log-archive-*.md` files instead of letting the active log bloat.

## What changed in the replan

- Pan and zoom quality is the first product problem, not a secondary polish pass.
- Recognizable section layout is mandatory from the start.
- Hybrid transparent DOM shells no longer count as progress toward the target renderer.
- Chat is an explicit DOM exception for this restart and is not the blocker lane.
- The workspace rewrite is the focus, not seam churn: one Pixi scene for the visible xyflow area, no hybrid DOM shells, no many-canvas composition.

## Immediate architecture rules

- Pixi owns the visible graph surface.
- xyflow cannot remain the default viewport/rendering owner on the canary path.
- DOM is limited to active editors, menus/popups, chat, and other explicit exceptions.
- Scene hit-testing must resolve against Pixi-owned geometry, not hidden DOM anchors.
- Pixi is the current substrate choice, not a success condition by itself. If the scene stays visibly worse or cannot clear Gate 0, stop for replan instead of widening Pixi ownership by inertia.
- The target is one workspace scene, not a collection of little canvases inside DOM shells.
- Changes that only move seams, forwarding layers, or ownership labels without producing a visible full-scene canary do not count as progress.

## Immediate next action

Build the Phase 0 and Phase 1 bootstrap on the clean branch:

1. Capture a fresh dense `settings` -> `All Settings` baseline on `origin/go-rewrite`.
2. Stand up one Pixi scene root that renders all visible sections from real section geometry.
3. Make `Callable` and `Dict` the first recognizable proving families on that scene.
4. Prove direct Pixi-owned pan/zoom on that scene before any broader family rollout work.

## Gate 0 definition for this branch

Gate 0 is green only when all of these are true:

- the scene is visible and nonblank
- the section layout is recognizable
- pan and zoom are not obviously worse than the DOM reference
- zoom does not blur, snap, or detach badly enough to feel broken

While Gate 0 is red, do not spend time on:

- shell-family expansion
- chat work
- support-only micro-optimizations
- parity polish that does not improve scene viability
- further Pixi rollout whose only justification is "we already picked Pixi"
- seam-lift cleanup
- many-canvas experiments

## Loop memory rules

- `plan.md` is the durable strategy and acceptance bar.
- `handoff.md` is the compact current-state summary.
- `log.md` is append-only recent iteration memory, not a full retrospective dump.
- When the active log stops being easy to scan, rotate older entries into `log-archive-*.md` and keep the active log current and readable.

## Closed lanes from the old branch

Treat these as closed unless a later human replan explicitly reopens them:

- transparent DOM shell / canvas-underlay expansion
- row-body and hidden-input activator retries
- chat activator retries
- section-family harvesting as the main strategy
- viewport and subscription micro-lanes that keep xyflow as the visible owner
- seam-forwarding cleanup as a default frontier
- many-small-canvas workspace composition

## Success interpretation

The new branch does not need immediate pixel parity, but it must feel like the same product:

- sections still read as Setta sections
- same overall layout
- premium pan/zoom
- first-click editing via overlays on representative controls
- one coherent workspace scene rather than DOM-hosted canvas fragments

If performance looks good in a report but the scene is visually broken or unpleasant to use, the branch is not succeeding.
