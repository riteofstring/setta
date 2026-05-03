import type { GpuNodeLayout } from "./htmlSurfaces/frame";
import type { GpuNodeResizeDirection } from "./resizeHandles";
import { rectsIntersect, type GpuPoint, type GpuRect } from "./viewportMath";

export const GPU_FLOW_SCENE_DIRTY_FLAGS = [
  "section-geometry",
  "section-order",
  "content",
  "scroll",
  "ports",
  "dom-islands",
] as const;

export type GpuFlowSceneDirtyFlag = (typeof GPU_FLOW_SCENE_DIRTY_FLAGS)[number];

export type GpuSectionSceneLayoutMode =
  | "absolute"
  | "horizontal"
  | "kanban"
  | "none"
  | "vertical";

export type GpuSectionSceneInteractionLayer = "chrome" | "content" | "overlay";

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

export type GpuPortAnchorDescriptor = {
  readonly id: string;
  readonly kind: "input" | "output" | "section";
  readonly localPosition: GpuPoint;
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
  readonly renderer: GpuSectionContentRendererDescriptor;
  readonly zIndex: number;
};

export type GpuDomIsland = {
  readonly clipOwnerId: string;
  readonly id: string;
  readonly ownerSectionId: string;
  readonly rect: GpuRect;
  readonly zIndex: number;
};

export type GpuEdgeSceneRecord = {
  readonly edgeId: string;
};

export type GpuFlowScene = {
  readonly contentSurfaces: readonly GpuContentSurface[];
  readonly domIslands: readonly GpuDomIsland[];
  readonly edges: readonly GpuEdgeSceneRecord[];
  readonly revision: number;
  readonly sections: readonly GpuSectionSceneNode[];
};

export const EMPTY_GPU_FLOW_SCENE: GpuFlowScene = {
  contentSurfaces: [],
  domIslands: [],
  edges: [],
  revision: 0,
  sections: [],
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
): readonly GpuContentSurface[] {
  return sections.flatMap((section) => {
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
  });
}

export function isGpuSectionSceneNodeInsideClip(
  section: GpuSectionSceneNode,
): boolean {
  return (
    isPositiveGpuRect(section.worldRect) &&
    isPositiveGpuRect(section.clipRect) &&
    rectsIntersect(section.worldRect, section.clipRect)
  );
}

function isPositiveGpuRect(rect: GpuRect): boolean {
  return rect.width > 0 && rect.height > 0;
}
