import type { GpuFlowProjectionDebugState } from "./projectionRuntime";

export function applyGpuFlowProjectionDebugAttributes({
  canvas,
  debugState,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly debugState: GpuFlowProjectionDebugState;
}): void {
  setProjectionDebugAttributes(canvas, debugState);
  const root = canvas.ownerDocument.querySelector<HTMLElement>(
    "[data-gpu-flow-dom-control-plane='true']",
  );
  if (root) {
    setProjectionDebugAttributes(root, debugState);
  }
}

export function setProjectionDebugAttributes(
  element: HTMLElement,
  debugState: GpuFlowProjectionDebugState,
): void {
  element.dataset.gpuFlowCommittedFrameId = String(debugState.committedFrameId);
  element.dataset.gpuFlowHeldPreviousDurationMs = String(
    debugState.heldPreviousDurationMs,
  );
  element.dataset.gpuFlowHeldPreviousFrameCount = String(
    debugState.heldPreviousFrameCount,
  );
  element.dataset.gpuFlowHeldPreviousOverBudget =
    debugState.heldPreviousOverBudget ? "true" : "false";
  element.dataset.gpuFlowHeldPreviousReason =
    debugState.heldPreviousReason ?? "";
  element.dataset.gpuFlowHeldPreviousRequestedSampleId =
    debugState.heldPreviousRequestedSampleId === null
      ? ""
      : String(debugState.heldPreviousRequestedSampleId);
  element.dataset.gpuFlowProjectionLane = debugState.lane;
  element.dataset.gpuFlowProjectionSampleId = String(
    debugState.projectionSampleId,
  );
  element.dataset.gpuFlowProjectionTransactionId =
    debugState.projectionTransactionId;
  element.dataset.gpuFlowProjectionTransactionKind = debugState.transactionKind;
}
