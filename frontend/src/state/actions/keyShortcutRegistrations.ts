import {
  showParamUITypeTab,
  showProjectOverviewTab,
  showVersionsTab,
} from "components/Panes/paneFns";
import { onFitViewHandler } from "forks/xyflow/core/store/utils";
import { focusAdjacentTopLevelSection, focusScope } from "utils/focusManager";
import { type SettingsState } from "utils/generatedTypes";
import {
  handleTabKeyDown,
  keyActivationCommands,
  runParamShortcut,
} from "./keyActivationHandlers";
import { isTabLikeShortcut } from "./keyShortcutUtils";

export type KeyActionEvent = Event | KeyboardEvent | MouseEvent;

export type KeyAction = (event: KeyboardEvent) => void;
export type KeyUpAction = (event: KeyActionEvent) => void;

export type ShortcutTrackingName =
  | "showTooltipShortcut"
  | "incrementTooltipPageShortcut"
  | "decrementTooltipPageShortcut"
  | "copyTooltipTextShortcut";

export type ShortcutRegistration = {
  keyCombo: string | null | undefined;
  keyDownAction: KeyAction;
  keyUpAction: KeyUpAction | null;
  allowRepeat: boolean;
  trackingName: ShortcutTrackingName | null;
};

type SettingsShortcuts = SettingsState["shortcuts"];

function createShortcutRegistration(
  keyCombo: string | null | undefined,
  keyDownAction: KeyAction,
  keyUpAction: KeyUpAction | null = null,
  allowRepeat = false,
): ShortcutRegistration {
  return {
    keyCombo,
    keyDownAction,
    keyUpAction,
    allowRepeat,
    trackingName: null,
  };
}

function createTrackedShortcutRegistration(
  shortcuts: SettingsShortcuts,
  trackingName: ShortcutTrackingName,
  keyDownAction: KeyAction,
  keyUpAction: KeyUpAction | null = null,
  allowRepeat = false,
): ShortcutRegistration {
  return {
    keyCombo: shortcuts[trackingName],
    keyDownAction,
    keyUpAction,
    allowRepeat,
    trackingName,
  };
}

function createParamShortcutRegistration(
  keyCombo: string | null | undefined,
  action: () => boolean | void,
  allowRepeat = false,
): ShortcutRegistration {
  return createShortcutRegistration(
    keyCombo,
    (event: KeyboardEvent) => runParamShortcut(action, event),
    null,
    allowRepeat,
  );
}

function getFocusShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createShortcutRegistration("tab", handleTabKeyDown),
    createShortcutRegistration("shift + tab", handleTabKeyDown),
    createShortcutRegistration(shortcuts.focusHeaderShortcut, () =>
      focusScope("header"),
    ),
    createShortcutRegistration(shortcuts.focusOverviewShortcut, () =>
      focusScope("overview"),
    ),
    createShortcutRegistration(shortcuts.focusCanvasShortcut, () =>
      focusScope("canvas"),
    ),
    createShortcutRegistration(shortcuts.focusUiEditorShortcut, () =>
      focusScope("ui-editor"),
    ),
    createShortcutRegistration(shortcuts.nextTopLevelSectionShortcut, () =>
      focusAdjacentTopLevelSection({ direction: 1 }),
    ),
    createShortcutRegistration(shortcuts.prevTopLevelSectionShortcut, () =>
      focusAdjacentTopLevelSection({ direction: -1 }),
    ),
  ];
}

function getCreationShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createShortcutRegistration(
      shortcuts.newCardShortcut,
      keyActivationCommands.addCallableSectionInEmptySpace,
    ),
    createShortcutRegistration(
      shortcuts.newGroupShortcut,
      keyActivationCommands.addGroupInEmptySpace,
    ),
    createShortcutRegistration(
      shortcuts.newTerminalShortcut,
      keyActivationCommands.addTerminalInEmptySpace,
    ),
  ];
}

function getTooltipShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createTrackedShortcutRegistration(
      shortcuts,
      "showTooltipShortcut",
      keyActivationCommands.enableFloatingBox,
      keyActivationCommands.disableFloatingBox,
    ),
    createShortcutRegistration(
      shortcuts.tooltipToPlaintextShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(false),
    ),
    createShortcutRegistration(
      shortcuts.tooltipToMarkdownShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(true),
    ),
    createShortcutRegistration(
      shortcuts.freezeTooltipShortcut,
      keyActivationCommands.freezeFloatingBox,
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipToPlaintextShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(false),
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipToMarkdownShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(true),
    ),
    createTrackedShortcutRegistration(
      shortcuts,
      "incrementTooltipPageShortcut",
      keyActivationCommands.incrementFloatingBoxIdx,
    ),
    createTrackedShortcutRegistration(
      shortcuts,
      "decrementTooltipPageShortcut",
      keyActivationCommands.decrementFloatingBoxIdx,
    ),
    createTrackedShortcutRegistration(
      shortcuts,
      "copyTooltipTextShortcut",
      keyActivationCommands.copyFloatingBoxContent,
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipIncrementShortcut,
      keyActivationCommands.incrementFrozenFloatingBoxIdx,
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipDecrementShortcut,
      keyActivationCommands.decrementFrozenFloatingBoxIdx,
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipCopyShortcut,
      keyActivationCommands.copyFrozenFloatingBoxContent,
    ),
  ];
}

function getProjectCommandShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createShortcutRegistration(
      shortcuts.undoShortcut,
      keyActivationCommands.undoProjectState,
      null,
      true,
    ),
    createShortcutRegistration(
      shortcuts.redoShortcut,
      keyActivationCommands.redoProjectState,
      null,
      true,
    ),
    createShortcutRegistration(
      shortcuts.groupShortcut,
      keyActivationCommands.groupActiveSections,
    ),
    createShortcutRegistration(
      shortcuts.ungroupShortcut,
      keyActivationCommands.ungroupActiveGroups,
    ),
    createShortcutRegistration(
      shortcuts.saveShortcut,
      keyActivationCommands.saveProject,
    ),
    createShortcutRegistration(
      shortcuts.loadShortcut,
      keyActivationCommands.openFileMenuLoadProjectConfigModal,
    ),
    createShortcutRegistration(
      shortcuts.saveAsShortcut,
      keyActivationCommands.openFileMenuSaveProjectConfigAsModal,
    ),
    createShortcutRegistration(
      shortcuts.searchShortcut,
      keyActivationCommands.focusOnSearch,
    ),
    createShortcutRegistration(
      shortcuts.advancedSearchShortcut,
      keyActivationCommands.focusOnAdvancedSearch,
    ),
    createShortcutRegistration(
      shortcuts.commandPaletteShortcut,
      keyActivationCommands.focusOnCommandPalette,
    ),
    createShortcutRegistration(
      shortcuts.resetZoomShortcut,
      keyActivationCommands.resetZoom,
    ),
    createShortcutRegistration(
      shortcuts.copyShortcut,
      keyActivationCommands.copy,
    ),
    createShortcutRegistration(
      shortcuts.pasteShortcut,
      keyActivationCommands.paste,
    ),
    createShortcutRegistration(shortcuts.pasteAsRefShortcut, () =>
      keyActivationCommands.paste({ asRef: true }),
    ),
    createShortcutRegistration(
      shortcuts.runEntryCodeBlockShortcut,
      keyActivationCommands.runEntryCodeBlock,
    ),
    createShortcutRegistration(
      shortcuts.formatCode,
      keyActivationCommands.formatActiveCodeSection,
    ),
  ];
}

function getParamShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  const registrations: Array<ShortcutRegistration> = [];

  if (!isTabLikeShortcut(shortcuts.paramIndentShortcut)) {
    registrations.push(
      createParamShortcutRegistration(
        shortcuts.paramIndentShortcut,
        keyActivationCommands.indentSelectedParams,
      ),
    );
  }

  if (!isTabLikeShortcut(shortcuts.paramUnindentShortcut)) {
    registrations.push(
      createParamShortcutRegistration(
        shortcuts.paramUnindentShortcut,
        keyActivationCommands.unindentSelectedParams,
      ),
    );
  }

  registrations.push(
    createParamShortcutRegistration(
      shortcuts.paramMoveUpShortcut,
      keyActivationCommands.moveSelectedParamsUp,
      true,
    ),
  );
  registrations.push(
    createParamShortcutRegistration(
      shortcuts.paramMoveDownShortcut,
      keyActivationCommands.moveSelectedParamsDown,
      true,
    ),
  );
  registrations.push(
    createShortcutRegistration(
      shortcuts.paramSelect,
      keyActivationCommands.activateParamSelect,
      keyActivationCommands.deactivateParamSelect,
    ),
  );

  return registrations;
}

function getCanvasAndPaneShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createShortcutRegistration(shortcuts.fitViewShortcut, onFitViewHandler),
    createShortcutRegistration(
      shortcuts.zoomToMouseShortcut,
      keyActivationCommands.zoomToMouseLocation,
    ),
    createShortcutRegistration(
      shortcuts.deleteSectionShortcut,
      keyActivationCommands.deleteEdgesOrSections,
    ),
    createShortcutRegistration(
      shortcuts.selectTopLevelNonGroupSections,
      keyActivationCommands.setTopLevelNonGroupSectionsAsActive,
    ),
    createShortcutRegistration(
      shortcuts.selectAll,
      keyActivationCommands.selectAll,
    ),
    createShortcutRegistration(
      shortcuts.showVersionsTabShortcut,
      showVersionsTab,
    ),
    createShortcutRegistration(
      shortcuts.showParamUITypeTabShortcut,
      showParamUITypeTab,
    ),
    createShortcutRegistration(
      shortcuts.showProjectOverviewTabShortcut,
      showProjectOverviewTab,
    ),
    createShortcutRegistration(
      shortcuts.zoomInShortcut,
      keyActivationCommands.zoomIn,
      null,
      true,
    ),
    createShortcutRegistration(
      shortcuts.zoomOutShortcut,
      keyActivationCommands.zoomOut,
      null,
      true,
    ),
    createShortcutRegistration(
      shortcuts.restartLanguageServerShortcut,
      keyActivationCommands.restartLanguageServer,
    ),
  ];
}

function getInteractionModeShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createShortcutRegistration(
      shortcuts.selectionKeyCode,
      keyActivationCommands.activateSelectionKeyPressed,
      keyActivationCommands.deactivateSelectionKeyPressed,
    ),
    createShortcutRegistration(
      shortcuts.multiSelectionKeyCode,
      keyActivationCommands.activateMultiSelectionPressed,
      keyActivationCommands.deactivateMultiSelectionPressed,
    ),
    createShortcutRegistration(
      shortcuts.panActivationKeyCode,
      keyActivationCommands.activatePanMode,
      keyActivationCommands.deactivatePanMode,
    ),
    createShortcutRegistration(
      shortcuts.zoomActivationKeyCode,
      keyActivationCommands.activateZoomMode,
      keyActivationCommands.deactivateZoomMode,
    ),
    createShortcutRegistration(
      shortcuts.moveSectionKeyCode,
      keyActivationCommands.activateMoveSectionMode,
      keyActivationCommands.deactivateMoveSectionMode,
    ),
    createShortcutRegistration(
      shortcuts.movingFreeShortcut,
      keyActivationCommands.activateDndMovingFreeMode,
      keyActivationCommands.deactivateDnd,
    ),
    createShortcutRegistration(
      shortcuts.sortingShortcut,
      keyActivationCommands.activateDndSortingMode,
      keyActivationCommands.deactivateDnd,
    ),
    createShortcutRegistration("Escape", keyActivationCommands.onEscapeKey),
  ];
}

export function createShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    ...getFocusShortcutRegistrations(shortcuts),
    ...getCreationShortcutRegistrations(shortcuts),
    ...getTooltipShortcutRegistrations(shortcuts),
    ...getProjectCommandShortcutRegistrations(shortcuts),
    ...getParamShortcutRegistrations(shortcuts),
    ...getCanvasAndPaneShortcutRegistrations(shortcuts),
    ...getInteractionModeShortcutRegistrations(shortcuts),
  ];
}
