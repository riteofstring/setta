import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import type { WorkspaceSceneTarget } from "./workspaceController";
import {
  WORKSPACE_SCENE_GEOMETRY,
  type WorkspaceHitRegion,
  type WorkspaceMinimapScene,
  type WorkspaceMinimapSectionPreview,
  type WorkspaceNestedDropZone,
  type WorkspacePoint,
  type WorkspaceRect,
  type WorkspaceResizeHandleRegions,
  type WorkspaceSceneRevisionKeys,
  type WorkspaceScrollbarScene,
  type WorkspaceSectionGeometry,
  type WorkspaceSectionScene,
  type WorkspaceSize,
  type WorkspaceViewport,
} from "./workspaceSceneTypes";

export function workspaceToScreen(
  point: WorkspacePoint,
  viewport: WorkspaceViewport,
): WorkspacePoint {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function screenToWorkspace(
  point: WorkspacePoint,
  viewport: WorkspaceViewport,
): WorkspacePoint {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function workspaceRectToScreen(
  rect: WorkspaceRect,
  viewport: WorkspaceViewport,
): WorkspaceRect {
  const origin = workspaceToScreen(rect, viewport);
  return {
    ...origin,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

export function screenRectToWorkspaceRect(
  rect: WorkspaceRect,
  viewport: WorkspaceViewport,
): WorkspaceRect {
  const topLeft = screenToWorkspace(rect, viewport);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: rect.width / viewport.zoom,
    height: rect.height / viewport.zoom,
  };
}

export function localToWorldSectionPoint(
  section: WorkspaceSectionScene,
  point: WorkspacePoint,
): WorkspacePoint {
  return {
    x: section.worldBounds.x + point.x,
    y: section.worldBounds.y + point.y,
  };
}

export function worldToLocalSectionPoint(
  section: WorkspaceSectionScene,
  point: WorkspacePoint,
): WorkspacePoint {
  return {
    x: point.x - section.worldBounds.x,
    y: point.y - section.worldBounds.y,
  };
}

export function rectContainsPoint(rect: WorkspaceRect, point: WorkspacePoint) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function unionRects(
  rects: Array<WorkspaceRect | undefined>,
): WorkspaceRect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const rect of rects) {
    if (!rect) {
      continue;
    }
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
    count += 1;
  }
  if (count === 0) {
    return null;
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function compareHitRegions(
  left: WorkspaceHitRegion,
  right: WorkspaceHitRegion,
) {
  return left.zIndex - right.zIndex || left.id.localeCompare(right.id);
}

export function getSectionHitZIndex(sectionOrderIndex: number, layer: number) {
  return sectionOrderIndex * 1_000 + layer;
}

export function buildWorkspaceSceneCacheKeys(
  revisions: WorkspaceSceneRevisionKeys,
) {
  return {
    scene: buildCacheKey(revisions, "scene"),
    projectBounds: buildCacheKey(revisions, "project-bounds"),
    minimap: buildCacheKey(revisions, "minimap"),
    textMeasurement: buildCacheKey(revisions, "text-measurements"),
    highlighter: buildCacheKey(revisions, "highlighter"),
  };
}

export function buildCacheKey(
  revisions: WorkspaceSceneRevisionKeys,
  kind: string,
  ...parts: Array<string>
) {
  return [
    kind,
    revisions.projectRevision,
    revisions.viewportRevision,
    revisions.sectionScrollRevision,
    revisions.themeRevision,
    revisions.fontRevision,
    revisions.devicePixelRatioRevision,
    revisions.textMeasurementRevision,
    revisions.highlighterRevision,
    ...parts,
  ].join(":");
}

export function rectKey(rect: WorkspaceRect) {
  return [
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.width),
    Math.round(rect.height),
  ].join(",");
}

export function deriveSectionGeometry(
  worldBounds: WorkspaceRect,
): WorkspaceSectionGeometry {
  const headerHeight = Math.min(
    WORKSPACE_SCENE_GEOMETRY.sectionHeaderHeight,
    Math.max(0, worldBounds.height),
  );
  const bodyHeight = Math.max(0, worldBounds.height - headerHeight);
  const body = {
    x: worldBounds.x,
    y: worldBounds.y + headerHeight,
    width: worldBounds.width,
    height: bodyHeight,
  };
  const childContentRegion = insetRect(
    body,
    WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding,
  );
  return {
    header: {
      x: worldBounds.x,
      y: worldBounds.y,
      width: worldBounds.width,
      height: headerHeight,
    },
    body,
    childContentRegion,
    clipRegion: childContentRegion,
  };
}

export function deriveResizeHandles(
  worldBounds: WorkspaceRect,
): WorkspaceResizeHandleRegions {
  const size = WORKSPACE_SCENE_GEOMETRY.sectionResizeHandleSize;
  return {
    right: {
      x: worldBounds.x + worldBounds.width - size,
      y: worldBounds.y,
      width: size,
      height: worldBounds.height,
    },
    bottom: {
      x: worldBounds.x,
      y: worldBounds.y + worldBounds.height - size,
      width: worldBounds.width,
      height: size,
    },
    corner: {
      x: worldBounds.x + worldBounds.width - size,
      y: worldBounds.y + worldBounds.height - size,
      width: size,
      height: size,
    },
  };
}

export function deriveEdgePortRegions({
  sectionId,
  impl,
  geometry,
  target,
  zIndexBase,
}: {
  sectionId: string;
  impl: BaseSectionImplUnion;
  geometry: WorkspaceSectionGeometry;
  target: WorkspaceSceneTarget;
  zIndexBase: number;
}): Array<WorkspaceHitRegion> {
  const inputs = getSectionStringArrayField(impl, "edgeInputParams");
  const outputs = getSectionEdgeOutputPortIds(impl);
  return [
    ...buildEdgePortRegions("input", inputs, geometry, target, zIndexBase),
    ...buildEdgePortRegions(
      "output",
      outputs,
      geometry,
      target,
      zIndexBase + inputs.length,
    ),
  ].map((region) => ({
    ...region,
    id: `section:${sectionId}:edge-${region.id}`,
  }));
}

export function deriveNestedDropZones(
  parent: WorkspaceSectionScene,
  childIds: Array<string>,
  sectionsById: Record<string, WorkspaceSectionScene>,
): Array<WorkspaceNestedDropZone> {
  if (childIds.length === 0) {
    return [
      {
        id: `drop-zone:${parent.id}:inside`,
        parentSectionId: parent.id,
        index: 0,
        kind: "inside-parent",
        childSectionId: null,
        rect: parent.geometry.childContentRegion,
      },
    ];
  }
  return childIds.flatMap((childId, index) =>
    buildChildDropZones(parent, sectionsById[childId], childId, index, {
      isLast: index === childIds.length - 1,
    }),
  );
}

export function deriveRootSectionLocalBounds(
  layout: TopLevelSectionLayout | undefined,
  impl: BaseSectionImplUnion,
): WorkspaceRect {
  const size = resolveSectionSize(impl);
  return {
    x: layout?.x ?? 0,
    y: layout?.y ?? 0,
    width: layout?.w ?? size.width,
    height: layout?.h ?? size.height,
  };
}

export function deriveNestedSectionLocalBounds(
  parent: WorkspaceSectionScene,
  childImpl: BaseSectionImplUnion,
  childIndex: number,
): WorkspaceRect {
  const size = resolveSectionSize(childImpl);
  const parentLocalContent = {
    x: parent.geometry.childContentRegion.x - parent.worldBounds.x,
    y: parent.geometry.childContentRegion.y - parent.worldBounds.y,
  };
  if (parent.childLayoutDirection === "horizontal") {
    return {
      x:
        parentLocalContent.x +
        childIndex * (size.width + WORKSPACE_SCENE_GEOMETRY.sectionNestedGap),
      y: parentLocalContent.y,
      width: size.width,
      height: size.height,
    };
  }
  return {
    x: parentLocalContent.x,
    y:
      parentLocalContent.y +
      childIndex * (size.height + WORKSPACE_SCENE_GEOMETRY.sectionNestedGap),
    width: size.width,
    height: size.height,
  };
}

export function getChildLayoutDirection(impl: BaseSectionImplUnion) {
  if (impl.type === SectionTypeEnum.Group) {
    return getBooleanSectionField(impl, "isHorizontalOrientation")
      ? "horizontal"
      : "vertical";
  }
  if (impl.type === SectionTypeEnum.ListRoot) {
    return getStringSectionField(impl, "viewMode") === "kanban"
      ? "horizontal"
      : "vertical";
  }
  return "vertical";
}

export function deriveMinimapScene({
  projectBounds,
  sectionsById,
  sectionOrder,
  viewportSize,
  visibleWorkspaceRect,
}: {
  projectBounds: WorkspaceRect;
  sectionsById: Record<string, WorkspaceSectionScene>;
  sectionOrder: Array<string>;
  viewportSize: WorkspaceSize;
  visibleWorkspaceRect: WorkspaceRect;
}): WorkspaceMinimapScene {
  const bounds = deriveMinimapBounds(viewportSize);
  const transform = deriveMinimapTransform(bounds, projectBounds);
  const sectionPreviews = sectionOrder
    .map((sectionId) => {
      const section = sectionsById[sectionId];
      return section
        ? {
            sectionId,
            rect: workspaceRectToMinimap(section.worldBounds, transform),
          }
        : null;
    })
    .filter((entry): entry is WorkspaceMinimapSectionPreview => entry !== null);
  const viewportMask = workspaceRectToMinimap(visibleWorkspaceRect, transform);
  return {
    id: "workspace-minimap",
    bounds,
    transform,
    viewportMask,
    sectionPreviews,
    hitRegions: [
      {
        id: "minimap:viewport-mask",
        coordinateSpace: "screen",
        rect: viewportMask,
        intent: "minimap-jump",
        target: { kind: "minimap", minimapId: "workspace-minimap" },
        zIndex: 1_000_001,
      },
      {
        id: "minimap:bounds",
        coordinateSpace: "screen",
        rect: bounds,
        intent: "minimap-pan",
        target: { kind: "minimap", minimapId: "workspace-minimap" },
        zIndex: 1_000_000,
      },
    ],
  };
}

export function deriveScrollbar({
  region,
  contentHeight,
  scrollOffset,
}: {
  region: WorkspaceRect;
  contentHeight: number;
  scrollOffset: number;
}): WorkspaceScrollbarScene | null {
  if (contentHeight <= region.height || region.height <= 0) {
    return null;
  }
  const track = {
    x:
      region.x + region.width - WORKSPACE_SCENE_GEOMETRY.dictScrollbarWidth - 2,
    y: region.y + WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding,
    width: WORKSPACE_SCENE_GEOMETRY.dictScrollbarWidth,
    height: Math.max(
      0,
      region.height - WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding * 2,
    ),
  };
  const thumbHeight = Math.max(
    24,
    (region.height / contentHeight) * track.height,
  );
  const scrollRange = Math.max(1, contentHeight - region.height);
  return {
    track,
    thumb: {
      x: track.x,
      y: track.y + ((track.height - thumbHeight) * scrollOffset) / scrollRange,
      width: track.width,
      height: thumbHeight,
    },
    contentHeight,
    viewportHeight: region.height,
  };
}

function buildEdgePortRegions(
  side: "input" | "output",
  portIds: Array<string>,
  geometry: WorkspaceSectionGeometry,
  target: WorkspaceSceneTarget,
  zIndexBase: number,
): Array<WorkspaceHitRegion> {
  const portSize = 12;
  const gap = 6;
  const startY = geometry.body.y + WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding;
  const x =
    side === "input"
      ? geometry.body.x - portSize / 2
      : geometry.body.x + geometry.body.width - portSize / 2;
  return portIds.map((portId, index) => ({
    id: `${side}:${portId}`,
    coordinateSpace: "workspace",
    rect: {
      x,
      y: startY + index * (portSize + gap),
      width: portSize,
      height: portSize,
    },
    intent: "edge-or-port",
    target,
    zIndex: zIndexBase + index,
  }));
}

function buildChildDropZones(
  parent: WorkspaceSectionScene,
  child: WorkspaceSectionScene | undefined,
  childId: string,
  index: number,
  options: { isLast: boolean },
): Array<WorkspaceNestedDropZone> {
  const baseRect = child?.worldBounds ?? parent.geometry.childContentRegion;
  const before: WorkspaceNestedDropZone = {
    id: `drop-zone:${parent.id}:before:${childId}`,
    parentSectionId: parent.id,
    index,
    kind: "before-child",
    childSectionId: childId,
    rect: {
      x: baseRect.x,
      y: baseRect.y - 4,
      width: baseRect.width,
      height: 8,
    },
  };
  if (!options.isLast) {
    return [before];
  }
  return [
    before,
    {
      id: `drop-zone:${parent.id}:after:${childId}`,
      parentSectionId: parent.id,
      index: index + 1,
      kind: "after-child",
      childSectionId: childId,
      rect: {
        x: baseRect.x,
        y: baseRect.y + baseRect.height - 4,
        width: baseRect.width,
        height: 8,
      },
    },
  ];
}

function deriveMinimapBounds(viewportSize: WorkspaceSize): WorkspaceRect {
  const width = Math.min(
    WORKSPACE_SCENE_GEOMETRY.minimapWidth,
    Math.max(160, viewportSize.width * 0.18),
  );
  const height = Math.min(
    WORKSPACE_SCENE_GEOMETRY.minimapHeight,
    Math.max(112, viewportSize.height * 0.16),
  );
  return {
    x:
      viewportSize.width -
      width -
      WORKSPACE_SCENE_GEOMETRY.minimapViewportMargin,
    y:
      viewportSize.height -
      height -
      WORKSPACE_SCENE_GEOMETRY.minimapViewportMargin,
    width,
    height,
  };
}

function deriveMinimapTransform(
  bounds: WorkspaceRect,
  projectBounds: WorkspaceRect,
) {
  const drawableWidth = Math.max(
    1,
    bounds.width - WORKSPACE_SCENE_GEOMETRY.minimapPadding * 2,
  );
  const drawableHeight = Math.max(
    1,
    bounds.height - WORKSPACE_SCENE_GEOMETRY.minimapPadding * 2,
  );
  const scale = Math.min(
    drawableWidth / Math.max(1, projectBounds.width),
    drawableHeight / Math.max(1, projectBounds.height),
  );
  return {
    scale,
    translateX:
      bounds.x +
      WORKSPACE_SCENE_GEOMETRY.minimapPadding -
      projectBounds.x * scale +
      (drawableWidth - projectBounds.width * scale) / 2,
    translateY:
      bounds.y +
      WORKSPACE_SCENE_GEOMETRY.minimapPadding -
      projectBounds.y * scale +
      (drawableHeight - projectBounds.height * scale) / 2,
  };
}

function workspaceRectToMinimap(
  rect: WorkspaceRect,
  transform: WorkspaceMinimapScene["transform"],
): WorkspaceRect {
  return {
    x: rect.x * transform.scale + transform.translateX,
    y: rect.y * transform.scale + transform.translateY,
    width: rect.width * transform.scale,
    height: rect.height * transform.scale,
  };
}

function insetRect(rect: WorkspaceRect, inset: number): WorkspaceRect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
  };
}

function resolveSectionSize(impl: BaseSectionImplUnion): WorkspaceSize {
  return {
    width: resolveSectionDimension(impl.size.width, 250),
    height: resolveSectionDimension(impl.size.height, 150),
  };
}

function resolveSectionDimension(
  value: { Auto: boolean; Value: number } | number,
  fallback: number,
) {
  if (typeof value === "number") {
    return value;
  }
  return value.Auto ? fallback : value.Value;
}

function getBooleanSectionField(impl: BaseSectionImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : false;
}

function getStringSectionField(impl: BaseSectionImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function getSectionStringArrayField(impl: BaseSectionImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function getSectionEdgeOutputPortIds(impl: BaseSectionImplUnion) {
  const value = (impl as Record<string, unknown>).edgeOutputPorts;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const id = (entry as Record<string, unknown>).id;
      return typeof id === "string" ? id : null;
    })
    .filter((entry): entry is string => entry !== null);
}
