import type { MutableRefObject, RefObject } from "react";

import type { GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";

export function clearGpuFlowDebugWindowHook(
  view: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (view[key] === value) {
    delete view[key];
  }
}

export function getGpuFlowDebugNodeInteractionActiveNodeId(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
): string | null {
  return nodeInteractionRef.current?.getActiveNodeId() ?? null;
}

export function getGpuFlowDebugOwnerDocument({
  containerRef,
  ownerWindow,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly ownerWindow: Window;
}): Document {
  return containerRef.current?.ownerDocument ?? ownerWindow.document;
}

export function resolveGpuFlowDebugOptionalValue<T>(
  resolve: (() => T | null | undefined) | undefined,
): T | null {
  return resolve?.() ?? null;
}
