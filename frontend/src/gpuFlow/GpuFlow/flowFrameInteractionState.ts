import { type MutableRefObject } from "react";

import { type GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";

export function resolveGpuFlowNodeInteractionActiveNodeId(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
): string | null {
  return nodeInteractionRef.current?.getActiveNodeId() ?? null;
}

export function resolveActiveGpuFlowNodeId({
  activeResizeNodeIdRef,
  nodeInteractionRef,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
}): string | null {
  return (
    resolveGpuFlowNodeInteractionActiveNodeId(nodeInteractionRef) ??
    activeResizeNodeIdRef.current
  );
}
