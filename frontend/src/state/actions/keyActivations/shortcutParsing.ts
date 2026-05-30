import {
  getGpuNodesBounds,
  isMeasuredGpuNodeBoundsInput,
} from "gpuFlow/nodeBounds";

import { fitView, resetZoom, zoomBy } from "gpuFlow/viewportActions";

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import _ from "lodash";

import { useLocalStorage, useSettings } from "state/definitions";

import { deleteSelectedAgenticEdges } from "../agenticEdges";

import { deleteSelectedEdges } from "../edges";

import { getNodes } from "../nodeInternals";

import { deleteAllActiveSections } from "../sectionInfos";

import { deleteSelectedStateMachineEdges } from "../stateMachineEdges";

export function deleteEdgesOrSections() {
  const deletedEdges = deleteSelectedEdges();
  const deletedAgenticEdges = deleteSelectedAgenticEdges();
  const deletedStateMachineEdges = deleteSelectedStateMachineEdges();
  if (!deletedEdges && !deletedAgenticEdges && !deletedStateMachineEdges) {
    deleteAllActiveSections();
  }
}

export let keysPressed = new Set();

export let keysPressedTimeStamps = new Map();

export const VIEWPORT_ZOOM_STEP_FACTOR = 1.2;

export const VIEWPORT_ZOOM_THROTTLE_MS = 50;

export const DEFAULT_FIT_VIEW_PADDING = 0.1;

export const zoomInViewportShortcut = _.throttle(
  () =>
    zoomBy(VIEWPORT_ZOOM_STEP_FACTOR, {
      overviewWidth: getProjectOverviewWidth(),
    }),
  VIEWPORT_ZOOM_THROTTLE_MS,
);

export const zoomOutViewportShortcut = _.throttle(
  () =>
    zoomBy(1 / VIEWPORT_ZOOM_STEP_FACTOR, {
      overviewWidth: getProjectOverviewWidth(),
    }),
  VIEWPORT_ZOOM_THROTTLE_MS,
);

export let pendingFitViewShortcutInitializationCleanup: (() => void) | null =
  null;

export function resetKeysPressed() {
  keysPressed = new Set();
  keysPressedTimeStamps = new Map();
}

export function deleteKeyPressed(key) {
  keysPressed.delete(key);
  keysPressedTimeStamps.delete(key);
}

export function addKeyPressed(key) {
  keysPressed.add(key);
  keysPressedTimeStamps.set(key, Date.now());
}

export function clearStaleKeys() {
  const now = Date.now();

  // First, collect all stale keys
  for (const [key, timestamp] of keysPressedTimeStamps) {
    if (now - timestamp > 100) {
      deleteKeyPressed(key);
    }
  }
}

export function fitGpuViewportShortcut(): boolean {
  if (gpuFlowViewportStore.getState().fitViewOnInit) {
    return false;
  }
  const nodes = getNodes().filter(isMeasuredGpuNodeBoundsInput);
  if (nodes.length === 0) {
    return false;
  }
  const fitted = fitView({
    bounds: getGpuNodesBounds(nodes),
    duration: useSettings.getState().gui.transitionDuration,
    overviewWidth: getProjectOverviewWidth(),
    padding: DEFAULT_FIT_VIEW_PADDING,
  });
  if (fitted) {
    markGpuFitViewShortcutInitializationAfterSettle();
  }
  return fitted;
}

export function resetGpuViewportZoom() {
  resetZoom({ overviewWidth: getProjectOverviewWidth() });
}

export function getProjectOverviewWidth(): number {
  return useLocalStorage.getState().overviewTrueWidth;
}

export function markGpuFitViewShortcutInitializationAfterSettle() {
  pendingFitViewShortcutInitializationCleanup?.();
  pendingFitViewShortcutInitializationCleanup = null;

  if (!gpuFlowViewportStore.getState().viewportAnimating) {
    markGpuFitViewShortcutInitialized();
    return;
  }

  const unsubscribe = gpuFlowViewportStore.subscribe((state, previousState) => {
    if (state.viewportAnimating || !previousState.viewportAnimating) {
      return;
    }
    pendingFitViewShortcutInitializationCleanup = null;
    unsubscribe();
    markGpuFitViewShortcutInitialized();
  });
  pendingFitViewShortcutInitializationCleanup = unsubscribe;
}

export function markGpuFitViewShortcutInitialized() {
  gpuFlowViewportStore.getState().setFitViewInitializationState({
    fitViewOnInit: true,
    fitViewOnInitDone: true,
    fitViewOnInitOptions: undefined,
  });
}

export function attachEventListenerAndReturnCleanup(
  attachTo,
  eventName,
  action,
) {
  attachTo.addEventListener(eventName, action);

  // Return a cleanup function
  return () => {
    attachTo.removeEventListener(eventName, action);
  };
}

export function attachKeyDownListener(action) {
  return attachEventListenerAndReturnCleanup(document, "keydown", action);
}

export function attachKeyUpListener(action) {
  return attachEventListenerAndReturnCleanup(document, "keyup", action);
}

export const specialEventKeyToEventCode = {
  ".": "Period",
  ",": "Comma",
  "/": "Slash",
  "\\": "Backslash",
  "'": "Quote",
  ";": "Semicolon",
  "[": "BracketLeft",
  "]": "BracketRight",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
  // Adding case-sensitive keys
  arrowright: "ArrowRight",
  arrowleft: "ArrowLeft",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
};

export const modifierKeyCodes = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
]);

export const namedEventKeyToCode = {
  " ": "Space",
  Shift: "ShiftLeft",
  Control: "ControlLeft",
  Alt: "AltLeft",
  Meta: "MetaLeft",
};

export type ParsedShortcut = {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  keys: Set<string>;
};

export type ShortcutPatternMode =
  | "no-modifiers"
  | "shift-only"
  | "mod-only"
  | "ctrl-only"
  | "alt-only"
  | "alt-shift"
  | "mod-shift"
  | "mod-ctrl"
  | "mod-or-ctrl"
  | "mod-or-ctrl-shift";

export type ShortcutPattern = {
  mode: ShortcutPatternMode;
  keys?: string[];
};

export type ShortcutModifiers = Omit<ParsedShortcut, "keys">;

export type TabShortcutInfo = { shift: boolean };

export type TabParamAction = "indent" | "unindent";

export function getNormalizedEventCode(event: KeyboardEvent): string | null {
  if (event.code && event.code !== "Unidentified") {
    return event.code;
  }

  const key = event.key;
  if (!key) {
    return null;
  }

  const normalizedNamedKey = namedEventKeyToCode[key];
  if (normalizedNamedKey) {
    return normalizedNamedKey;
  }

  const lowerKey = key.toLowerCase();
  const special =
    specialEventKeyToEventCode[lowerKey] ?? specialEventKeyToEventCode[key];
  if (special) {
    return special;
  }

  return getNormalizedAlphaNumericEventCode(key);
}

export function getNormalizedAlphaNumericEventCode(key: string) {
  if (/^[a-zA-Z]$/.test(key)) {
    return `Key${key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }

  if (key.length > 1) {
    return key[0].toUpperCase() + key.slice(1);
  }

  return key;
}

// shortcutString is a lowercase string.
export function parseShortcut(shortcutString): ParsedShortcut {
  const parts = shortcutString.split("+").map((x) => x.trim());

  let keys = parts.filter((x) => !["ctrl", "shift", "alt", "mod"].includes(x));

  keys = new Set(
    keys.map((part) => {
      const x = part.trim();
      if (/^[a-zA-Z]$/.test(x)) {
        return `Key${x.toUpperCase()}`;
      }
      if (/^[0-9]$/.test(x)) {
        return `Digit${x}`;
      }
      const special = specialEventKeyToEventCode[x];
      return special ?? x[0].toUpperCase() + x.slice(1);
    }),
  );

  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    keys,
  };
}

export function getTabShortcutInfo(shortcut) {
  if (!shortcut) {
    return null;
  }
  const parsed = parseShortcut(shortcut.toLowerCase());
  if (!isParsedTabShortcut(parsed)) {
    return null;
  }
  return { shift: parsed.shift };
}

export function isTabLikeShortcut(shortcut) {
  return getTabShortcutInfo(shortcut) !== null;
}

export function isParsedTabShortcut(parsedShortcut) {
  return (
    parsedShortcut.keys.size === 1 &&
    parsedShortcut.keys.has("Tab") &&
    !parsedShortcut.mod &&
    !parsedShortcut.ctrl &&
    !parsedShortcut.alt
  );
}

export function hasMatchingShortcutModifiers(
  event: KeyboardEvent,
  parsedShortcut: ParsedShortcut,
  macOs: boolean,
): boolean {
  if (macOs) {
    return (
      event.metaKey === parsedShortcut.mod &&
      event.ctrlKey === parsedShortcut.ctrl &&
      event.shiftKey === parsedShortcut.shift &&
      event.altKey === parsedShortcut.alt
    );
  }

  return (
    event.ctrlKey === (parsedShortcut.ctrl || parsedShortcut.mod) &&
    event.shiftKey === parsedShortcut.shift &&
    event.altKey === parsedShortcut.alt
  );
}

export function isShortcutPressed(e, parsedShortcut, _isMacOs) {
  return (
    hasMatchingShortcutModifiers(e, parsedShortcut, _isMacOs) &&
    _.isEqual(keysPressed, parsedShortcut.keys)
  );
}

export function keysMatch(keys, targetKeyList = []) {
  return _.isEqual(keys, new Set(targetKeyList));
}

export function matchesModifierState(
  parsedShortcut: ParsedShortcut,
  expected: ShortcutModifiers,
) {
  return (
    parsedShortcut.mod === expected.mod &&
    parsedShortcut.ctrl === expected.ctrl &&
    parsedShortcut.shift === expected.shift &&
    parsedShortcut.alt === expected.alt
  );
}

export const shortcutModeMatchers: Record<
  ShortcutPatternMode,
  (parsedShortcut: ParsedShortcut) => boolean
> = {
  "no-modifiers": (parsedShortcut) =>
    !parsedShortcut.mod &&
    !parsedShortcut.ctrl &&
    !parsedShortcut.shift &&
    !parsedShortcut.alt,
  "shift-only": (parsedShortcut) =>
    matchesModifierState(parsedShortcut, {
      mod: false,
      ctrl: false,
      shift: true,
      alt: false,
    }),
  "mod-only": (parsedShortcut) =>
    matchesModifierState(parsedShortcut, {
      mod: true,
      ctrl: false,
      shift: false,
      alt: false,
    }),
  "ctrl-only": (parsedShortcut) =>
    matchesModifierState(parsedShortcut, {
      mod: false,
      ctrl: true,
      shift: false,
      alt: false,
    }),
  "alt-only": (parsedShortcut) =>
    matchesModifierState(parsedShortcut, {
      mod: false,
      ctrl: false,
      shift: false,
      alt: true,
    }),
  "alt-shift": (parsedShortcut) =>
    matchesModifierState(parsedShortcut, {
      mod: false,
      ctrl: false,
      shift: true,
      alt: true,
    }),
  "mod-shift": (parsedShortcut) =>
    matchesModifierState(parsedShortcut, {
      mod: true,
      ctrl: false,
      shift: true,
      alt: false,
    }),
  "mod-ctrl": (parsedShortcut) =>
    matchesModifierState(parsedShortcut, {
      mod: true,
      ctrl: true,
      shift: false,
      alt: false,
    }),
  "mod-or-ctrl": (parsedShortcut) =>
    (parsedShortcut.mod || parsedShortcut.ctrl) &&
    !parsedShortcut.shift &&
    !parsedShortcut.alt,
  "mod-or-ctrl-shift": (parsedShortcut) =>
    (parsedShortcut.mod || parsedShortcut.ctrl) &&
    parsedShortcut.shift &&
    !parsedShortcut.alt,
};

export function matchesShortcutPattern(
  parsedShortcut: ParsedShortcut,
  pattern: ShortcutPattern,
) {
  if (!shortcutModeMatchers[pattern.mode](parsedShortcut)) {
    return false;
  }
  if (pattern.mode === "no-modifiers") {
    return true;
  }
  return keysMatch(parsedShortcut.keys, pattern.keys);
}

export function matchesAnyShortcutPattern(
  parsedShortcut: ParsedShortcut,
  patterns: ShortcutPattern[],
) {
  return patterns.some((pattern) =>
    matchesShortcutPattern(parsedShortcut, pattern),
  );
}

export const preventDefaultAllowedShortcuts: ShortcutPattern[] = [
  { mode: "mod-or-ctrl", keys: ["KeyC"] },
  { mode: "mod-or-ctrl", keys: ["KeyV"] },
];

export const sharedInputFieldIgnoredShortcuts: ShortcutPattern[] = [
  { mode: "no-modifiers" },
  { mode: "shift-only", keys: [] },
  { mode: "mod-only", keys: [] },
];

export const macosInputFieldIgnoredShortcuts: ShortcutPattern[] = [
  ...sharedInputFieldIgnoredShortcuts,
  { mode: "mod-only", keys: ["KeyC"] },
  { mode: "mod-only", keys: ["KeyV"] },
  { mode: "mod-only", keys: ["KeyX"] },
  { mode: "mod-only", keys: ["KeyZ"] },
  { mode: "mod-shift", keys: ["KeyZ"] },
  { mode: "mod-only", keys: ["KeyA"] },
  { mode: "mod-only", keys: ["ArrowLeft"] },
  { mode: "mod-only", keys: ["ArrowRight"] },
  { mode: "alt-only", keys: ["ArrowLeft"] },
  { mode: "alt-only", keys: ["ArrowRight"] },
  { mode: "shift-only", keys: ["ArrowLeft"] },
  { mode: "shift-only", keys: ["ArrowRight"] },
  { mode: "shift-only", keys: ["ArrowUp"] },
  { mode: "shift-only", keys: ["ArrowDown"] },
  { mode: "alt-shift", keys: ["ArrowLeft"] },
  { mode: "alt-shift", keys: ["ArrowRight"] },
  { mode: "mod-shift", keys: ["ArrowLeft"] },
  { mode: "mod-shift", keys: ["ArrowRight"] },
  { mode: "alt-only", keys: ["Backspace"] },
  { mode: "mod-only", keys: ["Backspace"] },
  { mode: "ctrl-only", keys: ["KeyA"] },
  { mode: "ctrl-only", keys: ["KeyE"] },
  { mode: "ctrl-only", keys: ["KeyF"] },
  { mode: "ctrl-only", keys: ["KeyB"] },
  { mode: "ctrl-only", keys: ["KeyN"] },
  { mode: "ctrl-only", keys: ["KeyP"] },
  { mode: "ctrl-only", keys: ["KeyD"] },
  { mode: "ctrl-only", keys: ["KeyH"] },
  { mode: "ctrl-only", keys: ["KeyT"] },
  { mode: "mod-ctrl", keys: ["Space"] },
  { mode: "mod-shift", keys: ["KeyV"] },
  { mode: "mod-only", keys: ["ArrowUp"] },
  { mode: "mod-only", keys: ["ArrowDown"] },
  { mode: "mod-shift", keys: ["ArrowUp"] },
  { mode: "mod-shift", keys: ["ArrowDown"] },
  { mode: "mod-only", keys: ["KeyY"] },
  { mode: "mod-only", keys: ["KeyB"] },
  { mode: "mod-only", keys: ["KeyI"] },
];

export const windowsInputFieldIgnoredShortcuts: ShortcutPattern[] = [
  ...sharedInputFieldIgnoredShortcuts,
  { mode: "mod-or-ctrl", keys: ["KeyA"] },
  { mode: "mod-or-ctrl", keys: ["KeyC"] },
  { mode: "mod-or-ctrl", keys: ["KeyV"] },
  { mode: "mod-or-ctrl", keys: ["KeyX"] },
  { mode: "mod-or-ctrl", keys: ["KeyZ"] },
  { mode: "mod-or-ctrl", keys: ["KeyY"] },
  { mode: "mod-or-ctrl", keys: ["ArrowLeft"] },
  { mode: "mod-or-ctrl", keys: ["ArrowRight"] },
  { mode: "shift-only", keys: ["ArrowLeft"] },
  { mode: "shift-only", keys: ["ArrowRight"] },
  { mode: "mod-or-ctrl-shift", keys: ["ArrowLeft"] },
  { mode: "mod-or-ctrl-shift", keys: ["ArrowRight"] },
  { mode: "mod-or-ctrl", keys: ["ArrowUp"] },
  { mode: "mod-or-ctrl", keys: ["ArrowDown"] },
  { mode: "mod-or-ctrl-shift", keys: ["ArrowUp"] },
  { mode: "mod-or-ctrl-shift", keys: ["ArrowDown"] },
  { mode: "shift-only", keys: ["ArrowUp"] },
  { mode: "shift-only", keys: ["ArrowDown"] },
  { mode: "alt-only", keys: ["ArrowLeft"] },
  { mode: "alt-only", keys: ["ArrowRight"] },
  { mode: "mod-or-ctrl", keys: ["KeyK"] },
  { mode: "shift-only", keys: ["Home"] },
  { mode: "shift-only", keys: ["End"] },
  { mode: "mod-or-ctrl", keys: ["Home"] },
  { mode: "mod-or-ctrl", keys: ["End"] },
  { mode: "mod-or-ctrl-shift", keys: ["Home"] },
  { mode: "mod-or-ctrl-shift", keys: ["End"] },
  { mode: "mod-or-ctrl", keys: ["Backspace"] },
  { mode: "mod-or-ctrl", keys: ["Delete"] },
  { mode: "shift-only", keys: ["Enter"] },
  { mode: "mod-or-ctrl-shift", keys: ["KeyV"] },
  { mode: "mod-or-ctrl", keys: ["KeyB"] },
  { mode: "mod-or-ctrl", keys: ["KeyI"] },
  { mode: "mod-or-ctrl", keys: ["KeyU"] },
];

export function getShouldPreventDefault(parsedShortcut: ParsedShortcut) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;

  // case for shortcuts that don't contain modifiers
  if (!mod && !ctrl && !shift && !alt) {
    return false;
  }

  if (isParsedTabShortcut(parsedShortcut)) {
    return false;
  }

  // case for "mod", "ctrl", "alt", "shift"
  if (keys.size === 0) {
    return false;
  }

  if (
    matchesAnyShortcutPattern(parsedShortcut, preventDefaultAllowedShortcuts)
  ) {
    return false;
  }

  return true;
}

export function getIsInput(event) {
  return (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.target.isContentEditable
  );
}

export function runParamShortcut(action, event) {
  if (getIsInput(event)) {
    return;
  }
  const didRun = action();
  if (didRun) {
    event.preventDefault();
  }
}

export function getIgnoreWhenInInputField(
  parsedShortcut: ParsedShortcut,
  _isMacOs,
) {
  if (isParsedTabShortcut(parsedShortcut)) {
    return false;
  }
  if (parsedShortcut.keys.has("Escape")) {
    return false;
  }
  return matchesAnyShortcutPattern(
    parsedShortcut,
    _isMacOs
      ? macosInputFieldIgnoredShortcuts
      : windowsInputFieldIgnoredShortcuts,
  );
}
