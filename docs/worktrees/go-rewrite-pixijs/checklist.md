# Go-Rewrite Pixi Canvas-First Guardrails And Acceptance Gates

Date: 2026-04-18
Worktree: `go-rewrite-pixijs`

This file is not a progress ledger.

Use `docs/worktrees/go-rewrite-pixijs/log.md` as the canonical append-only execution history and `docs/worktrees/go-rewrite-pixijs/handoff.md` as the current-state summary.

Keep this page short and stable. Change it only when the branch guardrails or success gates change.

## Tracking model

- `log.md` is the canonical append-only record of what happened, what evidence was collected, what regressed, and what the next action is.
- `handoff.md` is the current-state summary plus the immediate frontier.
- This file exists only for stable guardrails and acceptance gates that should survive across many loop iterations.

## Architectural guardrails

- `origin/go-rewrite` remains the product-architecture source of truth for this restart.
- `/home/ubuntu/dev/setta` remains the read-only reference worktree for side-by-side comparisons.
- That `/home/ubuntu/dev/setta` checkout is currently on branch `go-rewrite` and acts as the temporary pristine oracle until `go-rewrite` merges back into `main`.
- Closed micro-lanes stay closed by default; the default frontier is retained-graph / renderer-side motion cost, not another section-local resting-text harvest.
- After run `033` closed the visible row-body/article-chrome frontier at zero on the live canary, the next restart must target a retained-graph invalidation / redraw / snapshot decision or a broader canvas-side structural step, not another survivor-family DOM cleanup.
- Prior Pixi/frontend-performance branches are research inputs only, not structural templates to recreate wholesale.
- Port ideas as narrow `go-rewrite`-native seams, helpers, instrumentation, and measured product slices only.
- Do not back out broad `go-rewrite` refactors just to make older branch code easier to transplant.
- If a perf lane appears to require major structural rollback, stop for replan instead of silently undoing the rewrite.

## Measurement discipline

- Do not claim main-goal progress without dense `settings` -> `All Settings` measurement.
- Use `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md` as the durable pre-change branch baseline until a newer durable report replaces it.
- Treat `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the current clean whole-scene checkpoint until a newer clean checkpoint replaces it.
- Treat the `languageServer`, backend, and run-033 row-body refresh reruns as the branch’s explicit proof that survivor-family harvesting is spent: if a new slice only removes another visible DOM leaf/subtree and does not remove retained-graph motion cost, replan instead of running it.
- Treat narrow canary probes as slice verification or smoke checks unless a result is explicitly recorded as a durable benchmark replacement.
- Keep CDP visual verification as a first-class gate for UI-relevant slices.

## UX gates

- No second click to edit.
- No visible layout jump when a field becomes editable.
- Do not let the resting shell/control chrome visibly swap when editing begins.
- Keep heavyweight live DOM bounded to active editing surfaces and necessary popups only.

## Branch acceptance gates

- `All Settings` pan/zoom must be materially better than the durable `go-rewrite` baseline.
- Relative wins are not enough while the normalized dense probe still misses the `33.3ms` budget on most frames.
- The default visible graph surface must stop paying the cost of a full live widget forest during motion.
- At least one representative heavy control must prove first-click in-place DOM editing with stable outer chrome.
- Dense-scene progress must extend beyond one shell-only canary before the branch can count as successful.
