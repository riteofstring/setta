import {
  assertGpuFlowBlockedPublicationTokenBrand,
  assertGpuFlowCommitPublicationTokenBrand,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowCommitPublicationToken,
} from "./GpuFlow/visibleFramePresentationProofs";

const GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN = Symbol(
  "GpuFlowSurfaceTextureReleaseToken",
);

type GpuFlowSurfaceTextureReleaseReason =
  | "blocked-rejected-candidate"
  | "commit-superseded"
  | "source-unmounted";

type GpuFlowSurfaceTexturePublicationOutcome = "blocked" | "commit" | "none";

type SurfaceTextureReleaseTokenBrand = {
  readonly [GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN]: true;
};

export type GpuFlowSurfaceTextureReleaseToken =
  SurfaceTextureReleaseTokenBrand & {
    readonly publicationOutcome: GpuFlowSurfaceTexturePublicationOutcome;
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
      publicationOutcome: "none",
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
  readonly token: GpuFlowCommitPublicationToken;
}): GpuFlowSurfaceTextureReleaseResult {
  assertGpuFlowCommitPublicationTokenBrand({ token });
  return releaseGpuFlowPublicationOutcomeSurfaceTexture({
    publicationOutcome: "commit",
    reason: "commit-superseded",
    surfaceId,
    textureManager,
    transactionId: token.transactionId,
  });
}

export function releaseGpuFlowRejectedCandidateSurfaceTexture({
  surfaceId,
  textureManager,
  token,
}: {
  readonly surfaceId: string;
  readonly textureManager:
    | GpuFlowSurfaceTextureReleaseTarget
    | null
    | undefined;
  readonly token: GpuFlowBlockedPublicationToken;
}): GpuFlowSurfaceTextureReleaseResult {
  assertGpuFlowBlockedPublicationTokenBrand({ token });
  return releaseGpuFlowPublicationOutcomeSurfaceTexture({
    publicationOutcome: "blocked",
    reason: "blocked-rejected-candidate",
    surfaceId,
    textureManager,
    transactionId: token.transactionId,
  });
}

function releaseGpuFlowPublicationOutcomeSurfaceTexture({
  publicationOutcome,
  reason,
  surfaceId,
  textureManager,
  transactionId,
}: {
  readonly publicationOutcome: GpuFlowSurfaceTexturePublicationOutcome;
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
      publicationOutcome,
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
  publicationOutcome,
  reason,
  surfaceId,
  transactionId,
}: {
  readonly publicationOutcome: GpuFlowSurfaceTexturePublicationOutcome;
  readonly reason: GpuFlowSurfaceTextureReleaseReason;
  readonly surfaceId: string;
  readonly transactionId: string;
}): GpuFlowSurfaceTextureReleaseToken {
  return Object.freeze({
    [GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN]: true as const,
    publicationOutcome,
    reason,
    surfaceId,
    transactionId,
  });
}
