import type { DirtyNodeReason, NodeTexturePriority } from "./dirtyTracking";

export const GPU_FLOW_NODE_DIRTY_EVENT = "setta-gpu-flow-node-dirty";

type GpuFlowNodeDirtyEventDetail = {
  readonly animated?: boolean | undefined;
  readonly priority?: NodeTexturePriority | undefined;
  readonly reason?: DirtyNodeReason | undefined;
};

export function dispatchGpuFlowNodeDirtyEvent(
  target: EventTarget | null | undefined,
  detail: GpuFlowNodeDirtyEventDetail = {},
): boolean {
  const element = resolveDirtyEventElement(target);
  if (!element) {
    return false;
  }
  return element.dispatchEvent(
    new CustomEvent<GpuFlowNodeDirtyEventDetail>(GPU_FLOW_NODE_DIRTY_EVENT, {
      bubbles: true,
      composed: true,
      detail,
    }),
  );
}

export function getGpuFlowNodeDirtyEventDetail(
  event: Event,
): GpuFlowNodeDirtyEventDetail | null {
  if (event.type !== GPU_FLOW_NODE_DIRTY_EVENT) {
    return null;
  }
  if (typeof CustomEvent === "undefined" || !(event instanceof CustomEvent)) {
    return null;
  }
  const detail = event.detail;
  if (!detail || typeof detail !== "object") {
    return {};
  }
  return detail as GpuFlowNodeDirtyEventDetail;
}

function resolveDirtyEventElement(
  target: EventTarget | null | undefined,
): Element | null {
  if (!target || typeof Element === "undefined") {
    return null;
  }
  if (target instanceof Element) {
    return target;
  }
  if (typeof Text !== "undefined" && target instanceof Text) {
    return target.parentElement;
  }
  return null;
}
