/* global performance */

import { redrawWorkspaceEdgeFlow } from "./pixi-renderer-edge-rendering";
import { drawWorkspaceGlow } from "./pixi-renderer-helpers";

export function createWorkflowGraphAnimationCoordinator({
  animatedGlow,
  animationState,
  cellAnimation,
  debugMetrics,
  edgeFlowGraphics,
  edges,
  getNode,
  nodes,
  spatialQueries,
  staticGlow,
}) {
  return {
    syncActiveSet,
    tick,
  };

  function tick(now) {
    animationState.tick(now, {
      redrawCellAnimation: ({ nodes: cellNodes, now: animationNow }) => {
        debugMetrics.measure("cell-animation-redraw", () => {
          cellAnimation.sync(cellNodes, animationNow);
        });
      },
      redrawEdgeFlow: ({ edges: flowEdges, now: animationNow }) => {
        debugMetrics.measure("edge-flow-redraw", () => {
          redrawWorkspaceEdgeFlow({
            activeSemanticNodeIds: animationState.activeSemanticNodeIds(),
            edgeFlowGraphics,
            edges: flowEdges,
            getNode,
            now: animationNow,
          });
        });
      },
      redrawNodeGlow: ({ nodes: glowNodes, now: animationNow }) => {
        debugMetrics.measure("animated-glow-redraw", () => {
          drawWorkspaceGlow(animatedGlow, glowNodes, animationNow, { mode: "animated" });
        });
      },
    });
  }

  function syncActiveSet({ cameraMotion = "settled" } = {}) {
    const visibleNodeIds = spatialQueries.visibleNodeIds();
    const visibleNodes = nodes.filter((node) => visibleNodeIds.has(node.id));
    debugMetrics.measure("animation-active-set-recompute", () => {
      animationState.recompute({ edges, nodes, visibleNodeIds });
    });
    if (cameraMotion === "moving") {
      if (animationState.edgeFlows().length === 0) {
        edgeFlowGraphics.clear();
      }
      return;
    }
    debugMetrics.measure("static-glow-redraw", () => {
      drawWorkspaceGlow(staticGlow, visibleNodes, performance.now(), {
        mode: "static",
      });
    });
    debugMetrics.measure("animated-glow-redraw", () => {
      drawWorkspaceGlow(animatedGlow, animationState.glowNodes(), performance.now(), {
        mode: "steady",
      });
    });
    debugMetrics.measure("cell-animation-redraw", () => {
      cellAnimation.sync(animationState.cellNodes(), performance.now());
    });
    if (animationState.edgeFlows().length === 0) {
      edgeFlowGraphics.clear();
    }
  }
}
