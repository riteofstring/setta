import { GPU_FLOW_CLASS_NAMES } from "gpuFlow/gpuFlowDomClasses";
import { hitTestGpuRetainedContentInteraction } from "gpuFlow/interactions/retainedContentInteraction";
import type { GpuRetainedRuntimeFrame } from "gpuFlow/retainedRuntimeFrame";
import type { GpuFlowScene } from "gpuFlow/scene";

type ProjectRetainedContentPointerEvent = Pick<
  PointerEvent,
  "clientX" | "clientY"
>;

export function isProjectRetainedContentClickPoint({
  event,
  forceCurrentScene = false,
  getRetainedRuntimeFrame,
  root,
  scene,
}: {
  readonly event: ProjectRetainedContentPointerEvent;
  readonly forceCurrentScene?: boolean | undefined;
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
      forceCurrentScene,
      getRetainedRuntimeFrame,
      getScene: () => scene,
    }) !== null
  );
}
