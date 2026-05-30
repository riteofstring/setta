import {
  resolveGpuNodePointerHandoffTarget,
  resolveGpuNodeTargetDescriptor,
} from "../activeNodeTargeting";
import type { GpuNodeLayout } from "../htmlSurfaces/frame";
import type { HtmlSurfaceEffectHitProjector } from "../htmlSurfaces/hitScene";
import type { HtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";
import type { HtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";
import {
  resolveGpuNodeResizeDirection,
  resolveGpuNodeResizeTargetFromEventTarget,
  type GpuNodeResizeTarget,
} from "../resizeHandles";
import type { GpuViewportInput } from "../viewportMath";

export function resolveGpuFlowNodeResizeTarget({
  effectProjectors,
  elementByNodeId,
  event,
  nodes,
  sourceInteractionProjector,
  surfaceElement,
  viewport,
  visualScene,
}: {
  readonly effectProjectors: ReadonlyMap<string, HtmlSurfaceEffectHitProjector>;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly event: PointerEvent;
  readonly nodes: readonly GpuNodeLayout[];
  readonly sourceInteractionProjector: HtmlSurfaceInteractionProjector;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
}): GpuNodeResizeTarget | null {
  const directTarget = resolveGpuNodeResizeTargetFromEventTarget(event.target);
  if (directTarget) {
    return directTarget;
  }

  const handoffTarget = resolveGpuNodePointerHandoffTarget({
    clientX: event.clientX,
    clientY: event.clientY,
    effectProjectors,
    elementByNodeId,
    nodes,
    projectSourceForHitTesting: (projection) => {
      sourceInteractionProjector.alignSourceToClientPoint({
        localX: projection.localX,
        localY: projection.localY,
        sourceElement: projection.sourceElement,
        sourceId: projection.nodeId,
        surfaceX: projection.surfaceX,
        surfaceY: projection.surfaceY,
      });
    },
    surfaceElement,
    viewport,
    visualScene,
  });
  if (!handoffTarget) {
    return null;
  }
  const nodeElement = elementByNodeId.get(handoffTarget.nodeId);
  if (!nodeElement) {
    return null;
  }
  return resolveGpuFlowNodeResizeHandoffTarget({
    elementByNodeId,
    nodeId: handoffTarget.nodeId,
    targetElement: resolveGpuNodeTargetDescriptor(
      nodeElement,
      handoffTarget.descriptor,
    ),
  });
}

function resolveGpuFlowNodeResizeHandoffTarget({
  elementByNodeId,
  nodeId,
  targetElement,
}: {
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly nodeId: string;
  readonly targetElement: HTMLElement | null;
}): GpuNodeResizeTarget | null {
  if (!elementByNodeId.has(nodeId) || !targetElement) {
    return null;
  }
  const direction = resolveGpuNodeResizeDirection(targetElement);
  if (!direction) {
    return null;
  }
  return {
    direction,
    nodeId,
    targetElement,
  };
}
