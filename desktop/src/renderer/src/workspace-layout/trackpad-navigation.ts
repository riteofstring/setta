type WorkspaceTrackpadNavigationAxis = "horizontal" | "vertical";
type WorkspaceTrackpadNavigationDirection = "up" | "down" | "left" | "right";

export interface WorkspaceTrackpadNavigationState {
  accumulatedDelta: number;
  axis: WorkspaceTrackpadNavigationAxis | null;
}

export interface WorkspaceTrackpadWheelInput {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  metaKey: boolean;
  modifierRequired?: boolean;
  timeStampMs?: number;
}

export interface WorkspaceTrackpadNavigationResult {
  directions: WorkspaceTrackpadNavigationDirection[];
  shouldHandle: boolean;
}

export interface WorkspaceWheelNavigationTarget {
  paneId: string | null;
  target: "background" | "pane-top-bar";
}

const wheelDeltaModePixel = 0;
const wheelDeltaModeLine = 1;
const wheelDeltaModePage = 2;
const wheelLinePixelFactor = 16;
const wheelPagePixelFactor = 720;
const trackpadNavigationThresholdPx = 80;
const trackpadNavigationGestureReleaseMs = 220;
const trackpadNavigationGestureReleaseDeltaPx = 6;
const maxDirectionsPerWheelEvent = 1;

interface ConsumedTrackpadNavigationGesture {
  axis: WorkspaceTrackpadNavigationAxis | null;
  consumed: boolean;
  lastWheelTimeMs: number | null;
  sign: number;
}

const consumedGestureStates = new WeakMap<
  WorkspaceTrackpadNavigationState,
  ConsumedTrackpadNavigationGesture
>();

export function createWorkspaceTrackpadNavigationState(): WorkspaceTrackpadNavigationState {
  return {
    accumulatedDelta: 0,
    axis: null,
  };
}

export function interpretWorkspaceTrackpadWheel(
  input: WorkspaceTrackpadWheelInput,
  state: WorkspaceTrackpadNavigationState,
): WorkspaceTrackpadNavigationResult {
  if (!navigationModifierSatisfied(input)) {
    resetWorkspaceTrackpadNavigationState(state);
    resetConsumedTrackpadNavigationGesture(state);
    return navigationResult(false);
  }

  const gesture = consumedGestureStateFor(state);
  releaseConsumedTrackpadNavigationGestureAfterIdle(input, state, gesture);
  const dominantDelta = dominantWheelDelta(input);
  if (!dominantDelta) {
    return navigationResult(true);
  }
  if (gesture.consumed) {
    if (oppositeSwipeInterruptsConsumedGesture(gesture, dominantDelta)) {
      resetWorkspaceTrackpadNavigationState(state);
      gesture.consumed = false;
    } else {
      releaseConsumedTrackpadNavigationGestureAfterDecay(state, gesture, dominantDelta);
      return navigationResult(true);
    }
  }

  accumulateDominantWheelDelta(state, dominantDelta);
  const directions = drainTrackpadNavigationDirections(state);
  if (directions.length > 0) {
    state.accumulatedDelta = 0;
    gesture.axis = dominantDelta.axis;
    gesture.consumed = true;
    gesture.sign = Math.sign(dominantDelta.delta);
  }
  return navigationResult(true, directions);
}

export function paneTopBarPaneIdFromWheelTarget(target: EventTarget | null): string | null {
  if (!isClosestTarget(target)) {
    return null;
  }
  const topBar = target.closest("[data-workspace-pane-top-bar]");
  return topBar?.dataset?.paneId || null;
}

export function workspaceWheelNavigationTargetFromEventTarget(
  target: EventTarget | null,
  root: HTMLElement,
): WorkspaceWheelNavigationTarget | null {
  if (!isClosestTarget(target)) {
    return null;
  }
  if (!rootContainsTarget(root, target)) {
    return null;
  }
  const topBarPaneId = paneTopBarPaneIdFromWheelTarget(target);
  if (topBarPaneId !== null) {
    return {
      paneId: topBarPaneId,
      target: "pane-top-bar",
    };
  }
  if (
    target === root ||
    target.closest("[data-testid='workspace-presentation-engine']") === target
  ) {
    return {
      paneId: null,
      target: "background",
    };
  }
  return null;
}

interface ClosestTargetMatch extends EventTarget {
  dataset?: { paneId?: string };
}

function isClosestTarget(target: EventTarget | null): target is EventTarget & {
  closest: (selector: string) => ClosestTargetMatch | null;
} {
  return typeof (target as { closest?: unknown } | null)?.closest === "function";
}

function rootContainsTarget(root: HTMLElement, target: EventTarget): boolean {
  if (typeof Node !== "undefined" && target instanceof Node) {
    return root.contains(target);
  }
  return (root as unknown as { contains: (candidate: EventTarget) => boolean }).contains(target);
}

function resetWorkspaceTrackpadNavigationState(state: WorkspaceTrackpadNavigationState): void {
  state.accumulatedDelta = 0;
  state.axis = null;
}

function resetConsumedTrackpadNavigationGesture(state: WorkspaceTrackpadNavigationState): void {
  const gesture = consumedGestureStates.get(state);
  if (!gesture) {
    return;
  }
  gesture.axis = null;
  gesture.consumed = false;
  gesture.lastWheelTimeMs = null;
  gesture.sign = 0;
}

function consumedGestureStateFor(
  state: WorkspaceTrackpadNavigationState,
): ConsumedTrackpadNavigationGesture {
  const existing = consumedGestureStates.get(state);
  if (existing) {
    return existing;
  }
  const gesture = {
    axis: null,
    consumed: false,
    lastWheelTimeMs: null,
    sign: 0,
  } satisfies ConsumedTrackpadNavigationGesture;
  consumedGestureStates.set(state, gesture);
  return gesture;
}

function releaseConsumedTrackpadNavigationGestureAfterIdle(
  input: WorkspaceTrackpadWheelInput,
  state: WorkspaceTrackpadNavigationState,
  gesture: ConsumedTrackpadNavigationGesture,
): void {
  if (input.timeStampMs === undefined) {
    return;
  }
  if (gesture.lastWheelTimeMs !== null) {
    const elapsedMs = input.timeStampMs - gesture.lastWheelTimeMs;
    if (elapsedMs < 0 || elapsedMs > trackpadNavigationGestureReleaseMs) {
      resetWorkspaceTrackpadNavigationState(state);
      gesture.axis = null;
      gesture.consumed = false;
      gesture.sign = 0;
    }
  }
  gesture.lastWheelTimeMs = input.timeStampMs;
}

function oppositeSwipeInterruptsConsumedGesture(
  gesture: ConsumedTrackpadNavigationGesture,
  dominantDelta: { axis: WorkspaceTrackpadNavigationAxis; delta: number },
): boolean {
  return (
    gesture.axis === dominantDelta.axis &&
    gesture.sign !== 0 &&
    Math.sign(dominantDelta.delta) === -gesture.sign &&
    Math.abs(dominantDelta.delta) >= trackpadNavigationThresholdPx
  );
}

function releaseConsumedTrackpadNavigationGestureAfterDecay(
  state: WorkspaceTrackpadNavigationState,
  gesture: ConsumedTrackpadNavigationGesture,
  dominantDelta: { axis: WorkspaceTrackpadNavigationAxis; delta: number },
): void {
  if (Math.abs(dominantDelta.delta) > trackpadNavigationGestureReleaseDeltaPx) {
    return;
  }
  resetWorkspaceTrackpadNavigationState(state);
  gesture.axis = null;
  gesture.consumed = false;
  gesture.sign = 0;
}

function navigationModifierSatisfied(input: WorkspaceTrackpadWheelInput): boolean {
  return !(input.modifierRequired ?? true) || input.metaKey;
}

function navigationResult(
  shouldHandle: boolean,
  directions: WorkspaceTrackpadNavigationDirection[] = [],
): WorkspaceTrackpadNavigationResult {
  return {
    directions,
    shouldHandle,
  };
}

function dominantWheelDelta(
  input: WorkspaceTrackpadWheelInput,
): { axis: WorkspaceTrackpadNavigationAxis; delta: number } | null {
  const factor = deltaModePixelFactor(input.deltaMode);
  const deltaX = input.deltaX * factor;
  const deltaY = input.deltaY * factor;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX === 0 && absY === 0) {
    return null;
  }

  if (absX >= absY) {
    return {
      axis: "horizontal",
      delta: deltaX,
    };
  }

  return {
    axis: "vertical",
    delta: deltaY,
  };
}

function accumulateDominantWheelDelta(
  state: WorkspaceTrackpadNavigationState,
  dominantDelta: { axis: WorkspaceTrackpadNavigationAxis; delta: number },
): void {
  if (shouldResetAccumulatedDelta(state, dominantDelta)) {
    state.axis = dominantDelta.axis;
    state.accumulatedDelta = 0;
  }
  state.accumulatedDelta += dominantDelta.delta;
}

function shouldResetAccumulatedDelta(
  state: WorkspaceTrackpadNavigationState,
  dominantDelta: { axis: WorkspaceTrackpadNavigationAxis; delta: number },
): boolean {
  return (
    state.axis !== dominantDelta.axis ||
    (state.accumulatedDelta !== 0 &&
      Math.sign(state.accumulatedDelta) !== Math.sign(dominantDelta.delta))
  );
}

function drainTrackpadNavigationDirections(
  state: WorkspaceTrackpadNavigationState,
): WorkspaceTrackpadNavigationDirection[] {
  const directions: WorkspaceTrackpadNavigationDirection[] = [];
  while (
    Math.abs(state.accumulatedDelta) >= trackpadNavigationThresholdPx &&
    directions.length < maxDirectionsPerWheelEvent
  ) {
    const sign = Math.sign(state.accumulatedDelta);
    directions.push(directionForDelta(state.axis, sign));
    state.accumulatedDelta -= sign * trackpadNavigationThresholdPx;
  }
  return directions;
}

function deltaModePixelFactor(deltaMode: number): number {
  switch (deltaMode) {
    case wheelDeltaModePixel:
      return 1;
    case wheelDeltaModeLine:
      return wheelLinePixelFactor;
    case wheelDeltaModePage:
      return wheelPagePixelFactor;
    default:
      return 1;
  }
}

function directionForDelta(
  axis: WorkspaceTrackpadNavigationAxis | null,
  sign: number,
): WorkspaceTrackpadNavigationDirection {
  if (axis === "horizontal") {
    return sign < 0 ? "left" : "right";
  }
  if (axis === "vertical") {
    return sign < 0 ? "up" : "down";
  }
  throw new Error("cannot interpret trackpad navigation without an axis");
}
