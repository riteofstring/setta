import { getActiveSectionIds } from "../document/activeSections.js";
import { getRootSelectedSectionIds } from "../document/sectionSelection.js";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores.js";
import type { Position } from "../document/types.js";
import { getSectionRefsStore } from "../section/sectionRefs.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { getNodesBounds, hasPositiveRectBounds } from "./nodeBounds.js";
import type { Rect } from "./types.js";

type ScreenToFlowPosition = (
  position: Position,
  ignoreGrid: boolean,
) => Position;

export function resolveSectionRect(
  host: WorkspaceHost,
  sectionId: string,
  screenToFlowPosition: ScreenToFlowPosition,
  ignoreGrid = false,
): Rect | null {
  const ref =
    getSectionRefsStore(host).getState().selfOnly[sectionId] ??
    getSectionRefsStore(host).getState().withNested[sectionId];
  if (!ref) {
    return null;
  }

  const { clientWidth: width, clientHeight: height } = ref;
  const { x, y } = ref.getBoundingClientRect();
  const position = screenToFlowPosition({ x, y }, ignoreGrid);
  return { x: position.x, y: position.y, width, height };
}

export function resolveActiveSectionsBounds(
  host: WorkspaceHost,
  screenToFlowPosition: ScreenToFlowPosition,
  ignoreGrid = false,
): Rect {
  const activeSectionIds = getActiveSectionIds(host);
  const { rootIds } = getRootSelectedSectionIds(
    getWorkspaceDocumentStore(host).getState(),
    activeSectionIds,
  );
  const nodeInternals = getNodeInternalsStore(host).getState().x;
  const sections = rootIds.flatMap((sectionId) => {
    const node = nodeInternals.get(sectionId);
    if (node && hasPositiveRectBounds(node.width, node.height)) {
      return [
        {
          position: { x: node.position.x, y: node.position.y },
          width: node.width,
          height: node.height,
        },
      ];
    }

    const rect = resolveSectionRect(
      host,
      sectionId,
      screenToFlowPosition,
      ignoreGrid,
    );
    if (!rect || !hasPositiveRectBounds(rect.width, rect.height)) {
      return [];
    }
    return [
      {
        position: { x: rect.x, y: rect.y },
        width: rect.width,
        height: rect.height,
      },
    ];
  });

  return sections.length === 0
    ? { x: 0, y: 0, width: 0, height: 0 }
    : getNodesBounds(sections);
}
