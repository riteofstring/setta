import {
  showParamUITypeTab,
  showProjectOverviewTab,
  showVersionsTab,
} from "components/Panes/paneFns";
import { focusAdjacentTopLevelSection, focusScope } from "utils/focusManager";
import { keyActivationCommands } from "./keyActivationCommands";
import { handleTabKeyDown, onEscapeKey } from "./keyActivationHandlers";
import {
  createShortcutRegistration,
  createTrackedShortcutRegistration,
} from "./keyShortcutRegistrationFactories";
import type {
  SettingsShortcuts,
  ShortcutRegistration,
} from "./keyShortcutRegistrationTypes";

export function getFocusShortcutRegistrations(
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

export function getCreationShortcutRegistrations(
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

export function getTooltipShortcutRegistrations(
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

export function getProjectCommandShortcutRegistrations(
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

export function getCanvasAndPaneShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createShortcutRegistration(
      shortcuts.fitViewShortcut,
      keyActivationCommands.onFitViewHandler,
    ),
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

export function getInteractionModeShortcutRegistrations(
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
    createShortcutRegistration("Escape", onEscapeKey),
  ];
}
