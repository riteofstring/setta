import {
  assertGpuFlowBlockedPublicationTokenBrand,
  assertGpuFlowCommitPublicationTokenBrand,
  assertGpuFlowHoldPreviousTokenBrand,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";

export function assertGpuFlowColdStartShellPublicationToken({
  token,
}: {
  readonly token:
    | GpuFlowBlockedPublicationToken
    | GpuFlowCommitPublicationToken
    | GpuFlowHoldPreviousToken;
}): void {
  if ("blockedReasons" in token) {
    assertGpuFlowBlockedPublicationTokenBrand({ token });
    return;
  }
  if ("holdAgeFrames" in token) {
    assertGpuFlowHoldPreviousTokenBrand({ token });
    return;
  }
  assertGpuFlowCommitPublicationTokenBrand({ token });
}
