type PaintDeferredDirtySurface = {
  readonly deferUploadUntilPaint?: boolean | undefined;
  readonly surfaceId: string;
};

export class HtmlSurfaceTexturePaintDeferral {
  private paintGeneration = 0;
  private readonly pendingSurfacePaintGenerations = new Map<string, number>();
  private readonly surfacePaintGenerations = new Map<string, number>();

  clear() {
    this.paintGeneration = 0;
    this.pendingSurfacePaintGenerations.clear();
    this.surfacePaintGenerations.clear();
  }

  deleteSurface(surfaceId: string) {
    this.pendingSurfacePaintGenerations.delete(surfaceId);
    this.surfacePaintGenerations.delete(surfaceId);
  }

  markDirty(input: PaintDeferredDirtySurface) {
    if (!input.deferUploadUntilPaint) {
      return;
    }
    this.pendingSurfacePaintGenerations.set(
      input.surfaceId,
      (this.surfacePaintGenerations.get(input.surfaceId) ?? 0) + 1,
    );
  }

  markSurfacesPainted(surfaceIds: Iterable<string>) {
    const uniqueSurfaceIds = new Set(surfaceIds);
    if (uniqueSurfaceIds.size === 0) {
      return;
    }
    this.paintGeneration += 1;
    for (const surfaceId of uniqueSurfaceIds) {
      this.surfacePaintGenerations.set(surfaceId, this.paintGeneration);
    }
  }

  resolveDeferredSurfaceIds(
    deferSurfaceIds: ReadonlySet<string>,
  ): ReadonlySet<string> {
    const resolvedSurfaceIds = new Set(deferSurfaceIds);
    for (const [
      surfaceId,
      requiredPaintGeneration,
    ] of this.pendingSurfacePaintGenerations) {
      const surfacePaintGeneration =
        this.surfacePaintGenerations.get(surfaceId) ?? 0;
      if (surfacePaintGeneration >= requiredPaintGeneration) {
        this.pendingSurfacePaintGenerations.delete(surfaceId);
        continue;
      }
      resolvedSurfaceIds.add(surfaceId);
    }
    return resolvedSurfaceIds;
  }

  clearSurfaceIds(surfaceIds: Iterable<string>) {
    for (const surfaceId of surfaceIds) {
      this.pendingSurfacePaintGenerations.delete(surfaceId);
    }
  }
}
