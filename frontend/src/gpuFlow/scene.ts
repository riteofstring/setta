import type { GpuNodeLayout } from "./htmlSurfaces/frame";
import type { GpuNodeResizeDirection } from "./resizeHandles";
import type { GpuRetainedContentScene } from "./retainedContentScene";
import { rectsIntersect, type GpuPoint, type GpuRect } from "./viewportMath";

type GpuFlowSceneDirtyFlag =
  | "section-geometry"
  | "section-order"
  | "content"
  | "scroll"
  | "ports"
  | "dom-islands";

export type GpuSectionSceneLayoutMode =
  | "absolute"
  | "horizontal"
  | "kanban"
  | "none"
  | "vertical";

type GpuSectionSceneInteractionLayer = "chrome" | "content" | "overlay";

export type GpuSectionSceneResizePolicy = {
  readonly aspectRatio: boolean;
  readonly aspectRatioExtraHeight: number;
  readonly aspectRatioExtraWidth: number;
  readonly directions: readonly GpuNodeResizeDirection[];
  readonly locked: boolean;
  readonly maxHeight: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly minWidth: number;
};

export type GpuSectionSceneChildLayout = {
  readonly gap: GpuPoint;
};

type GpuPortAnchorHandleType = "source" | "target";
type GpuPortAnchorSide = "left" | "right";

export type GpuPortAnchorDescriptor = {
  readonly connectionStartSemanticType?: GpuPortAnchorHandleType | undefined;
  readonly id: string;
  readonly kind: "input" | "output" | "section";
  readonly isConnectableEnd?: boolean | undefined;
  readonly isConnectableStart?: boolean | undefined;
  readonly localPosition: GpuPoint;
  readonly side?: GpuPortAnchorSide | undefined;
  readonly type?: GpuPortAnchorHandleType | undefined;
};

export type GpuSectionContentRendererDescriptor =
  | {
      readonly kind: "dom-section";
      readonly surfaceId: string;
    }
  | {
      readonly kind: "canvas-content";
      readonly surfaceId: string;
    }
  | {
      readonly kind: "scene-only";
    };

export type GpuSectionSceneNode = GpuNodeLayout & {
  readonly bodyRect: GpuRect;
  readonly childLayout: GpuSectionSceneChildLayout;
  readonly childSectionIds: readonly string[];
  readonly childViewportRect: GpuRect | null;
  readonly chromeRect: GpuRect;
  readonly clipRect: GpuRect;
  readonly contentRenderer: GpuSectionContentRendererDescriptor;
  readonly dirty: readonly GpuFlowSceneDirtyFlag[];
  readonly interactionLayer: GpuSectionSceneInteractionLayer;
  readonly layoutMode: GpuSectionSceneLayoutMode;
  readonly localRect: GpuRect;
  readonly parentSectionId: string | null;
  readonly portAnchors: readonly GpuPortAnchorDescriptor[];
  readonly resizePolicy: GpuSectionSceneResizePolicy;
  readonly scrollOffset: GpuPoint;
  readonly sectionId: string;
  readonly worldRect: GpuRect;
};

export type GpuContentSurface = {
  readonly clipRect: GpuRect;
  readonly id: string;
  readonly ownerSectionId: string;
  readonly rect: GpuRect;
  readonly retainedScene?: GpuRetainedContentScene | undefined;
  readonly retainedScrollResetKey?: string | undefined;
  readonly renderer: GpuSectionContentRendererDescriptor;
  readonly zIndex: number;
};

type GpuDomIslandSource =
  | {
      readonly kind: "retained-content";
      readonly hitRecordId: string;
      readonly ownerRowId: string;
      readonly surfaceId: string;
    }
  | {
      readonly kind: "custom";
    };

type GpuDomIslandActivation = {
  readonly clientPoint: GpuPoint;
  readonly kind: "pointer";
};

export type GpuDomIsland = {
  readonly activation?: GpuDomIslandActivation | undefined;
  readonly clipOwnerId: string;
  readonly contentRect: GpuRect;
  readonly id: string;
  readonly kind:
    | "custom"
    | "retained-content-control"
    | "retained-content-label";
  readonly ownerSectionId: string;
  readonly rect: GpuRect;
  readonly source: GpuDomIslandSource;
  readonly zIndex: number;
};

type GpuEdgeSceneRecord = {
  readonly edgeId: string;
};

export type GpuFlowScene = {
  readonly contentSurfaces: readonly GpuContentSurface[];
  readonly domIslands: readonly GpuDomIsland[];
  readonly edges: readonly GpuEdgeSceneRecord[];
  readonly revision: number;
  readonly sections: readonly GpuSectionSceneNode[];
};

export function getGpuFlowSceneDomSectionNodes(
  scene: GpuFlowScene,
): readonly GpuSectionSceneNode[] {
  return scene.sections.filter(
    (section) =>
      section.contentRenderer.kind === "dom-section" &&
      isGpuSectionSceneNodeInsideClip(section),
  );
}

export function createGpuFlowContentSurfacesFromSections(
  sections: readonly GpuSectionSceneNode[],
  contentSurfaces: readonly GpuContentSurface[] = [],
): readonly GpuContentSurface[] {
  return validateGpuFlowContentSurfaceIds([
    ...sections.flatMap((section) => {
      if (section.contentRenderer.kind === "scene-only") {
        return [];
      }
      return [
        {
          clipRect: section.clipRect,
          id: section.contentRenderer.surfaceId,
          ownerSectionId: section.sectionId,
          rect: section.worldRect,
          renderer: section.contentRenderer,
          zIndex: section.zIndex ?? 0,
        },
      ];
    }),
    ...contentSurfaces,
  ]).filter(isGpuContentSurfaceInsideClip);
}

export function getGpuFlowExternalContentSurfaces(
  sections: readonly GpuSectionSceneNode[],
  contentSurfaces: readonly GpuContentSurface[],
): readonly GpuContentSurface[] {
  const sectionSurfaceIds = new Set(
    sections.flatMap((section) =>
      section.contentRenderer.kind === "scene-only"
        ? []
        : [section.contentRenderer.surfaceId],
    ),
  );
  return contentSurfaces.filter(
    (surface) => !sectionSurfaceIds.has(surface.id),
  );
}

function isGpuSectionSceneNodeInsideClip(
  section: GpuSectionSceneNode,
): boolean {
  return (
    isPositiveGpuRect(section.worldRect) &&
    isPositiveGpuRect(section.clipRect) &&
    rectsIntersect(section.worldRect, section.clipRect)
  );
}

function isGpuContentSurfaceInsideClip(surface: GpuContentSurface): boolean {
  return (
    isPositiveGpuRect(surface.rect) &&
    isPositiveGpuRect(surface.clipRect) &&
    rectsIntersect(surface.rect, surface.clipRect)
  );
}

export function getGpuPortAnchorHandleType(
  anchor: Pick<GpuPortAnchorDescriptor, "kind" | "type">,
): GpuPortAnchorHandleType | null {
  if (anchor.type) {
    return anchor.type;
  }
  if (anchor.kind === "input") {
    return "target";
  }
  if (anchor.kind === "output") {
    return "source";
  }
  return null;
}

export function getGpuPortAnchorSide(
  anchor: Pick<GpuPortAnchorDescriptor, "kind" | "side" | "type">,
): GpuPortAnchorSide | null {
  if (anchor.side) {
    return anchor.side;
  }
  const type = getGpuPortAnchorHandleType(anchor);
  if (type === "target") {
    return "left";
  }
  if (type === "source") {
    return "right";
  }
  return null;
}

function isPositiveGpuRect(rect: GpuRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function validateGpuFlowContentSurfaceIds(
  contentSurfaces: readonly GpuContentSurface[],
): readonly GpuContentSurface[] {
  const seenSurfaceIds = new Set<string>();
  for (const surface of contentSurfaces) {
    if (seenSurfaceIds.has(surface.id)) {
      throw new Error(`Duplicate GPU flow content surface ${surface.id}.`);
    }
    seenSurfaceIds.add(surface.id);
  }
  return contentSurfaces;
}
