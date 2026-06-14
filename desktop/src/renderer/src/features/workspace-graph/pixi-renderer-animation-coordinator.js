/* global performance */

import { redrawWorkspaceEdgeFlow } from "./pixi-renderer-edge-rendering";
import { drawWorkspaceGlow } from "./pixi-renderer-helpers";

export function createWorkflowGraphAnimationCoordinator({
  animatedGlow,
  animationState,
  cellAnimation,
  edgeFlowGraphics,
  edges,
  getNode,
  nodes,
  spatialQueries,
  staticGlow,
  viewport,
}) {
  return {
    syncActiveSet,
    tick,
  };

  function tick(now) {
    animationState.tick(now, {
      redrawCellAnimation: ({ nodes: cellNodes, now: animationNow }) => {
        cellAnimation.sync(cellNodes, animationNow);
      },
      redrawEdgeFlow: ({ edges: flowEdges, now: animationNow }) => {
        redrawWorkspaceEdgeFlow({
          activeSemanticNodeIds: animationState.activeSemanticNodeIds(),
          edgeFlowGraphics,
          edges: flowEdges,
          getNode,
          now: animationNow,
        });
      },
      redrawNodeGlow: ({ nodes: glowNodes, now: animationNow }) => {
        drawWorkspaceGlow(animatedGlow, glowNodes, animationNow, {
          mode: "animated",
          zoom: viewport.scaled,
        });
      },
    });
  }

  function syncActiveSet() {
    const visibleNodeIds = spatialQueries.visibleNodeIds();
    const visibleNodes = nodes.filter((node) => visibleNodeIds.has(node.id));
    animationState.recompute({ edges, nodes, visibleNodeIds });
    drawWorkspaceGlow(staticGlow, visibleNodes, performance.now(), {
      mode: "static",
      zoom: viewport.scaled,
    });
    drawWorkspaceGlow(animatedGlow, animationState.glowNodes(), performance.now(), {
      mode: "steady",
      zoom: viewport.scaled,
    });
    cellAnimation.sync(animationState.cellNodes(), performance.now());
    if (animationState.edgeFlows().length === 0) {
      edgeFlowGraphics.clear();
    }
  }
}
