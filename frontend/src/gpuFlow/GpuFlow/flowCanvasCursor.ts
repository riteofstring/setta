import type { GpuNodeLayout } from "../htmlSurfaces/frame";
import { resolveGpuRetainedContentCursor } from "../retainedContentCursor";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import { resolveGpuFlowNodeResizeCursor } from "./nodeResizeTarget";
import type { GpuFlowRetainedContentInteractionOptions } from "./retainedContentControllers";

export function resolveGpuFlowCanvasCursor({
  event,
  getRetainedRuntimeFrame,
  getScene,
  nodes,
  retainedContentInteraction,
  store,
  surfaceElement,
  viewport,
}: {
  readonly event: PointerEvent;
  readonly getRetainedRuntimeFrame:
    | (() => GpuRetainedRuntimeFrame | null | undefined)
    | undefined;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly retainedContentInteraction: GpuFlowRetainedContentInteractionOptions;
  readonly store: GpuFlowViewportStoreApi;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
}): string | null {
  return (
    (isGpuFlowRetainedContentCursorEnabled(retainedContentInteraction)
      ? resolveGpuRetainedContentCursor({
          element: surfaceElement,
          event,
          getRetainedRuntimeFrame,
          getScene,
          store,
        })
      : null) ??
    resolveGpuFlowNodeResizeCursor({
      event,
      nodes,
      surfaceElement,
      viewport,
    })
  );
}

function isGpuFlowRetainedContentCursorEnabled(
  options: GpuFlowRetainedContentInteractionOptions,
): boolean {
  if (!options) {
    return false;
  }
  const disabled = options.disabled;
  return !(typeof disabled === "function" ? disabled() : Boolean(disabled));
}
