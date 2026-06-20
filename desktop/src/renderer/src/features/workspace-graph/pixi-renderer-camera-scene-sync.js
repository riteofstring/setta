export function createWorkflowGraphCameraSceneSync({
  drawAllNodeOutlines,
  edgeScene,
  redrawEdges,
  sceneGraph,
}) {
  return function syncVisibleSceneForCamera(options = {}) {
    const sync = cameraSceneSyncForOptions(options);
    if (sync === null) {
      return false;
    }
    const update = sceneGraph.syncVisibleScene({ force: sync.force });
    if (cameraSceneSyncRequiresRedraw({ edgeScene, update, zoomChanged: sync.zoomChanged })) {
      drawAllNodeOutlines();
      redrawEdges();
    }
    return update.changed;
  };
}

function cameraSceneSyncForOptions({
  cameraMotion = "settled",
  force = false,
  zoomChanged = false,
} = {}) {
  return cameraMotion === "moving" && !force ? null : { force, zoomChanged };
}

function cameraSceneSyncRequiresRedraw({ edgeScene, update, zoomChanged }) {
  return update.changed || zoomChanged || edgeScene.edgeLevelOfDetailChanged();
}
