# Go-Rewrite Pixi Scene Guardrails And Acceptance Gates

Date: 2026-04-21
Worktree: `go-rewrite-pixi-scene`

This file is not a progress ledger.

Use `docs/worktrees/go-rewrite-pixi-scene/log.md` as the canonical append-only execution history and `docs/worktrees/go-rewrite-pixi-scene/handoff.md` as the current-state summary.

## Tracking model

- `plan.md` holds the durable first-principles strategy.
- `handoff.md` holds the compact current-state summary and immediate frontier.
- `log.md` is append-only recent loop memory.
- Keep the active `log.md` short and clean. Rotate older entries into `log-archive-*.md` files instead of turning the active log into a full branch retrospective.

## Architectural guardrails

- `origin/go-rewrite` remains the product-architecture source of truth.
- `/home/ubuntu/dev/setta` remains the read-only reference worktree for visual comparisons.
- The visible xyflow graph area must be replaced by a Pixi-owned scene.
- Pixi is a substrate choice, not the goal. The real goal is a GPU-owned visible scene with premium pan/zoom and stable editing handoff.
- Hybrid transparent-DOM-shell underlay work does not count as the target architecture.
- DOM is allowed only for active editors, menus/popups, chat, and other explicit exceptions.
- Chat is a documented DOM exception for this restart and is not the primary blocker lane.
- Do not widen section-family ownership before the scene passes Gate 0 viability.
- If the Pixi scene cannot clear Gate 0 after bounded bootstrap/zoom/text passes, stop for replan instead of forcing more Pixi rollout.

## Scene-quality guardrails

- The scene must stay visible and recognizable during pan and zoom.
- Section layout must continue to resemble the existing product layout.
- Zoom must not feel janky:
  - no severe blur smear
  - no obvious snap-after-zoom redraw
  - no detached shell/body behavior
  - no blanking during ordinary interaction
- Do not accept "faster but uglier/broken" as success.

## Measurement discipline

- Do not claim progress without dense `settings` -> `All Settings` measurement.
- Record before/after perf reports in `perf/reports/frontend/`.
- When a hotspot closes or the architecture pivots, save a trace or equivalent instrumentation artifact.
- Keep Chrome DevTools visual verification as a required gate for UI-relevant slices.

## UX gates

- No second click to edit on representative controls.
- No visible layout jump when a control becomes editable.
- Outer row/control chrome stays visually stable when editing begins.
- The product still reads as Setta sections rather than generic cards or placeholders.

## Branch acceptance gates

- `All Settings` pan/zoom must be materially better than the durable DOM baseline.
- The default visible graph surface must be Pixi-owned.
- The result must feel premium in normal use, not merely acceptable in a benchmark.
- DOM must stay bounded to overlays and explicit exceptions.
- At least one representative heavy control must prove first-click in-place DOM editing with stable outer chrome.
