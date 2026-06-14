import { nodeBounds, rectanglesIntersect } from "./pixi-renderer-helpers";
import { createNodeSpatialIndex } from "./pixi-renderer-spatial-index";

export function createWorkflowGraphSpatialQueries({ nodes, viewport }) {
  const nodeSpatialIndex = createNodeSpatialIndex(nodes);
  const counters = {
    lastGlowVisibilityCandidateCount: 0,
    lastLabelVisibilityCandidateCount: 0,
    lastMarqueeCandidateCount: 0,
    lastNodeHitCandidateCount: 0,
    lastPortHitCandidateCount: 0,
    lastVisibleNodeCandidateCount: 0,
    spatialIndexCandidateCount: 0,
    spatialIndexQueryCount: 0,
    spatialIndexRebuildCount: 1,
    spatialIndexUpdateCount: 0,
  };

  return {
    debugSnapshot: () => ({
      ...counters,
      spatialIndexNodeCount: nodeSpatialIndex.count(),
    }),
    labelVisibleNodeIds: () =>
      new Set(
        nodesInPaddedViewport({
          paddingScreenPx: 0,
          queryKind: "label-visibility",
        }).map((node) => node.id),
      ),
    marqueeCandidateIds: (bounds) =>
      new Set(
        searchSpatialIndex(bounds, "marquee")
          .filter((node) => rectanglesIntersect(bounds, nodeBounds(node)))
          .map((node) => node.id),
      ),
    nodesInPaddedViewport,
    nodeHitCandidatesAtScreen: (screen) => {
      const world = viewport.toWorld(screen);
      return {
        candidates: searchSpatialIndex(
          {
            height: 0,
            width: 0,
            x: world.x,
            y: world.y,
          },
          "node-hit",
        ),
        world,
      };
    },
    portHitCandidatesAtScreen: (screen, hitRadiusScreen) => {
      const world = viewport.toWorld(screen);
      const hitRadiusWorld = hitRadiusScreen / viewport.scaled;
      return searchSpatialIndex(
        {
          height: hitRadiusWorld * 2,
          width: hitRadiusWorld * 2,
          x: world.x - hitRadiusWorld,
          y: world.y - hitRadiusWorld,
        },
        "port-hit",
      );
    },
    visibleNodeIds: () => {
      return new Set(
        nodesInPaddedViewport({
          paddingScreenPx: 0,
          queryKind: "visible",
        }).map((node) => node.id),
      );
    },
    rebuild: (nextNodes) => {
      nodeSpatialIndex.rebuild(nextNodes);
      counters.spatialIndexRebuildCount += 1;
    },
    updateNode: (node) => {
      nodeSpatialIndex.update(node);
      counters.spatialIndexUpdateCount += 1;
    },
  };

  function nodesInPaddedViewport({ paddingScreenPx, queryKind }) {
    const worldBounds = viewportWorldBounds(viewport, paddingScreenPx);
    return searchSpatialIndex(worldBounds, queryKind).filter((node) =>
      rectanglesIntersect(nodeBounds(node), worldBounds),
    );
  }

  function searchSpatialIndex(bounds, queryKind) {
    const candidates = nodeSpatialIndex.search(bounds);
    const candidateCount = candidates.length;
    if (candidateCount > nodes.length) {
      throw new Error(
        `spatial index returned too many candidates: candidates=${candidateCount} nodes=${nodes.length}`,
      );
    }
    counters.spatialIndexQueryCount += 1;
    counters.spatialIndexCandidateCount = candidateCount;
    if (queryKind === "glow-visibility") {
      counters.lastGlowVisibilityCandidateCount = candidateCount;
    } else if (queryKind === "label-visibility") {
      counters.lastLabelVisibilityCandidateCount = candidateCount;
    } else if (queryKind === "marquee") {
      counters.lastMarqueeCandidateCount = candidateCount;
    } else if (queryKind === "node-hit") {
      counters.lastNodeHitCandidateCount = candidateCount;
    } else if (queryKind === "port-hit") {
      counters.lastPortHitCandidateCount = candidateCount;
    } else if (queryKind === "visible") {
      counters.lastVisibleNodeCandidateCount = candidateCount;
    } else {
      throw new Error(`unknown spatial index query kind: ${queryKind}`);
    }
    return candidates;
  }
}

function viewportWorldBounds(viewport, paddingScreenPx = 0) {
  const topLeft = viewport.toWorld({ x: -paddingScreenPx, y: -paddingScreenPx });
  const bottomRight = viewport.toWorld({
    x: viewport.screenWidth + paddingScreenPx,
    y: viewport.screenHeight + paddingScreenPx,
  });
  const left = Math.min(topLeft.x, bottomRight.x);
  const right = Math.max(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const bottom = Math.max(topLeft.y, bottomRight.y);
  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}
