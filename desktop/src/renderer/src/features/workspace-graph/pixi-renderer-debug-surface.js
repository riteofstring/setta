/* global performance */

import { registerWorkflowGraphDebugSurface } from "./pixi-renderer-debug-registry";

export function createWorkflowGraphDebugAnimationFrameRenderer({
  animationCoordinator,
  animationState,
  app,
}) {
  let tickerHold = null;
  return {
    releaseAnimationFrame,
    renderAnimationFrame,
  };

  function renderAnimationFrame({ holdTicker = false, now } = {}) {
    const animationNow = Number.isFinite(now) ? now : performance.now();
    if (holdTicker) {
      holdTickerForCapture();
    }
    animationCoordinator.tick(animationNow);
    app.render();
    return {
      animationActive: animationState.debugSnapshot().animationActive,
      tickerHeld: tickerHold !== null,
      tickerStarted: app.ticker.started === true,
      now: animationNow,
    };
  }

  function holdTickerForCapture() {
    if (tickerHold !== null) {
      return;
    }
    tickerHold = {
      wasStarted: app.ticker.started === true,
    };
    if (tickerHold.wasStarted) {
      app.ticker.stop();
    }
  }

  function releaseAnimationFrame() {
    const hold = tickerHold;
    tickerHold = null;
    if (hold?.wasStarted) {
      app.ticker.start();
    }
    return {
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
