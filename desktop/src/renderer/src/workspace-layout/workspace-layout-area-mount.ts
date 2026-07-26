import { useLayoutEffect, type RefObject } from "react";

import type { FrameScheduler } from "./frame-scheduler";
import { installWindowReportHooks } from "./performance-report";
import type { WorkspaceLayoutSnapshot } from "./layout-store";
import type { WorkspaceRuntime } from "./workspace-runtime";

interface WorkspaceLayoutMountedElements {
  hosts: HTMLDivElement[];
  root: HTMLDivElement;
  stage: HTMLDivElement;
}

interface WorkspaceLayoutMountedElementInput {
  hostPoolSize: number;
  hostRefs: Array<HTMLDivElement | null>;
  root: HTMLDivElement | null;
  stage: HTMLDivElement | null;
}

interface PresentationHostPoolInput {
  hostPoolSize: number;
  hostRefs: RefObject<Array<HTMLDivElement | null>>;
  rootRef: RefObject<HTMLDivElement | null>;
  runtime: WorkspaceRuntime;
  schedulerRef: RefObject<FrameScheduler | null>;
  stageRef: RefObject<HTMLDivElement | null>;
}

function requireWorkspaceLayoutElements({
  hostPoolSize,
  hostRefs,
  root,
  stage,
}: WorkspaceLayoutMountedElementInput): WorkspaceLayoutMountedElements {
  const hosts = hostRefs.filter((host): host is HTMLDivElement => host !== null);
  if (!root || !stage || hosts.length !== hostPoolSize) {
    throw new Error("workspace layout host pool did not mount");
  }
  return { hosts, root, stage };
}

export function usePresentationHostPool({
  hostPoolSize,
  hostRefs,
  rootRef,
  runtime,
  schedulerRef,
  stageRef,
}: PresentationHostPoolInput): void {
  useLayoutEffect(() => {
    const { hosts } = requireWorkspaceLayoutElements({
      hostPoolSize,
      hostRefs: hostRefs.current,
      root: rootRef.current,
      stage: stageRef.current,
    });
    runtime.presentation.syncHosts(hosts);
    schedulerRef.current?.requestFrame();
  }, [hostPoolSize, hostRefs, rootRef, runtime, schedulerRef, stageRef]);
}

export function installWindowReportHooksForRuntime(runtime: WorkspaceRuntime): void {
  const target = window as Window &
    typeof globalThis & {
      __settaWorkspaceReadFrameMetrics?: () => ReturnType<WorkspaceRuntime["metrics"]["snapshot"]>;
      __settaWorkspaceReadLayoutState?: () => WorkspaceLayoutSnapshot;
      __settaWorkspaceResetFrameMetrics?: () => void;
    };
  target.__settaWorkspaceReadFrameMetrics = () => runtime.metrics.snapshot();
  target.__settaWorkspaceReadLayoutState = () => runtime.store.getSnapshot();
  target.__settaWorkspaceResetFrameMetrics = () => runtime.metrics.reset();
  if (runtime.mode === "benchmark") {
    installWindowReportHooks();
  }
}

export function observeStageResize(
  stage: HTMLElement,
  listener: () => void,
): ResizeObserver | null {
  if (typeof ResizeObserver === "undefined") {
    return null;
  }
  const observer = new ResizeObserver(listener);
  observer.observe(stage);
  return observer;
}
