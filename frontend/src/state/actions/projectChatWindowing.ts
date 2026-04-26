import {
  callOpenAPI,
  createNewId,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX,
  PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX,
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
  resolveProjectChatFloatingBottomInsetPx,
  resolveProjectChatFloatingWorkspaceTopInsetPx,
} from "components/ChatWindowing/projectChatViewport";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  setProjectChatWindowChatId as setProjectChatWindowChatIdRequest,
  setProjectChatWindowingState,
} from "openapi/http";
import {
  NULL_PROJECT_CONFIG_ID,
  useAIStore,
  useMisc,
  useProjectState,
  useSettings,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
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
  getAuthoritativeProjectChatWindowingState,
  recordAuthoritativeProjectChatWindowingState,
} from "./projectChatWindowingAuthoritative";
import {
  clearTrackedGitPaneGraphWindowIfMatches,
  getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject,
  reconcileProjectChatWindowingEphemeralState,
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject,
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
  instanceId?: string;
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
type ResolvedProjectChatWindowIdentity = {
  instanceId: string;
  nextInstanceNumber: number;
};
type ResolvedCreateProjectChatWindowInstanceOptions = {
  instanceId?: string;
  placement: ChatWindowPlacement;
  mode: ChatWindowMode;
  sectionIdOrNull: string | null;
  title: string | null;
  chatId: string | null;
  bounds: ChatWindowBounds | null;
  nowMs: number;
};
type ChatWindowBoundsFieldConfig = {
  key: keyof ChatWindowBounds;
  requirePositive: boolean;
};
const DEFAULT_FLOATING_CHAT_WIDTH_PX = 820;
const DEFAULT_FLOATING_CHAT_HEIGHT_VIEWPORT_FRACTION = 0.7;
const DEFAULT_FLOATING_CHAT_MIN_WIDTH_PX = 380;
const DEFAULT_FLOATING_CHAT_MIN_HEIGHT_PX = 240;
const DEFAULT_DOCKED_CHAT_HEIGHT_VIEWPORT_FRACTION = 0.7;
const DEFAULT_DOCKED_CHAT_MIN_HEIGHT_PX = 220;
const DEFAULT_CREATE_PROJECT_CHAT_WINDOW_INSTANCE_OPTIONS = {
  placement: ChatWindowPlacementEnum.bottom_docked,
  mode: ChatWindowModeEnum.project_ai_mode,
  sectionIdOrNull: null,
  title: null,
  chatId: null,
  bounds: null,
} satisfies Omit<
  ResolvedCreateProjectChatWindowInstanceOptions,
  "instanceId" | "nowMs"
>;
const pendingProjectChatWindowingWrites = new Set<Promise<unknown>>();
const pendingProjectChatWindowingMutationsByProjectId = new Map<
  string,
  Array<PendingProjectChatWindowingMutation>
>();
const projectChatWindowingWriteBarrierByProjectId = new Map<
  string,
  Promise<void>
>();
const CHAT_WINDOW_BOUNDS_FIELDS: Array<ChatWindowBoundsFieldConfig> = [
  { key: "x", requirePositive: false },
  { key: "y", requirePositive: false },
  { key: "width", requirePositive: true },
  { key: "height", requirePositive: true },
];
function getProjectChatWindowingStateFromStore(
  state: ZustandProjectState,
): ProjectChatWindowingState {
  return state.projectChatWindowing;
}
function canMutateProjectChatWindowingLayout(): boolean {
  const shareSession = useShareSession.getState();
  return (
    !shareSession.isDeploymentMode ||
    shareSession.sharePolicy?.allowLayoutChanges !== false
  );
}
function shouldSyncActiveProjectChatId(
  window: ProjectChatWindowInstance | null | undefined,
): boolean {
  return (
    window?.mode === ChatWindowModeEnum.project_ai_mode &&
    window.sectionIdOrNull === null
  );
}
function resolveFinitePositiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function resolveFiniteNonNegativeNumber(
  value: number,
  fallback: number,
): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
function clampProjectChatWindowDimension(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(min, value), max);
}
function centerProjectChatWindowWithinAvailableSpace(
  startInsetPx: number,
  availableSizePx: number,
  resolvedSizePx: number,
): number {
  return (
    startInsetPx +
    Math.max(0, Math.round((availableSizePx - resolvedSizePx) / 2))
  );
}
function resolveProjectChatWindowTitle(
  title: string | null | undefined,
): string | null {
  return title?.trim() ? title.trim() : null;
}
function hasPositiveFiniteChatWindowSize(
  bounds: Pick<ChatWindowBounds, "width" | "height">,
): boolean {
  return (
    Number.isFinite(bounds.width) &&
    bounds.width > 0 &&
    Number.isFinite(bounds.height) &&
    bounds.height > 0
  );
}
export function resolveDefaultFloatingChatBounds({
  viewportWidthPx,
  viewportHeightPx,
  workspaceTopInsetPx,
  bottomInsetPx,
  widthPx = DEFAULT_FLOATING_CHAT_WIDTH_PX,
  heightViewportFraction = DEFAULT_FLOATING_CHAT_HEIGHT_VIEWPORT_FRACTION,
  sideRailWidthPx = PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
  minWidthPx = DEFAULT_FLOATING_CHAT_MIN_WIDTH_PX,
  minHeightPx = DEFAULT_FLOATING_CHAT_MIN_HEIGHT_PX,
}: DefaultFloatingChatBoundsOptions): ChatWindowBounds {
  const safeViewportWidthPx = resolveFinitePositiveNumber(
    viewportWidthPx,
    PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX,
  );
  const safeViewportHeightPx = resolveFinitePositiveNumber(
    viewportHeightPx,
    PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX,
  );
  const safeWorkspaceTopInsetPx = resolveFiniteNonNegativeNumber(
    workspaceTopInsetPx,
    PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  );
  const safeBottomInsetPx = resolveFiniteNonNegativeNumber(bottomInsetPx, 0);
  const availableWidthPx = Math.max(
    minWidthPx,
    safeViewportWidthPx - sideRailWidthPx * 2,
  );
  const availableHeightPx = Math.max(
    minHeightPx,
    safeViewportHeightPx - safeWorkspaceTopInsetPx - safeBottomInsetPx,
  );
  const resolvedWidthPx = clampProjectChatWindowDimension(
    widthPx,
    minWidthPx,
    availableWidthPx,
  );
  const desiredHeightPx = safeViewportHeightPx * heightViewportFraction;
  const resolvedHeightPx = clampProjectChatWindowDimension(
    desiredHeightPx,
    minHeightPx,
    availableHeightPx,
  );
  return {
    x: centerProjectChatWindowWithinAvailableSpace(
      sideRailWidthPx,
      availableWidthPx,
      resolvedWidthPx,
    ),
    y: centerProjectChatWindowWithinAvailableSpace(
      safeWorkspaceTopInsetPx,
      availableHeightPx,
      resolvedHeightPx,
    ),
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
  const safeViewportHeightPx = resolveFinitePositiveNumber(
    viewportHeightPx,
    PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX,
  );
  const safeWorkspaceTopInsetPx = resolveFiniteNonNegativeNumber(
    workspaceTopInsetPx,
    PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  );
  const safeBottomInsetPx = resolveFiniteNonNegativeNumber(bottomInsetPx, 0);
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
      : PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX;
  const viewportHeightPx =
    typeof window !== "undefined"
      ? window.innerHeight
      : PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
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
function resolveProjectChatCanvasSurfaceBootPosition(
  instanceId: string,
  canvasRect: DOMRect,
): Position | null {
  const sourceRect = resolveProjectChatWindowSurfaceRect(instanceId);
  if (!sourceRect) {
    return null;
  }
  const maxScreenX = Math.max(
    canvasRect.left,
    canvasRect.right - sourceRect.width,
  );
  const maxScreenY = Math.max(
    canvasRect.top,
    canvasRect.bottom - sourceRect.height,
  );
  return screenToFlowPosition({
    x: Math.min(Math.max(sourceRect.left, canvasRect.left), maxScreenX),
    y: Math.min(Math.max(sourceRect.top, canvasRect.top), maxScreenY),
  });
}
function resolveProjectChatCanvasPaneClickBootPosition(
  candidate: unknown,
): Position | null {
  if (!isFinitePoint(candidate)) {
    return null;
  }
  return candidate.x !== 0 || candidate.y !== 0 ? candidate : null;
}
function resolveProjectChatCanvasCursorBootPosition(
  canvasRect: DOMRect,
): Position | null {
  const miscState = useMisc.getState();
  for (const candidate of [
    miscState.lastMouseUpLocation,
    miscState.lastMouseDownLocation,
  ]) {
    if (
      isFinitePoint(candidate) &&
      isScreenPointInsideRect(candidate, canvasRect)
    ) {
      return screenToFlowPosition(candidate);
    }
  }
  return resolveProjectChatCanvasPaneClickBootPosition(
    miscState.lastPaneClickLocation,
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
  const surfacePosition =
    instanceId &&
    resolveProjectChatCanvasSurfaceBootPosition(instanceId, canvasRect);
  if (surfacePosition) {
    return surfacePosition;
  }
  const cursorPosition = resolveProjectChatCanvasCursorBootPosition(canvasRect);
  if (cursorPosition) {
    return cursorPosition;
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
function normalizeProjectChatWindowingLayering(
  state: ProjectChatWindowingState,
): NormalizeResult {
  const seenZIndexes = new Set<number>();
  let hasDuplicateZIndex = false;
  for (const instance of Object.values(state.instancesById)) {
    if (seenZIndexes.has(instance.zIndex)) {
      hasDuplicateZIndex = true;
      break;
    }
    seenZIndexes.add(instance.zIndex);
  }
  if (!hasDuplicateZIndex) {
    return { state, changed: false };
  }
  const orderIndexById = new Map(
    state.order.map((instanceId, index) => [instanceId, index] as const),
  );
  const orderedInstances = Object.values(state.instancesById).sort(
    (left, right) => {
      if (left.zIndex !== right.zIndex) {
        return left.zIndex - right.zIndex;
      }
      if (left.lastFocusedAt !== right.lastFocusedAt) {
        return left.lastFocusedAt - right.lastFocusedAt;
      }
      const leftOrderIndex = orderIndexById.get(left.instanceId) ?? 0;
      const rightOrderIndex = orderIndexById.get(right.instanceId) ?? 0;
      if (leftOrderIndex !== rightOrderIndex) {
        return leftOrderIndex - rightOrderIndex;
      }
      return left.instanceId.localeCompare(right.instanceId);
    },
  );
  let changed = false;
  const nextInstancesById = { ...state.instancesById };
  orderedInstances.forEach((instance, index) => {
    const nextZIndex = index + 1;
    if (instance.zIndex === nextZIndex) {
      return;
    }
    changed = true;
    nextInstancesById[instance.instanceId] = {
      ...instance,
      zIndex: nextZIndex,
    };
  });
  if (!changed) {
    return { state, changed: false };
  }
  return {
    state: {
      ...state,
      instancesById: nextInstancesById,
    },
    changed: true,
  };
}
export function normalizeProjectChatWindowingState(
  state: ProjectChatWindowingState,
): ProjectChatWindowingState {
  const ordered = normalizeProjectChatWindowingOrder(state).state;
  return normalizeProjectChatWindowingLayering(ordered).state;
}
function normalizeWorkspaceProjectChatWindowInstance(
  instance: ProjectChatWindowInstance,
): ProjectChatWindowInstance {
  if (
    instance.mode !== ChatWindowModeEnum.section_mode ||
    instance.chatId === null
  ) {
    return instance;
  }
  return {
    ...instance,
    chatId: null,
  };
}
function getProjectChatWindowInstanceForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.sectionIdOrNull !== sectionId) {
      continue;
    }
    return instance;
  }
  return null;
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
  {
    visibleOnly,
  }: {
    visibleOnly: boolean;
  },
): ProjectChatWindowInstance | null {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
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
    return instance;
  }
  return null;
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
function resolveProjectChatWindowExplicitNextInstanceNumber(
  normalized: ProjectChatWindowingState,
  explicitInstanceId: string,
): number {
  const explicitMatch = explicitInstanceId.match(/^project-chat-window-(\d+)$/);
  if (!explicitMatch) {
    return normalized.nextInstanceNumber;
  }
  return Math.max(
    normalized.nextInstanceNumber,
    Number.parseInt(explicitMatch[1], 10) + 1,
  );
}
function resolveProjectChatWindowInstanceIdentity(
  normalized: ProjectChatWindowingState,
  explicitInstanceId?: string,
): ResolvedProjectChatWindowIdentity {
  if (!explicitInstanceId) {
    return getNextWindowInstanceId(normalized);
  }
  return {
    instanceId: explicitInstanceId,
    nextInstanceNumber: resolveProjectChatWindowExplicitNextInstanceNumber(
      normalized,
      explicitInstanceId,
    ),
  };
}
function resolveProjectChatWindowInitialBounds(
  placement: ChatWindowPlacement,
  bounds: ChatWindowBounds | null | undefined,
): ChatWindowBounds | null {
  if (bounds) {
    return bounds;
  }
  return placement === ChatWindowPlacementEnum.floating
    ? resolveDefaultFloatingChatBoundsFromRuntime()
    : null;
}
function resolveCreateProjectChatWindowInstanceOptions(
  options: CreateProjectChatWindowInstanceOptions = {},
): ResolvedCreateProjectChatWindowInstanceOptions {
  return {
    instanceId: options.instanceId,
    placement:
      options.placement ??
      DEFAULT_CREATE_PROJECT_CHAT_WINDOW_INSTANCE_OPTIONS.placement,
    mode:
      options.mode ?? DEFAULT_CREATE_PROJECT_CHAT_WINDOW_INSTANCE_OPTIONS.mode,
    sectionIdOrNull:
      options.sectionIdOrNull ??
      DEFAULT_CREATE_PROJECT_CHAT_WINDOW_INSTANCE_OPTIONS.sectionIdOrNull,
    title:
      options.title ??
      DEFAULT_CREATE_PROJECT_CHAT_WINDOW_INSTANCE_OPTIONS.title,
    chatId:
      options.chatId ??
      DEFAULT_CREATE_PROJECT_CHAT_WINDOW_INSTANCE_OPTIONS.chatId,
    bounds:
      options.bounds ??
      DEFAULT_CREATE_PROJECT_CHAT_WINDOW_INSTANCE_OPTIONS.bounds,
    nowMs: options.nowMs ?? Date.now(),
  };
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
  const next = normalizeWorkspaceProjectChatWindowInstance(updater(current));
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
  options: CreateProjectChatWindowInstanceOptions = {},
): {
  state: ProjectChatWindowingState;
  instanceId: string;
} {
  const {
    instanceId: explicitInstanceId,
    placement,
    mode,
    sectionIdOrNull,
    title,
    chatId,
    bounds,
    nowMs,
  } = resolveCreateProjectChatWindowInstanceOptions(options);
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  const { instanceId, nextInstanceNumber } =
    resolveProjectChatWindowInstanceIdentity(normalized, explicitInstanceId);
  const nextZIndex = getHighestWindowZIndex(normalized) + 1;
  const resolvedBounds = resolveProjectChatWindowInitialBounds(
    placement,
    bounds,
  );
  const normalizedTitle = resolveProjectChatWindowTitle(title);
  const nextInstance = normalizeWorkspaceProjectChatWindowInstance(
    createProjectChatWindowInstanceModel({
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
    }),
  );
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
function resolveProjectChatWindowDockFractionUpdate(
  current: ProjectChatWindowInstance,
  widthFraction: number,
  dockContainerWidthPx: number | null,
): ProjectChatWindowInstance | null {
  if (!Number.isFinite(widthFraction) || widthFraction <= 0) {
    return null;
  }
  const nextPreferredWidthPx =
    typeof dockContainerWidthPx === "number" && dockContainerWidthPx > 0
      ? widthFraction * dockContainerWidthPx
      : current.dockMetrics.preferredWidthPx;
  if (
    current.dockMetrics.widthFraction === widthFraction &&
    current.dockMetrics.preferredWidthPx === nextPreferredWidthPx
  ) {
    return null;
  }
  return {
    ...current,
    dockMetrics: {
      ...current.dockMetrics,
      widthFraction,
      preferredWidthPx: nextPreferredWidthPx,
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
  restorePriorStateOnUnmaximize: boolean = true,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (!current.isMaximized) {
      return current;
    }
    return {
      ...current,
      isMaximized: false,
      placement: restorePriorStateOnUnmaximize
        ? current.lastPlacementBeforeMaximize ??
          ChatWindowPlacementEnum.bottom_docked
        : ChatWindowPlacementEnum.bottom_docked,
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
  const normalized = normalizeProjectChatWindowingState(state);
  const highestZIndex = getHighestWindowZIndex(normalized);
  const highestZIndexCount = Object.values(normalized.instancesById).filter(
    (instance) => instance.zIndex === highestZIndex,
  ).length;
  return withUpdatedWindow(normalized, instanceId, (current) => {
    if (current.zIndex === highestZIndex && highestZIndexCount === 1) {
      if (current.lastFocusedAt === nowMs) {
        return current;
      }
      return {
        ...current,
        lastFocusedAt: nowMs,
      };
    }
    return {
      ...current,
      zIndex: highestZIndex + 1,
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
  for (const [instanceId, widthFraction] of Object.entries(
    widthFractionsByInstanceId,
  )) {
    const current = state.instancesById[instanceId];
    if (!current) {
      continue;
    }
    const nextInstance = resolveProjectChatWindowDockFractionUpdate(
      current,
      widthFraction,
      dockContainerWidthPx,
    );
    if (!nextInstance) {
      continue;
    }
    if (!nextInstancesById) {
      nextInstancesById = { ...state.instancesById };
    }
    nextInstancesById[instanceId] = nextInstance;
  }
  if (!nextInstancesById) {
    return state;
  }
  return {
    ...state,
    instancesById: nextInstancesById,
  };
}
function resolveProjectChatWindowBoundsUpdate(
  currentBounds: ChatWindowBounds,
  bounds: SetBoundsOptions,
): ChatWindowBounds | null {
  let changed = false;
  const nextBounds: ChatWindowBounds = { ...currentBounds };
  for (const { key, requirePositive } of CHAT_WINDOW_BOUNDS_FIELDS) {
    const value = bounds[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    if (requirePositive && value <= 0) {
      continue;
    }
    if (nextBounds[key] === value) {
      continue;
    }
    nextBounds[key] = value;
    changed = true;
  }
  return changed ? nextBounds : null;
}
export function setProjectChatWindowBoundsInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  bounds: SetBoundsOptions,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    const nextBounds = resolveProjectChatWindowBoundsUpdate(
      current.bounds,
      bounds,
    );
    if (!nextBounds) {
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
  if (mode === ChatWindowModeEnum.git_graph_mode) {
    return state;
  }
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
  {
    createInstanceId,
  }: {
    createInstanceId?: string;
  } = {},
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
      instanceId: createInstanceId,
      placement: ChatWindowPlacementEnum.canvas_section,
      mode,
      sectionIdOrNull: sectionId,
    }).state;
  }
  return setProjectChatWindowModeInState(state, boundInstance.instanceId, mode);
}
function resolveSectionWindowRevealBounds(
  current: ProjectChatWindowInstance,
  previousPlacement: ChatWindowPlacement,
  nextPlacement: ChatWindowPlacement,
): ChatWindowBounds {
  const shouldSeedFloatingBounds =
    nextPlacement === ChatWindowPlacementEnum.floating &&
    (previousPlacement !== ChatWindowPlacementEnum.floating ||
      !hasPositiveFiniteChatWindowSize(current.bounds));
  return shouldSeedFloatingBounds
    ? resolveDefaultFloatingChatBoundsFromRuntime()
    : current.bounds;
}
export function showSectionInProjectChatWindowInState(
  state: ProjectChatWindowingState,
  sectionId: string,
  {
    instanceId,
    placement = ChatWindowPlacementEnum.floating,
    nowMs = Date.now(),
  }: {
    instanceId?: string;
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
      instanceId,
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
    const resolvedBounds = resolveSectionWindowRevealBounds(
      current,
      boundInstance.placement,
      placement,
    );
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
    if (current.mode !== ChatWindowModeEnum.project_ai_mode) {
      return current;
    }
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
type ProjectChatWindowingStoreOptions = {
  syncActiveChatId?: string | undefined;
  nextGitPaneVisibleInstanceIds?: Array<string> | undefined;
};
type ProjectChatWindowingSend = (
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
) => Promise<ProjectChatWindowingTrackedResponse>;
type ProjectChatWindowingMutationResult = {
  nextProjectChatWindowing: ProjectChatWindowingState;
  alwaysSend?: boolean;
  options?: ProjectChatWindowingStoreOptions;
  send?: ProjectChatWindowingSend;
};
type ProjectChatWindowingMutation = (
  currentWindowing: ProjectChatWindowingState,
) => ProjectChatWindowingMutationResult;
type PendingProjectChatWindowingMutation = {
  alwaysSend: boolean;
  mutation: ProjectChatWindowingMutation;
  opId: string;
  send: ProjectChatWindowingSend;
};
type ProjectChatWindowingWriteResponse =
  ResponseDataAndStatus<ProjectChatWindowingState>;
type SyntheticProjectChatWindowingWriteResponse =
  ProjectChatWindowingWriteResponse & {
    data: ProjectChatWindowingState;
    hasResponse: true;
    status: 200;
  };
type ProjectChatWindowingTrackedResponse =
  | ProjectChatWindowingWriteResponse
  | SyntheticProjectChatWindowingWriteResponse;
type ProjectChatWindowingSnapshotForMutation = {
  authoritativeWindowing: ProjectChatWindowingState;
  nextProjectChatWindowing: ProjectChatWindowingState;
};
function getPendingProjectChatWindowingMutations(
  projectConfigId: string,
): Array<PendingProjectChatWindowingMutation> {
  return (
    pendingProjectChatWindowingMutationsByProjectId.get(projectConfigId) ?? []
  );
}
function applyProjectChatWindowingEphemeralState(
  projectConfigId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions,
): void {
  if (Object.hasOwn(options, "nextGitPaneVisibleInstanceIds")) {
    replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject(
      projectConfigId,
      options.nextGitPaneVisibleInstanceIds ?? [],
    );
  }
  reconcileProjectChatWindowingEphemeralState(
    nextProjectChatWindowing,
    projectConfigId,
  );
}
function restoreProjectChatWindowingEphemeralState(
  projectConfigId: string,
  previousProjectChatWindowing: ProjectChatWindowingState,
  previousGitPaneVisibleInstanceIds: Array<string>,
): void {
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject(
    projectConfigId,
    previousGitPaneVisibleInstanceIds,
  );
  reconcileProjectChatWindowingEphemeralState(
    previousProjectChatWindowing,
    projectConfigId,
  );
}
function enqueueProjectChatWindowingWrite<T extends Promise<unknown>>(
  request: T,
): T {
  pendingProjectChatWindowingWrites.add(request);
  void request.finally(() => {
    pendingProjectChatWindowingWrites.delete(request);
  });
  return request;
}
function primeAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  projectChatWindowing: ProjectChatWindowingState,
): void {
  if (getPendingProjectChatWindowingMutations(projectConfigId).length > 0) {
    return;
  }
  recordAuthoritativeProjectChatWindowingState(
    projectConfigId,
    projectChatWindowing,
  );
}
function addPendingProjectChatWindowingMutation(
  projectConfigId: string,
  pendingMutation: PendingProjectChatWindowingMutation,
): void {
  pendingProjectChatWindowingMutationsByProjectId.set(projectConfigId, [
    ...getPendingProjectChatWindowingMutations(projectConfigId),
    pendingMutation,
  ]);
}
function removePendingProjectChatWindowingMutation(
  projectConfigId: string,
  opId: string,
): void {
  const remainingMutations = getPendingProjectChatWindowingMutations(
    projectConfigId,
  ).filter((pendingMutation) => pendingMutation.opId !== opId);
  if (remainingMutations.length === 0) {
    pendingProjectChatWindowingMutationsByProjectId.delete(projectConfigId);
    projectChatWindowingWriteBarrierByProjectId.delete(projectConfigId);
    return;
  }
  pendingProjectChatWindowingMutationsByProjectId.set(
    projectConfigId,
    remainingMutations,
  );
}
function buildProjectChatWindowingSnapshotForMutation(
  projectConfigId: string,
  opId: string,
): ProjectChatWindowingSnapshotForMutation | null {
  const pendingMutations =
    getPendingProjectChatWindowingMutations(projectConfigId);
  const targetIndex = pendingMutations.findIndex(
    (pendingMutation) => pendingMutation.opId === opId,
  );
  if (targetIndex < 0) {
    return null;
  }
  const authoritativeWindowing =
    getAuthoritativeProjectChatWindowingState(projectConfigId) ??
    useProjectState.getState().projectChatWindowing;
  let nextProjectChatWindowing = authoritativeWindowing;
  for (let index = 0; index <= targetIndex; index += 1) {
    const pendingMutation = pendingMutations[index];
    if (!pendingMutation) {
      continue;
    }
    nextProjectChatWindowing = pendingMutation.mutation(
      nextProjectChatWindowing,
    ).nextProjectChatWindowing;
  }
  return {
    authoritativeWindowing,
    nextProjectChatWindowing,
  };
}
function getPendingProjectChatWindowingMutationsAfter(
  projectConfigId: string,
  opId: string,
): Array<PendingProjectChatWindowingMutation> {
  const pendingMutations =
    getPendingProjectChatWindowingMutations(projectConfigId);
  const acknowledgedMutationIndex = pendingMutations.findIndex(
    (pendingMutation) => pendingMutation.opId === opId,
  );
  if (acknowledgedMutationIndex < 0) {
    return pendingMutations;
  }
  return pendingMutations.slice(acknowledgedMutationIndex + 1);
}
function publishAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  acknowledgedOpId: string,
  authoritativeWindowing: ProjectChatWindowingState,
): void {
  recordAuthoritativeProjectChatWindowingState(
    projectConfigId,
    authoritativeWindowing,
  );
  if (useProjectState.getState().projectConfig.id !== projectConfigId) {
    return;
  }
  const pendingMutations = getPendingProjectChatWindowingMutationsAfter(
    projectConfigId,
    acknowledgedOpId,
  );
  applyProjectChatWindowingEphemeralState(
    projectConfigId,
    authoritativeWindowing,
    {},
  );
  useProjectState.setState((state) => {
    if (state.projectConfig.id !== projectConfigId) {
      return;
    }
    state.projectChatWindowing = authoritativeWindowing;
    for (const pendingMutation of pendingMutations) {
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        pendingMutation.mutation,
      );
    }
  });
}
function sendProjectChatWindowingSnapshot(
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
): Promise<ProjectChatWindowingWriteResponse> {
  return callOpenAPI(
    setProjectChatWindowingState({
      body: {
        projectConfigId,
        state: nextProjectChatWindowing,
        frontendOpId,
      },
    } as Parameters<typeof setProjectChatWindowingState>[0]),
  );
}
function buildSyntheticProjectChatWindowingWriteResponse(
  projectConfigId: string,
): SyntheticProjectChatWindowingWriteResponse {
  return {
    data:
      getAuthoritativeProjectChatWindowingState(projectConfigId) ??
      useProjectState.getState().projectChatWindowing,
    status: 200,
    hasResponse: true,
  };
}
function createProjectChatWindowingWriteBarrier(
  request: Promise<unknown>,
): Promise<void> {
  return request
    .finally(
      () =>
        new Promise<void>((resolve) => {
          queueMicrotask(resolve);
        }),
    )
    .then(
      () => undefined,
      () => undefined,
    );
}
function enqueueSerializedProjectChatWindowingWrite(
  projectConfigId: string,
  opId: string,
  pendingMutation: PendingProjectChatWindowingMutation,
): Promise<ProjectChatWindowingTrackedResponse> {
  addPendingProjectChatWindowingMutation(projectConfigId, pendingMutation);
  const previousBarrier =
    projectChatWindowingWriteBarrierByProjectId.get(projectConfigId) ??
    Promise.resolve();
  const request = previousBarrier.then(async () => {
    const pendingMutations =
      getPendingProjectChatWindowingMutations(projectConfigId);
    const targetMutation = pendingMutations.find(
      (candidate) => candidate.opId === opId,
    );
    const snapshot = buildProjectChatWindowingSnapshotForMutation(
      projectConfigId,
      opId,
    );
    if (!snapshot || !targetMutation) {
      return buildSyntheticProjectChatWindowingWriteResponse(projectConfigId);
    }
    const { authoritativeWindowing, nextProjectChatWindowing } = snapshot;
    if (
      !targetMutation.alwaysSend &&
      nextProjectChatWindowing === authoritativeWindowing
    ) {
      return buildSyntheticProjectChatWindowingWriteResponse(projectConfigId);
    }
    const response = await targetMutation.send(
      projectConfigId,
      opId,
      nextProjectChatWindowing,
    );
    if (res200(response)) {
      publishAuthoritativeProjectChatWindowingState(
        projectConfigId,
        opId,
        response.data,
      );
    }
    return response;
  });
  const barrier = createProjectChatWindowingWriteBarrier(
    request.finally(() => {
      removePendingProjectChatWindowingMutation(projectConfigId, opId);
    }),
  );
  projectChatWindowingWriteBarrierByProjectId.set(projectConfigId, barrier);
  return enqueueProjectChatWindowingWrite(request);
}
function applyProjectChatWindowingMutation(
  currentWindowing: ProjectChatWindowingState,
  projectConfigId: string | null,
  mutation: ProjectChatWindowingMutation,
) {
  const resolvedMutation = mutation(currentWindowing);
  const options = resolvedMutation.options ?? {};
  const shouldSyncActiveChatId = Object.hasOwn(options, "syncActiveChatId");
  if (
    projectConfigId &&
    projectConfigId !== NULL_PROJECT_CONFIG_ID &&
    resolvedMutation.nextProjectChatWindowing !== currentWindowing
  ) {
    applyProjectChatWindowingEphemeralState(
      projectConfigId,
      resolvedMutation.nextProjectChatWindowing,
      options,
    );
  }
  if (resolvedMutation.nextProjectChatWindowing !== currentWindowing) {
    useProjectState.setState((state) => {
      state.projectChatWindowing = resolvedMutation.nextProjectChatWindowing;
    });
  }
  if (shouldSyncActiveChatId) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
  return {
    nextProjectChatWindowing: resolvedMutation.nextProjectChatWindowing,
    options,
  };
}
function applyProjectChatWindowingMutationToState(
  state: ZustandProjectState,
  projectConfigId: string,
  mutation: ProjectChatWindowingMutation,
): void {
  if (state.projectConfig.id !== projectConfigId) {
    return;
  }
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const { nextProjectChatWindowing, options } = mutation(currentWindowing);
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  applyProjectChatWindowingEphemeralState(
    projectConfigId,
    nextProjectChatWindowing,
    options ?? {},
  );
  state.projectChatWindowing = nextProjectChatWindowing;
  if (options && Object.hasOwn(options, "syncActiveChatId")) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
}
function dispatchProjectChatWindowingMutation(
  mutation: ProjectChatWindowingMutation,
): void {
  const projectConfigId = getCurrProjectConfigId();
  const currentProjectState = useProjectState.getState();
  const previousProjectChatWindowing = currentProjectState.projectChatWindowing;
  const previousActiveChatId = useAIStore.getState().activeChatId;
  const {
    nextProjectChatWindowing,
    alwaysSend = false,
    options: initialOptions,
    send = sendProjectChatWindowingSnapshot,
  } = mutation(getProjectChatWindowingStateFromStore(currentProjectState));
  const previousGitPaneVisibleInstanceIds =
    !projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID
      ? []
      : getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject(
          projectConfigId,
        );
  if (
    !alwaysSend &&
    nextProjectChatWindowing === previousProjectChatWindowing
  ) {
    return;
  }
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    applyProjectChatWindowingMutation(
      getProjectChatWindowingStateFromStore(currentProjectState),
      null,
      mutation,
    );
    return;
  }
  primeAuthoritativeProjectChatWindowingState(
    projectConfigId,
    previousProjectChatWindowing,
  );
  dispatchOptimisticProjectStateUpdate({
    projectConfigId,
    apply: (state) =>
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        mutation,
      ),
    reapply: (state) =>
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        mutation,
      ),
    rollback: (state) => {
      restoreProjectChatWindowingEphemeralState(
        projectConfigId,
        previousProjectChatWindowing,
        previousGitPaneVisibleInstanceIds,
      );
      state.projectChatWindowing = previousProjectChatWindowing;
      if (initialOptions && Object.hasOwn(initialOptions, "syncActiveChatId")) {
        useAIStore.setState({
          activeChatId: previousActiveChatId,
        });
      }
    },
    send: (frontendOpId) =>
      enqueueSerializedProjectChatWindowingWrite(
        projectConfigId,
        frontendOpId,
        {
          alwaysSend,
          mutation,
          opId: frontendOpId,
          send,
        },
      ),
  });
}
function applyProjectChatWindowingMutationLocally(
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions = {},
): void {
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId && projectConfigId !== NULL_PROJECT_CONFIG_ID) {
    applyProjectChatWindowingEphemeralState(
      projectConfigId,
      nextProjectChatWindowing,
      options,
    );
  }
  useProjectState.setState((state) => {
    state.projectChatWindowing = nextProjectChatWindowing;
  });
  if (Object.hasOwn(options, "syncActiveChatId")) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
}
export async function flushPendingProjectChatWindowingWrites(): Promise<void> {
  while (pendingProjectChatWindowingWrites.size > 0) {
    await Promise.allSettled([...pendingProjectChatWindowingWrites]);
  }
}
export async function syncProjectChatWindowingState() {
  const projectConfigId = getCurrProjectConfigId();
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return null;
  }
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  primeAuthoritativeProjectChatWindowingState(
    projectConfigId,
    currentWindowing,
  );
  const opId = createNewId();
  return enqueueSerializedProjectChatWindowingWrite(projectConfigId, opId, {
    alwaysSend: true,
    mutation: (latestWindowing) => ({
      nextProjectChatWindowing: latestWindowing,
      alwaysSend: true,
    }),
    opId,
    send: sendProjectChatWindowingSnapshot,
  });
}
export function replaceProjectChatWindowingState(
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions = {},
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation(() => ({
    nextProjectChatWindowing,
    options,
  }));
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
        callOpenAPI(
          setProjectChatWindowChatIdRequest({
            body: {
              projectConfigId,
              instanceId,
              chatId: normalizedChatId,
              frontendOpId,
            },
          } as Parameters<typeof setProjectChatWindowChatIdRequest>[0]),
        ),
      options: shouldSyncActiveProjectChatId(updatedWindow)
        ? {
            syncActiveChatId: updatedWindow?.chatId ?? undefined,
          }
        : {},
    };
  });
}
type ProjectChatWindowCanvasBootTarget = {
  currentInstance: ProjectChatWindowInstance;
};
function resolveProjectChatWindowCanvasBootTarget(
  instanceId: string,
): ProjectChatWindowCanvasBootTarget | null {
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const currentInstance = currentWindowing.instancesById[instanceId];
  if (
    !currentInstance ||
    currentInstance.mode === ChatWindowModeEnum.git_graph_mode
  ) {
    return null;
  }
  return {
    currentInstance,
  };
}
function restoreProjectChatCanvasViewport(
  viewportX: number,
  viewportY: number,
  viewportZoom: number,
): void {
  useReactFlow.setState({ transform: [viewportX, viewportY, viewportZoom] });
}
async function resolveProjectChatWindowCanvasBootSectionId(
  instanceId: string,
  currentInstance: ProjectChatWindowInstance,
): Promise<string | null> {
  if (currentInstance.sectionIdOrNull) {
    return currentInstance.sectionIdOrNull;
  }
  const canvasSectionSize = resolveProjectChatCanvasBootSectionSize(instanceId);
  const [viewportX, viewportY, viewportZoom] =
    useReactFlow.getState().transform;
  const created = await createTopLevelSectionWithResult({
    implType: SectionTypeEnum.Chat,
    implOverrides: {
      type: SectionTypeEnum.Chat,
      ...(canvasSectionSize ? { size: canvasSectionSize } : {}),
    },
    position: resolveProjectChatCanvasBootPosition(instanceId),
    name: resolveProjectChatWindowTitle(currentInstance.title),
  });
  if (!created) {
    return null;
  }
  restoreProjectChatCanvasViewport(viewportX, viewportY, viewportZoom);
  return created.sectionId;
}
function dispatchProjectChatWindowCanvasSectionMove(
  latestWindowing: ProjectChatWindowingState,
  instanceId: string,
  sectionId: string,
  mode: ChatWindowMode,
): void {
  const next = moveProjectChatWindowToCanvasSectionInState(
    latestWindowing,
    instanceId,
    {
      sectionId,
      mode,
    },
  );
  if (next === latestWindowing) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: moveProjectChatWindowToCanvasSectionInState(
      currentWindowing,
      instanceId,
      {
        sectionId,
        mode,
      },
    ),
  }));
}
export async function bootProjectChatWindowToCanvasSection(
  instanceId: string,
): Promise<string | null> {
  if (!canMutateProjectChatWindowingLayout()) {
    return null;
  }
  const bootTarget = resolveProjectChatWindowCanvasBootTarget(instanceId);
  if (!bootTarget) {
    return null;
  }
  const sectionId = await resolveProjectChatWindowCanvasBootSectionId(
    instanceId,
    bootTarget.currentInstance,
  );
  if (!sectionId) {
    return null;
  }
  const latestWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const latestInstance = latestWindowing.instancesById[instanceId];
  if (!latestInstance) {
    return sectionId;
  }
  dispatchProjectChatWindowCanvasSectionMove(
    latestWindowing,
    instanceId,
    sectionId,
    latestInstance.mode,
  );
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
