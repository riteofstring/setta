import type {
  RetainedRegionContentSegment,
  RetainedRegionTextLikeSnapshot,
} from "./retainedCommittedCoverageStore";
import { rectsIntersect } from "./retainedContentTexturePageManagerHelpers";
import type {
  RetainedContentTexturePageContentSegment,
  RetainedContentTexturePageFrameSurface,
} from "./retainedContentTexturePageManagerTypes";
import type { RetainedContentTexturePageTextLikeSnapshot } from "./retainedContentTexturePageTextLikeSnapshots";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

type PageContentIdentity = {
  readonly contentSegments: readonly RetainedRegionContentSegment[];
  readonly contentVersion: number;
  readonly textLikeSnapshots: readonly RetainedRegionTextLikeSnapshot[];
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
    const textLikeSnapshots = surface.textLikeSnapshots ?? [];
    if (segments.length === 0 && textLikeSnapshots.length === 0) {
      return descriptors;
    }
    return descriptors.map((descriptor) => {
      const identity = this.resolvePageContentIdentity({
        descriptor,
        segments,
        surfaceContentVersion: surface.contentVersion,
        textLikeSnapshots,
      });
      return {
        ...descriptor,
        contentSegments: identity.contentSegments,
        contentVersion: identity.contentVersion,
        textLikeSnapshots: identity.textLikeSnapshots,
      };
    });
  }

  private resolvePageContentIdentity({
    descriptor,
    segments,
    surfaceContentVersion,
    textLikeSnapshots,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly segments: readonly RetainedContentTexturePageContentSegment[];
    readonly surfaceContentVersion: number;
    readonly textLikeSnapshots: readonly RetainedContentTexturePageTextLikeSnapshot[];
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
    const snapshots = textLikeSnapshots
      .filter((snapshot) =>
        rectsIntersect(snapshot.rectCss, descriptor.sourceRectCss),
      )
      .map((snapshot) => ({
        rectCss: snapshot.rectCss,
        rowId: snapshot.rowId,
        sourceId: snapshot.sourceId,
        sourceKey: snapshot.sourceKey,
      }))
      .sort(
        (left, right) =>
          left.sourceId.localeCompare(right.sourceId) ||
          left.rowId.localeCompare(right.rowId),
      );
    if (contentSegments.length === 0 && snapshots.length === 0) {
      return {
        contentSegments: [],
        contentVersion: surfaceContentVersion,
        textLikeSnapshots: [],
      };
    }
    return {
      contentSegments,
      contentVersion: this.resolvePageContentVersionId({
        contentSegments,
        sourceRectCss: descriptor.sourceRectCss,
        surfaceContentVersion,
        textLikeSnapshots: snapshots,
      }),
      textLikeSnapshots: snapshots,
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
