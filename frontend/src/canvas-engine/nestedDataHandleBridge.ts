import type { CanvasEngineNestedPreviewRect } from "canvas-engine/types";
import type { CanvasEngineEdgeHandlePosition } from "./sceneAdapter";

type CollectNestedDataHandlePositionsParams = {
  liveEdgeHandlePositions: Record<string, CanvasEngineEdgeHandlePosition>;
  knownTopLevelSectionIds: string[];
  nestedPreviewRects: CanvasEngineNestedPreviewRect[];
  previousCachedPositions: Record<string, CanvasEngineEdgeHandlePosition>;
};

export function collectCanvasEngineNestedDataHandlePositions({
  liveEdgeHandlePositions,
  knownTopLevelSectionIds,
  nestedPreviewRects,
  previousCachedPositions,
}: CollectNestedDataHandlePositionsParams): Record<
  string,
  CanvasEngineEdgeHandlePosition
> {
  const topLevelSectionIdSet = new Set(knownTopLevelSectionIds);
  const nestedPreviewSectionIdSet = new Set(
    nestedPreviewRects.map((rect) => rect.id),
  );
  const nextCachedPositions: Record<string, CanvasEngineEdgeHandlePosition> =
    {};

  for (const [key, position] of Object.entries(previousCachedPositions)) {
    if (!nestedPreviewSectionIdSet.has(position.sectionId)) {
      continue;
    }
    nextCachedPositions[key] = position;
  }

  for (const [key, position] of Object.entries(liveEdgeHandlePositions)) {
    if (topLevelSectionIdSet.has(position.sectionId)) {
      continue;
    }
    if (!nestedPreviewSectionIdSet.has(position.sectionId)) {
      continue;
    }
    nextCachedPositions[key] = position;
  }

  return nextCachedPositions;
}
