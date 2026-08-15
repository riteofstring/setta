import { createSectionCommandContext } from "../commands/workspaceCommandContexts";
import { getWorkspaceCommandOrThrow } from "../commands/workspaceCommandRegistry";
import { runWorkspaceCommandById } from "../commands/workspaceCommandResolution";
import { getActiveSectionIds } from "../document/activeSections";
import { getSectionHasSelectedItems } from "../document/documentSelectors";
import { useWorkspaceDocument } from "../document/stores";
import { getSectionItemVisibility } from "../items/itemListRegistry";
import {
  indentSelectedItems,
  moveSelectedItemsDown,
  moveSelectedItemsUp,
  unindentSelectedItems,
} from "../items/selectedItemMoves";
import { getIsEditableTarget } from "./editableTarget";

// Every keyboard-reachable workspace operation, with the chord it answers to unless a host rebinds
// it. A binding runs the operation and reports whether it consumed the keypress; the dispatcher
// owns the chord rules around it.
export type WorkspaceKeyBindingDefinition = Readonly<{
  id: string;
  defaultChord: string | null;
  allowRepeat: boolean;
  // The reference's engine suppresses the browser default for every chord it recognizes. A command
  // binding instead hands an unavailable chord back to the browser, which is the accepted ungroup
  // behavior: a workspace that cannot run the operation never swallows the shortcut. The parameter
  // moves keep the reference's behavior because they decline on where the caret is rather than on
  // what the document contains, and the caret must not act on the chord either.
  keepsChordWhenDeclined: boolean;
  getLabel: () => string;
  run: (event: KeyboardEvent) => boolean;
}>;

// A chord targets the active section selection, the same selection the section context menu and
// the Inspector act on, and runs the command itself so the keyboard result cannot drift from the
// pointer result.
function runActiveSectionCommand(commandId: string): boolean {
  const state = useWorkspaceDocument.getState();
  const sections = getActiveSectionIds().flatMap((sectionId) => {
    const section = state.sections[sectionId];
    return section ? [section] : [];
  });
  const primarySection = sections[0];
  if (!primarySection) {
    return false;
  }
  return runWorkspaceCommandById(commandId, createSectionCommandContext(primarySection, sections))
    .ran;
}

function createSectionCommandBinding(
  commandId: string,
  defaultChord: string | null,
): WorkspaceKeyBindingDefinition {
  return Object.freeze({
    id: commandId,
    defaultChord,
    allowRepeat: false,
    keepsChordWhenDeclined: false,
    getLabel: () => getWorkspaceCommandOrThrow(commandId).definition.label,
    run: () => runActiveSectionCommand(commandId),
  });
}

function createItemMoveBinding(
  id: string,
  label: string,
  defaultChord: string,
  move: () => boolean,
): WorkspaceKeyBindingDefinition {
  return Object.freeze({
    id,
    defaultChord,
    allowRepeat: true,
    keepsChordWhenDeclined: true,
    getLabel: () => label,
    run: (event: KeyboardEvent) => !getIsEditableTarget(event) && move(),
  });
}

function activeSectionHasSelectedItems(): boolean {
  const activeId = getActiveSectionIds()[0];
  if (!activeId) {
    return false;
  }
  return getSectionHasSelectedItems(useWorkspaceDocument.getState(), activeId);
}

function activeSectionHasItemFilter(): boolean {
  const activeId = getActiveSectionIds()[0];
  return activeId ? (getSectionItemVisibility(activeId)?.filterActive ?? false) : false;
}

// The reference's Tab handling (`handleTabKeyDown`): hosts opt a subtree out with
// [data-tab-native], and an active filter keeps native navigation available because structural
// moves are suspended. Otherwise, while the active section has selected items the keypress
// restructures instead of reaching the browser. The guards travel with the operation, so a host
// that moves indentation onto another chord keeps them.
function createItemIndentBinding(
  id: string,
  label: string,
  defaultChord: string,
  move: () => boolean,
): WorkspaceKeyBindingDefinition {
  return Object.freeze({
    id,
    defaultChord,
    allowRepeat: false,
    keepsChordWhenDeclined: false,
    getLabel: () => label,
    run: (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target?.closest("[data-tab-native]") ||
        !activeSectionHasSelectedItems() ||
        activeSectionHasItemFilter()
      ) {
        return false;
      }
      move();
      return true;
    },
  });
}

// Registration order is the order a host listing shortcuts sees them in. The reference ships
// "Mod + G", "Shift + Mod + G", "Backspace", "Alt + ArrowUp", "Alt + ArrowDown", "Tab", and
// "Shift + Tab" for these operations. Locking has no reference shortcut, so it ships bindable and
// unbound rather than with an invented chord.
export const builtInWorkspaceKeyBindings: ReadonlyArray<WorkspaceKeyBindingDefinition> =
  Object.freeze([
    createSectionCommandBinding("workspace.group-sections", "Mod + G"),
    createSectionCommandBinding("workspace.ungroup-sections", "Shift + Mod + G"),
    createSectionCommandBinding("workspace.delete-sections", "Backspace"),
    createSectionCommandBinding("workspace.lock-sections", null),
    createSectionCommandBinding("workspace.unlock-sections", null),
    createItemMoveBinding(
      "workspace.move-items-up",
      "Move parameters up",
      "Alt + ArrowUp",
      moveSelectedItemsUp,
    ),
    createItemMoveBinding(
      "workspace.move-items-down",
      "Move parameters down",
      "Alt + ArrowDown",
      moveSelectedItemsDown,
    ),
    createItemIndentBinding(
      "workspace.indent-items",
      "Indent parameters",
      "Tab",
      indentSelectedItems,
    ),
    createItemIndentBinding(
      "workspace.unindent-items",
      "Unindent parameters",
      "Shift + Tab",
      unindentSelectedItems,
    ),
  ]);
