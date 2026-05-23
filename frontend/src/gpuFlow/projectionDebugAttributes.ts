import {
  assertGpuFlowCommitPublicationTokenForFrameId,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./GpuFlow/visibleFramePublicationTokens";
import type { GpuFlowProjectionDebugState } from "./projectionRuntime";

type GpuFlowProjectionDebugPublicationToken =
  | GpuFlowCommitPublicationToken
  | GpuFlowHoldPreviousToken;

export function applyGpuFlowProjectionDebugAttributes({
  canvas,
  debugState,
  token,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly debugState: GpuFlowProjectionDebugState;
  readonly token: GpuFlowProjectionDebugPublicationToken;
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
  token: GpuFlowProjectionDebugPublicationToken,
): void {
  assertGpuFlowProjectionDebugPublicationToken({ debugState, token });
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
  readonly token: GpuFlowProjectionDebugPublicationToken;
}): void {
  if ("holdAgeFrames" in token) {
    assertGpuFlowHoldPreviousTokenForProjectionSample({
      projectionSampleId: token.projectionSampleId,
      token,
    });
    if (
      token.committedFrameId !== debugState.committedFrameId ||
      token.holdAgeFrames !== debugState.heldPreviousFrameCount ||
      token.holdAgeMs !== debugState.heldPreviousDurationMs
    ) {
      throw new Error(
        "GPU Flow projection debug publication requires a hold token for the same frozen visible frame.",
      );
    }
    return;
  }
  assertGpuFlowCommitPublicationTokenForFrameId({
    committedFrameId: debugState.committedFrameId,
    token,
  });
  assertGpuFlowCommitPublicationTokenForProjectionSample({
    projectionSampleId: debugState.projectionSampleId,
    token,
  });
}
