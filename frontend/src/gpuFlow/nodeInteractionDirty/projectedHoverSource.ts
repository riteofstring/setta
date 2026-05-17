import type { GpuNodeInteractionDirtyControllerOptions } from "./interactionTypes";

type ProjectHoverInteraction =
  GpuNodeInteractionDirtyControllerOptions["projectHoverInteraction"];

type ClearProjectedHoverInteraction =
  GpuNodeInteractionDirtyControllerOptions["clearProjectedHoverInteraction"];

export type GpuNodeProjectedHoverSourceController = {
  clear(nodeId?: string | null): void;
  update(
    event: PointerEvent,
    input: {
      readonly dispatchingPointerHandoff: boolean;
      readonly pointerInteractionNodeId: string | null;
    },
  ): void;
};

export function createGpuNodeProjectedHoverSourceController({
  clearProjectedHoverInteraction,
  projectHoverInteraction,
}: {
  readonly clearProjectedHoverInteraction: ClearProjectedHoverInteraction;
  readonly projectHoverInteraction: ProjectHoverInteraction;
}): GpuNodeProjectedHoverSourceController {
  let projectedHoverNodeId: string | null = null;

  function clear(nodeId = projectedHoverNodeId) {
    if (!nodeId) {
      return;
    }
    clearProjectedHoverInteraction?.(nodeId);
    if (projectedHoverNodeId === nodeId) {
      projectedHoverNodeId = null;
    }
  }

  function update(
    event: PointerEvent,
    {
      dispatchingPointerHandoff,
      pointerInteractionNodeId,
    }: {
      readonly dispatchingPointerHandoff: boolean;
      readonly pointerInteractionNodeId: string | null;
    },
  ) {
    if (
      !projectHoverInteraction ||
      dispatchingPointerHandoff ||
      pointerInteractionNodeId
    ) {
      return;
    }
    const nextHoverNodeId = projectHoverInteraction(
      event,
      projectedHoverNodeId,
    );
    if (nextHoverNodeId === projectedHoverNodeId) {
      return;
    }
    clear(projectedHoverNodeId);
    projectedHoverNodeId = nextHoverNodeId;
  }

  return { clear, update };
}
