const GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN = Symbol(
  "GpuFlowSurfaceTextureReleaseToken",
);

export type GpuFlowSurfaceTextureReleaseReason = "source-unmounted" | "test";

type SurfaceTextureReleaseTokenBrand = {
  readonly [GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN]: true;
};

export type GpuFlowSurfaceTextureReleaseToken =
  SurfaceTextureReleaseTokenBrand & {
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

export type GpuFlowSurfaceTextureReleaseTarget = {
  destroySurfaceTexture(
    token: GpuFlowSurfaceTextureReleaseToken,
    surfaceId: string,
  ): GpuFlowSurfaceTextureReleaseResult;
};

export function releaseGpuFlowSurfaceTexture({
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
    createGpuFlowSurfaceTextureReleaseToken({ reason, surfaceId }),
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
  reason,
  surfaceId,
}: {
  readonly reason: GpuFlowSurfaceTextureReleaseReason;
  readonly surfaceId: string;
}): GpuFlowSurfaceTextureReleaseToken {
  return Object.freeze({
    [GPU_FLOW_SURFACE_TEXTURE_RELEASE_TOKEN]: true as const,
    reason,
    surfaceId,
    transactionId: `surface-texture-release:${reason}:${surfaceId}`,
  });
}
