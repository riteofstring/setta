import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  NULL_PROJECT_CONFIG_ID,
  useMisc,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import { route_set_project_chat_windowing_state } from "utils/generatedEndpoints";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  createProjectChatWindowInstance as createProjectChatWindowInstanceModel,
  createProjectChatWindowingState,
  type ChatWindowBounds,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type Position,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";
import { createTopLevelSectionWithResult } from "./sections/createSections";

type CreateProjectChatWindowInstanceOptions = {
  placement?: ChatWindowPlacement;
  mode?: ChatWindowMode;
  sectionIdOrNull?: string | null;
  chatId?: string | null;
  nowMs?: number;
};

type SetDockFractionsOptions = {
  widthFractionsByInstanceId: Record<string, number>;
  dockContainerWidthPx?: number | null;
};

type SetBoundsOptions = Partial<ChatWindowBounds>;

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

function getProjectChatWindowingStateFromStore(
  state: ZustandProjectState,
): ProjectChatWindowingState {
  return state.projectChatWindowing ?? createProjectChatWindowingState();
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

function resolveProjectChatCanvasBootPosition(): Position | null {
  const domNode = useReactFlow.getState().domNode;
  if (!domNode) {
    return null;
  }
  const canvasRect = domNode.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) {
    return null;
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

export function getProjectChatWindowInstanceForSectionInState(
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

export function getOpenFloatingProjectChatWindowInstanceForSectionInState(
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
    if (instance.placement !== ChatWindowPlacementEnum.floating) {
      continue;
    }
    if (instance.isClosed || instance.isMinimized) {
      continue;
    }
    if (
      !bestMatch ||
      instance.zIndex > bestMatch.zIndex ||
      (instance.zIndex === bestMatch.zIndex &&
        instance.lastFocusedAt > bestMatch.lastFocusedAt)
    ) {
      bestMatch = instance;
    }
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
    chatId = null,
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
  const nextInstance = createProjectChatWindowInstanceModel({
    instanceId,
    placement,
    mode,
    sectionIdOrNull,
    chatId,
    isClosed: false,
    isMinimized: false,
    isMaximized: placement === ChatWindowPlacementEnum.maximized,
    lastFocusedAt: nowMs,
    zIndex: nextZIndex,
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

export function setProjectChatWindowModeInState(
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
    if (current.isClosed && current.isMinimized) {
      return current;
    }
    return {
      ...current,
      isClosed: true,
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

export function moveProjectChatWindowToCanvasSectionInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  {
    sectionId,
    nowMs = Date.now(),
    mode = ChatWindowModeEnum.project_ai_mode,
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
    return state;
  }
  return setProjectChatWindowModeInState(state, boundInstance.instanceId, mode);
}

export function getVisibleProjectChatWindowInstances(
  state: ProjectChatWindowingState,
): ProjectChatWindowInstance[] {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  const visible: ProjectChatWindowInstance[] = [];
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.isClosed) {
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
    send: (frontendOpId) =>
      route_set_project_chat_windowing_state({
        projectConfigId,
        state: nextProjectChatWindowing,
        frontendOpId,
      }),
  });
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
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = unmaximizeProjectChatWindowInState(currentWindowing, instanceId);
  if (next === currentWindowing) {
    return;
  }
  setProjectChatWindowingStateInStore(next);
}

export function closeProjectChatWindow(instanceId: string): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = closeProjectChatWindowInState(currentWindowing, instanceId);
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
  if (!sectionId) {
    const created = await createTopLevelSectionWithResult({
      implType: SectionTypeEnum.Chat,
      implOverrides: {
        type: SectionTypeEnum.Chat,
      },
      position: resolveProjectChatCanvasBootPosition(),
    });
    if (!created) {
      return null;
    }
    sectionId = created.sectionId;
  }

  const next = moveProjectChatWindowToCanvasSectionInState(
    currentWindowing,
    instanceId,
    { sectionId },
  );
  if (next !== currentWindowing) {
    setProjectChatWindowingStateInStore(next);
  }
  return sectionId;
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
