export function createWorkflowGraphCameraFrameControls({ cameraControls, requestFrame }) {
  return {
    fitCameraToGraph,
    panCameraByScreenDelta,
    zoomCameraAtScreen,
  };

  function fitCameraToGraph(options) {
    const changed = cameraControls.fitCameraToGraph(options);
    if (changed) {
      requestFrame("camera-fit");
    }
    return changed;
  }

  function panCameraByScreenDelta(deltaX, deltaY, options = {}) {
    const changed = cameraControls.panCameraByScreenDelta(deltaX, deltaY, options);
    if (changed) {
      requestFrame(options.interactionKind ?? "camera-pan");
    }
    return changed;
  }

  function zoomCameraAtScreen(screen, factor, options = {}) {
    const changed = cameraControls.zoomCameraAtScreen(screen, factor, options);
    if (changed) {
      requestFrame(options.interactionKind ?? "camera-zoom");
    }
    return changed;
  }
}
