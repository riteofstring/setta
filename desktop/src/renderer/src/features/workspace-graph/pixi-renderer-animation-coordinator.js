/* global performance */

import { redrawWorkspaceEdgeFlow } from "./pixi-renderer-edge-rendering";
import { drawWorkspaceGlow } from "./pixi-renderer-helpers";
import { createPaddedViewportNodeSet } from "./pixi-renderer-visibility-window";

const glowVisibilityEnterPaddingScreenPx = 192;
const glowVisibilityExitPaddingScreenPx = 384;

export function createWorkflowGraphAnimationCoordinator({
  animatedGlow,
  animationState,
  cellAnimation,
  debugMetrics,
  edgeFlowGraphics,
  edges,
  getNode,
  spatialQueries,
  staticGlow,
}) {
  const glowVisibilityWindow = createPaddedViewportNodeSet({
    enterPaddingScreenPx: glowVisibilityEnterPaddingScreenPx,
    exitPaddingScreenPx: glowVisibilityExitPaddingScreenPx,
    getNode,
    queryKind: "glow-visibility",
    spatialQueries,
  });
  let staticGlowDirty = true;
  let staticGlowVisibilityChangeCount = 0;
  let lastStaticGlowVisibleNodeCount = 0;

  return {
    debugSnapshot,
    markStaticGlowDirty,
    resetVisibility,
    syncActiveSet,
    tick,
  };

  function debugSnapshot() {
    const windowSnapshot = glowVisibilityWindow.debugSnapshot();
    return {
      glowVisibilityWindowInitialized: windowSnapshot.visibleNodeWindowInitialized,
      glowVisibilityWindowSize: windowSnapshot.visibleNodeWindowSize,
      glowVisibilityEnterPaddingScreenPx,
      glowVisibilityExitPaddingScreenPx,
      lastStaticGlowVisibleNodeCount,
      staticGlowDirty,
      staticGlowVisibilityChangeCount,
    };
  }

  function markStaticGlowDirty() {
    staticGlowDirty = true;
  }

  function resetVisibility() {
    glowVisibilityWindow.reset();
    staticGlowDirty = true;
  }

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

  function syncActiveSet({ cameraMotion = "settled", forceStaticGlow = false } = {}) {
    const visibility = glowVisibilityWindow.sync();
    const visibleNodeIds = visibility.visibleNodeIds;
    const visibleNodes = visibility.visibleNodes;
    lastStaticGlowVisibleNodeCount = visibleNodes.length;
    if (visibility.changed) {
      staticGlowVisibilityChangeCount += 1;
    }
    debugMetrics.measure("animation-active-set-recompute", () => {
      animationState.recompute({ edges, visibleNodeIds, visibleNodes });
    });
    if (cameraMotion === "moving") {
      clearInactiveEdgeFlow();
      return;
    }
    syncSettledGlowAndCells(visibleNodes, {
      redrawStaticGlow: forceStaticGlow || staticGlowDirty || visibility.changed,
    });
    clearInactiveEdgeFlow();
  }

  function clearInactiveEdgeFlow() {
    if (animationState.edgeFlows().length === 0) {
      edgeFlowGraphics.clear();
    }
  }

  function syncSettledGlowAndCells(visibleNodes, { redrawStaticGlow }) {
    if (redrawStaticGlow) {
      redrawStaticGlowForNodes(visibleNodes);
    }
    debugMetrics.measure("animated-glow-redraw", () => {
      drawWorkspaceGlow(animatedGlow, animationState.glowNodes(), performance.now(), {
        mode: "steady",
      });
    });
    debugMetrics.measure("cell-animation-redraw", () => {
      cellAnimation.sync(animationState.cellNodes(), performance.now());
    });
  }

  function redrawStaticGlowForNodes(visibleNodes) {
    debugMetrics.measure("static-glow-redraw", () => {
      drawWorkspaceGlow(staticGlow, visibleNodes, performance.now(), {
        mode: "static",
      });
    });
    staticGlowDirty = false;
  }
}
