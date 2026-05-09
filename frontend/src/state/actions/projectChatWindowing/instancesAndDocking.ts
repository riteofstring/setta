import {
  PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX,
  PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX,
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
  resolveProjectChatFloatingBottomInsetPx,
  resolveProjectChatFloatingWorkspaceTopInsetPx,
} from "components/ChatWindowing/projectChatViewport";

import { getZoom, screenToFlowPosition } from "gpuFlow/viewportActions";

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import {
  useMisc,
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";

import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
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
  resolveTrackedGitPaneGraphWindowInstanceId,
  setTrackedGitPaneGraphWindowInstanceId,
} from "../projectChatWindowingEphemeral";

import {
  PendingProjectChatWindowingMutation,
  focusProjectChatWindowInState,
  maximizeProjectChatWindowInState,
  reopenProjectChatWindowInState,
} from "./windowingStateMutations";

import { dispatchProjectChatWindowingMutation } from "./windowingDispatch";

export type CreateProjectChatWindowInstanceOptions = {
  instanceId?: string;
  placement?: ChatWindowPlacement;
  mode?: ChatWindowMode;
  sectionIdOrNull?: string | null;
  title?: string | null;
  chatId?: string | null;
  bounds?: ChatWindowBounds | null;
  nowMs?: number;
};

export type SetDockFractionsOptions = {
  widthFractionsByInstanceId: Record<string, number>;
  dockContainerWidthPx?: number | null;
};

export type SetBoundsOptions = Partial<ChatWindowBounds>;

export type SetBoundsByInstanceIdOptions = Record<string, SetBoundsOptions>;

export type MoveProjectChatWindowToCanvasSectionOptions = {
  sectionId: string;
  nowMs?: number;
  mode?: ChatWindowMode;
};

export type UndockProjectChatWindowFromCanvasSectionOptions = {
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

export const pendingProjectChatWindowingWrites = new Set<Promise<unknown>>();

export const pendingProjectChatWindowingMutationsByProjectId = new Map<
  string,
  Array<PendingProjectChatWindowingMutation>
>();

export const projectChatWindowingWriteBarrierByProjectId = new Map<
  string,
  Promise<void>
>();

export const CHAT_WINDOW_BOUNDS_FIELDS: Array<ChatWindowBoundsFieldConfig> = [
  { key: "x", requirePositive: false },
  { key: "y", requirePositive: false },
  { key: "width", requirePositive: true },
  { key: "height", requirePositive: true },
];

export function getProjectChatWindowingStateFromStore(
  state: ZustandProjectState,
): ProjectChatWindowingState {
  return state.projectChatWindowing;
}

export function canMutateProjectChatWindowingLayout(): boolean {
  const shareSession = useShareSession.getState();
  return (
    !shareSession.isDeploymentMode ||
    shareSession.sharePolicy?.allowLayoutChanges !== false
  );
}

export function shouldSyncActiveProjectChatId(
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

export function resolveProjectChatWindowTitle(
  title: string | null | undefined,
): string | null {
  return title?.trim() ? title.trim() : null;
}

export function hasPositiveFiniteChatWindowSize(
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

export function resolveDefaultFloatingChatBoundsFromRuntime(): ChatWindowBounds {
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

export function resolveProjectChatCanvasBootPosition(
  instanceId?: string,
): Position | null {
  const domNode = gpuFlowViewportStore.getState().domNode;
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

export function resolveProjectChatCanvasBootSectionSize(instanceId: string) {
  const rect = resolveProjectChatWindowSurfaceRect(instanceId);
  if (!rect) {
    return null;
  }
  const zoom = getZoom();
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

export function getProjectChatWindowInstanceForSectionInState(
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

export function getHighestWindowZIndex(
  state: ProjectChatWindowingState,
): number {
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

export function withUpdatedWindow(
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
