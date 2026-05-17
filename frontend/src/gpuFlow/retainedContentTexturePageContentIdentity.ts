import type {
  RetainedRegionContentSegment,
  RetainedRegionDomControlTexture,
} from "./retainedCommittedCoverageStore";
import { rectsIntersect } from "./retainedContentTexturePageManagerHelpers";
import type {
  RetainedContentTexturePageContentSegment,
  RetainedContentTexturePageFrameSurface,
} from "./retainedContentTexturePageManagerTypes";
import type { GpuRetainedDomControlTextureDescriptor } from "./retainedDomControlScene";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

type PageContentIdentity = {
  readonly contentSegments: readonly RetainedRegionContentSegment[];
  readonly contentVersion: number;
  readonly domControlTextures: readonly RetainedRegionDomControlTexture[];
};

type PageContentVersionSignature = Omit<
  PageContentIdentity,
  "contentVersion"
> & {
  readonly sourceRectCss: GpuRect;
  readonly surfaceContentVersion: number;
};

export class RetainedTexturePageContentIdentityResolver {
  private readonly pageContentVersions = new Map<string, number>();
  private nextPageContentVersion = -1;

  clear(): void {
    this.pageContentVersions.clear();
    this.nextPageContentVersion = -1;
  }

  resolveDescriptors({
    descriptors,
    surface,
  }: {
    readonly descriptors: readonly RetainedTexturePageDescriptor[];
    readonly surface: RetainedContentTexturePageFrameSurface;
  }): readonly RetainedTexturePageDescriptor[] {
    const segments = surface.contentSegments ?? [];
    const domControlTextures = surface.domControlTextures ?? [];
    if (segments.length === 0 && domControlTextures.length === 0) {
      return descriptors;
    }
    return descriptors.map((descriptor) => {
      const identity = this.resolvePageContentIdentity({
        descriptor,
        segments,
        surfaceContentVersion: surface.contentVersion,
        domControlTextures: domControlTextures,
      });
      return {
        ...descriptor,
        contentSegments: identity.contentSegments,
        contentVersion: identity.contentVersion,
        domControlTextures: identity.domControlTextures,
      };
    });
  }

  private resolvePageContentIdentity({
    descriptor,
    segments,
    surfaceContentVersion,
    domControlTextures,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly segments: readonly RetainedContentTexturePageContentSegment[];
    readonly surfaceContentVersion: number;
    readonly domControlTextures: readonly GpuRetainedDomControlTextureDescriptor[];
  }): PageContentIdentity {
    const contentSegments = segments
      .filter((segment) =>
        rectsIntersect(segment.rectCss, descriptor.sourceRectCss),
      )
      .map((segment) => ({
        contentVersion: segment.contentVersion,
        id: segment.id,
        rectCss: segment.rectCss,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const textureDescriptors = domControlTextures
      .filter((texture) =>
        rectsIntersect(texture.rectCss, descriptor.sourceRectCss),
      )
      .map((texture) => ({
        rectCss: texture.rectCss,
        rowId: texture.rowId,
        sourceId: texture.sourceId,
        sourceKey: texture.sourceKey,
      }))
      .sort(
        (left, right) =>
          left.sourceId.localeCompare(right.sourceId) ||
          left.rowId.localeCompare(right.rowId),
      );
    if (contentSegments.length === 0 && textureDescriptors.length === 0) {
      return {
        contentSegments: [],
        contentVersion: surfaceContentVersion,
        domControlTextures: [],
      };
    }
    return {
      contentSegments,
      contentVersion: this.resolvePageContentVersionId({
        contentSegments,
        sourceRectCss: descriptor.sourceRectCss,
        surfaceContentVersion,
        domControlTextures: textureDescriptors,
      }),
      domControlTextures: textureDescriptors,
    };
  }

  private resolvePageContentVersionId(
    input: PageContentVersionSignature,
  ): number {
    const signature = JSON.stringify(input);
    const existing = this.pageContentVersions.get(signature);
    if (existing !== undefined) {
      return existing;
    }
    const version = this.nextPageContentVersion;
    this.nextPageContentVersion -= 1;
    this.pageContentVersions.set(signature, version);
    return version;
  }
}
