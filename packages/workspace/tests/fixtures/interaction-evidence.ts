export const SOURCE_SNAPSHOT = "043d3b2e9c69caf99d1246f1408b3ad7194b7864";

export const INTERACTION_FIXTURE_EVIDENCE = {
  collision: {
    behavior:
      "sortable priority, signed trigger distance, previous-target preference, retained rectangles, midpoint buffers, child promotion, and stale-target clearing",
    sources: [
      "frontend/src/forks/dnd-kit/adapter/collision.ts",
      "frontend/src/forks/dnd-kit/adapter/collisionCompare.ts",
      "frontend/src/forks/dnd-kit/useDropType.ts",
    ],
  },
  geometry: {
    behavior:
      "zoom-normalized drag translation, screen/workspace conversion, and combined drag bounds",
    sources: [
      "frontend/src/forks/dnd-kit/adapter/zoom.ts",
      "frontend/src/forks/dnd-kit/dragRectBounds.ts",
      "frontend/src/forks/dnd-kit/DragOperationShapeSync.tsx",
    ],
  },
  movement: {
    behavior:
      "normalized sibling-block order, sort/free plans, cross-depth moves, no-op detection, cycle prevention, cancellation, and host rejection",
    sources: [
      "frontend/src/forks/dnd-kit/useMoveSectionPlans.ts",
      "frontend/src/forks/dnd-kit/useMoveSection.ts",
      "frontend/src/state/actions/sections/sectionSelection.ts",
    ],
  },
  ownership: {
    behavior:
      "one movement owner across viewport, root layout, section structure, and item-tree activation",
    sources: [
      "frontend/src/forks/dnd-kit/useDropType.ts",
      "frontend/src/forks/dnd-kit/selectionDragHandle.ts",
      "frontend/src/forks/xyflow/core/container/ZoomPane.tsx",
    ],
  },
  preview: {
    behavior:
      "orientation-aware midpoint insertion with transform-only, layout-stable sibling previews",
    sources: [
      "frontend/src/forks/dnd-kit/adapter/sorting.ts",
      "frontend/src/forks/dnd-kit/sortingOverState.ts",
    ],
  },
} as const;

export const FIXTURE_ATTRIBUTION =
  "Independently written behavioral characterizations; no historical source text copied.";
