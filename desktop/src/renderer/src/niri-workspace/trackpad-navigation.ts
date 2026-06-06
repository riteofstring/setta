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
const maxDirectionsPerWheelEvent = 2;

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
    return navigationResult(false);
  }

  const dominantDelta = dominantWheelDelta(input);
  if (!dominantDelta) {
    return navigationResult(true);
  }

  accumulateDominantWheelDelta(state, dominantDelta);
  return navigationResult(true, drainTrackpadNavigationDirections(state));
}

function resetNiriTrackpadNavigationState(state: NiriTrackpadNavigationState): void {
  state.accumulatedDelta = 0;
  state.axis = null;
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
