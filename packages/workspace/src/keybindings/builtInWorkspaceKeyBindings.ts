import { onFitViewHandler } from "../canvas/fitView";
import {
  getCanZoomIn,
  getCanZoomOut,
  getIsZoomRuntimeReady,
  resetZoom,
  zoomIn,
  zoomOut,
  zoomToPointerLocation,
} from "../canvas/viewportHelpers";
import { createSectionCommandContext } from "../commands/workspaceCommandContexts";
import { getWorkspaceCommandOrThrow } from "../commands/workspaceCommandRegistry";
import { runWorkspaceCommandById } from "../commands/workspaceCommandResolution";
import { getActiveSectionIds } from "../document/activeSections";
import { getSectionHasSelectedItems } from "../document/documentSelectors";
import {
  selectAllInWorkspace,
  selectAllTopLevelNonGroupSections,
} from "../document/selectAllActions";
import { getWorkspaceDocumentStore } from "../document/stores";
import { focusAdjacentTopLevelSection } from "../focus/sectionNavigation";
import { focusWorkspaceScope } from "../focus/workspaceFocusScopes";
import {
  FOCUS_ITEM_FILTER_BINDING_ID,
  focusSectionItemFilter,
} from "../items/itemFilterFocusRegistry";
import { getSectionItemVisibility } from "../items/itemListRegistry";
import type { WorkspaceHost } from "../workspaceHost";
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
function runActiveSectionCommand(
  host: WorkspaceHost,
  commandId: string,
): boolean {
  const state = getWorkspaceDocumentStore(host).getState();
  const sections = getActiveSectionIds(host).flatMap((sectionId) => {
    const section = state.sections[sectionId];
    return section ? [section] : [];
  });
  const primarySection = sections[0];
  if (!primarySection) {
    return false;
  }
  return runWorkspaceCommandById(
    commandId,
    createSectionCommandContext(host, primarySection, sections),
  ).ran;
}

function createSectionCommandBinding(
  host: WorkspaceHost,
  commandId: string,
  defaultChord: string | null,
): WorkspaceKeyBindingDefinition {
  return Object.freeze({
    id: commandId,
    defaultChord,
    allowRepeat: false,
    keepsChordWhenDeclined: false,
    getLabel: () =>
      getWorkspaceCommandOrThrow(host, commandId).definition.label,
    run: () => runActiveSectionCommand(host, commandId),
  });
}

// A binding for an operation the package owns directly rather than through a command: it decides
// for itself whether it ran, and an operation that could not run leaves the chord to the browser
// the same way an unavailable command does.
function createOperationBinding(
  id: string,
  label: string,
  defaultChord: string,
  allowRepeat: boolean,
  run: () => boolean,
): WorkspaceKeyBindingDefinition {
  return Object.freeze({
    id,
    defaultChord,
    allowRepeat,
    keepsChordWhenDeclined: false,
    getLabel: () => label,
    run,
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

function activeSectionHasSelectedItems(host: WorkspaceHost): boolean {
  const activeId = getActiveSectionIds(host)[0];
  if (!activeId) {
    return false;
  }
  return getSectionHasSelectedItems(
    getWorkspaceDocumentStore(host).getState(),
    activeId,
  );
}

function activeSectionHasItemFilter(host: WorkspaceHost): boolean {
  const activeId = getActiveSectionIds(host)[0];
  return activeId
    ? (getSectionItemVisibility(host, activeId)?.filterActive ?? false)
    : false;
}

// The reference's `focusOnSearch`: with exactly one section active the chord goes to that
// section's Args filter, and anything else is not this section's filter to focus.
function focusSoleActiveSectionItemFilter(host: WorkspaceHost): boolean {
  const activeIds = getActiveSectionIds(host);
  const soleActiveId = activeIds.length === 1 ? activeIds[0] : undefined;
  return soleActiveId === undefined
    ? false
    : focusSectionItemFilter(host, soleActiveId);
}

// The reference's Tab handling (`handleTabKeyDown`): hosts opt a subtree out with
// [data-tab-native], and an active filter keeps native navigation available because structural
// moves are suspended. Otherwise, while the active section has selected items the keypress
// restructures instead of reaching the browser. The guards travel with the operation, so a host
// that moves indentation onto another chord keeps them.
function createItemIndentBinding(
  host: WorkspaceHost,
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
        !activeSectionHasSelectedItems(host) ||
        activeSectionHasItemFilter(host)
      ) {
        return false;
      }
      move();
      return true;
    },
  });
}

// Registration order is the order a host listing shortcuts sees them in: what the chord acts on
// — sections, then the selection over them, then the keyboard's place among them, then
// parameters, then the view, then the surrounding panes. The reference ships "Mod + G",
// "Shift + Mod + G", "Backspace", "Mod + A", "Mod + Shift + A", "Alt + J", "Alt + K",
// "Alt + ArrowUp", "Alt + ArrowDown", "Tab", "Shift + Tab", "Mod + K", "F", "Equal", "Minus",
// "Mod + Comma", "Z", "Ctrl + Shift + 2", "Ctrl + Shift + 3", and "Ctrl + Shift + 4" for these
// operations. Locking has no reference shortcut, so it ships bindable and unbound rather than
// with an invented chord. The reference's remaining focus chord, "Ctrl + Shift + 1", belongs to
// its application header, which the package does not have. Its "Mod + K" is one shortcut with two
// jobs: the sole active section's Args filter, or its application header's project search. Only
// the first is a workspace surface, so the binding here does that job and declines the rest.
export function listBuiltInWorkspaceKeyBindings(
  host: WorkspaceHost,
): ReadonlyArray<WorkspaceKeyBindingDefinition> {
  return Object.freeze([
    createSectionCommandBinding(host, "workspace.group-sections", "Mod + G"),
    createSectionCommandBinding(
      host,
      "workspace.ungroup-sections",
      "Shift + Mod + G",
    ),
    createSectionCommandBinding(host, "workspace.delete-sections", "Backspace"),
    createSectionCommandBinding(host, "workspace.lock-sections", null),
    createSectionCommandBinding(host, "workspace.unlock-sections", null),
    createOperationBinding(
      "workspace.select-all",
      "Select all",
      "Mod + A",
      false,
      () => selectAllInWorkspace(host),
    ),
    createOperationBinding(
      "workspace.select-top-level-sections",
      "Select top-level non-group sections",
      "Mod + Shift + A",
      false,
      () => {
        selectAllTopLevelNonGroupSections(host);
        return true;
      },
    ),
    createOperationBinding(
      "workspace.focus-next-section",
      "Focus next section",
      "Alt + J",
      false,
      () => focusAdjacentTopLevelSection(host, 1),
    ),
    createOperationBinding(
      "workspace.focus-previous-section",
      "Focus previous section",
      "Alt + K",
      false,
      () => focusAdjacentTopLevelSection(host, -1),
    ),
    createItemMoveBinding(
      "workspace.move-items-up",
      "Move parameters up",
      "Alt + ArrowUp",
      () => moveSelectedItemsUp(host),
    ),
    createItemMoveBinding(
      "workspace.move-items-down",
      "Move parameters down",
      "Alt + ArrowDown",
      () => moveSelectedItemsDown(host),
    ),
    createItemIndentBinding(
      host,
      "workspace.indent-items",
      "Indent parameters",
      "Tab",
      () => indentSelectedItems(host),
    ),
    createItemIndentBinding(
      host,
      "workspace.unindent-items",
      "Unindent parameters",
      "Shift + Tab",
      () => unindentSelectedItems(host),
    ),
    createOperationBinding(
      FOCUS_ITEM_FILTER_BINDING_ID,
      "Focus parameter filter",
      "Mod + K",
      false,
      () => focusSoleActiveSectionItemFilter(host),
    ),
    createOperationBinding("workspace.fit-view", "Fit view", "F", false, () =>
      onFitViewHandler(host),
    ),
    createOperationBinding(
      "workspace.zoom-in",
      "Zoom in",
      "Equal",
      true,
      () => {
        if (!getCanZoomIn(host)) {
          return false;
        }
        zoomIn(host);
        return true;
      },
    ),
    createOperationBinding(
      "workspace.zoom-out",
      "Zoom out",
      "Minus",
      true,
      () => {
        if (!getCanZoomOut(host)) {
          return false;
        }
        zoomOut(host);
        return true;
      },
    ),
    createOperationBinding(
      "workspace.reset-zoom",
      "Reset zoom",
      "Mod + Comma",
      false,
      () => {
        if (!getIsZoomRuntimeReady(host)) {
          return false;
        }
        resetZoom(host);
        return true;
      },
    ),
    createOperationBinding(
      "workspace.zoom-to-pointer",
      "Zoom to pointer",
      "Z",
      false,
      () => zoomToPointerLocation(host),
    ),
    createOperationBinding(
      "workspace.focus-leading-pane",
      "Focus leading pane",
      "Ctrl + Shift + 2",
      false,
      () => focusWorkspaceScope(host, "leading-pane"),
    ),
    createOperationBinding(
      "workspace.focus-canvas",
      "Focus canvas",
      "Ctrl + Shift + 3",
      false,
      () => focusWorkspaceScope(host, "canvas"),
    ),
    createOperationBinding(
      "workspace.focus-trailing-pane",
      "Focus trailing pane",
      "Ctrl + Shift + 4",
      false,
      () => focusWorkspaceScope(host, "trailing-pane"),
    ),
  ]);
}
