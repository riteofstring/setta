import type { WorkspaceDocument } from "../core.js";
import {
  clientRectToWorkspace,
  workspaceRectToClient,
  type WorkspaceRect,
} from "./geometry-index.js";
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
import type { WorkspaceSectionMoveRegion } from "./workspace-section-move-collision.js";

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

export function workspaceScreenRect(rect: DOMRect): InteractionRect {
  return createInteractionRect(rect.x, rect.y, rect.width, rect.height);
}

function regionClientRect(
  rect: WorkspaceRect,
  frame: WorkspaceSectionMoveGeometryFrame,
): InteractionRect {
  const client = workspaceRectToClient(rect, frame.canvasBounds, frame.viewport);
  return createInteractionRect(client.x, client.y, client.width, client.height);
}

function documentOrderSectionIds<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
): readonly string[] {
  const ordered: string[] = [];
  const visit = (sectionId: string): void => {
    ordered.push(sectionId);
    for (const childId of document.sections[sectionId]?.childLayout?.sectionIds ?? []) {
      visit(childId);
    }
  };
  for (const root of document.rootSections) {
    visit(root.sectionId);
  }
  return ordered;
}

function freeformRegionFromMeasurement(
  measured: MeasuredWorkspaceChildRegion,
  surface: HTMLElement,
  surfaceWorkspaceRect: WorkspaceRect,
  frame: WorkspaceSectionMoveGeometryFrame,
): WorkspaceSectionFreeformRegion {
  return {
    clientRect: regionClientRect(measured.workspaceRect, frame),
    element: measured.element,
    parentSectionId: measured.parentSectionId,
    surface,
    surfaceClientRect: regionClientRect(surfaceWorkspaceRect, frame),
    surfaceWorkspaceRect,
    workspaceRect: measured.workspaceRect,
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
      freeformRegionFromMeasurement(
        measured,
        measured.surface,
        measured.surfaceWorkspaceRect,
        frame,
      ),
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
  document: WorkspaceDocument<TSectionData>,
  frame: WorkspaceSectionMoveGeometryFrame,
  parentSectionId: string,
  measured: MeasuredWorkspaceChildRegion | null,
): CapturedWorkspaceSectionMoveRegion {
  const layout = document.sections[parentSectionId]?.childLayout;
  if (!layout) {
    return { allowed: false, reason: "A section move destination region is invalid." };
  }
  if (!measured) {
    return {
      allowed: false,
      reason: `The ${parentSectionId} drop destination region is not completely measured.`,
    };
  }
  if (layout.positioning === "freeform") {
    if (!measured.surface || !measured.surfaceWorkspaceRect) {
      return {
        allowed: false,
        reason: `The ${parentSectionId} freeform movement surface is unavailable.`,
      };
    }
    return {
      allowed: true,
      freeformRegion: freeformRegionFromMeasurement(
        measured,
        measured.surface,
        measured.surfaceWorkspaceRect,
        frame,
      ),
    };
  }
  const gap = layout.orientation === "horizontal" ? measured.columnGap : measured.rowGap;
  if (gap === null) {
    return { allowed: false, reason: `The ${parentSectionId} layout gap is unavailable.` };
  }
  return {
    allowed: true,
    region: {
      clientRect: regionClientRect(measured.workspaceRect, frame),
      direction: measured.direction,
      gap,
      orientation: layout.orientation,
      parentSectionId,
      workspaceRect: measured.workspaceRect,
    },
  };
}

export function captureWorkspaceSectionMoveRegions<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  frame: WorkspaceSectionMoveGeometryFrame,
  measuredRegions: WorkspaceMeasuredChildRegions,
): WorkspaceSectionMoveRegionCapture {
  const freeformRegions: WorkspaceSectionFreeformRegion[] = [];
  const regions: WorkspaceSectionMoveRegion[] = [];
  let visited = 0;
  for (const sectionId of documentOrderSectionIds(document)) {
    if (!measuredRegions.has(sectionId)) {
      continue;
    }
    visited += 1;
    const captured = captureWorkspaceSectionMoveRegion(
      document,
      frame,
      sectionId,
      measuredRegions.get(sectionId) ?? null,
    );
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
  if (visited !== measuredRegions.size) {
    return { allowed: false, reason: "A section move destination region is invalid." };
  }
  return { allowed: true, freeformRegions, regions };
}
