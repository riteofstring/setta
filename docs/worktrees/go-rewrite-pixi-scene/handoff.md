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

## What changed in the replan

- Pan and zoom quality is the first product problem, not a secondary polish pass.
- Recognizable section layout is mandatory from the start.
- Hybrid transparent DOM shells no longer count as progress toward the target renderer.
- Chat is an explicit DOM exception for this restart and is not the blocker lane.

## Immediate architecture rules

- Pixi owns the visible graph surface.
- xyflow cannot remain the default viewport/rendering owner on the canary path.
- DOM is limited to active editors, menus/popups, chat, and other explicit exceptions.
- Scene hit-testing must resolve against Pixi-owned geometry, not hidden DOM anchors.

## Immediate next action

Build the Phase 0 and Phase 1 bootstrap on the clean branch:

1. Capture a fresh dense `settings` -> `All Settings` baseline on `origin/go-rewrite`.
2. Stand up a Pixi scene root that renders all visible sections from real section geometry.
3. Prove direct Pixi-owned pan/zoom on that scene before any family rollout work.

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

## Closed lanes from the old branch

Treat these as closed unless a later human replan explicitly reopens them:

- transparent DOM shell / canvas-underlay expansion
- row-body and hidden-input activator retries
- chat activator retries
- section-family harvesting as the main strategy
- viewport and subscription micro-lanes that keep xyflow as the visible owner

## Success interpretation

The new branch does not need immediate pixel parity, but it must feel like the same product:

- sections still read as Setta sections
- same overall layout
- premium pan/zoom
- first-click editing via overlays on representative controls

If performance looks good in a report but the scene is visually broken or unpleasant to use, the branch is not succeeding.
