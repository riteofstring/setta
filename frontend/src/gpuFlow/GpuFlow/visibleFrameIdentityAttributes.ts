import type { GpuFlowCommitPublicationToken } from "./visibleFramePresentationProofs";

type GpuFlowVisibleFrameIdentityDataAttributes = {
  readonly "data-gpu-flow-content-frame-id"?: string | undefined;
  readonly "data-gpu-flow-presentation-id"?: string | undefined;
};

export function getGpuFlowVisibleFrameIdentityDataAttributes(
  token: GpuFlowCommitPublicationToken | null,
): GpuFlowVisibleFrameIdentityDataAttributes {
  if (token === null) {
    return Object.freeze({});
  }
  return Object.freeze({
    "data-gpu-flow-content-frame-id": String(token.contentFrameId),
    "data-gpu-flow-presentation-id": String(token.presentationId),
  });
}

export function setGpuFlowVisibleFrameIdentityAttributes(
  element: HTMLElement,
  token: GpuFlowCommitPublicationToken,
): void {
  element.dataset.gpuFlowContentFrameId = String(token.contentFrameId);
  element.dataset.gpuFlowPresentationId = String(token.presentationId);
}

export function clearGpuFlowVisibleFrameIdentityAttributes(
  element: HTMLElement,
): void {
  delete element.dataset.gpuFlowContentFrameId;
  delete element.dataset.gpuFlowPresentationId;
}
