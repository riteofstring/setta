import { zoomIdentity } from "d3-zoom";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { useProjectState } from "state/definitions";
import { useMisc } from "state/stores/layoutInteractionStores";
import { useSettings } from "state/stores/uiPreferenceStores";
import { route_set_project_chat_window_chat_id } from "utils/generatedEndpoints";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createSectionSize,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type Position,
} from "utils/generatedTypes";
import {
  clearTrackedGitPaneGraphWindowIfMatches,
  resolveTrackedGitPaneGraphWindowInstanceId,
  setTrackedGitPaneGraphWindowInstanceId,
} from "./projectChatWindowingEphemeral";
import {
  addProjectChatWindowInstanceInState,
  closeProjectChatWindowInState,
  focusProjectChatWindowInState,
  getProjectChatWindowInstanceForSectionInState,
  maximizeProjectChatWindowInState,
  minimizeProjectChatWindowInState,
  moveProjectChatWindowToCanvasSectionInState,
  reopenProjectChatWindowInState,
  setProjectChatWindowBoundsByIdInState,
  setProjectChatWindowBoundsInState,
  setProjectChatWindowChatIdInState,
  setProjectChatWindowDockFractionsInState,
  setProjectChatWindowModeForSectionInState,
  setProjectChatWindowPlacementInState,
  setProjectChatWindowTitleInState,
  shouldSyncActiveProjectChatId,
  showSectionInProjectChatWindowInState,
  undockProjectChatWindowFromCanvasSectionInState,
  unmaximizeProjectChatWindowInState,
  type CreateProjectChatWindowInstanceOptions,
  type SetBoundsByInstanceIdOptions,
  type SetBoundsOptions,
  type SetDockFractionsOptions,
} from "./projectChatWindowingState";
import {
  applyProjectChatWindowingMutationLocally,
  canMutateProjectChatWindowingLayout,
  dispatchProjectChatWindowingMutation,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWrites";
import { getCurrProjectConfigId } from "./sectionInfos";
import { createTopLevelSectionWithResult } from "./sections/createSections";

export {
  flushPendingProjectChatWindowingWrites,
  replaceProjectChatWindowingState,
  syncProjectChatWindowingState,
} from "./projectChatWindowingWrites";
export { clearTrackedGitPaneGraphWindowIfMatches };

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

export function ensureTrackedGitPaneGraphWindow({
  title = "Git Graph",
  nowMs = Date.now(),
}: {
  title?: string | null;
  nowMs?: number;
} = {}): string {
  if (!canMutateProjectChatWindowingLayout()) {
    return "";
  }
  const normalizedTitle = title?.trim() ? title.trim() : "Git Graph";
  const state = useProjectState.getState();
  const projectConfigId = state.projectConfig.id;
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const trackedInstanceId = resolveTrackedGitPaneGraphWindowInstanceId(
    currentWindowing,
    projectConfigId,
  );

  if (trackedInstanceId) {
    dispatchProjectChatWindowingMutation((latestWindowing) => {
      let next = reopenProjectChatWindowInState(
        latestWindowing,
        trackedInstanceId,
      );
      next = setProjectChatWindowTitleInState(
        next,
        trackedInstanceId,
        normalizedTitle,
      );
      next = maximizeProjectChatWindowInState(next, trackedInstanceId);
      return {
        nextProjectChatWindowing: focusProjectChatWindowInState(
          next,
          trackedInstanceId,
          nowMs,
        ),
      };
    });
    return trackedInstanceId;
  }

  const created = addProjectChatWindowInstanceInState(currentWindowing, {
    placement: ChatWindowPlacementEnum.floating,
    mode: ChatWindowModeEnum.git_graph_mode,
    title: normalizedTitle,
    nowMs,
  });
  dispatchProjectChatWindowingMutation((latestWindowing) => {
    const nextCreated = addProjectChatWindowInstanceInState(latestWindowing, {
      instanceId: created.instanceId,
      placement: ChatWindowPlacementEnum.floating,
      mode: ChatWindowModeEnum.git_graph_mode,
      title: normalizedTitle,
      nowMs,
    });
    let next = maximizeProjectChatWindowInState(
      nextCreated.state,
      nextCreated.instanceId,
    );
    next = focusProjectChatWindowInState(next, nextCreated.instanceId, nowMs);
    return {
      nextProjectChatWindowing: next,
    };
  });
  setTrackedGitPaneGraphWindowInstanceId(projectConfigId, created.instanceId);
  return created.instanceId;
}

export function createProjectChatWindowInstance(
  options: CreateProjectChatWindowInstanceOptions = {},
): string {
  if (!canMutateProjectChatWindowingLayout()) {
    return "";
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = addProjectChatWindowInstanceInState(currentWindowing, options);
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: addProjectChatWindowInstanceInState(
      latestWindowing,
      {
        ...options,
        instanceId: next.instanceId,
      },
    ).state,
  }));
  return next.instanceId;
}

export function setProjectChatWindowPlacement(
  instanceId: string,
  placement: ChatWindowPlacement,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  if (placement !== ChatWindowPlacementEnum.maximized) {
    clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowPlacementInState(
      currentWindowing,
      instanceId,
      placement,
    ),
  }));
}

export function maximizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: maximizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function unmaximizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: unmaximizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
      useSettings.getState().chatWindowing?.restorePriorStateOnUnmaximize ??
        true,
    ),
  }));
}

export function closeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: closeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function minimizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: minimizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function reopenProjectChatWindow(instanceId: string): void {
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const nextProjectChatWindowing = reopenProjectChatWindowInState(
    currentWindowing,
    instanceId,
  );
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  if (!canMutateProjectChatWindowingLayout()) {
    applyProjectChatWindowingMutationLocally(nextProjectChatWindowing);
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: reopenProjectChatWindowInState(
      latestWindowing,
      instanceId,
    ),
  }));
}

export function focusProjectChatWindow(
  instanceId: string,
  nowMs: number = Date.now(),
): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = focusProjectChatWindowInState(
    currentWindowing,
    instanceId,
    nowMs,
  );
  if (next === currentWindowing) {
    return;
  }
  const focusedWindow = next.instancesById[instanceId];
  if (!canMutateProjectChatWindowingLayout()) {
    applyProjectChatWindowingMutationLocally(next, {
      ...(shouldSyncActiveProjectChatId(focusedWindow)
        ? {
            syncActiveChatId: focusedWindow.chatId ?? undefined,
          }
        : {}),
    });
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => {
    const nextProjectChatWindowing = focusProjectChatWindowInState(
      latestWindowing,
      instanceId,
      nowMs,
    );
    const nextFocusedWindow =
      nextProjectChatWindowing.instancesById[instanceId] ?? null;
    return {
      nextProjectChatWindowing,
      options: shouldSyncActiveProjectChatId(nextFocusedWindow)
        ? {
            syncActiveChatId: nextFocusedWindow?.chatId ?? undefined,
          }
        : {},
    };
  });
}

export function setProjectChatWindowDockFractions(
  options: SetDockFractionsOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowDockFractionsInState(
      currentWindowing,
      options,
    ),
  }));
}

export function setProjectChatWindowBounds(
  instanceId: string,
  bounds: SetBoundsOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowBoundsInState(
      currentWindowing,
      instanceId,
      bounds,
    ),
  }));
}

export function setProjectChatWindowBoundsById(
  boundsByInstanceId: SetBoundsByInstanceIdOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  for (const instanceId of Object.keys(boundsByInstanceId)) {
    clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowBoundsByIdInState(
      currentWindowing,
      boundsByInstanceId,
    ),
  }));
}

export function setProjectChatWindowTitle(
  instanceId: string,
  title: string | null,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowTitleInState(
      currentWindowing,
      instanceId,
      title,
    ),
  }));
}

export function setProjectChatWindowChatId(
  instanceId: string,
  chatId: string | null | undefined,
): void {
  const normalizedChatId = chatId?.trim() ? chatId.trim() : null;
  dispatchProjectChatWindowingMutation((currentWindowing) => {
    const nextProjectChatWindowing = setProjectChatWindowChatIdInState(
      currentWindowing,
      instanceId,
      normalizedChatId,
    );
    const updatedWindow =
      nextProjectChatWindowing.instancesById[instanceId] ?? null;
    return {
      nextProjectChatWindowing,
      send: (projectConfigId, frontendOpId) =>
        route_set_project_chat_window_chat_id({
          projectConfigId,
          instanceId,
          chatId: normalizedChatId,
          frontendOpId,
        }),
      options: shouldSyncActiveProjectChatId(updatedWindow)
        ? {
            syncActiveChatId: updatedWindow?.chatId ?? undefined,
          }
        : {},
    };
  });
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

  const next = moveProjectChatWindowToCanvasSectionInState(
    latestWindowing,
    instanceId,
    {
      sectionId,
      mode: latestInstance.mode,
    },
  );
  if (next !== latestWindowing) {
    dispatchProjectChatWindowingMutation((currentWindowing) => ({
      nextProjectChatWindowing: moveProjectChatWindowToCanvasSectionInState(
        currentWindowing,
        instanceId,
        {
          sectionId,
          mode: latestInstance.mode,
        },
      ),
    }));
  }
  return sectionId;
}

export function showSectionInProjectChatWindow(
  sectionId: string,
  placement: ChatWindowPlacement = ChatWindowPlacementEnum.floating,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    currentWindowing,
    sectionId,
  );
  const createdInstanceId =
    boundInstance?.instanceId ??
    addProjectChatWindowInstanceInState(currentWindowing, {
      placement,
      mode: ChatWindowModeEnum.section_mode,
      sectionIdOrNull: sectionId,
    }).instanceId;
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: showSectionInProjectChatWindowInState(
      latestWindowing,
      sectionId,
      {
        instanceId: createdInstanceId,
        placement,
      },
    ),
  }));
}

export function undockProjectChatWindowFromCanvasSection(
  instanceId: string,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const currentInstance = currentWindowing.instancesById[instanceId];
  if (
    !currentInstance ||
    currentInstance.placement !== ChatWindowPlacementEnum.canvas_section
  ) {
    return;
  }
  const next = undockProjectChatWindowFromCanvasSectionInState(
    currentWindowing,
    instanceId,
  );
  if (next === currentWindowing) {
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: undockProjectChatWindowFromCanvasSectionInState(
      latestWindowing,
      instanceId,
    ),
  }));
}

export function setProjectChatWindowModeForSection(
  sectionId: string,
  mode: ChatWindowMode,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    currentWindowing,
    sectionId,
  );
  const createdInstanceId =
    boundInstance?.instanceId ??
    (mode === ChatWindowModeEnum.section_mode
      ? undefined
      : addProjectChatWindowInstanceInState(currentWindowing, {
          placement: ChatWindowPlacementEnum.canvas_section,
          mode,
          sectionIdOrNull: sectionId,
        }).instanceId);
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowModeForSectionInState(
      latestWindowing,
      sectionId,
      mode,
      {
        createInstanceId: createdInstanceId,
      },
    ),
  }));
}
