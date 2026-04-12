import {
  showParamUITypeTab,
  showProjectOverviewTab,
  showVersionsTab,
} from "components/Panes/paneFns";
import {
  copyFloatingBoxContent,
  copyFrozenFloatingBoxContent,
  decrementFloatingBoxIdx,
  decrementFrozenFloatingBoxIdx,
  disableFloatingBox,
  enableFloatingBox,
  freezeFloatingBox,
  getConvertFloatingBoxToSectionFn,
  incrementFloatingBoxIdx,
  incrementFrozenFloatingBoxIdx,
  removeFrozenFloatingBox,
} from "components/Utils/FloatingBox";
import {
  activateDndMovingFreeMode,
  activateDndSortingMode,
  deactivateDnd,
} from "forks/dnd-kit/dndState";
import {
  resetZoom,
  zoomIn,
  zoomOut,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { onFitViewHandler } from "forks/xyflow/core/store/utils";
import { zoomToMouseLocation } from "forks/xyflow/core/utils/mouseLocation";
import _ from "lodash";
import {
  activateParamSelect,
  deactivateParamSelect,
} from "state/actions/paramSelect";
import {
  indentSelectedParams,
  moveSelectedParamsDown,
  moveSelectedParamsUp,
  unindentSelectedParams,
} from "state/actions/params/moveParams";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState, useSettings } from "state/definitions";
import {
  focusAdjacentTopLevelSection,
  focusScope,
  handleTabNavigation,
} from "utils/focusManager";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { isMacOs } from "utils/utils";
import {
  clearActiveSectionIds,
  selectAll,
  setTopLevelNonGroupSectionsAsActive,
} from "./activeSections";
import { deleteSelectedAgenticEdges } from "./agenticEdges";
import { copy, paste } from "./copyPaste";
import { deleteSelectedEdges } from "./edges";
import { formatActiveCodeSection } from "./formatCode";
import { restartLanguageServer } from "./lsp";
import {
  openFileMenuLoadProjectConfigModal,
  openFileMenuSaveProjectConfigAsModal,
} from "./modal";
import { saveProject } from "./project/saveProject";
import { runEntryCodeBlock } from "./runOrImportCode";
import {
  deleteAllActiveSections,
  groupActiveSections,
  ungroupActiveGroups,
  unselectAllParams,
} from "./sectionInfos";
import {
  addCallableSectionInEmptySpace,
  addGroupInEmptySpace,
  addTerminalInEmptySpace,
} from "./sections/createSections";
import {
  focusOnAdvancedSearch,
  focusOnCommandPalette,
  focusOnSearch,
} from "./sections/sectionParamFilter";
import { deleteSelectedStateMachineEdges } from "./stateMachineEdges";
import { redoProjectState, undoProjectState } from "./undo";

function deleteEdgesOrSections() {
  const deletedEdges = deleteSelectedEdges();
  const deletedAgenticEdges = deleteSelectedAgenticEdges();
  const deletedStateMachineEdges = deleteSelectedStateMachineEdges();
  if (!deletedEdges && !deletedAgenticEdges && !deletedStateMachineEdges) {
    deleteAllActiveSections();
  }
}

let keysPressed = new Set();
let keysPressedTimeStamps = new Map();
let aModShortcutWasPressed = false;

function resetKeysPressed() {
  keysPressed = new Set();
  keysPressedTimeStamps = new Map();
}

function deleteKeyPressed(key) {
  keysPressed.delete(key);
  keysPressedTimeStamps.delete(key);
}

function addKeyPressed(key) {
  keysPressed.add(key);
  keysPressedTimeStamps.set(key, Date.now());
}

function clearStaleKeys() {
  const now = Date.now();

  // First, collect all stale keys
  for (const [key, timestamp] of keysPressedTimeStamps) {
    if (now - timestamp > 100) {
      deleteKeyPressed(key);
    }
  }
}

function attachEventListenerAndReturnCleanup(attachTo, eventName, action) {
  attachTo.addEventListener(eventName, action);

  // Return a cleanup function
  return () => {
    attachTo.removeEventListener(eventName, action);
  };
}

function attachKeyDownListener(action) {
  return attachEventListenerAndReturnCleanup(document, "keydown", action);
}

function attachKeyUpListener(action) {
  return attachEventListenerAndReturnCleanup(document, "keyup", action);
}

const specialEventKeyToEventCode = {
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

const modifierKeyCodes = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
]);

const namedEventKeyToCode = {
  " ": "Space",
  Shift: "ShiftLeft",
  Control: "ControlLeft",
  Alt: "AltLeft",
  Meta: "MetaLeft",
};

type ParsedShortcut = {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  keys: Set<string>;
};

type ShortcutPatternMode =
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

type ShortcutPattern = {
  mode: ShortcutPatternMode;
  keys?: string[];
};

type ShortcutModifiers = Omit<ParsedShortcut, "keys">;

function getNormalizedEventCode(event: KeyboardEvent): string | null {
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

function getNormalizedAlphaNumericEventCode(key: string) {
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

function getTabShortcutInfo(shortcut) {
  if (!shortcut) {
    return null;
  }
  const parsed = parseShortcut(shortcut.toLowerCase());
  if (!isParsedTabShortcut(parsed)) {
    return null;
  }
  return { shift: parsed.shift };
}

function isTabLikeShortcut(shortcut) {
  return getTabShortcutInfo(shortcut) !== null;
}

function isParsedTabShortcut(parsedShortcut) {
  return (
    parsedShortcut.keys.size === 1 &&
    parsedShortcut.keys.has("Tab") &&
    !parsedShortcut.mod &&
    !parsedShortcut.ctrl &&
    !parsedShortcut.alt
  );
}

function isShortcutPressed(e, parsedShortcut, _isMacOs) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  if (_isMacOs) {
    return (
      e.metaKey === mod &&
      e.ctrlKey === ctrl &&
      e.shiftKey === shift &&
      e.altKey === alt &&
      _.isEqual(keysPressed, keys)
    );
  } else {
    return (
      e.ctrlKey === (ctrl || mod) &&
      e.shiftKey === shift &&
      e.altKey === alt &&
      _.isEqual(keysPressed, keys)
    );
  }
}

function keysMatch(keys, targetKeyList = []) {
  return _.isEqual(keys, new Set(targetKeyList));
}

function matchesModifierState(
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

const shortcutModeMatchers: Record<
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

function matchesShortcutPattern(
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

function matchesAnyShortcutPattern(
  parsedShortcut: ParsedShortcut,
  patterns: ShortcutPattern[],
) {
  return patterns.some((pattern) =>
    matchesShortcutPattern(parsedShortcut, pattern),
  );
}

const preventDefaultAllowedShortcuts: ShortcutPattern[] = [
  { mode: "mod-or-ctrl", keys: ["KeyC"] },
  { mode: "mod-or-ctrl", keys: ["KeyV"] },
];

const sharedInputFieldIgnoredShortcuts: ShortcutPattern[] = [
  { mode: "no-modifiers" },
  { mode: "shift-only", keys: [] },
  { mode: "mod-only", keys: [] },
];

const macosInputFieldIgnoredShortcuts: ShortcutPattern[] = [
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

const windowsInputFieldIgnoredShortcuts: ShortcutPattern[] = [
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

function getIsInput(event) {
  return (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.target.isContentEditable
  );
}

function runParamShortcut(action, event) {
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

function syncPressedKeysFromKeyDown(event: KeyboardEvent) {
  // keyup does not trigger on mac when cmd is held down, so stale keys need
  // pruning before the next keydown is processed.
  if (aModShortcutWasPressed) {
    clearStaleKeys();
  }
  aModShortcutWasPressed = false;
  const eventCode = getNormalizedEventCode(event);
  if (eventCode && !modifierKeyCodes.has(eventCode)) {
    addKeyPressed(eventCode);
  }
}

function runShortcutKeyDownAction(
  event: KeyboardEvent,
  shortcut,
  isMac,
  isInput,
) {
  if (!isShortcutPressed(event, shortcut.parsedShortcut, isMac)) {
    return false;
  }
  if (shortcut.ignoreWhenInInputField && isInput) {
    return true;
  }
  if (shortcut.shouldPreventDefault) {
    event.preventDefault();
  }
  if (event.repeat && !shortcut.allowRepeat) {
    return true;
  }
  shortcut.keyDownAction(event);
  shortcut.wasPressed = true;
  if (shortcut.parsedShortcut.mod) {
    aModShortcutWasPressed = true;
  }
  return true;
}

function releaseShortcutIfNeeded(event: KeyboardEvent, shortcut) {
  if (!shortcut.wasPressed || shortcut.keepKeyDownCondition?.(event)) {
    return;
  }
  shortcut.keyUpAction?.(event);
  shortcut.wasPressed = false;
}

function handleShortcutKeyDownEvent(event: KeyboardEvent, shortcutInfo, isMac) {
  syncPressedKeysFromKeyDown(event);
  const isInput = getIsInput(event);
  for (const shortcut of shortcutInfo) {
    if (runShortcutKeyDownAction(event, shortcut, isMac, isInput)) {
      continue;
    }
    releaseShortcutIfNeeded(event, shortcut);
  }
}

function keyUpLoop(e, shortcutInfo) {
  for (const x of shortcutInfo) {
    if (x.wasPressed && !x.keepKeyDownCondition?.(e)) {
      x.wasPressed = false;
      x.keyUpAction?.(e);
    }
  }
}

function addKeepKeyDownConditions(sInfo, _isMacOs) {
  // post processing that depends on parsed shortcuts
  sInfo.showTooltipShortcut.keepKeyDownCondition = (e) =>
    isShortcutPressed(e, sInfo.showTooltipShortcut.parsedShortcut, _isMacOs) ||
    isShortcutPressed(
      e,
      sInfo.incrementTooltipPageShortcut.parsedShortcut,
      _isMacOs,
    ) ||
    isShortcutPressed(
      e,
      sInfo.decrementTooltipPageShortcut.parsedShortcut,
      _isMacOs,
    ) ||
    isShortcutPressed(
      e,
      sInfo.copyTooltipTextShortcut.parsedShortcut,
      _isMacOs,
    );
}

export function attachKeyEventListeners() {
  const shortcuts = useSettings.getState().shortcuts;
  const shortcutsNeededForExtraProcessing = {};
  const indentShortcutIsTab = isTabLikeShortcut(shortcuts.paramIndentShortcut);
  const unindentShortcutIsTab = isTabLikeShortcut(
    shortcuts.paramUnindentShortcut,
  );

  function addToShortcutsNeededForExtraProcessing(
    name,
    keyDownAction,
    keyUpAction = null,
    allowRepeat = false,
  ) {
    const output = [
      shortcuts[name],
      keyDownAction,
      keyUpAction,
      allowRepeat,
      name,
    ];
    shortcutsNeededForExtraProcessing[name] = output;
    return output;
  }

  const conditionAndAction = [
    ["tab", handleTabKeyDown],
    ["shift + tab", handleTabKeyDown],
    [shortcuts.focusHeaderShortcut, () => focusScope("header")],
    [shortcuts.focusOverviewShortcut, () => focusScope("overview")],
    [shortcuts.focusCanvasShortcut, () => focusScope("canvas")],
    [shortcuts.focusUiEditorShortcut, () => focusScope("ui-editor")],
    [
      shortcuts.nextTopLevelSectionShortcut,
      () => focusAdjacentTopLevelSection({ direction: 1 }),
    ],
    [
      shortcuts.prevTopLevelSectionShortcut,
      () => focusAdjacentTopLevelSection({ direction: -1 }),
    ],
    [shortcuts.newCardShortcut, addCallableSectionInEmptySpace],
    [shortcuts.newGroupShortcut, addGroupInEmptySpace],
    [shortcuts.newTerminalShortcut, addTerminalInEmptySpace],
    addToShortcutsNeededForExtraProcessing(
      "showTooltipShortcut",
      enableFloatingBox,
      disableFloatingBox,
    ),
    [
      shortcuts.tooltipToPlaintextShortcut,
      getConvertFloatingBoxToSectionFn(false),
    ],
    [
      shortcuts.tooltipToMarkdownShortcut,
      getConvertFloatingBoxToSectionFn(true),
    ],
    [shortcuts.freezeTooltipShortcut, freezeFloatingBox],
    [
      shortcuts.frozenTooltipToPlaintextShortcut,
      getConvertFloatingBoxToSectionFn(false),
    ],
    [
      shortcuts.frozenTooltipToMarkdownShortcut,
      getConvertFloatingBoxToSectionFn(true),
    ],
    addToShortcutsNeededForExtraProcessing(
      "incrementTooltipPageShortcut",
      incrementFloatingBoxIdx,
    ),
    addToShortcutsNeededForExtraProcessing(
      "decrementTooltipPageShortcut",
      decrementFloatingBoxIdx,
    ),
    addToShortcutsNeededForExtraProcessing(
      "copyTooltipTextShortcut",
      copyFloatingBoxContent,
    ),
    [shortcuts.frozenTooltipIncrementShortcut, incrementFrozenFloatingBoxIdx],
    [shortcuts.frozenTooltipDecrementShortcut, decrementFrozenFloatingBoxIdx],
    [shortcuts.frozenTooltipCopyShortcut, copyFrozenFloatingBoxContent],
    [shortcuts.undoShortcut, undoProjectState, null, true],
    [shortcuts.redoShortcut, redoProjectState, null, true],
    [shortcuts.groupShortcut, groupActiveSections],
    [shortcuts.ungroupShortcut, ungroupActiveGroups],
    [shortcuts.saveShortcut, saveProject],
    [shortcuts.loadShortcut, openFileMenuLoadProjectConfigModal],
    [shortcuts.saveAsShortcut, openFileMenuSaveProjectConfigAsModal],
    [shortcuts.searchShortcut, focusOnSearch],
    [shortcuts.advancedSearchShortcut, focusOnAdvancedSearch],
    [shortcuts.commandPaletteShortcut, focusOnCommandPalette],
    [shortcuts.resetZoomShortcut, resetZoom],
    [shortcuts.copyShortcut, copy],
    [shortcuts.pasteShortcut, paste],
    [shortcuts.pasteAsRefShortcut, () => paste({ asRef: true })],
    // [shortcuts.runCodeShortcut, runActiveCode],
    [shortcuts.runEntryCodeBlockShortcut, runEntryCodeBlock],
    [shortcuts.formatCode, formatActiveCodeSection],
    ...(indentShortcutIsTab
      ? []
      : [
          [
            shortcuts.paramIndentShortcut,
            (e) => runParamShortcut(indentSelectedParams, e),
          ],
        ]),
    ...(unindentShortcutIsTab
      ? []
      : [
          [
            shortcuts.paramUnindentShortcut,
            (e) => runParamShortcut(unindentSelectedParams, e),
          ],
        ]),
    [
      shortcuts.paramMoveUpShortcut,
      (e) => runParamShortcut(moveSelectedParamsUp, e),
      null,
      true,
    ],
    [
      shortcuts.paramMoveDownShortcut,
      (e) => runParamShortcut(moveSelectedParamsDown, e),
      null,
      true,
    ],
    [shortcuts.paramSelect, activateParamSelect, deactivateParamSelect],
    [shortcuts.fitViewShortcut, onFitViewHandler],
    [shortcuts.zoomToMouseShortcut, zoomToMouseLocation],
    [shortcuts.deleteSectionShortcut, deleteEdgesOrSections],
    [
      shortcuts.selectTopLevelNonGroupSections,
      setTopLevelNonGroupSectionsAsActive,
    ],
    [shortcuts.selectAll, selectAll],
    [shortcuts.showVersionsTabShortcut, showVersionsTab],
    [shortcuts.showParamUITypeTabShortcut, showParamUITypeTab],
    [shortcuts.showProjectOverviewTabShortcut, showProjectOverviewTab],
    [shortcuts.zoomInShortcut, zoomIn, null, true],
    [shortcuts.zoomOutShortcut, zoomOut, null, true],
    [shortcuts.restartLanguageServerShortcut, restartLanguageServer],
    [
      shortcuts.selectionKeyCode,
      activateSelectionKeyPressed,
      deactivateSelectionKeyPressed,
    ],
    [
      shortcuts.multiSelectionKeyCode,
      activateMultiSelectionPressed,
      deactivateMultiSelectionPressed,
    ],
    [shortcuts.panActivationKeyCode, activatePanMode, deactivatePanMode],
    [shortcuts.zoomActivationKeyCode, activateZoomMode, deactivateZoomMode],
    [
      shortcuts.moveSectionKeyCode,
      activateMoveSectionMode,
      deactivateMoveSectionMode,
    ],
    [shortcuts.movingFreeShortcut, activateDndMovingFreeMode, deactivateDnd],
    [shortcuts.sortingShortcut, activateDndSortingMode, deactivateDnd],
    ["Escape", onEscapeKey],
  ];

  const cleanup_functions = [];
  const shortcutInfo = [];
  const _isMacOs = isMacOs();
  for (const [
    keyCombo,
    keyDownAction,
    keyUpAction,
    allowRepeat,
    nameForExtraProcessing,
  ] of conditionAndAction) {
    if (!keyCombo) {
      continue;
    }

    const lowercaseKeyCombo = keyCombo.toLowerCase();
    const parsedShortcut = parseShortcut(lowercaseKeyCombo);
    const info = {
      parsedShortcut,
      wasPressed: false,
      shouldPreventDefault: getShouldPreventDefault(parsedShortcut),
      keyDownAction,
      keyUpAction,
      allowRepeat,
      ignoreWhenInInputField: getIgnoreWhenInInputField(
        parsedShortcut,
        _isMacOs,
      ),
    };
    shortcutInfo.push(info);
    if (shortcutsNeededForExtraProcessing[nameForExtraProcessing]) {
      shortcutsNeededForExtraProcessing[nameForExtraProcessing] = info;
    }
  }

  addKeepKeyDownConditions(shortcutsNeededForExtraProcessing, _isMacOs);

  let cleanup = attachKeyDownListener((e) =>
    handleShortcutKeyDownEvent(e, shortcutInfo, _isMacOs),
  );
  cleanup_functions.push(cleanup);

  cleanup = attachKeyUpListener((e) => {
    if (_isMacOs && e.key === "Meta") {
      // special case because on mac, meta key causes the other pressed keys to not trigger keyup
      resetKeysPressed();
    } else {
      const eventCode = getNormalizedEventCode(e);
      if (eventCode) {
        deleteKeyPressed(eventCode);
      }
    }
    keyUpLoop(e, shortcutInfo);
  });
  cleanup_functions.push(cleanup);

  cleanup = attachEventListenerAndReturnCleanup(window, "blur", (e) => {
    resetKeysPressed();
    keyUpLoop(e, shortcutInfo);
  });
  cleanup_functions.push(cleanup);

  if (_isMacOs) {
    cleanup = specialModTabCase(shortcutInfo);
    if (cleanup) {
      cleanup_functions.push(cleanup);
    }
  }

  return () => {
    cleanup_functions.forEach((x) => x());
  };
}

// When you do mod + tab in macos, but change your mind and don't change programs
// neither blur nor keyup get triggered. So shortcuts that consist of just "mod"
// never call their keyup action.
// The workaround here is to detect mouse movement
// (something the user will almost certainly do if they don't press any keys),
// and if metaKey is false, then call the keyup actions if necessary.
// If the user doesn't move the mouse, then they'll probably press a key, in which case
// the keyup action will be called in the keydown listener (since wasPressed is true).
function specialModTabCase(shortcutInfo) {
  const modShortcuts = shortcutInfo.filter((x) => x.parsedShortcut.mod);
  if (modShortcuts.length > 0) {
    const cleanup = attachEventListenerAndReturnCleanup(
      window,
      "mousemove",
      (e) => {
        if (aModShortcutWasPressed && !e.metaKey) {
          modShortcuts.forEach((x) => {
            if (x.wasPressed) {
              x.keyUpAction?.(e);
              x.wasPressed = false;
            }
          });
          aModShortcutWasPressed = false;
        }
      },
    );
    return cleanup;
  }
}

function getEventSectionNode(event: KeyboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return target?.closest(".react-flow__node");
}

function getDocumentActiveElement() {
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

function isRootDocumentElement(element: HTMLElement | null) {
  return (
    !element ||
    element === document.body ||
    element === document.documentElement
  );
}

function blurDocumentActiveElement() {
  const activeElement = getDocumentActiveElement();
  if (!isRootDocumentElement(activeElement)) {
    activeElement.blur();
  }
}

function ensureDocumentFallbackFocus() {
  if (isRootDocumentElement(getDocumentActiveElement())) {
    return;
  }
  document.body.focus({ preventScroll: true });
  if (isRootDocumentElement(getDocumentActiveElement())) {
    return;
  }
  document.documentElement.focus({ preventScroll: true });
}

function clearActiveSectionSelectionIfNeeded(sectionNode: Element) {
  const sectionId = sectionNode.getAttribute("data-id");
  if (!sectionId || !getActiveSectionUIIds().includes(sectionId)) {
    return;
  }
  clearActiveSectionIds();
  blurDocumentActiveElement();
  ensureDocumentFallbackFocus();
}

function onEscapeKey(event: KeyboardEvent) {
  removeFrozenFloatingBox();
  const sectionNode = getEventSectionNode(event);
  if (getIsInput(event) && !sectionNode) {
    return;
  }
  if (unselectAllParams() || !sectionNode) {
    return;
  }
  clearActiveSectionSelectionIfNeeded(sectionNode);
}

function handleTabKeyDown(event: KeyboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest("[data-tab-native]")) {
    return;
  }
  if (activeSectionHasSelectedParams()) {
    const action = resolveTabParamAction(event);
    if (action === "indent") {
      indentSelectedParams();
      event.preventDefault();
      return;
    }
    if (action === "unindent") {
      unindentSelectedParams();
      event.preventDefault();
      return;
    }
  }

  const didHandle = handleTabNavigation(event);
  if (didHandle) {
    event.preventDefault();
  }
}

function resolveTabParamAction(event: KeyboardEvent) {
  const shortcuts = useSettings.getState().shortcuts;
  const indentTab = getTabShortcutInfo(shortcuts.paramIndentShortcut);
  const unindentTab = getTabShortcutInfo(shortcuts.paramUnindentShortcut);
  if (event.shiftKey) {
    if (unindentTab?.shift) {
      return "unindent";
    }
    if (indentTab?.shift) {
      return "indent";
    }
    return null;
  }
  if (indentTab && !indentTab.shift) {
    return "indent";
  }
  if (unindentTab && !unindentTab.shift) {
    return "unindent";
  }
  return null;
}

function activeSectionHasSelectedParams(): boolean {
  const state = useProjectState.getState();
  const activeId = getActiveSectionUIIds()[0];
  if (!activeId) {
    return false;
  }
  const impl = getCurrEffectiveSectionImpl(state, activeId);
  return isBaseSectionWithParamsImpl(impl) && impl.selectedParams.length > 0;
}

function activateSelectionKeyPressed() {
  useReactFlow.setState({ selectionKeyPressed: true });
}

function deactivateSelectionKeyPressed() {
  useReactFlow.setState({ selectionKeyPressed: false });
}

function activateMultiSelectionPressed() {
  useReactFlow.setState({ multiSelectionActive: true });
}

function deactivateMultiSelectionPressed() {
  useReactFlow.setState({ multiSelectionActive: false });
}

function activatePanMode() {
  useReactFlow.setState({ panActivationKeyPressed: true });
}

function deactivatePanMode() {
  useReactFlow.setState({ panActivationKeyPressed: false });
}

function activateZoomMode() {
  useReactFlow.setState({ zoomActivationKeyPressed: true });
}

function deactivateZoomMode() {
  useReactFlow.setState({ zoomActivationKeyPressed: false });
}

function activateMoveSectionMode() {
  useReactFlow.setState({ moveSectionActivationKeyPressed: true });
}

function deactivateMoveSectionMode() {
  useReactFlow.setState({ moveSectionActivationKeyPressed: false });
}
