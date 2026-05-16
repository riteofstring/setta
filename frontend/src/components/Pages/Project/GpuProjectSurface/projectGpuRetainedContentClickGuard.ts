import { GPU_FLOW_CLASS_NAMES } from "gpuFlow/gpuFlowDomClasses";
import { hitTestGpuRetainedContentInteraction } from "gpuFlow/interactions/retainedContentInteraction";
import type { GpuRetainedRuntimeFrame } from "gpuFlow/retainedRuntimeFrame";
import type { GpuFlowScene } from "gpuFlow/scene";
import type { MouseEvent as ReactMouseEvent } from "react";

export function isProjectRetainedContentClickPoint({
  event,
  getRetainedRuntimeFrame,
  root,
  scene,
}: {
  readonly event: ReactMouseEvent<HTMLElement>;
  readonly getRetainedRuntimeFrame:
    | (() => GpuRetainedRuntimeFrame | null | undefined)
    | undefined;
  readonly root: HTMLElement | null;
  readonly scene: GpuFlowScene;
}): boolean {
  const pane = root?.querySelector<HTMLElement>(
    `.${GPU_FLOW_CLASS_NAMES.pane}`,
  );
  if (!pane) {
    return false;
  }
  return (
    hitTestGpuRetainedContentInteraction({
      element: pane,
      event,
      getRetainedRuntimeFrame,
      getScene: () => scene,
    }) !== null
  );
}
