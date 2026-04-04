import { NO_WHEEL_CLASS_NAME } from "utils/constants";

export const SETTINGS_GRAPH_SUBSTRATE_CANARY_SECTION_SELECTOR =
  '[data-testid="graph-substrate-canary-section"]';

const SETTINGS_GRAPH_SUBSTRATE_CANARY_DRAG_BLOCKING_SELECTOR =
  ".nodrag,input,textarea,select,option,a,[contenteditable='true']";

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
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest(`.${NO_WHEEL_CLASS_NAME}`) !== null;
}
