import { fitViewportToGraph } from "./pixi-renderer-camera-fit";
import { cameraState, clamp } from "./pixi-renderer-helpers";

export function createWorkflowGraphCameraControls({
  cameraSync,
  getHost,
  limits,
  nodes,
  viewport,
}) {
  return {
    fitCameraToGraph,
    panCameraByScreenDelta,
    zoomCameraAtScreen,
  };

  function panCameraByScreenDelta(deltaX, deltaY, { interactionKind = "none" } = {}) {
    if (deltaX === 0 && deltaY === 0) {
      return false;
    }
    const corner = viewport.corner;
    viewport.moveCorner(corner.x + deltaX / viewport.scaled, corner.y + deltaY / viewport.scaled);
    const changed = cameraSync.recordCameraState(cameraState(viewport), {
      interactionKind,
      moving: true,
    });
    if (changed) {
      cameraSync.scheduleCameraDependentSync();
    }
    return changed;
  }

  function zoomCameraAtScreen(screen, factor, { interactionKind = "none" } = {}) {
    const nextZoom = clamp(viewport.scaled * factor, limits.minZoom, limits.maxZoom);
    if (nextZoom === viewport.scaled) {
      return false;
    }
    const worldBefore = viewport.toWorld(screen);
    viewport.setZoom(nextZoom);
    const screenAfter = viewport.toScreen(worldBefore);
    viewport.x += screen.x - screenAfter.x;
    viewport.y += screen.y - screenAfter.y;
    const changed = cameraSync.recordCameraState(cameraState(viewport), {
      interactionKind,
      moving: true,
    });
    if (changed) {
      cameraSync.scheduleCameraDependentSync();
    }
    return changed;
  }

  function fitCameraToGraph({ maxFitZoom = 1.15, paddingScreenPx = 160 } = {}) {
    return fitViewportToGraph({
      host: getHost(),
      maxFitZoom,
      maxZoom: limits.maxZoom,
      minZoom: limits.minZoom,
      nodes,
      paddingScreenPx,
      recordCameraState: cameraSync.recordCameraState,
      runCameraDependentSyncFrame: cameraSync.runCameraDependentSyncFrame,
      scheduleCameraDependentSync: cameraSync.scheduleCameraDependentSync,
      viewport,
    });
  }
}
