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
} from "components/Utils/FloatingBox";

import {
  activateDndMovingFreeMode,
  activateDndSortingMode,
  deactivateDnd,
} from "forks/dnd-kit/dndState";

import { zoomToMouseLocation } from "gpuFlow/mouseLocation";

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

import { useLocalStorage, useSettings } from "state/definitions";

import { focusAdjacentTopLevelSection, focusScope } from "utils/focusManager";

import { isMacOs } from "utils/utils";

import {
  selectAll,
  setTopLevelNonGroupSectionsAsActive,
} from "../activeSections";

import { copy, paste } from "../copyPaste";

import { formatActiveCodeSection } from "../formatCode";

import { restartLanguageServer } from "../lsp";

import {
  openFileMenuLoadProjectConfigModal,
  openFileMenuSaveProjectConfigAsModal,
} from "../modal";

import { saveProject } from "../project/saveProject";

import { runEntryCodeBlock } from "../runOrImportCode";

import { groupActiveSections, ungroupActiveGroups } from "../sectionInfos";

import {
  addCallableSectionInEmptySpace,
  addGroupInEmptySpace,
  addTerminalInEmptySpace,
} from "../sections/createSections";

import {
  focusOnAdvancedSearch,
  focusOnCommandPalette,
  focusOnSearch,
} from "../sections/sectionParamFilter";

import { redoProjectState, undoProjectState } from "../undo";

import {
  addKeyPressed,
  attachEventListenerAndReturnCleanup,
  attachKeyDownListener,
  attachKeyUpListener,
  clearStaleKeys,
  deleteEdgesOrSections,
  deleteKeyPressed,
  fitGpuViewportShortcut,
  getIgnoreWhenInInputField,
  getIsInput,
  getNormalizedEventCode,
  getShouldPreventDefault,
  isShortcutPressed,
  isTabLikeShortcut,
  modifierKeyCodes,
  parseShortcut,
  resetGpuViewportZoom,
  resetKeysPressed,
  runParamShortcut,
  zoomInViewportShortcut,
  zoomOutViewportShortcut,
} from "./shortcutParsing";

import {
  activateMoveSectionMode,
  activateMultiSelectionPressed,
  activatePanMode,
  activateSelectionKeyPressed,
  activateZoomMode,
  deactivateMoveSectionMode,
  deactivateMultiSelectionPressed,
  deactivatePanMode,
  deactivateSelectionKeyPressed,
  deactivateZoomMode,
  handleTabKeyDown,
  onEscapeKey,
} from "./tabAndModeActions";

let aModShortcutWasPressed = false;

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
    [shortcuts.resetZoomShortcut, resetGpuViewportZoom],
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
    [shortcuts.fitViewShortcut, fitGpuViewportShortcut],
    [shortcuts.zoomToMouseShortcut, zoomToProjectMouseLocation],
    [shortcuts.deleteSectionShortcut, deleteEdgesOrSections],
    [
      shortcuts.selectTopLevelNonGroupSections,
      setTopLevelNonGroupSectionsAsActive,
    ],
    [shortcuts.selectAll, selectAll],
    [shortcuts.showVersionsTabShortcut, showVersionsTab],
    [shortcuts.showParamUITypeTabShortcut, showParamUITypeTab],
    [shortcuts.showProjectOverviewTabShortcut, showProjectOverviewTab],
    [shortcuts.zoomInShortcut, zoomInViewportShortcut, null, true],
    [shortcuts.zoomOutShortcut, zoomOutViewportShortcut, null, true],
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

function zoomToProjectMouseLocation() {
  return zoomToMouseLocation({
    overviewWidth: useLocalStorage.getState().overviewTrueWidth,
    zoom: useSettings.getState().gui.defaultZoomLevel,
  });
}
