import type {
  GpuFlowLayoutChange,
  GpuFlowLayoutStoreApi,
} from "gpuFlow/layoutStore";
import {
  getGpuFlowSceneDomSectionNodes,
  type GpuFlowScene,
} from "gpuFlow/scene";
import { useEffect } from "react";
import type { ZustandProjectState } from "state/definitions";

import type { ProjectGpuFlowSceneOptions } from "./projectGpuFlowSceneFactory";
import {
  claimProjectGpuFlowPrewarmKey,
  createProjectGpuFlowPrewarmKey,
  getProjectGpuFlowPrewarmViewModeIds,
  prewarmProjectGpuFlowSceneCacheViewMode,
} from "./projectGpuLayoutSceneCache";

type ProjectGpuFlowSceneFactory = (
  projectState: ZustandProjectState,
  options: ProjectGpuFlowSceneOptions,
) => GpuFlowScene;

let projectGpuLayoutStoreSyncSubscriberCount = 0;
const PROJECT_GPU_FLOW_PREWARM_INITIAL_DELAY_MS = 3_000;
const PROJECT_GPU_FLOW_PREWARM_MIN_IDLE_MS = 12;
const PROJECT_GPU_LAYOUT_STORE_SYNC_IDLE_TIMEOUT_MS = 1_000;
const PROJECT_GPU_LAYOUT_STORE_SYNC_MIN_IDLE_MS = 12;
const PROJECT_GPU_LAYOUT_STORE_SYNC_FALLBACK_DELAY_MS = 250;

export function hasProjectGpuLayoutStoreSyncSubscribers(): boolean {
  return projectGpuLayoutStoreSyncSubscriberCount > 0;
}

export function syncProjectGpuLayoutStoreFromScene(
  layoutStore: GpuFlowLayoutStoreApi,
  scene: GpuFlowScene,
): GpuFlowLayoutChange {
  return layoutStore
    .getState()
    .replaceNodes(getGpuFlowSceneDomSectionNodes(scene), {
      phase: "commit",
      reason: "project-sync",
    });
}

export function useProjectGpuFlowSceneCachePrewarm({
  getProjectGpuFlowScene,
  projectState,
  sceneOptions,
}: {
  readonly getProjectGpuFlowScene: ProjectGpuFlowSceneFactory;
  readonly projectState: ZustandProjectState;
  readonly sceneOptions: ProjectGpuFlowSceneOptions;
}) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const prewarmKey = createProjectGpuFlowPrewarmKey(
      projectState,
      sceneOptions,
    );
    if (!claimProjectGpuFlowPrewarmKey(prewarmKey)) {
      return;
    }
    const prewarmViewModeIds =
      getProjectGpuFlowPrewarmViewModeIds(projectState);
    let canceled = false;
    let idleCallbackId: number | null = null;
    let timerId: number | null = null;
    let nextPrewarmIndex = 0;
    const clearScheduledPrewarm = () => {
      if (idleCallbackId !== null && window.cancelIdleCallback) {
        window.cancelIdleCallback(idleCallbackId);
        idleCallbackId = null;
      }
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };
    const runNextPrewarm = () => {
      idleCallbackId = null;
      timerId = null;
      if (canceled) {
        return;
      }
      const activeViewModeId = prewarmViewModeIds[nextPrewarmIndex];
      nextPrewarmIndex += 1;
      if (activeViewModeId) {
        prewarmProjectGpuFlowSceneCacheViewMode(
          projectState,
          sceneOptions,
          activeViewModeId,
          getProjectGpuFlowScene,
        );
      }
      if (nextPrewarmIndex < prewarmViewModeIds.length) {
        scheduleNextPrewarm();
      }
    };
    const runNextIdlePrewarm = (deadline?: IdleDeadline) => {
      if (
        deadline &&
        !deadline.didTimeout &&
        deadline.timeRemaining() < PROJECT_GPU_FLOW_PREWARM_MIN_IDLE_MS
      ) {
        scheduleNextPrewarm();
        return;
      }
      runNextPrewarm();
    };
    const scheduleNextPrewarm = () => {
      clearScheduledPrewarm();
      if (window.requestIdleCallback) {
        idleCallbackId = window.requestIdleCallback(runNextIdlePrewarm);
        return;
      }
      timerId = window.setTimeout(runNextPrewarm, 1_000);
    };
    timerId = window.setTimeout(
      scheduleNextPrewarm,
      PROJECT_GPU_FLOW_PREWARM_INITIAL_DELAY_MS,
    );
    return () => {
      canceled = true;
      clearScheduledPrewarm();
    };
  }, [getProjectGpuFlowScene, projectState, sceneOptions]);
}

export function useProjectGpuLayoutStoreSceneSync(
  layoutStore: GpuFlowLayoutStoreApi,
  scene: GpuFlowScene,
) {
  useEffect(() => {
    projectGpuLayoutStoreSyncSubscriberCount += 1;
    let canceled = false;
    let idleCallbackId: number | null = null;
    let timerId: number | null = null;
    const syncScene = () => {
      idleCallbackId = null;
      timerId = null;
      if (!canceled) {
        syncProjectGpuLayoutStoreFromScene(layoutStore, scene);
      }
    };
    const scheduleIdleSync = () => {
      if (typeof window === "undefined") {
        syncScene();
        return;
      }
      if (window.requestIdleCallback && window.cancelIdleCallback) {
        idleCallbackId = window.requestIdleCallback(
          (deadline) => {
            idleCallbackId = null;
            if (canceled) {
              return;
            }
            if (
              !deadline.didTimeout &&
              deadline.timeRemaining() <
                PROJECT_GPU_LAYOUT_STORE_SYNC_MIN_IDLE_MS
            ) {
              scheduleIdleSync();
              return;
            }
            syncScene();
          },
          { timeout: PROJECT_GPU_LAYOUT_STORE_SYNC_IDLE_TIMEOUT_MS },
        );
        return;
      }
      timerId = window.setTimeout(
        syncScene,
        PROJECT_GPU_LAYOUT_STORE_SYNC_FALLBACK_DELAY_MS,
      );
    };
    if (typeof window === "undefined") {
      syncScene();
    } else {
      scheduleIdleSync();
    }
    return () => {
      canceled = true;
      if (
        idleCallbackId !== null &&
        typeof window !== "undefined" &&
        window.cancelIdleCallback
      ) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timerId !== null && typeof window !== "undefined") {
        window.clearTimeout(timerId);
      }
      projectGpuLayoutStoreSyncSubscriberCount = Math.max(
        0,
        projectGpuLayoutStoreSyncSubscriberCount - 1,
      );
    };
  }, [layoutStore, scene]);
}
