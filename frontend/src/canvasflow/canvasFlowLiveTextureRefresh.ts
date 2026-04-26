export const CANVAS_FLOW_INTERACTIVE_TEXTURE_REFRESH_MS = 900;

type ScheduleCanvasFlowTexturePaint = (
  reason?: string,
  nodeIds?: ReadonlySet<string> | "all",
) => void;

type CanvasFlowAnimationFrameRequest = (
  callback: FrameRequestCallback,
) => number;
type CanvasFlowAnimationFrameCancel = (handle: number) => void;

type CreateCanvasFlowLiveTextureRefreshControllerParams = {
  cancelAnimationFrame?: CanvasFlowAnimationFrameCancel;
  now?: () => number;
  requestAnimationFrame?: CanvasFlowAnimationFrameRequest;
  scheduleTexturePaint: ScheduleCanvasFlowTexturePaint;
};

export type CanvasFlowLiveTextureRefreshController = {
  destroy: () => void;
  request: (
    reason: string,
    nodeIds: ReadonlySet<string>,
    durationMs?: number,
  ) => void;
};

export function createCanvasFlowLiveTextureRefreshController({
  cancelAnimationFrame = window.cancelAnimationFrame.bind(window),
  now = () => performance.now(),
  requestAnimationFrame = window.requestAnimationFrame.bind(window),
  scheduleTexturePaint,
}: CreateCanvasFlowLiveTextureRefreshControllerParams): CanvasFlowLiveTextureRefreshController {
  const deadlinesByNodeId = new Map<string, number>();
  let frameId: number | null = null;
  let lastReason = "live-texture";

  const requestNextFrame = () => {
    if (frameId !== null) {
      return;
    }
    frameId = requestAnimationFrame(runFrame);
  };

  const runFrame = (timestamp: number) => {
    frameId = null;
    const nowMs = Number.isFinite(timestamp) ? timestamp : now();
    const liveNodeIds = new Set<string>();
    for (const [nodeId, deadline] of deadlinesByNodeId) {
      if (deadline <= nowMs) {
        deadlinesByNodeId.delete(nodeId);
        continue;
      }
      liveNodeIds.add(nodeId);
    }
    if (liveNodeIds.size === 0) {
      return;
    }
    scheduleTexturePaint(`live-${lastReason}`, liveNodeIds);
    requestNextFrame();
  };

  return {
    destroy() {
      deadlinesByNodeId.clear();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
    request(
      reason,
      nodeIds,
      durationMs = CANVAS_FLOW_INTERACTIVE_TEXTURE_REFRESH_MS,
    ) {
      const deadline = now() + durationMs;
      lastReason = reason;
      for (const nodeId of nodeIds) {
        deadlinesByNodeId.set(
          nodeId,
          Math.max(deadlinesByNodeId.get(nodeId) ?? 0, deadline),
        );
      }
      requestNextFrame();
    },
  };
}
