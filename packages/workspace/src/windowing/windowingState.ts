import {
  buildWorkspaceFloatingSnapBounds,
  classifyWorkspaceFloatingSnapPreset,
  resolveWorkspaceWindowWorkArea,
} from "./windowingSnapLayout";
import {
  assertWorkspaceWindowingLayoutEditable,
  createWorkspaceFloatingWindow,
  createWorkspaceWindowBounds,
  createWorkspaceWindowingState,
  createWorkspaceWindowViewport,
  isWorkspaceWindowVisible,
  type WorkspaceFloatingSnapPreset,
  type WorkspaceFloatingWindow,
  type WorkspaceFloatingWindowInput,
  type WorkspaceWindowBounds,
  type WorkspaceWindowingMutationOptions,
  type WorkspaceWindowingState,
  type WorkspaceWindowViewport,
  WorkspaceWindowingError,
} from "./windowingTypes";

const WORKSPACE_FLOATING_WINDOW_DEFAULT_WIDTH_PX = 820;
const WORKSPACE_FLOATING_WINDOW_DEFAULT_HEIGHT_VIEWPORT_FRACTION = 0.7;
export const WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX = 380;
export const WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX = 240;
export const WORKSPACE_FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX = 32;
const WORKSPACE_FLOATING_WINDOW_MIN_VISIBLE_WIDTH_PX = 120;
export const WORKSPACE_FLOATING_WINDOW_UNSNAP_DRAG_THRESHOLD_PX = 6;

export interface WorkspaceWindowPosition {
  readonly x: number;
  readonly y: number;
}

export interface WorkspaceWindowBoundsUpdate {
  readonly id: string;
  readonly bounds: WorkspaceWindowBounds;
}

export interface OpenWorkspaceFloatingWindowInput {
  readonly id: string;
  readonly contentId: string;
  readonly surfaceKind: string;
  readonly title: string;
  readonly rendererData: WorkspaceFloatingWindowInput["rendererData"];
  readonly bounds?: WorkspaceWindowBounds;
}

function getValidatedState(
  input: WorkspaceWindowingState,
): WorkspaceWindowingState {
  return createWorkspaceWindowingState(input);
}

function getWindowOrThrow(
  state: WorkspaceWindowingState,
  id: string,
): WorkspaceFloatingWindow {
  const window = state.windows.find((candidate) => candidate.id === id);
  if (!window) {
    throw new WorkspaceWindowingError(
      "unknown_window",
      `Unknown workspace window ${id}.`,
    );
  }
  return window;
}

function requireVisibleWindow(
  window: WorkspaceFloatingWindow,
  operation: string,
): void {
  if (!isWorkspaceWindowVisible(window)) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      `Cannot ${operation} a minimized or closed workspace window.`,
    );
  }
}

function requireFloatingVisibleWindow(
  window: WorkspaceFloatingWindow,
  operation: string,
): void {
  requireVisibleWindow(window, operation);
  if (window.placement !== "floating") {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      `Cannot ${operation} a maximized workspace window.`,
    );
  }
}

function replaceWindow(
  state: WorkspaceWindowingState,
  replacement: WorkspaceFloatingWindow,
  nextFocusOrder = state.nextFocusOrder,
): WorkspaceWindowingState {
  return createWorkspaceWindowingState({
    windows: state.windows.map((window) =>
      window.id === replacement.id ? replacement : window,
    ),
    nextFocusOrder,
  });
}

function highestLiveZIndex(state: WorkspaceWindowingState): number {
  return state.windows.reduce(
    (highest, window) =>
      isWorkspaceWindowVisible(window)
        ? Math.max(highest, window.zIndex)
        : highest,
    0,
  );
}

function isUniqueTopLiveWindow(
  state: WorkspaceWindowingState,
  target: WorkspaceFloatingWindow,
): boolean {
  return state.windows.every(
    (window) =>
      window.id === target.id ||
      !isWorkspaceWindowVisible(window) ||
      target.zIndex > window.zIndex,
  );
}

function createFocusedState(
  state: WorkspaceWindowingState,
  target: WorkspaceFloatingWindow,
): WorkspaceWindowingState {
  if (isUniqueTopLiveWindow(state, target)) {
    return state;
  }
  const zIndex = Math.max(state.nextFocusOrder, highestLiveZIndex(state) + 1);
  return replaceWindow(state, { ...target, zIndex }, zIndex + 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function createDefaultBoundsWithinViewport(
  viewportInput: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  const viewport = createWorkspaceWindowViewport(viewportInput);
  const workArea = resolveWorkspaceWindowWorkArea(viewport);
  const availableWidth = Math.max(
    WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX,
    workArea.width,
  );
  const availableHeight = Math.max(
    WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX,
    workArea.height,
  );
  const width = clamp(
    WORKSPACE_FLOATING_WINDOW_DEFAULT_WIDTH_PX,
    WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX,
    availableWidth,
  );
  const height = clamp(
    viewport.height *
      WORKSPACE_FLOATING_WINDOW_DEFAULT_HEIGHT_VIEWPORT_FRACTION,
    WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX,
    availableHeight,
  );
  return Object.freeze({
    x: workArea.minX + Math.max(0, Math.round((availableWidth - width) / 2)),
    y: workArea.minY + Math.max(0, Math.round((availableHeight - height) / 2)),
    width,
    height,
  });
}

/** The frozen default floating size, centered within the host's inset work area. */
export function createDefaultWorkspaceFloatingWindowBounds(
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  return createDefaultBoundsWithinViewport(viewport);
}

/**
 * Live free-window guardrails. A host narrower than the minimum still keeps a
 * usable title bar and a 120px horizontal grab region reachable.
 */
export function clampWorkspaceFloatingWindowBounds(
  boundsInput: WorkspaceWindowBounds,
  viewportInput: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  const bounds = createWorkspaceWindowBounds(boundsInput);
  const workArea = resolveWorkspaceWindowWorkArea(viewportInput);
  const width = clamp(
    bounds.width,
    WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX,
    Math.max(WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX, workArea.width),
  );
  const height = clamp(
    bounds.height,
    WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX,
    Math.max(WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX, workArea.height),
  );
  const visibleWidth = Math.min(
    WORKSPACE_FLOATING_WINDOW_MIN_VISIBLE_WIDTH_PX,
    workArea.width,
  );
  return Object.freeze({
    x: clamp(
      bounds.x,
      workArea.minX + visibleWidth - width,
      workArea.maxX - visibleWidth,
    ),
    y: clamp(
      bounds.y,
      workArea.minY,
      Math.max(
        workArea.minY,
        workArea.maxY - WORKSPACE_FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX,
      ),
    ),
    width,
    height,
  });
}

/**
 * A snap transition caches its current free geometry. Windows restored from a
 * saved snapped layout intentionally have no cache and use the default float.
 */
function resolveWorkspaceWindowBoundsForUnsnap(
  windowInput: WorkspaceFloatingWindow,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  const window = createWorkspaceFloatingWindow(windowInput);
  return clampWorkspaceFloatingWindowBounds(
    window.lastUnsnappedBounds ?? createDefaultBoundsWithinViewport(viewport),
    viewport,
  );
}

function resolveSnapTransitionUnsnappedBounds(
  window: WorkspaceFloatingWindow,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  if (window.placement === "maximized") {
    return clampWorkspaceFloatingWindowBounds(
      window.restoreBounds ?? createDefaultBoundsWithinViewport(viewport),
      viewport,
    );
  }
  if (classifyWorkspaceFloatingSnapPreset(window.bounds, viewport)) {
    return resolveWorkspaceWindowBoundsForUnsnap(window, viewport);
  }
  return clampWorkspaceFloatingWindowBounds(window.bounds, viewport);
}

export function getWorkspaceWindowStackingOrder(
  stateInput: WorkspaceWindowingState,
): readonly WorkspaceFloatingWindow[] {
  const state = getValidatedState(stateInput);
  return Object.freeze(
    state.windows
      .map((window, index) => ({ window, index }))
      .sort(
        (first, second) =>
          first.window.zIndex - second.window.zIndex ||
          first.index - second.index,
      )
      .map(({ window }) => window),
  );
}

export function openWorkspaceFloatingWindow(
  stateInput: WorkspaceWindowingState,
  input: OpenWorkspaceFloatingWindowInput,
  viewport: WorkspaceWindowViewport,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const requestedBounds =
    input.bounds ?? createDefaultBoundsWithinViewport(viewport);
  const zIndex = Math.max(state.nextFocusOrder, highestLiveZIndex(state) + 1);
  const window = createWorkspaceFloatingWindow({
    ...input,
    bounds: clampWorkspaceFloatingWindowBounds(requestedBounds, viewport),
    placement: "floating",
    restoreBounds: null,
    lastUnsnappedBounds: clampWorkspaceFloatingWindowBounds(
      requestedBounds,
      viewport,
    ),
    isMinimized: false,
    isClosed: false,
    zIndex,
  });
  return createWorkspaceWindowingState({
    windows: [...state.windows, window],
    nextFocusOrder: zIndex + 1,
  });
}

/** Reopen remains allowed in a layout-disabled host, as in the frozen reference. */
export function reopenWorkspaceWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
): WorkspaceWindowingState {
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  const reopened = createWorkspaceFloatingWindow({
    ...window,
    isMinimized: false,
    isClosed: false,
  });
  return createFocusedState(replaceWindow(state, reopened), reopened);
}

/** Focus is local view behavior and remains available when layout editing is disabled. */
export function focusWorkspaceWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
): WorkspaceWindowingState {
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  requireVisibleWindow(window, "focus");
  return createFocusedState(state, window);
}

export function moveWorkspaceFloatingWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
  position: WorkspaceWindowPosition,
  viewport: WorkspaceWindowViewport,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  requireFloatingVisibleWindow(window, "move");
  const bounds = clampWorkspaceFloatingWindowBounds(
    { ...window.bounds, ...position },
    viewport,
  );
  return replaceWindow(
    state,
    createWorkspaceFloatingWindow({
      ...window,
      bounds,
      lastUnsnappedBounds: bounds,
    }),
  );
}

export function resizeWorkspaceFloatingWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
  boundsInput: WorkspaceWindowBounds,
  viewport: WorkspaceWindowViewport,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  requireFloatingVisibleWindow(window, "resize");
  const bounds = clampWorkspaceFloatingWindowBounds(boundsInput, viewport);
  return replaceWindow(
    state,
    createWorkspaceFloatingWindow({
      ...window,
      bounds,
      lastUnsnappedBounds: bounds,
    }),
  );
}

export function setWorkspaceWindowBoundsAtomically(
  stateInput: WorkspaceWindowingState,
  updates: readonly WorkspaceWindowBoundsUpdate[],
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  if (updates.length === 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "Workspace window bounds updates must not be empty.",
    );
  }
  const boundsById = new Map<string, WorkspaceWindowBounds>();
  for (const update of updates) {
    if (boundsById.has(update.id)) {
      throw new WorkspaceWindowingError(
        "invalid_input",
        `Workspace window bounds updates contain duplicate id ${update.id}.`,
      );
    }
    getWindowOrThrow(state, update.id);
    boundsById.set(update.id, createWorkspaceWindowBounds(update.bounds));
  }
  return createWorkspaceWindowingState({
    windows: state.windows.map((window) => {
      const bounds = boundsById.get(window.id);
      return bounds ? { ...window, bounds } : window;
    }),
    nextFocusOrder: state.nextFocusOrder,
  });
}

export function snapWorkspaceFloatingWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
  preset: WorkspaceFloatingSnapPreset,
  viewport: WorkspaceWindowViewport,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  requireVisibleWindow(window, "snap");
  const snapBounds = buildWorkspaceFloatingSnapBounds(preset, viewport);
  const lastUnsnappedBounds = resolveSnapTransitionUnsnappedBounds(
    window,
    viewport,
  );
  const snapped = createWorkspaceFloatingWindow({
    ...window,
    bounds: snapBounds,
    placement: "floating",
    restoreBounds: null,
    lastUnsnappedBounds,
    isMinimized: false,
    isClosed: false,
  });
  return createFocusedState(replaceWindow(state, snapped), snapped);
}

export function minimizeWorkspaceWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  if (window.isClosed) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "Cannot minimize a closed workspace window.",
    );
  }
  return replaceWindow(
    state,
    createWorkspaceFloatingWindow({ ...window, isMinimized: true }),
  );
}

export function maximizeWorkspaceWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  if (window.isClosed) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "Cannot maximize a closed workspace window.",
    );
  }
  const maximized = createWorkspaceFloatingWindow({
    ...window,
    placement: "maximized",
    restoreBounds:
      window.placement === "maximized" ? window.restoreBounds : window.bounds,
    isMinimized: false,
  });
  return createFocusedState(replaceWindow(state, maximized), maximized);
}

export function restoreWorkspaceWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  if (window.isClosed) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "Cannot restore a closed workspace window.",
    );
  }
  if (window.placement === "floating") {
    return state;
  }
  const restored = createWorkspaceFloatingWindow({
    ...window,
    bounds: window.restoreBounds ?? window.bounds,
    placement: "floating",
    restoreBounds: null,
  });
  return replaceWindow(state, restored);
}

export function closeWorkspaceWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  return replaceWindow(
    state,
    createWorkspaceFloatingWindow({
      ...window,
      isClosed: true,
      isMinimized: false,
    }),
  );
}

export function renameWorkspaceWindow(
  stateInput: WorkspaceWindowingState,
  id: string,
  title: string,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = getValidatedState(stateInput);
  const window = getWindowOrThrow(state, id);
  const nextTitle = title.trim();
  if (nextTitle.length === 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "A workspace window title must be nonblank after trimming.",
    );
  }
  return replaceWindow(
    state,
    createWorkspaceFloatingWindow({ ...window, title: nextTitle }),
  );
}
