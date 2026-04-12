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

function getNormalizedEventCode(event: KeyboardEvent): string | null {
  if (event.code && event.code !== "Unidentified") {
    return event.code;
  }

  const key = event.key;
  if (!key) {
    return null;
  }

  if (key === " ") {
    return "Space";
  }
  if (key === "Shift") {
    return "ShiftLeft";
  }
  if (key === "Control") {
    return "ControlLeft";
  }
  if (key === "Alt") {
    return "AltLeft";
  }
  if (key === "Meta") {
    return "MetaLeft";
  }

  const lowerKey = key.toLowerCase();
  const special =
    specialEventKeyToEventCode[lowerKey] ?? specialEventKeyToEventCode[key];
  if (special) {
    return special;
  }

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
function parseShortcut(shortcutString) {
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

function keysMatch(keys, targetKeyList) {
  return _.isEqual(keys, new Set(targetKeyList));
}

function isModOrCtrlPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return (ctrl || mod) && !shift && !alt && keysMatch(keys, targetKeyList);
}

function isModOrCtrlShiftPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return (ctrl || mod) && shift && !alt && keysMatch(keys, targetKeyList);
}

function isCtrlPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return ctrl && !mod && !shift && !alt && keysMatch(keys, targetKeyList);
}

function isModPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return mod && !ctrl && !shift && !alt && keysMatch(keys, targetKeyList);
}

function isModShiftPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return mod && shift && !ctrl && !alt && keysMatch(keys, targetKeyList);
}

function isOptionPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return alt && !shift && !ctrl && !mod && keysMatch(keys, targetKeyList);
}

function isOptionShiftPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return alt && shift && !ctrl && !mod && keysMatch(keys, targetKeyList);
}

function isShiftPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return shift && !alt && !ctrl && !mod && keysMatch(keys, targetKeyList);
}

function isModCtrlPlus(parsedShortcut, targetKeyList) {
  const { mod, ctrl, shift, alt, keys } = parsedShortcut;
  return mod && ctrl && !alt && !shift && keysMatch(keys, targetKeyList);
}

function getShouldPreventDefault(parsedShortcut) {
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

  // special shortcuts
  if (
    isModOrCtrlPlus(parsedShortcut, ["KeyC"]) ||
    isModOrCtrlPlus(parsedShortcut, "KeyV")
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

function getMacosIgnoreWhenInInputField(parsedShortcut) {
  const { mod, shift, ctrl, alt } = parsedShortcut;
  return (
    (!mod && !shift && !ctrl && !alt) ||
    isShiftPlus(parsedShortcut, []) ||
    isModPlus(parsedShortcut, []) ||
    isModPlus(parsedShortcut, ["KeyC"]) || // Copy selected text.
    isModPlus(parsedShortcut, ["KeyV"]) || // Paste text from the clipboard.
    isModPlus(parsedShortcut, ["KeyX"]) || // Cut selected text.
    isModPlus(parsedShortcut, ["KeyZ"]) || // Undo the last action.
    isModShiftPlus(parsedShortcut, ["KeyZ"]) || // Redo the last undone action.
    isModPlus(parsedShortcut, ["KeyA"]) || // Select all text in the field.
    isModPlus(parsedShortcut, ["ArrowLeft"]) || // Move cursor to the beginning of the line.
    isModPlus(parsedShortcut, ["ArrowRight"]) || // Move cursor to the end of the line.
    isOptionPlus(parsedShortcut, ["ArrowLeft"]) || // Move cursor to the previous word.
    isOptionPlus(parsedShortcut, ["ArrowRight"]) || // Move cursor to the next word.
    isShiftPlus(parsedShortcut, ["ArrowLeft"]) || // Extend selection one character to the left.
    isShiftPlus(parsedShortcut, ["ArrowRight"]) || // Extend selection one character to the right.
    isShiftPlus(parsedShortcut, ["ArrowUp"]) || // Extend selection one line up.
    isShiftPlus(parsedShortcut, ["ArrowDown"]) || // Extend selection one line down.
    isOptionShiftPlus(parsedShortcut, ["ArrowLeft"]) || // Extend selection to the previous word.
    isOptionShiftPlus(parsedShortcut, ["ArrowRight"]) || // Extend selection to the next word.
    isModShiftPlus(parsedShortcut, ["ArrowLeft"]) || // Extend selection to the beginning of the line.
    isModShiftPlus(parsedShortcut, ["ArrowRight"]) || // Extend selection to the end of the line.
    isOptionPlus(parsedShortcut, ["Backspace"]) || // Delete the word to the left of the cursor.
    isModPlus(parsedShortcut, ["Backspace"]) || // Delete from the cursor to the beginning of the line.
    isCtrlPlus(parsedShortcut, ["KeyA"]) || // Move cursor to the beginning of the line.
    isCtrlPlus(parsedShortcut, ["KeyE"]) || // Move cursor to the end of the line.
    isCtrlPlus(parsedShortcut, ["KeyF"]) || // Move cursor forward one character.
    isCtrlPlus(parsedShortcut, ["KeyB"]) || // Move cursor backward one character.
    isCtrlPlus(parsedShortcut, ["KeyN"]) || // Move cursor down one line.
    isCtrlPlus(parsedShortcut, ["KeyP"]) || // Move cursor up one line.
    isCtrlPlus(parsedShortcut, ["KeyD"]) || // Delete the character ahead of the cursor.
    isCtrlPlus(parsedShortcut, ["KeyH"]) || // Delete the character behind the cursor.
    isCtrlPlus(parsedShortcut, ["KeyT"]) || // Transpose the characters on either side of the cursor.
    isModCtrlPlus(parsedShortcut, ["Space"]) || // Open the Emoji & Symbols palette.
    isModShiftPlus(parsedShortcut, ["KeyV"]) || // Paste and match style (paste without formatting).
    isModPlus(parsedShortcut, ["ArrowUp"]) || // Move cursor to document start
    isModPlus(parsedShortcut, ["ArrowDown"]) || // Move cursor to document end
    isModShiftPlus(parsedShortcut, ["ArrowUp"]) || // Extend selection to document start
    isModShiftPlus(parsedShortcut, ["ArrowDown"]) || // Extend selection to document end
    isModPlus(parsedShortcut, ["KeyY"]) || // Redo (alternative to Cmd+Shift+Z)
    isModPlus(parsedShortcut, ["KeyB"]) || // Bold text
    isModPlus(parsedShortcut, ["KeyI"]) // Italic text
  );
}

function getWindowsIgnoreWhenInInputField(parsedShortcut) {
  const { mod, shift, ctrl, alt } = parsedShortcut;
  return (
    (!mod && !shift && !ctrl && !alt) ||
    isShiftPlus(parsedShortcut, []) ||
    isModPlus(parsedShortcut, []) ||
    isModOrCtrlPlus(parsedShortcut, ["KeyA"]) || // Select all text
    isModOrCtrlPlus(parsedShortcut, ["KeyC"]) || // Copy selected text
    isModOrCtrlPlus(parsedShortcut, ["KeyV"]) || // Paste text from the clipboard
    isModOrCtrlPlus(parsedShortcut, ["KeyX"]) || // Cut selected text
    isModOrCtrlPlus(parsedShortcut, ["KeyZ"]) || // Undo the last action
    isModOrCtrlPlus(parsedShortcut, ["KeyY"]) || // Redo the last undone action
    isModOrCtrlPlus(parsedShortcut, ["ArrowLeft"]) || // Move the cursor to the beginning of the previous word
    isModOrCtrlPlus(parsedShortcut, ["ArrowRight"]) || // Move the cursor to the beginning of the next word
    isShiftPlus(parsedShortcut, ["ArrowLeft"]) || // Extend selection one character to the left
    isShiftPlus(parsedShortcut, ["ArrowRight"]) || // Extend selection one character to the right
    isModOrCtrlShiftPlus(parsedShortcut, ["ArrowLeft"]) || // Extend selection to include the previous word
    isModOrCtrlShiftPlus(parsedShortcut, ["ArrowRight"]) || // Extend selection to include the next word
    isModOrCtrlPlus(parsedShortcut, ["ArrowUp"]) || // Move cursor to beginning of paragraph/section
    isModOrCtrlPlus(parsedShortcut, ["ArrowDown"]) || // Move cursor to end of paragraph/section
    isModOrCtrlShiftPlus(parsedShortcut, ["ArrowUp"]) || // Extend selection to beginning of paragraph
    isModOrCtrlShiftPlus(parsedShortcut, ["ArrowDown"]) || // Extend selection to end of paragraph
    isShiftPlus(parsedShortcut, ["ArrowUp"]) || // Extend selection one line up
    isShiftPlus(parsedShortcut, ["ArrowDown"]) || // Extend selection one line down
    isOptionPlus(parsedShortcut, ["ArrowLeft"]) || // Move cursor one word left (alternative to Ctrl+Left)
    isOptionPlus(parsedShortcut, ["ArrowRight"]) || // Move cursor one word right (alternative to Ctrl+Right)
    isModOrCtrlPlus(parsedShortcut, ["KeyK"]) || // Create/follow link (in rich text editors)
    isShiftPlus(parsedShortcut, ["Home"]) || // Select text from the cursor to the beginning of the line
    isShiftPlus(parsedShortcut, ["End"]) || // Select text from the cursor to the end of the line
    isModOrCtrlPlus(parsedShortcut, ["Home"]) || // Move the cursor to the beginning of the text field
    isModOrCtrlPlus(parsedShortcut, ["End"]) || // Move the cursor to the end of the text field
    isModOrCtrlShiftPlus(parsedShortcut, ["Home"]) || // Select text from the cursor to the beginning of the text field
    isModOrCtrlShiftPlus(parsedShortcut, ["End"]) || // Select text from the cursor to the end of the text field
    isModOrCtrlPlus(parsedShortcut, ["Backspace"]) || // Delete the word before the cursor
    isModOrCtrlPlus(parsedShortcut, ["Delete"]) || // Delete the word after the cursor
    isShiftPlus(parsedShortcut, ["Enter"]) || // Insert a new line without submitting
    isModOrCtrlShiftPlus(parsedShortcut, ["KeyV"]) || // Paste without formatting
    isModOrCtrlPlus(parsedShortcut, ["KeyB"]) || // Bold text (in rich text editors)
    isModOrCtrlPlus(parsedShortcut, ["KeyI"]) || // Italicize text (in rich text editors)
    isModOrCtrlPlus(parsedShortcut, ["KeyU"]) // Underline text (in rich text editors)
  );
}

function getIgnoreWhenInInputField(parsedShortcut, _isMacOs) {
  if (isParsedTabShortcut(parsedShortcut)) {
    return false;
  }
  if (parsedShortcut.keys.has("Escape")) {
    return false;
  }
  return _isMacOs
    ? getMacosIgnoreWhenInInputField(parsedShortcut)
    : getWindowsIgnoreWhenInInputField(parsedShortcut);
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

  let cleanup = attachKeyDownListener((e) => {
    // need to clear keys by timestamp because keyup does not trigger on mac when cmd key is held down
    if (aModShortcutWasPressed) {
      clearStaleKeys();
    }
    aModShortcutWasPressed = false;
    const eventCode = getNormalizedEventCode(e);
    if (eventCode && !modifierKeyCodes.has(eventCode)) {
      addKeyPressed(eventCode);
    }
    const isInput = getIsInput(e);

    for (const x of shortcutInfo) {
      if (isShortcutPressed(e, x.parsedShortcut, _isMacOs)) {
        if (x.ignoreWhenInInputField && isInput) {
          continue;
        }
        if (x.shouldPreventDefault) {
          e.preventDefault();
        }
        if (e.repeat && !x.allowRepeat) {
          continue;
        }
        x.keyDownAction(e);
        x.wasPressed = true;
        if (x.parsedShortcut.mod) {
          aModShortcutWasPressed = true;
        }
      } else if (x.wasPressed && !x.keepKeyDownCondition?.(e)) {
        x.keyUpAction?.(e);
        x.wasPressed = false;
      }
    }
  });
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

function onEscapeKey(event: KeyboardEvent) {
  removeFrozenFloatingBox();
  const target = event.target instanceof HTMLElement ? event.target : null;
  const sectionNode = target?.closest(".react-flow__node");
  if (getIsInput(event) && !sectionNode) {
    return;
  }
  const didUnselectSomeParams = unselectAllParams();
  if (!didUnselectSomeParams && sectionNode) {
    const sectionId = sectionNode.getAttribute("data-id");
    const activeIds = getActiveSectionUIIds();
    if (sectionId && activeIds.includes(sectionId)) {
      clearActiveSectionIds();
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (
        activeElement &&
        activeElement !== document.body &&
        activeElement !== document.documentElement
      ) {
        activeElement.blur();
      }
      const postBlurActive =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (
        postBlurActive &&
        postBlurActive !== document.body &&
        postBlurActive !== document.documentElement
      ) {
        document.body.focus({ preventScroll: true });
        if (
          document.activeElement !== document.body &&
          document.activeElement !== document.documentElement
        ) {
          document.documentElement.focus({ preventScroll: true });
        }
      }
    }
  }
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
