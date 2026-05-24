import {
  assertGpuFlowBlockedPresentationTokenBrand,
  assertGpuFlowVisibleFramePresentationTokenBrand,
  type GpuFlowBlockedPresentationToken,
  type GpuFlowVisibleFramePresentationToken,
} from "./GpuFlow/visibleFramePresentationProofs";

const GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN = Symbol(
  "GpuFlowSurfaceTextureReleaseToken",
);

type GpuFlowSurfaceTextureReleaseReason =
  | "blocked-candidate"
  | "presentation-superseded"
  | "source-unmounted";

type GpuFlowSurfaceTexturePresentationOutcome = "blocked" | "presented" | "none";

type SurfaceTextureReleaseTokenBrand = {
  readonly [GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN]: true;
};

export type GpuFlowSurfaceTextureReleaseToken =
  SurfaceTextureReleaseTokenBrand & {
    readonly presentationOutcome: GpuFlowSurfaceTexturePresentationOutcome;
    readonly reason: GpuFlowSurfaceTextureReleaseReason;
    readonly surfaceId: string;
    readonly transactionId: string;
  };

export type GpuFlowSurfaceTextureReleaseResult =
  | {
      readonly kind: "deferred-protected";
      readonly surfaceId: string;
    }
  | {
      readonly kind: "manager-unavailable";
      readonly surfaceId: string;
    }
  | {
      readonly kind: "not-found";
      readonly surfaceId: string;
    }
  | {
      readonly kind: "released";
      readonly surfaceId: string;
    };

type GpuFlowSurfaceTextureReleaseTarget = {
  destroySurfaceTexture(
    token: GpuFlowSurfaceTextureReleaseToken,
    surfaceId: string,
  ): GpuFlowSurfaceTextureReleaseResult;
};

function releaseGpuFlowSurfaceTexture({
  reason,
  surfaceId,
  textureManager,
}: {
  readonly reason: GpuFlowSurfaceTextureReleaseReason;
  readonly surfaceId: string;
  readonly textureManager:
    | GpuFlowSurfaceTextureReleaseTarget
    | null
    | undefined;
}): GpuFlowSurfaceTextureReleaseResult {
  if (!textureManager) {
    return Object.freeze({
      kind: "manager-unavailable" as const,
      surfaceId,
    });
  }
  return textureManager.destroySurfaceTexture(
    createGpuFlowSurfaceTextureReleaseToken({
      presentationOutcome: "none",
      reason,
      surfaceId,
      transactionId: `surface-texture-release:${reason}:${surfaceId}`,
    }),
    surfaceId,
  );
}

export function releaseGpuFlowUnmountedSourceSurfaceTexture({
  surfaceId,
  textureManager,
}: {
  readonly surfaceId: string;
  readonly textureManager:
    | GpuFlowSurfaceTextureReleaseTarget
    | null
    | undefined;
}): GpuFlowSurfaceTextureReleaseResult {
  return releaseGpuFlowSurfaceTexture({
    reason: "source-unmounted",
    surfaceId,
    textureManager,
  });
}

export function releaseGpuFlowSupersededSurfaceTexture({
  surfaceId,
  textureManager,
  token,
}: {
  readonly surfaceId: string;
  readonly textureManager:
    | GpuFlowSurfaceTextureReleaseTarget
    | null
    | undefined;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): GpuFlowSurfaceTextureReleaseResult {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  return releaseGpuFlowPresentationOutcomeSurfaceTexture({
    presentationOutcome: "presented",
    reason: "presentation-superseded",
    surfaceId,
    textureManager,
    transactionId: token.transactionId,
  });
}

export function releaseGpuFlowBlockedCandidateSurfaceTexture({
  surfaceId,
  textureManager,
  token,
}: {
  readonly surfaceId: string;
  readonly textureManager:
    | GpuFlowSurfaceTextureReleaseTarget
    | null
    | undefined;
  readonly token: GpuFlowBlockedPresentationToken;
}): GpuFlowSurfaceTextureReleaseResult {
  assertGpuFlowBlockedPresentationTokenBrand({ token });
  return releaseGpuFlowPresentationOutcomeSurfaceTexture({
    presentationOutcome: "blocked",
    reason: "blocked-candidate",
    surfaceId,
    textureManager,
    transactionId: token.transactionId,
  });
}

function releaseGpuFlowPresentationOutcomeSurfaceTexture({
  presentationOutcome,
  reason,
  surfaceId,
  textureManager,
  transactionId,
}: {
  readonly presentationOutcome: GpuFlowSurfaceTexturePresentationOutcome;
  readonly reason: GpuFlowSurfaceTextureReleaseReason;
  readonly surfaceId: string;
  readonly textureManager:
    | GpuFlowSurfaceTextureReleaseTarget
    | null
    | undefined;
  readonly transactionId: string;
}): GpuFlowSurfaceTextureReleaseResult {
  if (!textureManager) {
    return Object.freeze({
      kind: "manager-unavailable" as const,
      surfaceId,
    });
  }
  return textureManager.destroySurfaceTexture(
    createGpuFlowSurfaceTextureReleaseToken({
      presentationOutcome,
      reason,
      surfaceId,
      transactionId,
    }),
    surfaceId,
  );
}

export function assertGpuFlowSurfaceTextureReleaseToken({
  surfaceId,
  token,
}: {
  readonly surfaceId: string;
  readonly token: GpuFlowSurfaceTextureReleaseToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN] !== true ||
    token.surfaceId !== surfaceId
  ) {
    throw new Error(
      `GPU Flow surface texture release requires a release token for surface "${surfaceId}".`,
    );
  }
}

function createGpuFlowSurfaceTextureReleaseToken({
  presentationOutcome,
  reason,
  surfaceId,
  transactionId,
}: {
  readonly presentationOutcome: GpuFlowSurfaceTexturePresentationOutcome;
  readonly reason: GpuFlowSurfaceTextureReleaseReason;
  readonly surfaceId: string;
  readonly transactionId: string;
}): GpuFlowSurfaceTextureReleaseToken {
  return Object.freeze({
    [GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN]: true as const,
    presentationOutcome,
    reason,
    surfaceId,
    transactionId,
  });
}
