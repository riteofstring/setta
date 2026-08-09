import type { WorkspaceDocument } from "../core.js";
import { clientRectToWorkspace, type WorkspaceRect } from "./geometry-index.js";
import {
  createInteractionRect,
  type InteractionPoint,
  type InteractionRect,
  type ViewportTransform,
} from "./interaction-geometry.js";
import {
  selectionContainsSectionOrAncestor,
  type SectionHierarchySnapshot,
} from "./selection-planning.js";
import type { MeasuredWorkspaceChildRegion } from "./workspace-geometry-service.js";
import type {
  WorkspaceSectionMoveRegion,
} from "./workspace-section-move-collision.js";

export type WorkspaceSectionMoveGeometryFrame = Readonly<{
  canvasBounds: WorkspaceRect;
  viewport: ViewportTransform;
}>;

export type WorkspaceMeasuredChildRegions = ReadonlyMap<
  string,
  MeasuredWorkspaceChildRegion | null
>;

export type WorkspaceSectionFreeformRegion = Readonly<{
  clientRect: InteractionRect;
  element: HTMLElement;
  parentSectionId: string;
  surface: HTMLElement;
  surfaceClientRect: InteractionRect;
  surfaceWorkspaceRect: WorkspaceRect;
  workspaceRect: WorkspaceRect;
}>;

export type WorkspaceSectionMoveRegionCapture =
  | Readonly<{
      allowed: true;
      freeformRegions: readonly WorkspaceSectionFreeformRegion[];
      regions: readonly WorkspaceSectionMoveRegion[];
    }>
  | Readonly<{ allowed: false; reason: string }>;

export type WorkspaceSectionFreeformRegionCapture =
  | Readonly<{
      allowed: true;
      freeformRegions: readonly WorkspaceSectionFreeformRegion[];
    }>
  | Readonly<{ allowed: false; reason: string }>;

export type WorkspaceSectionInvalidMoveRegion =
  | Readonly<{ positioning: "freeform"; region: WorkspaceSectionFreeformRegion }>
  | Readonly<{ positioning: "ordered"; region: WorkspaceSectionMoveRegion }>;

function pointInsideRegion(
  point: InteractionPoint,
  region: Readonly<{ clientRect: InteractionRect }>,
) {
  const rect = region.clientRect;
  return point.x >= rect.x && point.x <= rect.right && point.y >= rect.y && point.y <= rect.bottom;
}

function sectionDepth(sectionId: string, hierarchy: SectionHierarchySnapshot): number {
  let depth = 0;
  let parentId = hierarchy.parentByChild[sectionId] ?? null;
  while (parentId) {
    depth += 1;
    parentId = hierarchy.parentByChild[parentId] ?? null;
  }
  return depth;
}

export function resolveWorkspaceSectionInvalidMoveRegion({
  freeformRegions,
  hierarchy,
  orderedRegions,
  point,
  sectionIds,
}: Readonly<{
  freeformRegions: readonly WorkspaceSectionFreeformRegion[];
  hierarchy: SectionHierarchySnapshot;
  orderedRegions: readonly WorkspaceSectionMoveRegion[];
  point: InteractionPoint;
  sectionIds: readonly string[];
}>): WorkspaceSectionInvalidMoveRegion | null {
  const movingIds = new Set(sectionIds);
  const candidates: WorkspaceSectionInvalidMoveRegion[] = [
    ...orderedRegions.map((region) => ({ positioning: "ordered" as const, region })),
    ...freeformRegions.map((region) => ({ positioning: "freeform" as const, region })),
  ];
  return (
    candidates
      .filter(
        ({ region }) =>
          pointInsideRegion(point, region) &&
          selectionContainsSectionOrAncestor(
            region.parentSectionId,
            movingIds,
            hierarchy.parentByChild,
          ),
      )
      .sort(
        (left, right) =>
          sectionDepth(right.region.parentSectionId, hierarchy) -
          sectionDepth(left.region.parentSectionId, hierarchy),
      )[0] ?? null
  );
}

function logicalDirection(region: HTMLElement): WorkspaceSectionMoveDirection {
  return region.ownerDocument.defaultView?.getComputedStyle(region).direction === "rtl"
    ? "rtl"
    : "ltr";
}

function layoutGap(region: HTMLElement, orientation: "horizontal" | "vertical"): number | null {
  const style = region.ownerDocument.defaultView?.getComputedStyle(region);
  const value = style ? (orientation === "horizontal" ? style.columnGap : style.rowGap) : "";
  const gap = Number.parseFloat(value);
  return Number.isFinite(gap) && gap >= 0 ? gap : null;
}

export function workspaceScreenRect(rect: DOMRect): InteractionRect {
  return createInteractionRect(rect.x, rect.y, rect.width, rect.height);
}

function freeformRegion(
  element: HTMLElement,
  parentSectionId: string,
  frame: WorkspaceSectionMoveGeometryFrame,
): WorkspaceSectionFreeformRegion | null {
  const surface = element.querySelector<HTMLElement>(WORKSPACE_FREEFORM_SURFACE_SELECTOR);
  if (!surface) {
    return null;
  }
  const clientRect = workspaceScreenRect(element.getBoundingClientRect());
  const surfaceClientRect = workspaceScreenRect(surface.getBoundingClientRect());
  return {
    clientRect,
    element,
    parentSectionId,
    surface,
    surfaceClientRect,
    surfaceWorkspaceRect: clientRectToWorkspace(
      surfaceClientRect,
      frame.canvasBounds,
      frame.viewport,
    ),
    workspaceRect: clientRectToWorkspace(clientRect, frame.canvasBounds, frame.viewport),
  };
}

export function refreshWorkspaceSectionFreeformRegion(
  region: WorkspaceSectionFreeformRegion,
  frame: WorkspaceSectionMoveGeometryFrame,
): WorkspaceSectionFreeformRegion | null {
  if (!region.element.isConnected || !region.surface.isConnected) {
    return null;
  }
  const clientRect = workspaceScreenRect(region.element.getBoundingClientRect());
  const surfaceClientRect = workspaceScreenRect(region.surface.getBoundingClientRect());
  return {
    ...region,
    clientRect,
    surfaceClientRect,
    surfaceWorkspaceRect: clientRectToWorkspace(
      surfaceClientRect,
      frame.canvasBounds,
      frame.viewport,
    ),
    workspaceRect: clientRectToWorkspace(clientRect, frame.canvasBounds, frame.viewport),
  };
}

export function refreshWorkspaceSectionFreeformRegions(
  regions: readonly WorkspaceSectionFreeformRegion[],
  frame: WorkspaceSectionMoveGeometryFrame,
): readonly WorkspaceSectionFreeformRegion[] {
  return regions.flatMap((region) => {
    const refreshed = refreshWorkspaceSectionFreeformRegion(region, frame);
    return refreshed ? [refreshed] : [];
  });
}

export function captureWorkspaceSectionFreeformRegions<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  frame: WorkspaceSectionMoveGeometryFrame,
  measuredRegions: WorkspaceMeasuredChildRegions,
): WorkspaceSectionFreeformRegionCapture {
  const freeformRegions: WorkspaceSectionFreeformRegion[] = [];
  for (const sectionId of documentOrderSectionIds(document)) {
    if (!measuredRegions.has(sectionId)) {
      continue;
    }
    const layout = document.sections[sectionId]?.childLayout;
    if (layout?.positioning !== "freeform") {
      continue;
    }
    const measured = measuredRegions.get(sectionId);
    if (!measured?.surface || !measured.surfaceWorkspaceRect) {
      return {
        allowed: false,
        reason: `The ${sectionId} freeform drop surface is unavailable.`,
      };
    }
    freeformRegions.push(
      freeformRegionFromMeasurement(measured, measured.surface, measured.surfaceWorkspaceRect, frame),
    );
  }
  return { allowed: true, freeformRegions };
}

type CapturedWorkspaceSectionMoveRegion =
  | Readonly<{
      allowed: true;
      freeformRegion?: WorkspaceSectionFreeformRegion;
      region?: WorkspaceSectionMoveRegion;
    }>
  | Readonly<{ allowed: false; reason: string }>;

function captureWorkspaceSectionMoveRegion<TSectionData>(
  element: HTMLElement,
  document: WorkspaceDocument<TSectionData>,
  frame: WorkspaceSectionMoveGeometryFrame,
  seen: Set<string>,
): CapturedWorkspaceSectionMoveRegion {
  const parentSectionId = element.getAttribute(WORKSPACE_SECTION_CHILD_REGION_ATTRIBUTE);
  if (!parentSectionId) {
    return { allowed: false, reason: "A section move destination region is invalid." };
  }
  if (seen.has(parentSectionId)) {
    return { allowed: false, reason: "A section move destination region is invalid." };
  }
  const layout = document.sections[parentSectionId]?.childLayout;
  if (!layout) {
    return { allowed: false, reason: "A section move destination region is invalid." };
  }
  seen.add(parentSectionId);
  if (layout.positioning === "freeform") {
    const capturedFreeformRegion = freeformRegion(element, parentSectionId, frame);
    return capturedFreeformRegion
      ? { allowed: true, freeformRegion: capturedFreeformRegion }
      : {
          allowed: false,
          reason: `The ${parentSectionId} freeform movement surface is unavailable.`,
        };
  }
  const gap = layoutGap(element, layout.orientation);
  if (gap === null) {
    return { allowed: false, reason: `The ${parentSectionId} layout gap is unavailable.` };
  }
  const clientRect = workspaceScreenRect(element.getBoundingClientRect());
  return {
    allowed: true,
    region: {
      clientRect,
      direction: logicalDirection(element),
      gap,
      orientation: layout.orientation,
      parentSectionId,
      workspaceRect: clientRectToWorkspace(clientRect, frame.canvasBounds, frame.viewport),
    },
  };
}

export function captureWorkspaceSectionMoveRegions<TSectionData>(
  canvas: HTMLElement,
  document: WorkspaceDocument<TSectionData>,
  frame: WorkspaceSectionMoveGeometryFrame,
): WorkspaceSectionMoveRegionCapture {
  const freeformRegions: WorkspaceSectionFreeformRegion[] = [];
  const regions: WorkspaceSectionMoveRegion[] = [];
  const seen = new Set<string>();
  const elements = canvas.querySelectorAll<HTMLElement>(
    `[${WORKSPACE_SECTION_CHILD_REGION_ATTRIBUTE}]`,
  );
  for (const element of elements) {
    const captured = captureWorkspaceSectionMoveRegion(element, document, frame, seen);
    if (!captured.allowed) {
      return captured;
    }
    if (captured.freeformRegion) {
      freeformRegions.push(captured.freeformRegion);
    }
    if (captured.region) {
      regions.push(captured.region);
    }
  }
  return { allowed: true, freeformRegions, regions };
}
