import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import type { Position } from "utils/generatedTypes";

export const SETTINGS_GRAPH_SUBSTRATE_CANARY_SECTION_SELECTOR =
  '[data-testid="graph-substrate-canary-section"]';

const SETTINGS_GRAPH_SUBSTRATE_CANARY_DRAG_BLOCKING_SELECTOR =
  ".nodrag,input,textarea,select,option,a,[contenteditable='true']";

type SettingsGraphSubstrateCanaryWheelTargetBehavior = {
  ctrlKey: boolean;
  isMacOs: boolean;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
};

export function shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(SETTINGS_GRAPH_SUBSTRATE_CANARY_DRAG_BLOCKING_SELECTOR),
  );
}

export function shouldBlockSettingsGraphSubstrateCanaryPanePointerTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target.closest(SETTINGS_GRAPH_SUBSTRATE_CANARY_SECTION_SELECTOR) !== null
  );
}

export function shouldBlockSettingsGraphSubstrateCanaryWheelTarget(
  target: EventTarget | null,
  behavior: SettingsGraphSubstrateCanaryWheelTargetBehavior,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest(`.${NO_WHEEL_CLASS_NAME}`) === null) {
    return false;
  }

  if (behavior.zoomActivationKeyPressed) {
    return false;
  }

  if (behavior.ctrlKey && behavior.zoomOnPinch && behavior.isMacOs) {
    return false;
  }

  return true;
}

export function resolveSettingsGraphSubstrateCanarySectionDragEndPosition(
  position: Position,
  options: {
    snapGrid: [number, number];
    snapToGrid: boolean;
  },
): Position {
  if (!options.snapToGrid) {
    return position;
  }

  return {
    x: options.snapGrid[0] * Math.round(position.x / options.snapGrid[0]),
    y: options.snapGrid[1] * Math.round(position.y / options.snapGrid[1]),
  };
}
