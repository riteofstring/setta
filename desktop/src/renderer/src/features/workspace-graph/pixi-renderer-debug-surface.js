/* global performance */

import { registerWorkflowGraphDebugSurface } from "./pixi-renderer-debug-registry";

export function createWorkflowGraphDebugAnimationFrameRenderer({
  animationCoordinator,
  animationState,
  app,
  frameOwner,
}) {
  let frameOwnerHold = null;
  return {
    releaseAnimationFrame,
    renderAnimationFrame,
  };

  function renderAnimationFrame({ holdTicker = false, now } = {}) {
    const animationNow = Number.isFinite(now) ? now : performance.now();
    if (holdTicker) {
      holdFrameOwnerForCapture();
    }
    animationCoordinator.tick(animationNow);
    app.render();
    return {
      animationActive: animationState.debugSnapshot().animationActive,
      frameOwnerHeld: frameOwnerHold !== null,
      frameOwnerRunning: frameOwner.debugSnapshot().frameOwnerRunning,
      tickerHeld: frameOwnerHold !== null,
      tickerStarted: app.ticker.started === true,
      now: animationNow,
    };
  }

  function holdFrameOwnerForCapture() {
    if (frameOwnerHold !== null) {
      return;
    }
    frameOwnerHold = {
      wasRunning: frameOwner.debugSnapshot().frameOwnerRunning,
    };
    if (frameOwnerHold.wasRunning) {
      frameOwner.suspend("debug-capture");
    }
  }

  function releaseAnimationFrame() {
    const hold = frameOwnerHold;
    frameOwnerHold = null;
    if (hold?.wasRunning) {
      frameOwner.release("debug-capture-release");
    }
    return {
      frameOwnerHeld: false,
      frameOwnerRunning: frameOwner.debugSnapshot().frameOwnerRunning,
      tickerHeld: false,
      tickerStarted: app.ticker.started === true,
    };
  }
}

export function registerWorkflowGraphDebugSurfaceIfEnabled({
  debugEnabled,
  fitToGraph,
  debugSurfaceId,
  getSnapshot,
  releaseAnimationFrame,
  renderAnimationFrame,
}) {
  if (!debugEnabled) {
    return null;
  }
  return registerWorkflowGraphDebugSurface(debugSurfaceId, {
    fitToGraph,
    getSnapshot,
    releaseAnimationFrame,
    renderAnimationFrame,
  });
}
