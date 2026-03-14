import { resolveEstimatedDataPortAnchor } from "canvas-engine/dataPortAnchor";
import type { CanvasEngineNestedPreviewRect } from "canvas-engine/types";
import type {
  CanvasEngineEdgeHandlePosition,
  CanvasEngineSectionEdgePorts,
} from "./sceneAdapter";

type CollectNestedDataHandlePositionsParams = {
  liveEdgeHandlePositions: Record<string, CanvasEngineEdgeHandlePosition>;
  knownTopLevelSectionIds: string[];
  nestedPreviewRects: CanvasEngineNestedPreviewRect[];
  sectionEdgePortsBySectionId: Record<string, CanvasEngineSectionEdgePorts>;
};

export function collectCanvasEngineNestedDataHandlePositions({
  liveEdgeHandlePositions,
  knownTopLevelSectionIds,
  nestedPreviewRects,
  sectionEdgePortsBySectionId,
}: CollectNestedDataHandlePositionsParams): Record<
  string,
  CanvasEngineEdgeHandlePosition
> {
  const topLevelSectionIdSet = new Set(knownTopLevelSectionIds);
  const nestedPreviewRectBySectionId = new Map(
    nestedPreviewRects.map((rect) => [rect.id, rect]),
  );
  const nextCachedPositions: Record<string, CanvasEngineEdgeHandlePosition> =
    {};

  for (const [key, position] of Object.entries(liveEdgeHandlePositions)) {
    if (topLevelSectionIdSet.has(position.sectionId)) {
      continue;
    }
    const nestedPreviewRect = nestedPreviewRectBySectionId.get(position.sectionId);
    if (!nestedPreviewRect) {
      continue;
    }
    if (
      !isKnownNestedDataPort({
        position,
        sectionEdgePortsBySectionId,
      })
    ) {
      continue;
    }
    nextCachedPositions[key] = position;
  }

  for (const nestedPreviewRect of nestedPreviewRects) {
    if (topLevelSectionIdSet.has(nestedPreviewRect.id)) {
      continue;
    }
    const sectionPorts = sectionEdgePortsBySectionId[nestedPreviewRect.id];
    for (const portId of sectionPorts?.inputPortIds ?? []) {
      const key = buildDataHandleKey(nestedPreviewRect.id, portId, "target");
      if (key in nextCachedPositions) {
        continue;
      }
      const anchor = resolveEstimatedDataPortAnchor({
        rect: nestedPreviewRect,
        portId,
        portIds: sectionPorts.inputPortIds,
        handleType: "target",
      });
      nextCachedPositions[key] = {
        sectionId: nestedPreviewRect.id,
        portId,
        type: "target",
        x: anchor.x,
        y: anchor.y,
      };
    }
    for (const portId of sectionPorts?.outputPortIds ?? []) {
      const key = buildDataHandleKey(nestedPreviewRect.id, portId, "source");
      if (key in nextCachedPositions) {
        continue;
      }
      const anchor = resolveEstimatedDataPortAnchor({
        rect: nestedPreviewRect,
        portId,
        portIds: sectionPorts.outputPortIds,
        handleType: "source",
      });
      nextCachedPositions[key] = {
        sectionId: nestedPreviewRect.id,
        portId,
        type: "source",
        x: anchor.x,
        y: anchor.y,
      };
    }
  }

  return nextCachedPositions;
}

function isKnownNestedDataPort({
  position,
  sectionEdgePortsBySectionId,
}: {
  position: CanvasEngineEdgeHandlePosition;
  sectionEdgePortsBySectionId: Record<string, CanvasEngineSectionEdgePorts>;
}): boolean {
  const sectionPorts = sectionEdgePortsBySectionId[position.sectionId];
  if (!sectionPorts) {
    return false;
  }
  const knownPortIds =
    position.type === "target"
      ? sectionPorts.inputPortIds
      : sectionPorts.outputPortIds;
  return knownPortIds.includes(position.portId);
}

function buildDataHandleKey(
  sectionId: string,
  portId: string,
  type: "source" | "target",
): string {
  return `${sectionId}:${portId}:${type}`;
}
