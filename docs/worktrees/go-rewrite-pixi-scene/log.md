# Go-Rewrite Pixi Scene Log

Date: 2026-04-21
Worktree: `go-rewrite-pixi-scene`
Related plan: `docs/worktrees/go-rewrite-pixi-scene/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixi-scene/handoff.md`

This file is append-only.

Log policy:

- Keep this file focused on recent iteration memory for the current worktree.
- Do not rewrite or compress prior entries in place except for narrow factual corrections.
- When the active log grows beyond a clean recent window, move older entries into `log-archive-*.md` files and leave this file as the current append-only window.

## 2026-04-21

- Item: Reset the renderer plan from first principles on a clean branch.
  - Branch created: `go-rewrite-pixi-scene`
  - Base: `origin/go-rewrite`
  - Reason:
    - the prior `go-rewrite-pixijs` branch remained a hybrid `xyflow` + canvas-underlay path
    - live feedback reported that it felt slower and visually unusable
    - the next attempt needs a real Pixi-owned graph scene rather than more hybrid expansion
  - Created:
    - `RALPH.md`
    - `branch_intent.md`
    - `docs/worktrees/go-rewrite-pixi-scene/{plan,handoff,checklist,log}.md`
  - New branch direction:
    - replace the visible xyflow area with a Pixi-owned scene
    - preserve the existing section layout
    - prioritize premium pan/zoom and recognizability before family rollout
    - keep DOM limited to overlays and explicit exceptions such as chat
  - Next action:
    - capture a clean dense `All Settings` baseline
    - stand up the Pixi scene root on real section geometry
    - prove direct Pixi-owned pan/zoom before broader rollout

- Item: Tighten the plan so the workspace rewrite boundary is explicit.
  - Clarified that this effort is a full rewrite of the visible workspace / xyflow area, while keeping the surrounding app chrome.
  - Explicitly ruled out:
    - hybrid DOM shell underlays
    - many-small-canvas workspace composition
    - seam-lift / forwarding cleanup as the main path
  - Named `Callable` and `Dict` on `settings` -> `All Settings` as the first real proving families.
  - Reinforced that progress does not count unless it produces one coherent visible-scene canary with premium pan/zoom and recognizable section structure.
