import {
  showParamUITypeTab,
  showProjectOverviewTab,
  showVersionsTab,
} from "components/Panes/paneFns";
import { onFitViewHandler } from "forks/xyflow/core/store/utils";
import { useSettings } from "state/stores/uiPreferenceStores";
import { focusAdjacentTopLevelSection, focusScope } from "utils/focusManager";
import { isMacOs } from "utils/utils";
import {
  handleTabKeyDown,
  keyActivationCommands,
  runParamShortcut,
} from "./keyActivationHandlers";
import {
  getIgnoreWhenInInputField,
  getNormalizedEventCode,
  getShouldPreventDefault,
  isShortcutPressed,
  isTabLikeShortcut,
  modifierKeyCodes,
  parseShortcut,
  type ParsedShortcut,
} from "./keyShortcutUtils";

type KeyActionEvent = Event | KeyboardEvent | MouseEvent;

type KeyAction = (event: KeyboardEvent) => void;
type KeyUpAction = (event: KeyActionEvent) => void;

type ShortcutInfo = {
  parsedShortcut: ParsedShortcut;
  wasPressed: boolean;
  shouldPreventDefault: boolean;
  keyDownAction: KeyAction;
  keyUpAction: KeyUpAction | null;
  allowRepeat: boolean;
  ignoreWhenInInputField: boolean;
  keepKeyDownCondition?: (event: KeyActionEvent) => boolean;
};

let keysPressed = new Set<string>();
let keysPressedTimeStamps = new Map<string, number>();
let aModShortcutWasPressed = false;

function resetKeysPressed() {
  keysPressed = new Set<string>();
  keysPressedTimeStamps = new Map<string, number>();
}

function deleteKeyPressed(key: string) {
  keysPressed.delete(key);
  keysPressedTimeStamps.delete(key);
}

function addKeyPressed(key: string) {
  keysPressed.add(key);
  keysPressedTimeStamps.set(key, Date.now());
}

function clearStaleKeys() {
  const now = Date.now();
  for (const [key, timestamp] of keysPressedTimeStamps) {
    if (now - timestamp > 100) {
      deleteKeyPressed(key);
    }
  }
}

function attachEventListenerAndReturnCleanup(
  attachTo: Document | Window,
  eventName: string,
  action: EventListener,
) {
  attachTo.addEventListener(eventName, action);
  return () => {
    attachTo.removeEventListener(eventName, action);
  };
}

function attachKeyDownListener(action: (event: KeyboardEvent) => void) {
  return attachEventListenerAndReturnCleanup(document, "keydown", action);
}

function attachKeyUpListener(action: (event: KeyboardEvent) => void) {
  return attachEventListenerAndReturnCleanup(document, "keyup", action);
}

function keyUpLoop(event: KeyActionEvent, shortcutInfo: Array<ShortcutInfo>) {
  for (const info of shortcutInfo) {
    if (info.wasPressed && !info.keepKeyDownCondition?.(event)) {
      info.wasPressed = false;
      info.keyUpAction?.(event);
    }
  }
}

function addKeepKeyDownConditions(
  shortcutInfoByName: Record<string, ShortcutInfo | undefined>,
  isMacOsHost: boolean,
) {
  const showTooltipShortcut = shortcutInfoByName.showTooltipShortcut;
  const incrementTooltipPageShortcut =
    shortcutInfoByName.incrementTooltipPageShortcut;
  const decrementTooltipPageShortcut =
    shortcutInfoByName.decrementTooltipPageShortcut;
  const copyTooltipTextShortcut = shortcutInfoByName.copyTooltipTextShortcut;

  if (
    !showTooltipShortcut ||
    !incrementTooltipPageShortcut ||
    !decrementTooltipPageShortcut ||
    !copyTooltipTextShortcut
  ) {
    return;
  }

  showTooltipShortcut.keepKeyDownCondition = (event) =>
    event instanceof KeyboardEvent &&
    (isShortcutPressed(
      event,
      showTooltipShortcut.parsedShortcut,
      isMacOsHost,
      keysPressed,
    ) ||
      isShortcutPressed(
        event,
        incrementTooltipPageShortcut.parsedShortcut,
        isMacOsHost,
        keysPressed,
      ) ||
      isShortcutPressed(
        event,
        decrementTooltipPageShortcut.parsedShortcut,
        isMacOsHost,
        keysPressed,
      ) ||
      isShortcutPressed(
        event,
        copyTooltipTextShortcut.parsedShortcut,
        isMacOsHost,
        keysPressed,
      ));
}

export function attachKeyEventListeners() {
  const shortcuts = useSettings.getState().shortcuts;
  const shortcutInfoByName: Record<string, ShortcutInfo | undefined> = {};
  const indentShortcutIsTab = isTabLikeShortcut(shortcuts.paramIndentShortcut);
  const unindentShortcutIsTab = isTabLikeShortcut(
    shortcuts.paramUnindentShortcut,
  );

  function registerTrackedShortcut(
    name: string,
    keyDownAction: KeyAction,
    keyUpAction: KeyUpAction | null = null,
    allowRepeat = false,
  ) {
    return [
      shortcuts[name],
      keyDownAction,
      keyUpAction,
      allowRepeat,
      name,
    ] as const;
  }

  const conditionAndAction = [
    ["tab", handleTabKeyDown, null, false, null],
    ["shift + tab", handleTabKeyDown, null, false, null],
    [
      shortcuts.focusHeaderShortcut,
      () => focusScope("header"),
      null,
      false,
      null,
    ],
    [
      shortcuts.focusOverviewShortcut,
      () => focusScope("overview"),
      null,
      false,
      null,
    ],
    [
      shortcuts.focusCanvasShortcut,
      () => focusScope("canvas"),
      null,
      false,
      null,
    ],
    [
      shortcuts.focusUiEditorShortcut,
      () => focusScope("ui-editor"),
      null,
      false,
      null,
    ],
    [
      shortcuts.nextTopLevelSectionShortcut,
      () => focusAdjacentTopLevelSection({ direction: 1 }),
      null,
      false,
      null,
    ],
    [
      shortcuts.prevTopLevelSectionShortcut,
      () => focusAdjacentTopLevelSection({ direction: -1 }),
      null,
      false,
      null,
    ],
    [
      shortcuts.newCardShortcut,
      keyActivationCommands.addCallableSectionInEmptySpace,
      null,
      false,
      null,
    ],
    [
      shortcuts.newGroupShortcut,
      keyActivationCommands.addGroupInEmptySpace,
      null,
      false,
      null,
    ],
    [
      shortcuts.newTerminalShortcut,
      keyActivationCommands.addTerminalInEmptySpace,
      null,
      false,
      null,
    ],
    registerTrackedShortcut(
      "showTooltipShortcut",
      keyActivationCommands.enableFloatingBox,
      keyActivationCommands.disableFloatingBox,
    ),
    [
      shortcuts.tooltipToPlaintextShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(false),
      null,
      false,
      null,
    ],
    [
      shortcuts.tooltipToMarkdownShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(true),
      null,
      false,
      null,
    ],
    [
      shortcuts.freezeTooltipShortcut,
      keyActivationCommands.freezeFloatingBox,
      null,
      false,
      null,
    ],
    [
      shortcuts.frozenTooltipToPlaintextShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(false),
      null,
      false,
      null,
    ],
    [
      shortcuts.frozenTooltipToMarkdownShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(true),
      null,
      false,
      null,
    ],
    registerTrackedShortcut(
      "incrementTooltipPageShortcut",
      keyActivationCommands.incrementFloatingBoxIdx,
    ),
    registerTrackedShortcut(
      "decrementTooltipPageShortcut",
      keyActivationCommands.decrementFloatingBoxIdx,
    ),
    registerTrackedShortcut(
      "copyTooltipTextShortcut",
      keyActivationCommands.copyFloatingBoxContent,
    ),
    [
      shortcuts.frozenTooltipIncrementShortcut,
      keyActivationCommands.incrementFrozenFloatingBoxIdx,
      null,
      false,
      null,
    ],
    [
      shortcuts.frozenTooltipDecrementShortcut,
      keyActivationCommands.decrementFrozenFloatingBoxIdx,
      null,
      false,
      null,
    ],
    [
      shortcuts.frozenTooltipCopyShortcut,
      keyActivationCommands.copyFrozenFloatingBoxContent,
      null,
      false,
      null,
    ],
    [
      shortcuts.undoShortcut,
      keyActivationCommands.undoProjectState,
      null,
      true,
      null,
    ],
    [
      shortcuts.redoShortcut,
      keyActivationCommands.redoProjectState,
      null,
      true,
      null,
    ],
    [
      shortcuts.groupShortcut,
      keyActivationCommands.groupActiveSections,
      null,
      false,
      null,
    ],
    [
      shortcuts.ungroupShortcut,
      keyActivationCommands.ungroupActiveGroups,
      null,
      false,
      null,
    ],
    [
      shortcuts.saveShortcut,
      keyActivationCommands.saveProject,
      null,
      false,
      null,
    ],
    [
      shortcuts.loadShortcut,
      keyActivationCommands.openFileMenuLoadProjectConfigModal,
      null,
      false,
      null,
    ],
    [
      shortcuts.saveAsShortcut,
      keyActivationCommands.openFileMenuSaveProjectConfigAsModal,
      null,
      false,
      null,
    ],
    [
      shortcuts.searchShortcut,
      keyActivationCommands.focusOnSearch,
      null,
      false,
      null,
    ],
    [
      shortcuts.advancedSearchShortcut,
      keyActivationCommands.focusOnAdvancedSearch,
      null,
      false,
      null,
    ],
    [
      shortcuts.commandPaletteShortcut,
      keyActivationCommands.focusOnCommandPalette,
      null,
      false,
      null,
    ],
    [
      shortcuts.resetZoomShortcut,
      keyActivationCommands.resetZoom,
      null,
      false,
      null,
    ],
    [shortcuts.copyShortcut, keyActivationCommands.copy, null, false, null],
    [shortcuts.pasteShortcut, keyActivationCommands.paste, null, false, null],
    [
      shortcuts.pasteAsRefShortcut,
      () => keyActivationCommands.paste({ asRef: true }),
      null,
      false,
      null,
    ],
    [
      shortcuts.runEntryCodeBlockShortcut,
      keyActivationCommands.runEntryCodeBlock,
      null,
      false,
      null,
    ],
    [
      shortcuts.formatCode,
      keyActivationCommands.formatActiveCodeSection,
      null,
      false,
      null,
    ],
    ...(indentShortcutIsTab
      ? []
      : [
          [
            shortcuts.paramIndentShortcut,
            (event: KeyboardEvent) =>
              runParamShortcut(
                keyActivationCommands.indentSelectedParams,
                event,
              ),
            null,
            false,
            null,
          ] as const,
        ]),
    ...(unindentShortcutIsTab
      ? []
      : [
          [
            shortcuts.paramUnindentShortcut,
            (event: KeyboardEvent) =>
              runParamShortcut(
                keyActivationCommands.unindentSelectedParams,
                event,
              ),
            null,
            false,
            null,
          ] as const,
        ]),
    [
      shortcuts.paramMoveUpShortcut,
      (event: KeyboardEvent) =>
        runParamShortcut(keyActivationCommands.moveSelectedParamsUp, event),
      null,
      true,
      null,
    ],
    [
      shortcuts.paramMoveDownShortcut,
      (event: KeyboardEvent) =>
        runParamShortcut(keyActivationCommands.moveSelectedParamsDown, event),
      null,
      true,
      null,
    ],
    [
      shortcuts.paramSelect,
      keyActivationCommands.activateParamSelect,
      keyActivationCommands.deactivateParamSelect,
      false,
      null,
    ],
    [shortcuts.fitViewShortcut, onFitViewHandler, null, false, null],
    [
      shortcuts.zoomToMouseShortcut,
      keyActivationCommands.zoomToMouseLocation,
      null,
      false,
      null,
    ],
    [
      shortcuts.deleteSectionShortcut,
      keyActivationCommands.deleteEdgesOrSections,
      null,
      false,
      null,
    ],
    [
      shortcuts.selectTopLevelNonGroupSections,
      keyActivationCommands.setTopLevelNonGroupSectionsAsActive,
      null,
      false,
      null,
    ],
    [shortcuts.selectAll, keyActivationCommands.selectAll, null, false, null],
    [shortcuts.showVersionsTabShortcut, showVersionsTab, null, false, null],
    [
      shortcuts.showParamUITypeTabShortcut,
      showParamUITypeTab,
      null,
      false,
      null,
    ],
    [
      shortcuts.showProjectOverviewTabShortcut,
      showProjectOverviewTab,
      null,
      false,
      null,
    ],
    [shortcuts.zoomInShortcut, keyActivationCommands.zoomIn, null, true, null],
    [
      shortcuts.zoomOutShortcut,
      keyActivationCommands.zoomOut,
      null,
      true,
      null,
    ],
    [
      shortcuts.restartLanguageServerShortcut,
      keyActivationCommands.restartLanguageServer,
      null,
      false,
      null,
    ],
    [
      shortcuts.selectionKeyCode,
      keyActivationCommands.activateSelectionKeyPressed,
      keyActivationCommands.deactivateSelectionKeyPressed,
      false,
      null,
    ],
    [
      shortcuts.multiSelectionKeyCode,
      keyActivationCommands.activateMultiSelectionPressed,
      keyActivationCommands.deactivateMultiSelectionPressed,
      false,
      null,
    ],
    [
      shortcuts.panActivationKeyCode,
      keyActivationCommands.activatePanMode,
      keyActivationCommands.deactivatePanMode,
      false,
      null,
    ],
    [
      shortcuts.zoomActivationKeyCode,
      keyActivationCommands.activateZoomMode,
      keyActivationCommands.deactivateZoomMode,
      false,
      null,
    ],
    [
      shortcuts.moveSectionKeyCode,
      keyActivationCommands.activateMoveSectionMode,
      keyActivationCommands.deactivateMoveSectionMode,
      false,
      null,
    ],
    [
      shortcuts.movingFreeShortcut,
      keyActivationCommands.activateDndMovingFreeMode,
      keyActivationCommands.deactivateDnd,
      false,
      null,
    ],
    [
      shortcuts.sortingShortcut,
      keyActivationCommands.activateDndSortingMode,
      keyActivationCommands.deactivateDnd,
      false,
      null,
    ],
    ["Escape", keyActivationCommands.onEscapeKey, null, false, null],
  ] as const;

  const cleanupFunctions: Array<() => void> = [];
  const shortcutInfo: Array<ShortcutInfo> = [];
  const isMacOsHost = isMacOs();

  for (const [
    keyCombo,
    keyDownAction,
    keyUpAction,
    allowRepeat,
    nameForTracking,
  ] of conditionAndAction) {
    if (!keyCombo) {
      continue;
    }

    const parsedShortcut = parseShortcut(keyCombo.toLowerCase());
    const info: ShortcutInfo = {
      parsedShortcut,
      wasPressed: false,
      shouldPreventDefault: getShouldPreventDefault(parsedShortcut),
      keyDownAction,
      keyUpAction,
      allowRepeat,
      ignoreWhenInInputField: getIgnoreWhenInInputField(
        parsedShortcut,
        isMacOsHost,
      ),
    };
    shortcutInfo.push(info);
    if (nameForTracking) {
      shortcutInfoByName[nameForTracking] = info;
    }
  }

  addKeepKeyDownConditions(shortcutInfoByName, isMacOsHost);

  let cleanup = attachKeyDownListener((event) => {
    if (aModShortcutWasPressed) {
      clearStaleKeys();
    }
    aModShortcutWasPressed = false;

    const eventCode = getNormalizedEventCode(event);
    if (eventCode && !modifierKeyCodes.has(eventCode)) {
      addKeyPressed(eventCode);
    }

    const isInput = Boolean(
      event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target as HTMLElement | null)?.isContentEditable,
    );

    for (const info of shortcutInfo) {
      if (
        isShortcutPressed(event, info.parsedShortcut, isMacOsHost, keysPressed)
      ) {
        if (info.ignoreWhenInInputField && isInput) {
          continue;
        }
        if (info.shouldPreventDefault) {
          event.preventDefault();
        }
        if (event.repeat && !info.allowRepeat) {
          continue;
        }
        info.keyDownAction(event);
        info.wasPressed = true;
        if (info.parsedShortcut.mod) {
          aModShortcutWasPressed = true;
        }
      } else if (info.wasPressed && !info.keepKeyDownCondition?.(event)) {
        info.keyUpAction?.(event);
        info.wasPressed = false;
      }
    }
  });
  cleanupFunctions.push(cleanup);

  cleanup = attachKeyUpListener((event) => {
    if (isMacOsHost && event.key === "Meta") {
      resetKeysPressed();
    } else {
      const eventCode = getNormalizedEventCode(event);
      if (eventCode) {
        deleteKeyPressed(eventCode);
      }
    }
    keyUpLoop(event, shortcutInfo);
  });
  cleanupFunctions.push(cleanup);

  cleanup = attachEventListenerAndReturnCleanup(window, "blur", (event) => {
    resetKeysPressed();
    keyUpLoop(event, shortcutInfo);
  });
  cleanupFunctions.push(cleanup);

  if (isMacOsHost) {
    cleanup = specialModTabCase(shortcutInfo);
    if (cleanup) {
      cleanupFunctions.push(cleanup);
    }
  }

  return () => {
    cleanupFunctions.forEach((cleanupFn) => cleanupFn());
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
function specialModTabCase(shortcutInfo: Array<ShortcutInfo>) {
  const modShortcuts = shortcutInfo.filter((info) => info.parsedShortcut.mod);
  if (modShortcuts.length === 0) {
    return null;
  }

  return attachEventListenerAndReturnCleanup(window, "mousemove", (event) => {
    if (!(event instanceof MouseEvent)) {
      return;
    }
    if (aModShortcutWasPressed && !event.metaKey) {
      modShortcuts.forEach((info) => {
        if (info.wasPressed) {
          info.keyUpAction?.(event);
          info.wasPressed = false;
        }
      });
      aModShortcutWasPressed = false;
    }
  });
}
