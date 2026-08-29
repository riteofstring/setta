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

export type WorkspaceKeyBindingDefinition = Readonly<{
  id: string;
  defaultChord: string | null;
  allowRepeat: boolean;

  keepsChordWhenDeclined: boolean;
  getLabel: () => string;
  run: (event: KeyboardEvent) => boolean;
}>;

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

function focusSoleActiveSectionItemFilter(host: WorkspaceHost): boolean {
  const activeIds = getActiveSectionIds(host);
  const soleActiveId = activeIds.length === 1 ? activeIds[0] : undefined;
  return soleActiveId === undefined
    ? false
    : focusSectionItemFilter(host, soleActiveId);
}

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
