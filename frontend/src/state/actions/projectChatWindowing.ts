import {
  PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX,
  PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX,
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
  resolveProjectChatFloatingBottomInsetPx,
  resolveProjectChatFloatingWorkspaceTopInsetPx,
} from "components/ChatWindowing/projectChatViewport";
import { zoomIdentity } from "d3-zoom";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  NULL_PROJECT_CONFIG_ID,
  useAIStore,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import { route_set_project_chat_windowing_state } from "utils/generatedEndpoints";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createProjectChatWindowInstance as createProjectChatWindowInstanceModel,
  createSectionSize,
  type ChatWindowBounds,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type Position,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  clearTrackedGitPaneGraphWindowIfMatches,
  reconcileProjectChatWindowingEphemeralState,
  resetProjectChatGitGraphEmbeddedPaneVisibility,
  resolveTrackedGitPaneGraphWindowInstanceId,
  setTrackedGitPaneGraphWindowInstanceId,
} from "./projectChatWindowingEphemeral";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";
import { createTopLevelSectionWithResult } from "./sections/createSections";

export { clearTrackedGitPaneGraphWindowIfMatches };

type CreateProjectChatWindowInstanceOptions = {
  placement?: ChatWindowPlacement;
  mode?: ChatWindowMode;
  sectionIdOrNull?: string | null;
  title?: string | null;
  chatId?: string | null;
  bounds?: ChatWindowBounds | null;
  nowMs?: number;
};

type SetDockFractionsOptions = {
  widthFractionsByInstanceId: Record<string, number>;
  dockContainerWidthPx?: number | null;
};

type SetBoundsOptions = Partial<ChatWindowBounds>;
type SetBoundsByInstanceIdOptions = Record<string, SetBoundsOptions>;

type MoveProjectChatWindowToCanvasSectionOptions = {
  sectionId: string;
  nowMs?: number;
  mode?: ChatWindowMode;
};

type UndockProjectChatWindowFromCanvasSectionOptions = {
  nowMs?: number;
};

type NormalizeResult = {
  state: ProjectChatWindowingState;
  changed: boolean;
};

type Point = {
  x: number;
  y: number;
};

type DefaultFloatingChatBoundsOptions = {
  viewportWidthPx: number;
  viewportHeightPx: number;
  workspaceTopInsetPx: number;
  bottomInsetPx: number;
  widthPx?: number;
  heightViewportFraction?: number;
  sideRailWidthPx?: number;
  minWidthPx?: number;
  minHeightPx?: number;
};

type DefaultDockedChatHeightOptions = {
  viewportHeightPx: number;
  workspaceTopInsetPx: number;
  bottomInsetPx: number;
  heightViewportFraction?: number;
  minHeightPx?: number;
};

const DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_WIDTH_PX =
  PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX;
const DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX =
  PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
const DEFAULT_FLOATING_CHAT_WIDTH_PX = 820;
const DEFAULT_FLOATING_CHAT_HEIGHT_VIEWPORT_FRACTION = 0.7;
const DEFAULT_FLOATING_CHAT_SIDE_RAIL_WIDTH_PX =
  PROJECT_CHAT_SIDE_RAIL_WIDTH_PX;
const DEFAULT_FLOATING_CHAT_WORKSPACE_TOP_INSET_PX =
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX;
const DEFAULT_FLOATING_CHAT_MIN_WIDTH_PX = 380;
const DEFAULT_FLOATING_CHAT_MIN_HEIGHT_PX = 240;
const DEFAULT_DOCKED_CHAT_HEIGHT_VIEWPORT_FRACTION = 0.7;
const DEFAULT_DOCKED_CHAT_MIN_HEIGHT_PX = 220;
const pendingProjectChatWindowingWrites = new Set<Promise<unknown>>();

function getProjectChatWindowingStateFromStore(
  state: ZustandProjectState,
): ProjectChatWindowingState {
  return state.projectChatWindowing;
}

function shouldSyncActiveProjectChatId(
  window: ProjectChatWindowInstance | null | undefined,
): boolean {
  return (
    window?.mode === ChatWindowModeEnum.project_ai_mode &&
    window.sectionIdOrNull === null
  );
}

export function resolveDefaultFloatingChatBounds({
  viewportWidthPx,
  viewportHeightPx,
  workspaceTopInsetPx,
  bottomInsetPx,
  widthPx = DEFAULT_FLOATING_CHAT_WIDTH_PX,
  heightViewportFraction = DEFAULT_FLOATING_CHAT_HEIGHT_VIEWPORT_FRACTION,
  sideRailWidthPx = DEFAULT_FLOATING_CHAT_SIDE_RAIL_WIDTH_PX,
  minWidthPx = DEFAULT_FLOATING_CHAT_MIN_WIDTH_PX,
  minHeightPx = DEFAULT_FLOATING_CHAT_MIN_HEIGHT_PX,
}: DefaultFloatingChatBoundsOptions): ChatWindowBounds {
  const safeViewportWidthPx =
    Number.isFinite(viewportWidthPx) && viewportWidthPx > 0
      ? viewportWidthPx
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_WIDTH_PX;
  const safeViewportHeightPx =
    Number.isFinite(viewportHeightPx) && viewportHeightPx > 0
      ? viewportHeightPx
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
  const safeWorkspaceTopInsetPx =
    Number.isFinite(workspaceTopInsetPx) && workspaceTopInsetPx >= 0
      ? workspaceTopInsetPx
      : DEFAULT_FLOATING_CHAT_WORKSPACE_TOP_INSET_PX;
  const safeBottomInsetPx =
    Number.isFinite(bottomInsetPx) && bottomInsetPx >= 0 ? bottomInsetPx : 0;
  const availableWidthPx = Math.max(
    minWidthPx,
    safeViewportWidthPx - sideRailWidthPx * 2,
  );
  const availableHeightPx = Math.max(
    minHeightPx,
    safeViewportHeightPx - safeWorkspaceTopInsetPx - safeBottomInsetPx,
  );
  const resolvedWidthPx = Math.min(
    Math.max(minWidthPx, widthPx),
    availableWidthPx,
  );
  const desiredHeightPx = safeViewportHeightPx * heightViewportFraction;
  const resolvedHeightPx = Math.min(
    Math.max(minHeightPx, desiredHeightPx),
    availableHeightPx,
  );

  return {
    x:
      sideRailWidthPx +
      Math.max(0, Math.round((availableWidthPx - resolvedWidthPx) / 2)),
    y:
      safeWorkspaceTopInsetPx +
      Math.max(0, Math.round((availableHeightPx - resolvedHeightPx) / 2)),
    width: resolvedWidthPx,
    height: resolvedHeightPx,
  };
}

export function resolveDefaultDockedChatHeightPx({
  viewportHeightPx,
  workspaceTopInsetPx,
  bottomInsetPx,
  heightViewportFraction = DEFAULT_DOCKED_CHAT_HEIGHT_VIEWPORT_FRACTION,
  minHeightPx = DEFAULT_DOCKED_CHAT_MIN_HEIGHT_PX,
}: DefaultDockedChatHeightOptions): number {
  const safeViewportHeightPx =
    Number.isFinite(viewportHeightPx) && viewportHeightPx > 0
      ? viewportHeightPx
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
  const safeWorkspaceTopInsetPx =
    Number.isFinite(workspaceTopInsetPx) && workspaceTopInsetPx >= 0
      ? workspaceTopInsetPx
      : DEFAULT_FLOATING_CHAT_WORKSPACE_TOP_INSET_PX;
  const safeBottomInsetPx =
    Number.isFinite(bottomInsetPx) && bottomInsetPx >= 0 ? bottomInsetPx : 0;
  const availableHeightPx = Math.max(
    minHeightPx,
    safeViewportHeightPx - safeWorkspaceTopInsetPx - safeBottomInsetPx,
  );
  return Math.min(
    Math.max(minHeightPx, safeViewportHeightPx * heightViewportFraction),
    availableHeightPx,
  );
}

function resolveFloatingWorkspaceTopInsetPx(): number {
  return resolveProjectChatFloatingWorkspaceTopInsetPx();
}

function resolveFloatingBottomInsetPx(): number {
  return resolveProjectChatFloatingBottomInsetPx();
}

function resolveDefaultFloatingChatBoundsFromRuntime(): ChatWindowBounds {
  const viewportWidthPx =
    typeof window !== "undefined"
      ? window.innerWidth
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_WIDTH_PX;
  const viewportHeightPx =
    typeof window !== "undefined"
      ? window.innerHeight
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
  return resolveDefaultFloatingChatBounds({
    viewportWidthPx,
    viewportHeightPx,
    workspaceTopInsetPx: resolveFloatingWorkspaceTopInsetPx(),
    bottomInsetPx: resolveFloatingBottomInsetPx(),
  });
}

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

function normalizeProjectChatWindowingOrder(
  state: ProjectChatWindowingState,
): NormalizeResult {
  const seen = new Set<string>();
  const nextOrder: string[] = [];
  for (const instanceId of state.order) {
    if (!state.instancesById[instanceId]) {
      continue;
    }
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    nextOrder.push(instanceId);
  }
  for (const instanceId of Object.keys(state.instancesById)) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    nextOrder.push(instanceId);
  }
  const changed =
    nextOrder.length !== state.order.length ||
    nextOrder.some((id, index) => id !== state.order[index]);
  if (!changed) {
    return { state, changed: false };
  }
  return {
    state: {
      ...state,
      order: nextOrder,
    },
    changed: true,
  };
}

function getSectionBindingPlacementPriority(
  placement: ChatWindowPlacement,
): number {
  if (placement === ChatWindowPlacementEnum.canvas_section) {
    return 4;
  }
  if (placement === ChatWindowPlacementEnum.floating) {
    return 3;
  }
  if (placement === ChatWindowPlacementEnum.maximized) {
    return 2;
  }
  return 1;
}

function isProjectChatWindowVisible(
  instance: ProjectChatWindowInstance,
): boolean {
  return !instance.isClosed && !instance.isMinimized;
}

function isPreferredSectionBindingCandidate(
  candidate: ProjectChatWindowInstance,
  currentBest: ProjectChatWindowInstance | null,
): boolean {
  if (!currentBest) {
    return true;
  }
  const candidatePlacementPriority = getSectionBindingPlacementPriority(
    candidate.placement,
  );
  const bestPlacementPriority = getSectionBindingPlacementPriority(
    currentBest.placement,
  );
  if (candidatePlacementPriority !== bestPlacementPriority) {
    return candidatePlacementPriority > bestPlacementPriority;
  }

  const candidateVisible = isProjectChatWindowVisible(candidate);
  const bestVisible = isProjectChatWindowVisible(currentBest);
  if (candidateVisible !== bestVisible) {
    return candidateVisible;
  }

  if (candidate.zIndex !== currentBest.zIndex) {
    return candidate.zIndex > currentBest.zIndex;
  }
  if (candidate.lastFocusedAt !== currentBest.lastFocusedAt) {
    return candidate.lastFocusedAt > currentBest.lastFocusedAt;
  }
  return false;
}

function getProjectChatWindowInstanceForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  let bestMatch: ProjectChatWindowInstance | null = null;
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.sectionIdOrNull !== sectionId) {
      continue;
    }
    if (!isPreferredSectionBindingCandidate(instance, bestMatch)) {
      continue;
    }
    bestMatch = instance;
  }
  return bestMatch;
}

export function getProjectChatWindowBindingForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  return getProjectChatWindowInstanceForSectionInState(state, sectionId);
}

export function getProjectChatWindowModeForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ChatWindowMode {
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
  );
  if (!boundInstance) {
    return ChatWindowModeEnum.section_mode;
  }
  return boundInstance.mode;
}

function getProjectChatWindowInstanceForModeInState(
  state: ProjectChatWindowingState,
  mode: ChatWindowMode,
): ProjectChatWindowInstance | null {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  let bestMatch: ProjectChatWindowInstance | null = null;
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.mode !== mode || instance.sectionIdOrNull) {
      continue;
    }
    if (!isPreferredSectionBindingCandidate(instance, bestMatch)) {
      continue;
    }
    bestMatch = instance;
  }
  return bestMatch;
}

export function ensureTrackedGitPaneGraphWindow({
  title = "Git Graph",
  nowMs = Date.now(),
}: {
  title?: string | null;
  nowMs?: number;
} = {}): string {
  const normalizedTitle = title?.trim() ? title.trim() : "Git Graph";
  const state = useProjectState.getState();
  const projectConfigId = state.projectConfig.id;
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const trackedInstanceId = resolveTrackedGitPaneGraphWindowInstanceId(
    currentWindowing,
    projectConfigId,
  );

  if (trackedInstanceId) {
    let next = reopenProjectChatWindowInState(
      currentWindowing,
      trackedInstanceId,
    );
    next = withUpdatedWindow(next, trackedInstanceId, (current) => {
      if (current.title === normalizedTitle) {
        return current;
      }
      return {
        ...current,
        title: normalizedTitle,
      };
    });
    next = maximizeProjectChatWindowInState(next, trackedInstanceId);
    next = focusProjectChatWindowInState(next, trackedInstanceId, nowMs);
    setProjectChatWindowingStateInStore(next);
    return trackedInstanceId;
  }

  const created = addProjectChatWindowInstanceInState(currentWindowing, {
    placement: ChatWindowPlacementEnum.floating,
    mode: ChatWindowModeEnum.git_graph_mode,
    title: normalizedTitle,
    nowMs,
  });
  let next = maximizeProjectChatWindowInState(
    created.state,
    created.instanceId,
  );
  next = focusProjectChatWindowInState(next, created.instanceId, nowMs);
  setProjectChatWindowingStateInStore(next);
  setTrackedGitPaneGraphWindowInstanceId(projectConfigId, created.instanceId);
  return created.instanceId;
}

export function getOpenExternalProjectChatWindowInstanceForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  return getExternalProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
    {
      visibleOnly: true,
    },
  );
}

export function getExternalProjectChatWindowBindingForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  return getExternalProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
    {
      visibleOnly: false,
    },
  );
}

function getExternalProjectChatWindowInstanceForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
  { visibleOnly }: { visibleOnly: boolean },
): ProjectChatWindowInstance | null {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  let bestMatch: ProjectChatWindowInstance | null = null;
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.sectionIdOrNull !== sectionId) {
      continue;
    }
    if (instance.placement === ChatWindowPlacementEnum.canvas_section) {
      continue;
    }
    if (visibleOnly && (instance.isClosed || instance.isMinimized)) {
      continue;
    }
    if (!isPreferredSectionBindingCandidate(instance, bestMatch)) {
      continue;
    }
    bestMatch = instance;
  }
  return bestMatch;
}

function getNextWindowInstanceId(state: ProjectChatWindowingState): {
  instanceId: string;
  nextInstanceNumber: number;
} {
  let nextInstanceNumber = Math.max(1, state.nextInstanceNumber);
  for (;;) {
    const candidateId = `project-chat-window-${nextInstanceNumber}`;
    if (!state.instancesById[candidateId]) {
      return {
        instanceId: candidateId,
        nextInstanceNumber: nextInstanceNumber + 1,
      };
    }
    nextInstanceNumber += 1;
  }
}

function getHighestWindowZIndex(state: ProjectChatWindowingState): number {
  let maxZIndex = 0;
  for (const instance of Object.values(state.instancesById)) {
    if (instance.zIndex > maxZIndex) {
      maxZIndex = instance.zIndex;
    }
  }
  return maxZIndex;
}

function buildNextWindowInstances(
  state: ProjectChatWindowingState,
  instanceId: string,
  updater: (instance: ProjectChatWindowInstance) => ProjectChatWindowInstance,
): Record<string, ProjectChatWindowInstance> {
  const current = state.instancesById[instanceId];
  if (!current) {
    return state.instancesById;
  }
  const next = updater(current);
  if (next === current) {
    return state.instancesById;
  }
  return {
    ...state.instancesById,
    [instanceId]: next,
  };
}

function withUpdatedWindow(
  state: ProjectChatWindowingState,
  instanceId: string,
  updater: (instance: ProjectChatWindowInstance) => ProjectChatWindowInstance,
): ProjectChatWindowingState {
  const nextInstancesById = buildNextWindowInstances(
    state,
    instanceId,
    updater,
  );
  if (nextInstancesById === state.instancesById) {
    return state;
  }
  return {
    ...state,
    instancesById: nextInstancesById,
  };
}

export function addProjectChatWindowInstanceInState(
  state: ProjectChatWindowingState,
  {
    placement = ChatWindowPlacementEnum.bottom_docked,
    mode = ChatWindowModeEnum.project_ai_mode,
    sectionIdOrNull = null,
    title = null,
    chatId = null,
    bounds = null,
    nowMs = Date.now(),
  }: CreateProjectChatWindowInstanceOptions = {},
): {
  state: ProjectChatWindowingState;
  instanceId: string;
} {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  const { instanceId, nextInstanceNumber } =
    getNextWindowInstanceId(normalized);
  const nextZIndex = getHighestWindowZIndex(normalized) + 1;
  const resolvedBounds =
    bounds ??
    (placement === ChatWindowPlacementEnum.floating
      ? resolveDefaultFloatingChatBoundsFromRuntime()
      : null);
  const normalizedTitle = title?.trim() ? title.trim() : null;
  const nextInstance = createProjectChatWindowInstanceModel({
    instanceId,
    placement,
    mode,
    sectionIdOrNull,
    title: normalizedTitle,
    chatId,
    isClosed: false,
    isMinimized: false,
    isMaximized: placement === ChatWindowPlacementEnum.maximized,
    lastFocusedAt: nowMs,
    zIndex: nextZIndex,
    ...(resolvedBounds ? { bounds: resolvedBounds } : {}),
  });
  return {
    instanceId,
    state: {
      ...normalized,
      instancesById: {
        ...normalized.instancesById,
        [instanceId]: nextInstance,
      },
      order: [...normalized.order, instanceId],
      nextInstanceNumber,
    },
  };
}

export function setProjectChatWindowPlacementInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  placement: ChatWindowPlacement,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    const isMaximized = placement === ChatWindowPlacementEnum.maximized;
    const nextLastPlacementBeforeMaximize = isMaximized
      ? current.placement === ChatWindowPlacementEnum.maximized
        ? current.lastPlacementBeforeMaximize
        : current.placement
      : current.lastPlacementBeforeMaximize;
    if (
      current.placement === placement &&
      current.isMaximized === isMaximized &&
      current.lastPlacementBeforeMaximize === nextLastPlacementBeforeMaximize
    ) {
      return current;
    }
    return {
      ...current,
      placement,
      isMaximized,
      lastPlacementBeforeMaximize: nextLastPlacementBeforeMaximize,
    };
  });
}

function setProjectChatWindowModeInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  mode: ChatWindowMode,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (current.mode === mode) {
      return current;
    }
    return {
      ...current,
      mode,
    };
  });
}

export function maximizeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (current.isMaximized) {
      return current;
    }
    const nextLastPlacementBeforeMaximize =
      current.placement === ChatWindowPlacementEnum.maximized
        ? current.lastPlacementBeforeMaximize
        : current.placement;
    return {
      ...current,
      isMaximized: true,
      placement: ChatWindowPlacementEnum.maximized,
      lastPlacementBeforeMaximize: nextLastPlacementBeforeMaximize,
    };
  });
}

export function unmaximizeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (!current.isMaximized) {
      return current;
    }
    return {
      ...current,
      isMaximized: false,
      placement:
        current.lastPlacementBeforeMaximize ??
        ChatWindowPlacementEnum.bottom_docked,
      lastPlacementBeforeMaximize: null,
    };
  });
}

export function closeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (current.isClosed && !current.isMinimized) {
      return current;
    }
    return {
      ...current,
      isClosed: true,
      isMinimized: false,
    };
  });
}

export function minimizeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (!current.isClosed && current.isMinimized) {
      return current;
    }
    return {
      ...current,
      isClosed: false,
      isMinimized: true,
    };
  });
}

export function reopenProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (!current.isClosed && !current.isMinimized) {
      return current;
    }
    return {
      ...current,
      isClosed: false,
      isMinimized: false,
    };
  });
}

export function focusProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  nowMs: number = Date.now(),
): ProjectChatWindowingState {
  const nextZIndex = getHighestWindowZIndex(state) + 1;
  return withUpdatedWindow(state, instanceId, (current) => {
    if (current.zIndex === nextZIndex && current.lastFocusedAt === nowMs) {
      return current;
    }
    return {
      ...current,
      zIndex: nextZIndex,
      lastFocusedAt: nowMs,
    };
  });
}

export function setProjectChatWindowDockFractionsInState(
  state: ProjectChatWindowingState,
  {
    widthFractionsByInstanceId,
    dockContainerWidthPx = null,
  }: SetDockFractionsOptions,
): ProjectChatWindowingState {
  let nextInstancesById: Record<string, ProjectChatWindowInstance> | null =
    null;
  let changed = false;
  const hasDockContainerWidth =
    typeof dockContainerWidthPx === "number" && dockContainerWidthPx > 0;
  for (const [instanceId, widthFraction] of Object.entries(
    widthFractionsByInstanceId,
  )) {
    const current = state.instancesById[instanceId];
    if (!current) {
      continue;
    }
    if (!Number.isFinite(widthFraction) || widthFraction <= 0) {
      continue;
    }
    const nextPreferredWidthPx = hasDockContainerWidth
      ? widthFraction * dockContainerWidthPx
      : current.dockMetrics.preferredWidthPx;
    if (
      current.dockMetrics.widthFraction === widthFraction &&
      current.dockMetrics.preferredWidthPx === nextPreferredWidthPx
    ) {
      continue;
    }
    if (!nextInstancesById) {
      nextInstancesById = { ...state.instancesById };
    }
    nextInstancesById[instanceId] = {
      ...current,
      dockMetrics: {
        ...current.dockMetrics,
        widthFraction,
        preferredWidthPx: nextPreferredWidthPx,
      },
    };
    changed = true;
  }

  if (!changed || !nextInstancesById) {
    return state;
  }
  return {
    ...state,
    instancesById: nextInstancesById,
  };
}

export function setProjectChatWindowBoundsInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  bounds: SetBoundsOptions,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    let changed = false;
    const nextBounds: ChatWindowBounds = { ...current.bounds };

    if (
      typeof bounds.x === "number" &&
      Number.isFinite(bounds.x) &&
      nextBounds.x !== bounds.x
    ) {
      nextBounds.x = bounds.x;
      changed = true;
    }
    if (
      typeof bounds.y === "number" &&
      Number.isFinite(bounds.y) &&
      nextBounds.y !== bounds.y
    ) {
      nextBounds.y = bounds.y;
      changed = true;
    }
    if (
      typeof bounds.width === "number" &&
      Number.isFinite(bounds.width) &&
      bounds.width > 0 &&
      nextBounds.width !== bounds.width
    ) {
      nextBounds.width = bounds.width;
      changed = true;
    }
    if (
      typeof bounds.height === "number" &&
      Number.isFinite(bounds.height) &&
      bounds.height > 0 &&
      nextBounds.height !== bounds.height
    ) {
      nextBounds.height = bounds.height;
      changed = true;
    }

    if (!changed) {
      return current;
    }
    return {
      ...current,
      bounds: nextBounds,
    };
  });
}

export function setProjectChatWindowBoundsByIdInState(
  state: ProjectChatWindowingState,
  boundsByInstanceId: SetBoundsByInstanceIdOptions,
): ProjectChatWindowingState {
  let nextState = state;
  for (const [instanceId, bounds] of Object.entries(boundsByInstanceId)) {
    nextState = setProjectChatWindowBoundsInState(
      nextState,
      instanceId,
      bounds,
    );
  }
  return nextState;
}

export function moveProjectChatWindowToCanvasSectionInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  {
    sectionId,
    nowMs = Date.now(),
    mode = ChatWindowModeEnum.section_mode,
  }: MoveProjectChatWindowToCanvasSectionOptions,
): ProjectChatWindowingState {
  const withCanvasPlacement = setProjectChatWindowPlacementInState(
    state,
    instanceId,
    ChatWindowPlacementEnum.canvas_section,
  );
  const withOpenWindow = withUpdatedWindow(
    withCanvasPlacement,
    instanceId,
    (current) => {
      if (
        current.sectionIdOrNull === sectionId &&
        current.mode === mode &&
        !current.isClosed &&
        !current.isMinimized
      ) {
        return current;
      }
      return {
        ...current,
        sectionIdOrNull: sectionId,
        mode,
        title: null,
        isClosed: false,
        isMinimized: false,
      };
    },
  );
  return focusProjectChatWindowInState(withOpenWindow, instanceId, nowMs);
}

export function undockProjectChatWindowFromCanvasSectionInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  { nowMs = Date.now() }: UndockProjectChatWindowFromCanvasSectionOptions = {},
): ProjectChatWindowingState {
  const withFloatingPlacement = setProjectChatWindowPlacementInState(
    state,
    instanceId,
    ChatWindowPlacementEnum.floating,
  );
  const withOpenWindow = withUpdatedWindow(
    withFloatingPlacement,
    instanceId,
    (current) => {
      if (!current.isClosed && !current.isMinimized) {
        return current;
      }
      return {
        ...current,
        isClosed: false,
        isMinimized: false,
      };
    },
  );
  return focusProjectChatWindowInState(withOpenWindow, instanceId, nowMs);
}

export function setProjectChatWindowModeForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
  mode: ChatWindowMode,
): ProjectChatWindowingState {
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
  );
  if (!boundInstance) {
    if (mode === ChatWindowModeEnum.section_mode) {
      return state;
    }
    return addProjectChatWindowInstanceInState(state, {
      placement: ChatWindowPlacementEnum.canvas_section,
      mode,
      sectionIdOrNull: sectionId,
    }).state;
  }
  return setProjectChatWindowModeInState(state, boundInstance.instanceId, mode);
}

export function showSectionInProjectChatWindowInState(
  state: ProjectChatWindowingState,
  sectionId: string,
  {
    placement = ChatWindowPlacementEnum.floating,
    nowMs = Date.now(),
  }: {
    placement?: ChatWindowPlacement;
    nowMs?: number;
  } = {},
): ProjectChatWindowingState {
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
  );
  if (!boundInstance) {
    return addProjectChatWindowInstanceInState(state, {
      placement,
      mode: ChatWindowModeEnum.section_mode,
      sectionIdOrNull: sectionId,
      nowMs,
    }).state;
  }

  let next = setProjectChatWindowPlacementInState(
    state,
    boundInstance.instanceId,
    placement,
  );
  next = withUpdatedWindow(next, boundInstance.instanceId, (current) => {
    const shouldSeedFloatingBounds =
      placement === ChatWindowPlacementEnum.floating &&
      (boundInstance.placement !== ChatWindowPlacementEnum.floating ||
        !Number.isFinite(current.bounds.width) ||
        current.bounds.width <= 0 ||
        !Number.isFinite(current.bounds.height) ||
        current.bounds.height <= 0);
    const resolvedBounds = shouldSeedFloatingBounds
      ? resolveDefaultFloatingChatBoundsFromRuntime()
      : current.bounds;
    if (
      current.sectionIdOrNull === sectionId &&
      !current.isClosed &&
      !current.isMinimized &&
      current.bounds === resolvedBounds
    ) {
      return current;
    }
    return {
      ...current,
      sectionIdOrNull: sectionId,
      title: null,
      isClosed: false,
      isMinimized: false,
      bounds: resolvedBounds,
    };
  });
  return focusProjectChatWindowInState(next, boundInstance.instanceId, nowMs);
}

export function setProjectChatWindowTitleInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  title: string | null,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    const normalizedTitle = current.sectionIdOrNull
      ? null
      : title?.trim()
        ? title.trim()
        : null;
    if (current.title === normalizedTitle) {
      return current;
    }
    return {
      ...current,
      title: normalizedTitle,
    };
  });
}

function setProjectChatWindowChatIdInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  chatId: string | null | undefined,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    const normalizedChatId = chatId?.trim() ? chatId.trim() : null;
    if (current.chatId === normalizedChatId) {
      return current;
    }
    return {
      ...current,
      chatId: normalizedChatId,
    };
  });
}

export function showProjectChatWindowForModeInState(
  state: ProjectChatWindowingState,
  mode: ChatWindowMode,
  {
    placement = ChatWindowPlacementEnum.floating,
    title = null,
    nowMs = Date.now(),
  }: {
    placement?: ChatWindowPlacement;
    title?: string | null;
    nowMs?: number;
  } = {},
): {
  state: ProjectChatWindowingState;
  instanceId: string;
} {
  const normalizedTitle = title?.trim() ? title.trim() : null;
  const existing = getProjectChatWindowInstanceForModeInState(state, mode);
  if (!existing) {
    const initialPlacement =
      placement === ChatWindowPlacementEnum.maximized
        ? ChatWindowPlacementEnum.floating
        : placement;
    const created = addProjectChatWindowInstanceInState(state, {
      placement: initialPlacement,
      mode,
      title: normalizedTitle,
      nowMs,
    });
    const nextState =
      placement === ChatWindowPlacementEnum.maximized
        ? focusProjectChatWindowInState(
            maximizeProjectChatWindowInState(created.state, created.instanceId),
            created.instanceId,
            nowMs,
          )
        : focusProjectChatWindowInState(
            created.state,
            created.instanceId,
            nowMs,
          );
    return {
      state: nextState,
      instanceId: created.instanceId,
    };
  }

  let next = reopenProjectChatWindowInState(state, existing.instanceId);
  if (existing.isMaximized && placement !== ChatWindowPlacementEnum.maximized) {
    next = unmaximizeProjectChatWindowInState(next, existing.instanceId);
  }
  next = setProjectChatWindowPlacementInState(
    next,
    existing.instanceId,
    placement,
  );
  next = withUpdatedWindow(next, existing.instanceId, (current) => {
    const shouldSeedFloatingBounds =
      placement === ChatWindowPlacementEnum.floating &&
      (existing.placement !== ChatWindowPlacementEnum.floating ||
        !Number.isFinite(current.bounds.width) ||
        current.bounds.width <= 0 ||
        !Number.isFinite(current.bounds.height) ||
        current.bounds.height <= 0);
    const resolvedBounds = shouldSeedFloatingBounds
      ? resolveDefaultFloatingChatBoundsFromRuntime()
      : current.bounds;
    if (
      !current.isClosed &&
      !current.isMinimized &&
      current.title === (normalizedTitle ?? current.title) &&
      current.bounds === resolvedBounds
    ) {
      return current;
    }
    return {
      ...current,
      isClosed: false,
      isMinimized: false,
      title: normalizedTitle ?? current.title,
      bounds: resolvedBounds,
    };
  });
  if (placement === ChatWindowPlacementEnum.maximized) {
    next = maximizeProjectChatWindowInState(next, existing.instanceId);
  }
  return {
    state: focusProjectChatWindowInState(next, existing.instanceId, nowMs),
    instanceId: existing.instanceId,
  };
}

export function getVisibleProjectChatWindowInstances(
  state: ProjectChatWindowingState,
): ProjectChatWindowInstance[] {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  const visible: ProjectChatWindowInstance[] = [];
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.isClosed || instance.isMinimized) {
      continue;
    }
    visible.push(instance);
  }
  return visible;
}

function setProjectChatWindowingStateInStore(
  nextProjectChatWindowing: ProjectChatWindowingState,
): void {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId) {
    reconcileProjectChatWindowingEphemeralState(
      nextProjectChatWindowing,
      projectConfigId,
    );
  }
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    useProjectState.setState((state) => {
      state.projectChatWindowing = nextProjectChatWindowing;
    });
    return;
  }

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      state.projectChatWindowing = nextProjectChatWindowing;
    },
    send: (frontendOpId) => {
      const request = route_set_project_chat_windowing_state({
        projectConfigId,
        state: nextProjectChatWindowing,
        frontendOpId,
      });
      pendingProjectChatWindowingWrites.add(request);
      void request.finally(() => {
        pendingProjectChatWindowingWrites.delete(request);
      });
      return request;
    },
  });
}

export async function flushPendingProjectChatWindowingWrites(): Promise<void> {
  while (pendingProjectChatWindowingWrites.size > 0) {
    await Promise.allSettled([...pendingProjectChatWindowingWrites]);
  }
}

export function replaceProjectChatWindowingState(
  nextProjectChatWindowing: ProjectChatWindowingState,
): void {
  resetProjectChatGitGraphEmbeddedPaneVisibility();
  setProjectChatWindowingStateInStore(nextProjectChatWindowing);
}

export function createProjectChatWindowInstance(
  options: CreateProjectChatWindowInstanceOptions = {},
): string {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = addProjectChatWindowInstanceInState(currentWindowing, options);
  setProjectChatWindowingStateInStore(next.state);
  return next.instanceId;
}

export function setProjectChatWindowPlacement(
  instanceId: string,
  placement: ChatWindowPlacement,
): void {
  const projectConfigId = getCurrProjectConfigId();
  if (placement !== ChatWindowPlacementEnum.maximized) {
    clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = setProjectChatWindowPlacementInState(
    currentWindowing,
    instanceId,
    placement,
  );
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function maximizeProjectChatWindow(instanceId: string): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = maximizeProjectChatWindowInState(currentWindowing, instanceId);
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function unmaximizeProjectChatWindow(instanceId: string): void {
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = unmaximizeProjectChatWindowInState(currentWindowing, instanceId);
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function closeProjectChatWindow(instanceId: string): void {
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = closeProjectChatWindowInState(currentWindowing, instanceId);
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function minimizeProjectChatWindow(instanceId: string): void {
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = minimizeProjectChatWindowInState(currentWindowing, instanceId);
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function reopenProjectChatWindow(instanceId: string): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = reopenProjectChatWindowInState(currentWindowing, instanceId);
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
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
  setProjectChatWindowingStateInStore(next);
  const focusedWindow = next.instancesById[instanceId];
  if (shouldSyncActiveProjectChatId(focusedWindow)) {
    useAIStore.setState({
      activeChatId: focusedWindow.chatId ?? undefined,
    });
  }
}

export function setProjectChatWindowDockFractions(
  options: SetDockFractionsOptions,
): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = setProjectChatWindowDockFractionsInState(
    currentWindowing,
    options,
  );
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function setProjectChatWindowBounds(
  instanceId: string,
  bounds: SetBoundsOptions,
): void {
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = setProjectChatWindowBoundsInState(
    currentWindowing,
    instanceId,
    bounds,
  );
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function setProjectChatWindowBoundsById(
  boundsByInstanceId: SetBoundsByInstanceIdOptions,
): void {
  const projectConfigId = getCurrProjectConfigId();
  for (const instanceId of Object.keys(boundsByInstanceId)) {
    clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = setProjectChatWindowBoundsByIdInState(
    currentWindowing,
    boundsByInstanceId,
  );
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function setProjectChatWindowTitle(
  instanceId: string,
  title: string | null,
): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = setProjectChatWindowTitleInState(
    currentWindowing,
    instanceId,
    title,
  );
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function setProjectChatWindowChatId(
  instanceId: string,
  chatId: string | null | undefined,
): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = setProjectChatWindowChatIdInState(
    currentWindowing,
    instanceId,
    chatId,
  );
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
  const updatedWindow = next.instancesById[instanceId];
  if (!shouldSyncActiveProjectChatId(updatedWindow)) {
    return;
  }
  useAIStore.setState({
    activeChatId: chatId?.trim() ? chatId.trim() : undefined,
  });
}

export async function bootProjectChatWindowToCanvasSection(
  instanceId: string,
): Promise<string | null> {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const currentInstance = currentWindowing.instancesById[instanceId];
  if (!currentInstance) {
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
    setProjectChatWindowingStateInStore(next);
  }
  return sectionId;
}

export function showSectionInProjectChatWindow(
  sectionId: string,
  placement: ChatWindowPlacement = ChatWindowPlacementEnum.floating,
): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = showSectionInProjectChatWindowInState(
    currentWindowing,
    sectionId,
    {
      placement,
    },
  );
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function undockProjectChatWindowFromCanvasSection(
  instanceId: string,
): void {
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
  setProjectChatWindowingStateInStore(next);
}

export function setProjectChatWindowModeForSection(
  sectionId: string,
  mode: ChatWindowMode,
): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = setProjectChatWindowModeForSectionInState(
    currentWindowing,
    sectionId,
    mode,
  );
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}
