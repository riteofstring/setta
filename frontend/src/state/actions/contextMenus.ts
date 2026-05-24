import { useContextMenus } from "state/definitions";
import { NO_CONTEXT_MENU } from "utils/constants";

type ContextMenuEvent = {
  preventDefault: () => void;
  clientX: number;
  clientY: number;
};

type ContextMenuName = "pane" | "selection" | "typeError";

function openContextMenu(
  e: ContextMenuEvent,
  name: ContextMenuName,
  props: Record<string, unknown> = {},
) {
  if (NO_CONTEXT_MENU) {
    return;
  }
  e.preventDefault();
  const val = { isOpen: true, x: e.clientX, y: e.clientY, ...props };
  useContextMenus.getState().reset();
  useContextMenus.setState((state) => ({ [name]: { ...state[name], ...val } }));
}

export function openPaneContextMenu(e: ContextMenuEvent) {
  openContextMenu(e, "pane");
}

export function openSelectionContextMenu(
  e: ContextMenuEvent,
  nodeIds: Array<string>,
) {
  openContextMenu(e, "selection", { nodeIds });
}

export function openTypeErrorContextMenu(
  e: ContextMenuEvent,
  sectionId: string,
  paramInfoId: string | null,
) {
  openContextMenu(e, "typeError", { sectionId, paramInfoId });
}

export function closeAllContextMenus() {
  useContextMenus.getState().reset();
}
