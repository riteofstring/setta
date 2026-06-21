import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphCameraSceneSync } from "./pixi-renderer-camera-scene-sync";

describe("workflow graph camera scene sync", () => {
  test("skips scene sync while camera is moving", () => {
    const { drawAllNodeOutlines, redrawEdges, sceneGraph, syncVisibleSceneForCamera } =
      cameraSceneSyncFixture();

    expect(syncVisibleSceneForCamera({ cameraMotion: "moving" })).toBe(false);

    expect(sceneGraph.syncVisibleScene).not.toHaveBeenCalled();
    expect(drawAllNodeOutlines).not.toHaveBeenCalled();
    expect(redrawEdges).not.toHaveBeenCalled();
  });

  test("syncs and redraws settled zoom changes", () => {
    const { drawAllNodeOutlines, redrawEdges, sceneGraph, syncVisibleSceneForCamera } =
      cameraSceneSyncFixture();
    sceneGraph.syncVisibleScene.mockReturnValue({ changed: false });

    expect(syncVisibleSceneForCamera({ cameraMotion: "settled", zoomChanged: true })).toBe(false);

    expect(sceneGraph.syncVisibleScene).toHaveBeenCalledWith({ force: false });
    expect(drawAllNodeOutlines).toHaveBeenCalledTimes(1);
    expect(redrawEdges).toHaveBeenCalledTimes(1);
  });
});

function cameraSceneSyncFixture() {
  const drawAllNodeOutlines = vi.fn();
  const edgeScene = { edgeLevelOfDetailChanged: vi.fn(() => false) };
  const redrawEdges = vi.fn();
  const sceneGraph = { syncVisibleScene: vi.fn(() => ({ changed: true })) };
  return {
    drawAllNodeOutlines,
    edgeScene,
    redrawEdges,
    sceneGraph,
    syncVisibleSceneForCamera: createWorkflowGraphCameraSceneSync({
      drawAllNodeOutlines,
      edgeScene,
      redrawEdges,
      sceneGraph,
    }),
  };
}
