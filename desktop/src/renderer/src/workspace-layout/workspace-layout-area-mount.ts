import { installWindowReportHooks } from "./performance-report";
import type { WorkspaceRuntime } from "./workspace-runtime";

export interface WorkspaceLayoutMountedElements {
  hosts: HTMLDivElement[];
  root: HTMLDivElement;
  stage: HTMLDivElement;
}

export interface WorkspaceLayoutMountedElementInput {
  hostPoolSize: number;
  hostRefs: Array<HTMLDivElement | null>;
  root: HTMLDivElement | null;
  stage: HTMLDivElement | null;
}

export function requireWorkspaceLayoutElements({
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

export function installWindowReportHooksForRuntime(runtime: WorkspaceRuntime): void {
  window.__settaWorkspaceReadFrameMetrics = () => runtime.metrics.snapshot();
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
