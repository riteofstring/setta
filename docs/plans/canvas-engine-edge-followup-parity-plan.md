# Canvas Engine Edge Follow-Up Parity Plan

## Goal

Finish the next set of edge interactions that the experimental canvas engine host already attempts to support, but which still lack direct end-to-end parity coverage on the current branch.

## Scope

- Data-edge reconnect via endpoint drag
- Data-edge hover and click selection
- Agentic-edge create via handle drag
- Agentic-edge hover and click selection

## Approach

1. Port the remaining browser scenarios from `frontend-performance-5`.
   - Reuse current helper patterns where they are already robust.
   - Prefer live DOM-island bounds and mounted section DOM for test coordinates over brittle backend layout assumptions.

2. Harden the host runtime only where the new scenarios expose real gaps.
   - Keep the current camera, pan, resize, and marquee behavior unchanged.
   - Avoid speculative refactors while the parity surface is still moving.

3. Keep verification narrow and repeatable.
   - Focused Playwright coverage for each edge scenario
   - Existing host Vitest suite rerun after any runtime changes
   - CDP sanity check on the live experimental host after the slice lands

## Exit Criteria

- Data-edge reconnect works end-to-end on the canvas host.
- Edge hover/select behavior is verified for both data and agentic edges.
- Agentic connect works end-to-end on the canvas host.
