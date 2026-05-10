import { GPU_FLOW_CLASS_NAMES } from "gpuFlow/gpuFlowDomClasses";
import { hitTestGpuRetainedContentInteraction } from "gpuFlow/interactions/retainedContentInteraction";
import type { GpuFlowScene } from "gpuFlow/scene";
import type { MouseEvent as ReactMouseEvent } from "react";

export function isProjectRetainedContentClickPoint({
  event,
  root,
  scene,
}: {
  readonly event: ReactMouseEvent<HTMLElement>;
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
      getScene: () => scene,
    }) !== null
  );
}
