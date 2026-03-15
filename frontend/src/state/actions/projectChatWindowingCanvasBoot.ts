import { zoomIdentity } from "d3-zoom";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { useProjectState } from "state/definitions";
import { useMisc } from "state/stores/layoutInteractionStores";
import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  createSectionSize,
  type Position,
} from "utils/generatedTypes";
import {
  moveProjectChatWindowToCanvasSectionInState,
  type MoveProjectChatWindowToCanvasSectionOptions,
} from "./projectChatWindowingSectionState";
import { dispatchProjectChatWindowingMutation } from "./projectChatWindowingWrites";
import {
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWriteState";
import { createTopLevelSectionWithResult } from "./sections/createSections";

type Point = {
  x: number;
  y: number;
};

function isFinitePoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as {
    x?: unknown;
    y?: unknown;
  };
  if (typeof candidate.x !== "number" || !Number.isFinite(candidate.x)) {
    return false;
  }
  if (typeof candidate.y !== "number" || !Number.isFinite(candidate.y)) {
    return false;
  }
  return true;
}

function isScreenPointInsideRect(point: Point, rect: DOMRect): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

function resolveProjectChatWindowSurfaceRect(
  instanceId: string,
): DOMRect | null {
  if (typeof document === "undefined") {
    return null;
  }
  const selectors = [
    `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${instanceId}"]`,
    `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${instanceId}"]`,
    `[data-testid="project-chat-maximized-window"][data-chat-window-instance-id="${instanceId}"]`,
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    return rect;
  }
  return null;
}

function resolveProjectChatCanvasBootPosition(
  instanceId?: string,
): Position | null {
  const domNode = useReactFlow.getState().domNode;
  if (!domNode) {
    return null;
  }
  const canvasRect = domNode.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) {
    return null;
  }
  if (instanceId) {
    const sourceRect = resolveProjectChatWindowSurfaceRect(instanceId);
    if (sourceRect) {
      const maxScreenX = Math.max(
        canvasRect.left,
        canvasRect.right - sourceRect.width,
      );
      const maxScreenY = Math.max(
        canvasRect.top,
        canvasRect.bottom - sourceRect.height,
      );
      const clampedScreenLeft = Math.min(
        Math.max(sourceRect.left, canvasRect.left),
        maxScreenX,
      );
      const clampedScreenTop = Math.min(
        Math.max(sourceRect.top, canvasRect.top),
        maxScreenY,
      );
      return screenToFlowPosition({
        x: clampedScreenLeft,
        y: clampedScreenTop,
      });
    }
  }
  const miscState = useMisc.getState();
  const cursorCandidates: Array<unknown> = [
    miscState.lastMouseUpLocation,
    miscState.lastMouseDownLocation,
  ];
  for (const candidate of cursorCandidates) {
    if (!isFinitePoint(candidate)) {
      continue;
    }
    if (!isScreenPointInsideRect(candidate, canvasRect)) {
      continue;
    }
    return screenToFlowPosition(candidate);
  }
  if (
    isFinitePoint(miscState.lastPaneClickLocation) &&
    (miscState.lastPaneClickLocation.x !== 0 ||
      miscState.lastPaneClickLocation.y !== 0)
  ) {
    return miscState.lastPaneClickLocation;
  }
  return screenToFlowPosition({
    x: canvasRect.left + canvasRect.width / 2,
    y: canvasRect.top + canvasRect.height / 2,
  });
}

function resolveProjectChatCanvasBootSectionSize(instanceId: string) {
  const rect = resolveProjectChatWindowSurfaceRect(instanceId);
  if (!rect) {
    return null;
  }
  const zoom = useReactFlow.getState().transform[2];
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return createSectionSize({
    width: Math.max(1, Math.round(rect.width / safeZoom)),
    height: Math.max(1, Math.round(rect.height / safeZoom)),
  });
}

function moveBootedProjectChatWindowToCanvasSection(
  instanceId: string,
  options: MoveProjectChatWindowToCanvasSectionOptions,
): void {
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: moveProjectChatWindowToCanvasSectionInState(
      currentWindowing,
      instanceId,
      options,
    ),
  }));
}

export async function bootProjectChatWindowToCanvasSection(
  instanceId: string,
): Promise<string | null> {
  if (!canMutateProjectChatWindowingLayout()) {
    return null;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const currentInstance = currentWindowing.instancesById[instanceId];
  if (!currentInstance) {
    return null;
  }
  if (currentInstance.mode === ChatWindowModeEnum.git_graph_mode) {
    return null;
  }

  let sectionId = currentInstance.sectionIdOrNull;
  const canvasSectionSize = sectionId
    ? null
    : resolveProjectChatCanvasBootSectionSize(instanceId);
  if (!sectionId) {
    const [viewportX, viewportY, viewportZoom] =
      useReactFlow.getState().transform;
    const created = await createTopLevelSectionWithResult({
      implType: SectionTypeEnum.Chat,
      implOverrides: {
        type: SectionTypeEnum.Chat,
        ...(canvasSectionSize ? { size: canvasSectionSize } : {}),
      },
      position: resolveProjectChatCanvasBootPosition(instanceId),
      name: currentInstance.title?.trim() ? currentInstance.title.trim() : null,
    });
    if (!created) {
      return null;
    }
    const { d3Zoom, d3Selection } = useReactFlow.getState();
    if (d3Zoom && d3Selection) {
      d3Zoom.transform(
        d3Selection,
        zoomIdentity.translate(viewportX, viewportY).scale(viewportZoom),
      );
    }
    sectionId = created.sectionId;
  }

  const latestWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const latestInstance = latestWindowing.instancesById[instanceId];
  if (!latestInstance) {
    return sectionId;
  }

  const moveOptions = {
    sectionId,
    mode: latestInstance.mode,
  };
  const next = moveProjectChatWindowToCanvasSectionInState(
    latestWindowing,
    instanceId,
    moveOptions,
  );
  if (next !== latestWindowing) {
    moveBootedProjectChatWindowToCanvasSection(instanceId, moveOptions);
  }
  return sectionId;
}
