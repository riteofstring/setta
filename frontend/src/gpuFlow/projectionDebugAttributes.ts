import { setGpuFlowVisibleFrameIdentityAttributes } from "./GpuFlow/visibleFrameIdentityAttributes";
import {
  assertGpuFlowCommitPublicationTokenForFrameId,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  type GpuFlowCommitPublicationToken,
} from "./GpuFlow/visibleFramePresentationProofs";
import type { GpuFlowProjectionDebugState } from "./projectionRuntime";

export function applyGpuFlowProjectionDebugAttributes({
  canvas,
  debugState,
  token,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly debugState: GpuFlowProjectionDebugState;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  setProjectionDebugAttributes(canvas, debugState, token);
  const root = canvas
    .closest<HTMLElement>("[data-tab-scope='canvas']")
    ?.querySelector<HTMLElement>("[data-gpu-flow-dom-control-plane='true']");
  if (root) {
    setProjectionDebugAttributes(root, debugState, token);
  }
}

export function setProjectionDebugAttributes(
  element: HTMLElement,
  debugState: GpuFlowProjectionDebugState,
  token: GpuFlowCommitPublicationToken,
): void {
  assertGpuFlowProjectionDebugPublicationToken({ debugState, token });
  setGpuFlowVisibleFrameIdentityAttributes(element, token);
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
  element.dataset.gpuFlowProjectionGestureOwner = debugState.gestureOwner;
  element.dataset.gpuFlowProjectionLane = debugState.lane;
  element.dataset.gpuFlowProjectionSampleId = String(
    debugState.projectionSampleId,
  );
  element.dataset.gpuFlowProjectionTransactionId =
    debugState.projectionTransactionId;
  element.dataset.gpuFlowProjectionTransactionKind = debugState.transactionKind;
}

function assertGpuFlowProjectionDebugPublicationToken({
  debugState,
  token,
}: {
  readonly debugState: GpuFlowProjectionDebugState;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  assertGpuFlowCommitPublicationTokenForFrameId({
    committedFrameId: debugState.committedFrameId,
    token,
  });
  assertGpuFlowCommitPublicationTokenForProjectionSample({
    projectionSampleId: debugState.projectionSampleId,
    token,
  });
}
