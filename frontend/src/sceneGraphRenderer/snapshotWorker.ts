/// <reference lib="webworker" />

import {
  runSceneGraphSnapshotBuildTask,
  type SceneGraphSnapshotWorkerRequest,
  type SceneGraphSnapshotWorkerResponse,
} from "./snapshotPipeline";

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener(
  "message",
  (event: MessageEvent<SceneGraphSnapshotWorkerRequest>) => {
    const request = event.data;
    if (request.type !== "build_snapshot") {
      return;
    }
    try {
      const result = runSceneGraphSnapshotBuildTask(request);
      const response: SceneGraphSnapshotWorkerResponse = {
        type: "build_snapshot_result",
        requestId: request.requestId,
        snapshot: result.snapshot,
        diff: result.diff,
        buildMs: result.buildMs,
        diffMs: result.diffMs,
        totalMs: result.totalMs,
      };
      self.postMessage(response);
    } catch (error) {
      const response: SceneGraphSnapshotWorkerResponse = {
        type: "build_snapshot_error",
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    }
  },
);

export {};
