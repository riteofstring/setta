# DnD Kit Collision Detour Findings

## Context
This document captures findings from comparing the main branch collision/drag logic to the current upgrade branch. The goal is to record regressions/complexity introduced during the dnd-kit adapter upgrade, with a focus on nested list collisions and placeholder jitter/stickiness.

## Summary of Findings
- The upgrade branch runs two different collision ranking systems: dnd-kit sorts collisions by `value`/`priority`, while `useDropType.ts` re-selects a “best” collision via `compareCollisions`. These can disagree, unlike main where the collision detector returned a single “best” collision.
- Collision hysteresis now follows `collisions[0]` from dnd-kit, not the resolved `overId`. This breaks the alignment between `pastHalfway`, `triggerDistCondition`, and the resolved collision used for placement. Main kept these aligned because it only produced one collision.
- The new collision scoring (`intersectionRatio * 1000 - absTriggerDist`) does not replicate main’s left-distance prioritization logic. So dnd-kit’s `over` can differ from `compareCollisions`, which adds instability.
- Free-move behavior is more complex than main: it triggers `onDragOver` on more conditions, and it reorders items within the same parent. This increases state churn and makes jitter more noticeable when collision resolution is unstable.
- The old “remove temp placeholder when hovering a container with existing children” was dropped in the upgrade branch and later restored. Its absence caused visible stickiness when `overId` resolved to the container root instead of a child.

## Evidence from Logs
- Logs show repeated cases where `overId` is not the same as `collisions[0].id`. This causes hysteresis to pin to a different target than the resolved drop target, resulting in “sticky” placeholder behavior.

## Candidate Fix Directions
These are not mutually exclusive; they can be staged.
1) Align hysteresis with the resolved `overId` collision so `pastHalfway` and buffers apply to the same target.
2) Align collision scoring with `compareCollisions` so dnd-kit’s `collisions[0]` and our resolved `overId` stay consistent.
3) Simplify free-move behavior by removing intra-parent reorder logic to match main and reduce churn.

## Files Reviewed
- `frontend/src/forks/dnd-kit/adapter/collision.ts`
- `frontend/src/forks/dnd-kit/useDropType.ts`
- `frontend/src/forks/dnd-kit/adapter/useDndMonitor.ts`
- `frontend/src/forks/dnd-kit/adapter/DragDropProvider.tsx`
- `frontend/src/forks/dnd-kit/collisionDetection.ts` (main branch)
- `frontend/src/forks/dnd-kit/collisionDetectionSorting.ts` (main branch)

## Notes
- Main branch returned a single “best” collision from the detector, so `over`, `collisions[0]`, `pastHalfway`, and `triggerDistCondition` all referred to the same droppable.
- Upgrade branch emits multiple collisions and then re-selects a different “best” target later, which introduces instability.
