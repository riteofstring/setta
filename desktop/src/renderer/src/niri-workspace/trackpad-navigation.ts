type NiriTrackpadNavigationAxis = "horizontal" | "vertical";
type NiriTrackpadNavigationDirection = "up" | "down" | "left" | "right";

export interface NiriTrackpadNavigationState {
  accumulatedDelta: number;
  axis: NiriTrackpadNavigationAxis | null;
}

export interface NiriTrackpadWheelInput {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  metaKey: boolean;
  modifierRequired?: boolean;
  timeStampMs?: number;
}

export interface NiriTrackpadNavigationResult {
  directions: NiriTrackpadNavigationDirection[];
  shouldHandle: boolean;
}

const wheelDeltaModePixel = 0;
const wheelDeltaModeLine = 1;
const wheelDeltaModePage = 2;
const wheelLinePixelFactor = 16;
const wheelPagePixelFactor = 720;
const trackpadNavigationThresholdPx = 80;
const trackpadNavigationGestureReleaseMs = 220;
const maxDirectionsPerWheelEvent = 1;

interface ConsumedTrackpadNavigationGesture {
  consumed: boolean;
  lastWheelTimeMs: number | null;
}

const consumedGestureStates = new WeakMap<
  NiriTrackpadNavigationState,
  ConsumedTrackpadNavigationGesture
>();

export function createNiriTrackpadNavigationState(): NiriTrackpadNavigationState {
  return {
    accumulatedDelta: 0,
    axis: null,
  };
}

export function interpretNiriTrackpadWheel(
  input: NiriTrackpadWheelInput,
  state: NiriTrackpadNavigationState,
): NiriTrackpadNavigationResult {
  if (!navigationModifierSatisfied(input)) {
    resetNiriTrackpadNavigationState(state);
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
    return navigationResult(true);
  }

  accumulateDominantWheelDelta(state, dominantDelta);
  const directions = drainTrackpadNavigationDirections(state);
  if (directions.length > 0) {
    state.accumulatedDelta = 0;
    gesture.consumed = true;
  }
  return navigationResult(true, directions);
}

export function paneTopBarPaneIdFromWheelTarget(target: EventTarget | null): string | null {
  if (!isClosestTarget(target)) {
    return null;
  }
  const topBar = target.closest("[data-niri-pane-top-bar]");
  return topBar?.dataset.paneId || null;
}

export function wheelTargetIsAppTitleBar(target: EventTarget | null): boolean {
  if (!isClosestTarget(target)) {
    return false;
  }
  return (
    target.closest("[data-setta-shell-title-bar]") !== null ||
    target.closest("[data-niri-workspace-title-bar]") !== null
  );
}

function isClosestTarget(target: EventTarget | null): target is EventTarget & {
  closest: (selector: string) => { dataset: { paneId?: string } } | null;
} {
  return typeof (target as { closest?: unknown } | null)?.closest === "function";
}

function resetNiriTrackpadNavigationState(state: NiriTrackpadNavigationState): void {
  state.accumulatedDelta = 0;
  state.axis = null;
}

function resetConsumedTrackpadNavigationGesture(state: NiriTrackpadNavigationState): void {
  const gesture = consumedGestureStates.get(state);
  if (!gesture) {
    return;
  }
  gesture.consumed = false;
  gesture.lastWheelTimeMs = null;
}

function consumedGestureStateFor(
  state: NiriTrackpadNavigationState,
): ConsumedTrackpadNavigationGesture {
  const existing = consumedGestureStates.get(state);
  if (existing) {
    return existing;
  }
  const gesture = {
    consumed: false,
    lastWheelTimeMs: null,
  } satisfies ConsumedTrackpadNavigationGesture;
  consumedGestureStates.set(state, gesture);
  return gesture;
}

function releaseConsumedTrackpadNavigationGestureAfterIdle(
  input: NiriTrackpadWheelInput,
  state: NiriTrackpadNavigationState,
  gesture: ConsumedTrackpadNavigationGesture,
): void {
  if (input.timeStampMs === undefined) {
    return;
  }
  if (gesture.lastWheelTimeMs !== null) {
    const elapsedMs = input.timeStampMs - gesture.lastWheelTimeMs;
    if (elapsedMs < 0 || elapsedMs > trackpadNavigationGestureReleaseMs) {
      resetNiriTrackpadNavigationState(state);
      gesture.consumed = false;
    }
  }
  gesture.lastWheelTimeMs = input.timeStampMs;
}

function navigationModifierSatisfied(input: NiriTrackpadWheelInput): boolean {
  return !(input.modifierRequired ?? true) || input.metaKey;
}

function navigationResult(
  shouldHandle: boolean,
  directions: NiriTrackpadNavigationDirection[] = [],
): NiriTrackpadNavigationResult {
  return {
    directions,
    shouldHandle,
  };
}

function dominantWheelDelta(
  input: NiriTrackpadWheelInput,
): { axis: NiriTrackpadNavigationAxis; delta: number } | null {
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
  state: NiriTrackpadNavigationState,
  dominantDelta: { axis: NiriTrackpadNavigationAxis; delta: number },
): void {
  if (shouldResetAccumulatedDelta(state, dominantDelta)) {
    state.axis = dominantDelta.axis;
    state.accumulatedDelta = 0;
  }
  state.accumulatedDelta += dominantDelta.delta;
}

function shouldResetAccumulatedDelta(
  state: NiriTrackpadNavigationState,
  dominantDelta: { axis: NiriTrackpadNavigationAxis; delta: number },
): boolean {
  return (
    state.axis !== dominantDelta.axis ||
    (state.accumulatedDelta !== 0 &&
      Math.sign(state.accumulatedDelta) !== Math.sign(dominantDelta.delta))
  );
}

function drainTrackpadNavigationDirections(
  state: NiriTrackpadNavigationState,
): NiriTrackpadNavigationDirection[] {
  const directions: NiriTrackpadNavigationDirection[] = [];
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
  axis: NiriTrackpadNavigationAxis | null,
  sign: number,
): NiriTrackpadNavigationDirection {
  if (axis === "horizontal") {
    return sign < 0 ? "left" : "right";
  }
  if (axis === "vertical") {
    return sign < 0 ? "up" : "down";
  }
  throw new Error("cannot interpret trackpad navigation without an axis");
}
