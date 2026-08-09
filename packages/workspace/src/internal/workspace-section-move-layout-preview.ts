import type { WorkspaceRect } from "./geometry-index.js";
import type { InteractionPoint } from "./interaction-geometry.js";
import type { SectionMovePlan } from "./section-move-planning.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";
import type {
  WorkspaceSectionMoveDirection,
  WorkspaceSectionMoveRegion,
} from "./workspace-section-move-collision.js";

type WorkspaceSectionMoveLayoutPreview = Readonly<{
  transformsById: Readonly<Record<string, InteractionPoint>>;
}>;

export type WorkspaceSectionMoveLayoutPreviewResolution =
  | Readonly<{ allowed: true; preview: WorkspaceSectionMoveLayoutPreview }>
  | Readonly<{ allowed: false; reason: string }>;

const TRANSFORM_TOLERANCE = 0.01;

function childOrder(
  hierarchy: SectionHierarchySnapshot,
  parentSectionId: string,
): readonly string[] {
  return hierarchy.childrenByParent[parentSectionId] ?? [];
}

function withoutIds(ids: readonly string[], removedIds: ReadonlySet<string>): readonly string[] {
  return ids.filter((id) => !removedIds.has(id));
}

function insertAt<T>(items: readonly T[], index: number, inserted: readonly T[]): readonly T[] {
  return [...items.slice(0, index), ...inserted, ...items.slice(index)];
}

function logicalStart(
  rect: WorkspaceRect,
  orientation: "horizontal" | "vertical",
  direction: WorkspaceSectionMoveDirection,
): number {
  if (orientation === "vertical") {
    return rect.y;
  }
  return direction === "rtl" ? -(rect.x + rect.width) : rect.x;
}

function logicalSize(rect: WorkspaceRect, orientation: "horizontal" | "vertical"): number {
  return orientation === "vertical" ? rect.height : rect.width;
}

function plannedStarts(
  order: readonly string[],
  baseline: number,
  gap: number,
  orientation: "horizontal" | "vertical",
  rectsById: Readonly<Record<string, WorkspaceRect>>,
): Readonly<Record<string, number>> | null {
  const starts: Record<string, number> = {};
  let nextStart = baseline;
  for (const sectionId of order) {
    const rect = rectsById[sectionId];
    if (!rect) {
      return null;
    }
    starts[sectionId] = nextStart;
    nextStart += logicalSize(rect, orientation) + gap;
  }
  return starts;
}

function transformPoint(
  logicalDelta: number,
  orientation: "horizontal" | "vertical",
  direction: WorkspaceSectionMoveDirection,
): InteractionPoint {
  if (orientation === "vertical") {
    return { x: 0, y: logicalDelta };
  }
  return { x: direction === "rtl" ? -logicalDelta : logicalDelta, y: 0 };
}

function hasMeaningfulTransform(transform: InteractionPoint): boolean {
  return Math.abs(transform.x) > TRANSFORM_TOLERANCE || Math.abs(transform.y) > TRANSFORM_TOLERANCE;
}

function regionTransforms({
  currentOrder,
  nextOrder,
  rectsById,
  region,
}: Readonly<{
  currentOrder: readonly string[];
  nextOrder: readonly string[];
  rectsById: Readonly<Record<string, WorkspaceRect>>;
  region: WorkspaceSectionMoveRegion;
}>): WorkspaceSectionMoveLayoutPreviewResolution {
  const firstId = currentOrder[0];
  if (!firstId) {
    return { allowed: true, preview: { transformsById: {} } };
  }
  const firstRect = rectsById[firstId];
  if (!firstRect) {
    return {
      allowed: false,
      reason: `The ${region.parentSectionId} layout preview is not completely measured.`,
    };
  }
  const starts = plannedStarts(
    nextOrder,
    logicalStart(firstRect, region.orientation, region.direction),
    region.gap,
    region.orientation,
    rectsById,
  );
  if (!starts) {
    return {
      allowed: false,
      reason: `The ${region.parentSectionId} layout preview is not completely measured.`,
    };
  }
  const transformsById = Object.fromEntries(
    currentOrder.flatMap((sectionId) => {
      const rect = rectsById[sectionId];
      const nextStart = starts[sectionId];
      if (!rect || nextStart === undefined) {
        return [];
      }
      const transform = transformPoint(
        nextStart - logicalStart(rect, region.orientation, region.direction),
        region.orientation,
        region.direction,
      );
      return hasMeaningfulTransform(transform) ? [[sectionId, transform] as const] : [];
    }),
  );
  return { allowed: true, preview: { transformsById } };
}

function mergeTransforms(
  left: Readonly<Record<string, InteractionPoint>>,
  right: Readonly<Record<string, InteractionPoint>>,
): Readonly<Record<string, InteractionPoint>> {
  return { ...left, ...right };
}

function requireRegion(
  regions: readonly WorkspaceSectionMoveRegion[],
  parentSectionId: string,
): WorkspaceSectionMoveRegion | null {
  return regions.find((region) => region.parentSectionId === parentSectionId) ?? null;
}

function sameParentPreview({
  hierarchy,
  plan,
  rectsById,
  region,
}: Readonly<{
  hierarchy: SectionHierarchySnapshot;
  plan: SectionMovePlan;
  rectsById: Readonly<Record<string, WorkspaceRect>>;
  region: WorkspaceSectionMoveRegion;
}>): WorkspaceSectionMoveLayoutPreviewResolution {
  const currentOrder = childOrder(hierarchy, region.parentSectionId);
  const remaining = withoutIds(currentOrder, new Set(plan.sectionIds));
  return regionTransforms({
    currentOrder,
    nextOrder: insertAt(remaining, plan.destinationIndex, plan.sectionIds),
    rectsById,
    region,
  });
}

function crossParentPreview({
  hierarchy,
  plan,
  rectsById,
  regions,
}: Readonly<{
  hierarchy: SectionHierarchySnapshot;
  plan: SectionMovePlan;
  rectsById: Readonly<Record<string, WorkspaceRect>>;
  regions: readonly WorkspaceSectionMoveRegion[];
}>): WorkspaceSectionMoveLayoutPreviewResolution {
  const movingIds = new Set(plan.sectionIds);
  let transformsById: Readonly<Record<string, InteractionPoint>> = {};
  if (plan.sourceParentId) {
    const sourceRegion = requireRegion(regions, plan.sourceParentId);
    if (!sourceRegion) {
      return { allowed: false, reason: "The source layout preview region is unavailable." };
    }
    const currentOrder = childOrder(hierarchy, plan.sourceParentId);
    const source = regionTransforms({
      currentOrder,
      nextOrder: withoutIds(currentOrder, movingIds),
      rectsById,
      region: sourceRegion,
    });
    if (!source.allowed) {
      return source;
    }
    transformsById = source.preview.transformsById;
  }
  if (plan.destinationParentId) {
    const destinationRegion = requireRegion(regions, plan.destinationParentId);
    if (!destinationRegion) {
      return { allowed: false, reason: "The destination layout preview region is unavailable." };
    }
    const currentOrder = childOrder(hierarchy, plan.destinationParentId);
    const remaining = withoutIds(currentOrder, movingIds);
    const destination = regionTransforms({
      currentOrder,
      nextOrder: insertAt(remaining, plan.destinationIndex, plan.sectionIds),
      rectsById,
      region: destinationRegion,
    });
    if (!destination.allowed) {
      return destination;
    }
    transformsById = mergeTransforms(transformsById, destination.preview.transformsById);
  }
  return { allowed: true, preview: { transformsById } };
}

export function resolveWorkspaceSectionMoveLayoutPreview({
  hierarchy,
  plan,
  rectsById,
  regions,
}: Readonly<{
  hierarchy: SectionHierarchySnapshot;
  plan: SectionMovePlan;
  rectsById: Readonly<Record<string, WorkspaceRect>>;
  regions: readonly WorkspaceSectionMoveRegion[];
}>): WorkspaceSectionMoveLayoutPreviewResolution {
  if (plan.sourceParentId && plan.sourceParentId === plan.destinationParentId) {
    const region = requireRegion(regions, plan.sourceParentId);
    return region
      ? sameParentPreview({ hierarchy, plan, rectsById, region })
      : { allowed: false, reason: "The source layout preview region is unavailable." };
  }
  return crossParentPreview({ hierarchy, plan, rectsById, regions });
}
