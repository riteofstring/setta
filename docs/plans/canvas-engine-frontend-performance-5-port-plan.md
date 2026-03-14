# Frontend-Performance-5 Canvas Engine Port Plan

## Goal
Salvage the useful canvas-engine work from `frontend-performance-5` onto current `main` without reviving that stale branch as the primary integration branch.

## Why Port Instead Of Continue The Old Branch
- `frontend-performance-5` is far behind current `main` and current worktree state.
- It overlaps many files that have since changed substantially.
- The branch contains good architectural work, but rebasing it wholesale would mix the engine project with a large amount of unrelated drift and conflict resolution.

## Source Inventory
High-value pieces already present on `frontend-performance-5`:
- `frontend/src/canvas-engine/types.ts`
- `frontend/src/canvas-engine/spatialIndex.ts`
- `frontend/src/canvas-engine/spatialIndex.test.ts`
- `frontend/src/canvas-engine/domIslandMountPolicy.ts`
- `frontend/src/canvas-engine/domIslandMountPolicy.test.ts`
- `frontend/src/canvas-engine/sceneAdapter.ts`
- `frontend/src/canvas-engine/sceneAdapter.test.ts`
- `frontend/src/canvas-engine/edgeHandlePositionSelectors.ts`
- `frontend/src/components/Pages/Project/CanvasEngineHost.tsx`
- `frontend/tests/e2e/sections/canvas-engine-host.spec.ts`
- `frontend/tests/e2e/sections/canvas-engine-dom-island-virtualization.perf.spec.ts`
- `docs/plans/reactflow-webgl-webgpu-rewrite-plan.md`

## Porting Rules
- Port onto current `main` in small slices.
- Prefer cherry-pick-by-concept, not branch-wide merge.
- Re-evaluate each slice against current code before landing it.
- Do not blindly port stale local-storage, state, or UI assumptions.

## Porting Sequence
1. Planning and baseline docs
- Port the useful architectural intent from the old rewrite plan into current planning docs.
- Keep current perf reports append-only and reference them as migration baselines.

2. Self-contained engine primitives
- Port:
  - `types.ts`
  - `spatialIndex.ts`
  - `spatialIndex.test.ts`
  - `domIslandMountPolicy.ts`
  - `domIslandMountPolicy.test.ts`
- Reason:
  - low coupling
  - immediate testable value
  - useful regardless of final host shape

3. Scene adapter slice
- Port:
  - `sceneAdapter.ts`
  - `sceneAdapter.test.ts`
  - `edgeHandlePositionSelectors.ts`
  - `edgeHandlePositionSelectors.test.ts`
- Adjust for current generated types and state contracts as needed.

4. Flagged host scaffold
- Port a minimal `CanvasEngineHost` behind a disabled-by-default flag.
- Initially allow the host to render diagnostic primitives and expose observability attributes before chasing full parity.

5. Interaction and parity slices
- Port in layers:
  - camera persistence
  - selection and hit testing
  - drag/resize
  - edge connect/reconnect
  - DOM-island virtualization

6. Generalization work
- Close the gap between the old branch and the final requirement:
  - top-level-only scene assumptions
  - nested/group/list-root semantics
  - arbitrary section-type coverage

## First Implementation Slice
Port the self-contained primitives first:
- `canvas-engine/types.ts`
- `canvas-engine/spatialIndex.ts`
- `canvas-engine/spatialIndex.test.ts`
- `canvas-engine/domIslandMountPolicy.ts`
- `canvas-engine/domIslandMountPolicy.test.ts`

This is the safest way to start real code movement immediately while keeping the worktree stable.

## Commit Plan
1. Commit the existing always-on shell-promotion stopgap.
2. Commit the two new planning docs.
3. Commit engine primitive ports plus Vitest coverage.
4. Commit scene-adapter port in its own slice.
5. Commit host scaffolding separately from interaction parity work.

## Verification Plan
- For primitive ports:
  - run focused Vitest files for the new modules
- For host/integration slices:
  - run focused Playwright specs
  - run CDP visual verification
  - append perf notes when behavior or structural performance changes

## Risks
- Risk: old branch assumptions no longer match current stores and project structures.
  - Mitigation: port incrementally and re-evaluate each module.
- Risk: top-level-only engine logic gets mistaken for a final general solution.
  - Mitigation: keep generalization as an explicit milestone, not an implied TODO.
- Risk: branch-wide merge causes avoidable regressions.
  - Mitigation: do not merge `frontend-performance-5` wholesale.
