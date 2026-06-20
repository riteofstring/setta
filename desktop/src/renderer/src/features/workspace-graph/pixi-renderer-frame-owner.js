/* global performance, requestAnimationFrame, cancelAnimationFrame */

export function createWorkflowGraphFrameOwner({
  app,
  cancelFrame = defaultCancelFrame,
  now = () => performance.now(),
  onFrame,
  requestFrame = defaultRequestFrame,
  shouldContinue = () => false,
}) {
  let destroyed = false;
  let frameId = null;
  let held = false;
  let running = false;
  let frameCount = 0;
  let renderCount = 0;
  let requestCount = 0;
  let cancelCount = 0;
  let staleFrameCount = 0;
  let lastFrameReason = "none";
  let lastRequestReason = "none";

  return {
    debugSnapshot,
    destroy,
    release,
    request,
    start,
    stop,
    suspend,
  };

  function start(reason = "start") {
    if (destroyed) {
      return false;
    }
    running = true;
    return schedule(reason);
  }

  function stop(reason = "stop") {
    running = false;
    return cancelScheduledFrame(reason);
  }

  function suspend(reason = "suspend") {
    held = true;
    return stop(reason);
  }

  function release(reason = "release") {
    if (destroyed) {
      return false;
    }
    held = false;
    running = true;
    return schedule(reason);
  }

  function request(reason = "request") {
    if (destroyed || held) {
      return false;
    }
    running = true;
    return schedule(reason);
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    running = false;
    held = false;
    cancelScheduledFrame("destroy");
  }

  function schedule(reason) {
    if (frameId !== null) {
      lastRequestReason = reason;
      return false;
    }
    requestCount += 1;
    lastRequestReason = reason;
    frameId = requestFrame(runFrame);
    return true;
  }

  function cancelScheduledFrame(reason) {
    if (frameId === null) {
      lastRequestReason = reason;
      return false;
    }
    cancelFrame(frameId);
    frameId = null;
    cancelCount += 1;
    lastRequestReason = reason;
    return true;
  }

  function runFrame(timestamp) {
    frameId = null;
    if (destroyed || held || !running) {
      staleFrameCount += 1;
      return;
    }
    const frameNow = Number.isFinite(timestamp) ? timestamp : now();
    frameCount += 1;
    lastFrameReason = lastRequestReason;
    onFrame(frameNow);
    app.render();
    renderCount += 1;
    if (shouldContinue()) {
      schedule("continuous");
    }
  }

  function debugSnapshot() {
    return {
      frameOwnerCancelCount: cancelCount,
      frameOwnerFrameCount: frameCount,
      frameOwnerHeld: held,
      frameOwnerLastFrameReason: lastFrameReason,
      frameOwnerLastRequestReason: lastRequestReason,
      frameOwnerRenderCount: renderCount,
      frameOwnerRequestCount: requestCount,
      frameOwnerRunning: running,
      frameOwnerScheduled: frameId !== null,
      frameOwnerStaleFrameCount: staleFrameCount,
    };
  }
}

function defaultRequestFrame(callback) {
  return requestAnimationFrame(callback);
}

function defaultCancelFrame(frameId) {
  cancelAnimationFrame(frameId);
}
