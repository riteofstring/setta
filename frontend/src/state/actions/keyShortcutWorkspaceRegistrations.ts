import { keyActivationCommands } from "./keyActivationCommands";
import { onEscapeKey } from "./keyActivationHandlers";
import { createShortcutRegistration } from "./keyShortcutRegistrationFactories";
import type {
  SettingsShortcuts,
  ShortcutRegistration,
} from "./keyShortcutRegistrationTypes";

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

export function getCanvasShortcutRegistrations(
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
